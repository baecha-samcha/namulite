import crypto from "node:crypto";
import type { FastifyReply } from "fastify";
import type { RowDataPacket } from "mysql2";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import type { AuthUser } from "../types.js";

export const sessionCookieName = "wikindle_session";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;

type UserRow = RowDataPacket & AuthUser;

export function hashSessionToken(token: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionTtlMs);

  await pool.execute(
    "INSERT INTO sessions (id, user_id, session_token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [crypto.randomUUID(), userId, tokenHash, expiresAt]
  );

  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000)
  });
}

export async function clearSession(reply: FastifyReply, token?: string): Promise<void> {
  if (token) {
    await pool.execute("DELETE FROM sessions WHERE session_token_hash = ?", [hashSessionToken(token)]);
  }
  reply.clearCookie(sessionCookieName, { path: "/" });
}

export async function getUserForSession(token: string): Promise<AuthUser | null> {
  const tokenHash = hashSessionToken(token);
  const [rows] = await pool.execute<UserRow[]>(
    `SELECT u.id, u.username, u.email, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = ?
       AND s.expires_at > NOW()
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}