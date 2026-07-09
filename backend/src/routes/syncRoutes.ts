import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { sendError, sendOk } from "../http/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { ConflictError, NotFoundError, createPage, deletePage, getPage, updatePage } from "../services/pageService.js";
import type { PageRecord } from "../types.js";

type PageRow = RowDataPacket & PageRecord;
type DeletedPageRow = RowDataPacket & { id: string; updated_at: Date; deleted_at: Date };

const pagePayloadSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().max(16 * 1024 * 1024).default(""),
  visibility: z.enum(["private", "shared", "public"]).default("private")
});

const changeSchema = z.object({
  local_queue_id: z.string().min(1),
  entity_type: z.literal("page"),
  entity_id: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  payload: pagePayloadSchema.partial().passthrough().optional().default({}),
  base_version: z.number().int().positive().optional(),
  created_at: z.string().optional()
});

const pushSchema = z.object({
  client_id: z.string().trim().min(1).max(120),
  changes: z.array(changeSchema).max(100)
});

export async function registerSyncRoutes(app: FastifyInstance) {
  app.post("/api/sync/push", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid sync payload");

    const success = [];
    const conflicts = [];
    const failed = [];

    for (const change of parsed.data.changes) {
      try {
        if (change.operation === "create") {
          const input = pagePayloadSchema.parse(change.payload);
          const page = await createPage(request.user!.id, input);
          if (!page) throw new Error("Created page could not be loaded");
          success.push({ local_queue_id: change.local_queue_id, entity_id: change.entity_id, server_id: page.id, page });
          await logSync(request.user!.id, parsed.data.client_id, change.entity_type, page.id, change.operation, "success");
          continue;
        }

        if (change.operation === "update") {
          const input = pagePayloadSchema.parse(change.payload);
          const page = await updatePage(request.user!.id, change.entity_id, {
            ...input,
            baseVersion: change.base_version
          });
          success.push({ local_queue_id: change.local_queue_id, entity_id: change.entity_id, server_id: page?.id, page });
          await logSync(request.user!.id, parsed.data.client_id, change.entity_type, change.entity_id, change.operation, "success");
          continue;
        }

        const deleted = await deletePage(request.user!.id, change.entity_id);
        if (!deleted) throw new NotFoundError("Page not found");
        success.push({ local_queue_id: change.local_queue_id, entity_id: change.entity_id, deleted: true });
        await logSync(request.user!.id, parsed.data.client_id, change.entity_type, change.entity_id, change.operation, "success");
      } catch (error) {
        if (error instanceof ConflictError) {
          const page = await getPage(request.user!.id, change.entity_id);
          conflicts.push({
            local_queue_id: change.local_queue_id,
            entity_id: change.entity_id,
            server_version: error.currentVersion,
            message: "Page changed on server",
            page
          });
          await logSync(request.user!.id, parsed.data.client_id, change.entity_type, change.entity_id, change.operation, "conflict");
          continue;
        }
        const message = error instanceof NotFoundError ? "Page not found" : "Sync change failed";
        failed.push({ local_queue_id: change.local_queue_id, entity_id: change.entity_id, message });
        await logSync(request.user!.id, parsed.data.client_id, change.entity_type, change.entity_id, change.operation, "failed");
      }
    }

    return sendOk(reply, { success, conflicts, failed, server_time: new Date().toISOString() });
  });

  app.get("/api/sync/pull", { preHandler: requireAuth }, async (request, reply) => {
    const query = z.object({ since: z.string().optional() }).parse(request.query);
    const since = query.since ? new Date(query.since) : new Date(0);
    if (Number.isNaN(since.getTime())) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid since timestamp");

    const [pages] = await pool.execute<PageRow[]>(
      `SELECT id, owner_id, title, slug, content, rendered_cache, visibility, version, created_at, updated_at, deleted_at
       FROM pages
       WHERE owner_id = ? AND deleted_at IS NULL AND updated_at > ?
       ORDER BY updated_at ASC
       LIMIT 500`,
      [request.user!.id, since]
    );

    const [deletedPages] = await pool.execute<DeletedPageRow[]>(
      `SELECT id, updated_at, deleted_at
       FROM pages
       WHERE owner_id = ? AND deleted_at IS NOT NULL AND updated_at > ?
       ORDER BY updated_at ASC
       LIMIT 500`,
      [request.user!.id, since]
    );

    return sendOk(reply, {
      pages,
      deleted_pages: deletedPages,
      server_time: new Date().toISOString()
    });
  });
}

async function logSync(userId: string, clientId: string, entityType: string, entityId: string, operation: string, status: string) {
  await pool.execute(
    `INSERT INTO sync_log (id, user_id, client_id, entity_type, entity_id, operation, status)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
    [userId, clientId, entityType, entityId, operation, status]
  );
}
