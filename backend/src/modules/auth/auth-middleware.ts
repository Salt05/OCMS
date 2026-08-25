/**
 * Auth middleware — verifies JWT on protected routes.
 * JWT user shape is defined in shared/types/fastify-jwt-user.d.ts.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const queryToken = (request.query as any)?.token;
    if (queryToken && !request.headers.authorization) {
      request.headers.authorization = `Bearer ${queryToken}`;
    }
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
