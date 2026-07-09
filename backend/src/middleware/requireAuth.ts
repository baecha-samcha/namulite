import type { FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../http/response.js";
import { getUserForSession, sessionCookieName } from "../auth/session.js";
import type { AuthUser } from "../types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.[sessionCookieName];
  if (!token) return sendError(reply, 401, "UNAUTHORIZED", "Authentication required");

  const user = await getUserForSession(token);
  if (!user) return sendError(reply, 401, "UNAUTHORIZED", "Invalid or expired session");

  request.user = user;
}