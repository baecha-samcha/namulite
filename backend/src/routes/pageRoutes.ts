import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendError, sendOk } from "../http/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  ConflictError,
  NotFoundError,
  createPage,
  deletePage,
  getPage,
  getPageByTitle,
  getPageGraph,
  listPages,
  updatePage
} from "../services/pageService.js";

const visibilitySchema = z.enum(["private", "shared", "public"]).default("private");

const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().max(16 * 1024 * 1024).default(""),
  visibility: visibilitySchema
});

const pageUpdateSchema = pageInputSchema.extend({
  base_version: z.number().int().positive().optional()
});

export async function registerPageRoutes(app: FastifyInstance) {
  app.get("/api/pages", { preHandler: requireAuth }, async (request, reply) => {
    const query = z.object({
      q: z.string().optional().default(""),
      limit: z.coerce.number().int().positive().optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0)
    }).parse(request.query);

    const pages = await listPages(request.user!.id, query.q, query.limit, query.offset);
    return sendOk(reply, { pages });
  });

  app.post("/api/pages", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = pageInputSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page input");

    const page = await createPage(request.user!.id, parsed.data);
    return sendOk(reply, { page }, 201);
  });

  app.get("/api/pages/graph", { preHandler: requireAuth }, async (request, reply) => {
    const graph = await getPageGraph(request.user!.id);
    return sendOk(reply, { graph });
  });
  app.get("/api/pages/by-title/:title", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ title: z.string().min(1) }).parse(request.params);
    const page = await getPageByTitle(request.user!.id, decodeURIComponent(params.title));
    if (!page) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    return sendOk(reply, { page });
  });

  app.get("/api/pages/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");

    const page = await getPage(request.user!.id, params.data.id);
    if (!page) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    return sendOk(reply, { page });
  });

  app.patch("/api/pages/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");
    const parsed = pageUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page input");

    try {
      const page = await updatePage(request.user!.id, params.data.id, {
        title: parsed.data.title,
        content: parsed.data.content,
        visibility: parsed.data.visibility,
        baseVersion: parsed.data.base_version
      });
      return sendOk(reply, { page });
    } catch (error) {
      if (error instanceof ConflictError) {
        return sendError(reply, 409, "PAGE_CONFLICT", `Page changed on server at version ${error.currentVersion}`);
      }
      if (error instanceof NotFoundError) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
      throw error;
    }
  });

  app.delete("/api/pages/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid page id");

    const deleted = await deletePage(request.user!.id, params.data.id);
    if (!deleted) return sendError(reply, 404, "PAGE_NOT_FOUND", "Page not found");
    return sendOk(reply, { deleted: true });
  });
}