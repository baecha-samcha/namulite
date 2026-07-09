import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { sendError, sendOk } from "../http/response.js";
import { requireAuth } from "../middleware/requireAuth.js";

type PermissionRow = RowDataPacket & {
  id: string;
  page_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  username: string;
  email: string;
  display_name: string;
  created_at: Date;
  updated_at: Date;
};

type RevisionRow = RowDataPacket & {
  id: string;
  page_id: string;
  user_id: string;
  content: string;
  summary: string | null;
  version: number;
  created_at: Date;
  username: string;
  display_name: string;
};

type BacklinkRow = RowDataPacket & {
  page_id: string;
  title: string;
  link_text: string;
  created_at: Date;
};

type MissingLinkRow = RowDataPacket & {
  target_title: string;
  references_count: number;
};

const shareSchema = z.object({
  username_or_email: z.string().trim().min(1),
  role: z.enum(["editor", "viewer"])
});

export async function registerCollaborationRoutes(app: FastifyInstance) {
  app.get("/api/pages/:id/permissions", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");
    if (!(await canViewPage(request.user!.id, params.data.id))) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    const permissions = await listPermissions(params.data.id);
    return sendOk(reply, { permissions });
  });

  app.post("/api/pages/:id/share", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");
    const parsed = shareSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid share input");
    if (!(await isOwner(request.user!.id, params.data.id))) return sendError(reply, 403, "FORBIDDEN", "Owner permission required");

    const [users] = await pool.execute<(RowDataPacket & { id: string })[]>(
      "SELECT id FROM users WHERE deleted_at IS NULL AND (username = ? OR email = ?) LIMIT 1",
      [parsed.data.username_or_email, parsed.data.username_or_email]
    );
    const target = users[0];
    if (!target) return sendError(reply, 404, "USER_NOT_FOUND", "User not found");
    if (target.id === request.user!.id) return sendError(reply, 400, "VALIDATION_ERROR", "Cannot share with yourself");

    await pool.execute(
      `INSERT INTO permissions (id, page_id, user_id, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = NOW()`,
      [crypto.randomUUID(), params.data.id, target.id, parsed.data.role]
    );
    await pool.execute("UPDATE pages SET visibility = 'shared' WHERE id = ?", [params.data.id]);
    const permissions = await listPermissions(params.data.id);
    return sendOk(reply, { permissions });
  });

  app.delete("/api/pages/:id/permissions/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid permission input");
    if (!(await isOwner(request.user!.id, params.data.id))) return sendError(reply, 403, "FORBIDDEN", "Owner permission required");
    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM permissions WHERE page_id = ? AND user_id = ? AND role <> 'owner'",
      [params.data.id, params.data.userId]
    );
    return sendOk(reply, { deleted: result.affectedRows > 0 });
  });

  app.get("/api/pages/:id/revisions", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");
    if (!(await canViewPage(request.user!.id, params.data.id))) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    const [revisions] = await pool.execute<RevisionRow[]>(
      `SELECT pr.id, pr.page_id, pr.user_id, pr.content, pr.summary, pr.version, pr.created_at, u.username, u.display_name
       FROM page_revisions pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.page_id = ?
       ORDER BY pr.version DESC
       LIMIT 50`,
      [params.data.id]
    );
    return sendOk(reply, { revisions });
  });

  app.get("/api/pages/:id/backlinks", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");
    if (!(await canViewPage(request.user!.id, params.data.id))) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    const [backlinks] = await pool.execute<BacklinkRow[]>(
      `SELECT fp.id AS page_id, fp.title, pl.link_text, pl.created_at
       FROM page_links pl
       JOIN pages fp ON fp.id = pl.from_page_id
       WHERE pl.to_page_id = ? AND fp.deleted_at IS NULL
       ORDER BY fp.updated_at DESC`,
      [params.data.id]
    );
    return sendOk(reply, { backlinks });
  });

  app.get("/api/links/missing", { preHandler: requireAuth }, async (request, reply) => {
    const [missingLinks] = await pool.execute<MissingLinkRow[]>(
      `SELECT pl.target_title, COUNT(*) AS references_count
       FROM page_links pl
       JOIN pages fp ON fp.id = pl.from_page_id
       WHERE fp.owner_id = ? AND fp.deleted_at IS NULL AND pl.to_page_id IS NULL
       GROUP BY pl.target_title
       ORDER BY references_count DESC, pl.target_title ASC
       LIMIT 100`,
      [request.user!.id]
    );
    return sendOk(reply, { missing_links: missingLinks });
  });
}

async function isOwner(userId: string, pageId: string) {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM pages WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1", [pageId, userId]);
  return rows.length > 0;
}

async function canViewPage(userId: string, pageId: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.id
     FROM pages p
     LEFT JOIN permissions pm ON pm.page_id = p.id AND pm.user_id = ?
     WHERE p.id = ? AND p.deleted_at IS NULL AND (p.owner_id = ? OR p.visibility = 'public' OR pm.id IS NOT NULL)
     LIMIT 1`,
    [userId, pageId, userId]
  );
  return rows.length > 0;
}

async function listPermissions(pageId: string) {
  const [rows] = await pool.execute<PermissionRow[]>(
    `SELECT pm.id, pm.page_id, pm.user_id, pm.role, pm.created_at, pm.updated_at, u.username, u.email, u.display_name
     FROM permissions pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.page_id = ?
     ORDER BY FIELD(pm.role, 'owner', 'editor', 'viewer'), u.username ASC`,
    [pageId]
  );
  return rows;
}
