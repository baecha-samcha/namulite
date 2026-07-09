import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { sendError, sendOk } from "../http/response.js";
import { requireAuth } from "../middleware/requireAuth.js";

type BoardRow = RowDataPacket & {
  id: string;
  owner_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

type NodeRow = RowDataPacket & {
  id: string;
  board_id: string;
  page_id: string | null;
  type: "page" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | null;
  title?: string | null;
  created_at: Date;
  updated_at: Date;
};

const boardInputSchema = z.object({ title: z.string().trim().min(1).max(255) });
const nodeInputSchema = z.object({
  page_id: z.string().uuid().nullable().optional(),
  type: z.enum(["page", "text"]),
  x: z.number().int().default(40),
  y: z.number().int().default(40),
  width: z.number().int().min(160).max(640).default(260),
  height: z.number().int().min(100).max(420).default(160),
  content: z.string().max(5000).nullable().optional()
});
const nodeUpdateSchema = nodeInputSchema.partial();

export async function registerCanvasRoutes(app: FastifyInstance) {
  app.get("/api/canvas/boards", { preHandler: requireAuth }, async (request, reply) => {
    const [boards] = await pool.execute<BoardRow[]>(
      `SELECT id, owner_id, title, created_at, updated_at, deleted_at
       FROM canvas_boards
       WHERE owner_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [request.user!.id]
    );
    return sendOk(reply, { boards });
  });

  app.post("/api/canvas/boards", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = boardInputSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board input");
    const boardId = crypto.randomUUID();
    await pool.execute("INSERT INTO canvas_boards (id, owner_id, title) VALUES (?, ?, ?)", [boardId, request.user!.id, parsed.data.title]);
    const board = await getBoard(request.user!.id, boardId);
    return sendOk(reply, { board }, 201);
  });

  app.get("/api/canvas/boards/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board id");
    const board = await getBoard(request.user!.id, params.data.id);
    if (!board) return sendError(reply, 404, "BOARD_NOT_FOUND", "Board not found");
    const nodes = await getBoardNodes(request.user!.id, params.data.id);
    return sendOk(reply, { board, nodes });
  });

  app.patch("/api/canvas/boards/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board id");
    const parsed = boardInputSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board input");
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE canvas_boards SET title = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL",
      [parsed.data.title, params.data.id, request.user!.id]
    );
    if (result.affectedRows === 0) return sendError(reply, 404, "BOARD_NOT_FOUND", "Board not found");
    const board = await getBoard(request.user!.id, params.data.id);
    return sendOk(reply, { board });
  });

  app.delete("/api/canvas/boards/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board id");
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE canvas_boards SET deleted_at = NOW() WHERE id = ? AND owner_id = ? AND deleted_at IS NULL",
      [params.data.id, request.user!.id]
    );
    if (result.affectedRows === 0) return sendError(reply, 404, "BOARD_NOT_FOUND", "Board not found");
    return sendOk(reply, { deleted: true });
  });

  app.post("/api/canvas/boards/:id/nodes", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid board id");
    if (!(await getBoard(request.user!.id, params.data.id))) return sendError(reply, 404, "BOARD_NOT_FOUND", "Board not found");
    const parsed = nodeInputSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid node input");
    const nodeId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO canvas_nodes (id, board_id, page_id, type, x, y, width, height, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nodeId, params.data.id, parsed.data.page_id ?? null, parsed.data.type, parsed.data.x, parsed.data.y, parsed.data.width, parsed.data.height, parsed.data.content ?? null]
    );
    const node = await getNode(request.user!.id, nodeId);
    return sendOk(reply, { node }, 201);
  });

  app.patch("/api/canvas/nodes/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid node id");
    const existing = await getNode(request.user!.id, params.data.id);
    if (!existing) return sendError(reply, 404, "NODE_NOT_FOUND", "Node not found");
    const parsed = nodeUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid node input");
    const next = { ...existing, ...parsed.data };
    await pool.execute(
      `UPDATE canvas_nodes
       SET page_id = ?, type = ?, x = ?, y = ?, width = ?, height = ?, content = ?
       WHERE id = ?`,
      [next.page_id ?? null, next.type, next.x, next.y, next.width, next.height, next.content ?? null, params.data.id]
    );
    const node = await getNode(request.user!.id, params.data.id);
    return sendOk(reply, { node });
  });

  app.delete("/api/canvas/nodes/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid node id");
    const existing = await getNode(request.user!.id, params.data.id);
    if (!existing) return sendError(reply, 404, "NODE_NOT_FOUND", "Node not found");
    await pool.execute("DELETE FROM canvas_nodes WHERE id = ?", [params.data.id]);
    return sendOk(reply, { deleted: true });
  });
}

async function getBoard(userId: string, boardId: string) {
  const [rows] = await pool.execute<BoardRow[]>(
    `SELECT id, owner_id, title, created_at, updated_at, deleted_at
     FROM canvas_boards
     WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [boardId, userId]
  );
  return rows[0] ?? null;
}

async function getBoardNodes(userId: string, boardId: string) {
  const [rows] = await pool.execute<NodeRow[]>(
    `SELECT cn.id, cn.board_id, cn.page_id, cn.type, cn.x, cn.y, cn.width, cn.height, cn.content, cn.created_at, cn.updated_at, p.title
     FROM canvas_nodes cn
     JOIN canvas_boards cb ON cb.id = cn.board_id
     LEFT JOIN pages p ON p.id = cn.page_id AND p.deleted_at IS NULL
     WHERE cn.board_id = ? AND cb.owner_id = ? AND cb.deleted_at IS NULL
     ORDER BY cn.updated_at ASC`,
    [boardId, userId]
  );
  return rows;
}

async function getNode(userId: string, nodeId: string) {
  const [rows] = await pool.execute<NodeRow[]>(
    `SELECT cn.id, cn.board_id, cn.page_id, cn.type, cn.x, cn.y, cn.width, cn.height, cn.content, cn.created_at, cn.updated_at, p.title
     FROM canvas_nodes cn
     JOIN canvas_boards cb ON cb.id = cn.board_id
     LEFT JOIN pages p ON p.id = cn.page_id AND p.deleted_at IS NULL
     WHERE cn.id = ? AND cb.owner_id = ? AND cb.deleted_at IS NULL
     LIMIT 1`,
    [nodeId, userId]
  );
  return rows[0] ?? null;
}
