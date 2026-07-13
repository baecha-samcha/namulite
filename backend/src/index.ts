import fastify from "fastify";
import cookie from "@fastify/cookie";
import { env } from "./env.js";
import { sendError } from "./http/response.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerCanvasRoutes } from "./routes/canvasRoutes.js";
import { registerCollaborationRoutes } from "./routes/collaborationRoutes.js";
import { registerPageRoutes } from "./routes/pageRoutes.js";
import { registerSyncRoutes } from "./routes/syncRoutes.js";
import { pool } from "./db/pool.js";
import { databaseErrorSummary } from "./db/errors.js";

const app = fastify({ logger: true });

await app.register(cookie);

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && origin === env.frontendOrigin) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
  }
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
});

app.options("*", async (_request, reply) => reply.code(204).send());

app.get("/api/health", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return reply.send({
      ok: true,
      data: { status: "ok", database: "connected" },
      error: null
    });
  } catch (error) {
    app.log.error(
      { databaseError: databaseErrorSummary(error) },
      "Database health check failed"
    );
    return reply.code(503).send({
      ok: false,
      data: null,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database connection is unavailable"
      }
    });
  }
});

await registerAuthRoutes(app);
await registerPageRoutes(app);
await registerCanvasRoutes(app);
await registerCollaborationRoutes(app);
await registerSyncRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
});

try {
  await pool.query("SELECT 1");
  app.log.info("MariaDB connection established");
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  app.log.fatal(
    { databaseError: databaseErrorSummary(error) },
    "Application startup failed"
  );
  await pool.end();
  process.exitCode = 1;
}
