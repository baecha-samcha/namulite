import crypto from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool.js";
import { extractInternalLinks, slugifyTitle } from "../parser/wikiText.js";
import type { PageRecord, PageVisibility } from "../types.js";

type PageRow = RowDataPacket & PageRecord;
type CountRow = RowDataPacket & { count: number };
type LinkRow = RowDataPacket & { from_page_id: string; from_title: string; to_page_id: string | null; to_title: string | null; target_title: string; link_text: string };

type PageInput = {
  title: string;
  content: string;
  visibility: PageVisibility;
};

export class ConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("Page version conflict");
  }
}

export class NotFoundError extends Error {}

export async function listPages(ownerId: string, q = "", limit = 50, offset = 0) {
  const normalizedLimit = Math.min(Math.max(limit, 1), 100);
  const normalizedOffset = Math.max(offset, 0);
  const like = `%${q.trim()}%`;

  const [rows] = await pool.execute<PageRow[]>(
    `SELECT id, owner_id, title, slug, content, rendered_cache, visibility, version, created_at, updated_at, deleted_at
     FROM pages p
     WHERE p.deleted_at IS NULL
       AND (p.owner_id = ? OR p.visibility = 'public' OR EXISTS (SELECT 1 FROM permissions pm WHERE pm.page_id = p.id AND pm.user_id = ?))
       AND (? = '' OR p.title LIKE ? OR p.content LIKE ?)
     ORDER BY p.updated_at DESC
     LIMIT ? OFFSET ?`,
    [ownerId, ownerId, q.trim(), like, like, normalizedLimit, normalizedOffset]
  );

  return rows;
}

export async function getPage(ownerId: string, pageId: string) {
  const [rows] = await pool.execute<PageRow[]>(
    `SELECT p.id, p.owner_id, p.title, p.slug, p.content, p.rendered_cache, p.visibility, p.version, p.created_at, p.updated_at, p.deleted_at
     FROM pages p
     WHERE p.id = ? AND p.deleted_at IS NULL
       AND (p.owner_id = ? OR p.visibility = 'public' OR EXISTS (SELECT 1 FROM permissions pm WHERE pm.page_id = p.id AND pm.user_id = ?))
     LIMIT 1`,
    [pageId, ownerId, ownerId]
  );
  return rows[0] ?? null;
}

export async function getPageByTitle(ownerId: string, title: string) {
  const [rows] = await pool.execute<PageRow[]>(
    `SELECT p.id, p.owner_id, p.title, p.slug, p.content, p.rendered_cache, p.visibility, p.version, p.created_at, p.updated_at, p.deleted_at
     FROM pages p
     WHERE p.title = ? AND p.deleted_at IS NULL
       AND (p.owner_id = ? OR p.visibility = 'public' OR EXISTS (SELECT 1 FROM permissions pm WHERE pm.page_id = p.id AND pm.user_id = ?))
     ORDER BY p.owner_id = ? DESC, p.updated_at DESC
     LIMIT 1`,
    [title, ownerId, ownerId, ownerId]
  );
  return rows[0] ?? null;
}

