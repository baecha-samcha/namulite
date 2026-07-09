import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { clearSession, createSession, sessionCookieName } from "../auth/session.js";
import { sendError, sendOk } from "../http/response.js";
import { requireAuth } from "../middleware/requireAuth.js";

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
  display_name: string;
  password_hash: string;
};

const registerSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_\-.]+$/),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  display_name: z.string().trim().min(1).max(120)
});

const loginSchema = z.object({
  username_or_email: z.string().trim().min(1),
  password: z.string().min(1)
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid registration input");

    const input = parsed.data;
    const passwordHash = await hashPassword(input.password);
    const userId = crypto.randomUUID();

    try {
      await pool.execute(
        `INSERT INTO users (id, username, email, password_hash, display_name)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, input.username, input.email, passwordHash, input.display_name]
      );
      await createSession(reply, userId);
      return sendOk(reply, {
        user: { id: userId, username: input.username, email: input.email, display_name: input.display_name }
      }, 201);
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") {
        return sendError(reply, 409, "ACCOUNT_EXISTS", "Username or email already exists");
      }
      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid login input");

    const [rows] = await pool.execute<UserRow[]>(
      `SELECT id, username, email, display_name, password_hash
       FROM users
       WHERE deleted_at IS NULL AND (username = ? OR email = ?)
       LIMIT 1`,
      [parsed.data.username_or_email, parsed.data.username_or_email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
      return sendError(reply, 401, "INVALID_CREDENTIALS", "Invalid username/email or password");
    }

    await createSession(reply, user.id);
    return sendOk(reply, {
      user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name }
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await clearSession(reply, request.cookies?.[sessionCookieName]);
    return sendOk(reply, { loggedOut: true });
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    return sendOk(reply, { user: request.user });
  });
}