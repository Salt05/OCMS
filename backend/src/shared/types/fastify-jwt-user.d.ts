/**
 * Extends Fastify's JWT user type to include our custom JWT payload fields.
 * This merges with @fastify/jwt's FastifyJWT interface.
 */
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; orgId: string };
    user: { id: string; email: string; role: string; orgId: string };
  }
}