export async function createPage(ownerId: string, input: PageInput) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const pageId = crypto.randomUUID();
    const slug = await uniqueSlug(connection, ownerId, input.title);

    await connection.execute(
      `INSERT INTO pages (id, owner_id, title, slug, content, visibility, version)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [pageId, ownerId, input.title, slug, input.content, input.visibility]
    );

    await connection.execute(
      `INSERT INTO permissions (id, page_id, user_id, role)
       VALUES (?, ?, ?, 'owner')
       ON DUPLICATE KEY UPDATE role = 'owner'`,
      [crypto.randomUUID(), pageId, ownerId]
    );

    await connection.execute(
      `INSERT INTO page_revisions (id, page_id, user_id, content, summary, version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), pageId, ownerId, input.content, "Initial version", 1]
    );

    await replacePageLinks(connection, ownerId, pageId, input.content);
    await relinkIncomingTargets(connection, ownerId, pageId, input.title);
    await connection.commit();
    return await getPage(ownerId, pageId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updatePage(ownerId: string, pageId: string, input: PageInput & { baseVersion?: number }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<PageRow[]>(
      `SELECT p.id, p.owner_id, p.title, p.slug, p.content, p.rendered_cache, p.visibility, p.version, p.created_at, p.updated_at, p.deleted_at
       FROM pages p
       LEFT JOIN permissions pm ON pm.page_id = p.id AND pm.user_id = ?
       WHERE p.id = ? AND p.deleted_at IS NULL AND (p.owner_id = ? OR pm.role IN ('owner', 'editor'))
       FOR UPDATE`,
      [ownerId, pageId, ownerId]
    );
    const current = rows[0];
    if (!current) throw new NotFoundError("Page not found");
    if (input.baseVersion !== undefined && input.baseVersion < current.version) {
      throw new ConflictError(current.version);
    }

    const nextVersion = current.version + 1;
    const pageOwnerId = current.owner_id;
    const slug = input.title === current.title ? current.slug : await uniqueSlug(connection, pageOwnerId, input.title, pageId);

    await connection.execute(
      `UPDATE pages
       SET title = ?, slug = ?, content = ?, visibility = ?, version = ?, rendered_cache = NULL
       WHERE id = ?`,
      [input.title, slug, input.content, input.visibility, nextVersion, pageId]
    );

    await connection.execute(
      `INSERT INTO page_revisions (id, page_id, user_id, content, summary, version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), pageId, ownerId, input.content, "Updated page", nextVersion]
    );

    await replacePageLinks(connection, pageOwnerId, pageId, input.content);
    await relinkIncomingTargets(connection, pageOwnerId, pageId, input.title);
    await connection.commit();
    return await getPage(ownerId, pageId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deletePage(ownerId: string, pageId: string) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE pages SET deleted_at = NOW(), version = version + 1 WHERE id = ? AND owner_id = ? AND deleted_at IS NULL",
      [pageId, ownerId]
    );
    if (result.affectedRows > 0) {
      await connection.execute("UPDATE page_links SET to_page_id = NULL WHERE to_page_id = ?", [pageId]);
    }
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function uniqueSlug(connection: PoolConnection, ownerId: string, title: string, excludePageId?: string): Promise<string> {
  const base = slugifyTitle(title);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const params = excludePageId ? [ownerId, candidate, excludePageId] : [ownerId, candidate];
    const sql = excludePageId
      ? "SELECT COUNT(*) AS count FROM pages WHERE owner_id = ? AND slug = ? AND id <> ? AND deleted_at IS NULL"
      : "SELECT COUNT(*) AS count FROM pages WHERE owner_id = ? AND slug = ? AND deleted_at IS NULL";
    const [rows] = await connection.execute<CountRow[]>(sql, params);
    if ((rows[0]?.count ?? 0) === 0) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function replacePageLinks(connection: PoolConnection, ownerId: string, pageId: string, content: string) {
  await connection.execute("DELETE FROM page_links WHERE from_page_id = ?", [pageId]);

  const links = extractInternalLinks(content);
  for (const link of links) {
    const [targetRows] = await connection.execute<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM pages
       WHERE owner_id = ? AND title = ? AND deleted_at IS NULL
       LIMIT 1`,
      [ownerId, link.targetTitle]
    );
    await connection.execute(
      `INSERT INTO page_links (id, from_page_id, to_page_id, target_title, link_text)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), pageId, targetRows[0]?.id ?? null, link.targetTitle, link.linkText]
    );
  }
}

export async function getPageGraph(ownerId: string) {
  const pages = await listPages(ownerId, "", 100, 0);
  const nodes = new Map<string, { id: string; title: string; missing: boolean }>();
  for (const page of pages) {
    nodes.set(page.id, { id: page.id, title: page.title, missing: false });
  }

  const [links] = await pool.execute<LinkRow[]>(
    `SELECT pl.from_page_id, fp.title AS from_title, pl.to_page_id, tp.title AS to_title, pl.target_title, pl.link_text
     FROM page_links pl
     JOIN pages fp ON fp.id = pl.from_page_id
     LEFT JOIN pages tp ON tp.id = pl.to_page_id AND tp.deleted_at IS NULL
     WHERE fp.owner_id = ? AND fp.deleted_at IS NULL
     ORDER BY fp.title ASC, pl.target_title ASC`,
    [ownerId]
  );

  const edges = links.map((link, index) => {
    const targetId = link.to_page_id ?? `missing:${link.target_title}`;
    if (!nodes.has(targetId)) {
      nodes.set(targetId, { id: targetId, title: link.target_title, missing: true });
    }
    return {
      id: `${link.from_page_id}:${targetId}:${index}`,
      from: link.from_page_id,
      to: targetId,
      label: link.link_text
    };
  });

  return { nodes: [...nodes.values()], edges };
}
async function relinkIncomingTargets(connection: PoolConnection, ownerId: string, pageId: string, title: string) {
  await connection.execute(
    `UPDATE page_links pl
     JOIN pages fp ON fp.id = pl.from_page_id
     SET pl.to_page_id = ?
     WHERE fp.owner_id = ? AND fp.deleted_at IS NULL AND pl.target_title = ?`,
    [pageId, ownerId, title]
  );

  await connection.execute(
    `UPDATE page_links pl
     JOIN pages fp ON fp.id = pl.from_page_id
     SET pl.to_page_id = NULL
     WHERE fp.owner_id = ? AND pl.to_page_id = ? AND pl.target_title <> ?`,
    [ownerId, pageId, title]
  );
}
