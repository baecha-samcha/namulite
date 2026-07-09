import type { FastifyReply } from "fastify";

export function sendOk(reply: FastifyReply, data: unknown, statusCode = 200) {
  return reply.code(statusCode).send({ ok: true, data, error: null });
}

export function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ ok: false, data: null, error: { code, message } });
}