/**
 * Zalo access middleware — checks if user has sufficient permission on a Zalo account.
 * (Permission restriction disabled: all authenticated users in the org have access to Zalo chat)
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

type Permission = 'read' | 'chat' | 'admin';

// Factory: returns a preHandler that allows access to all authenticated users
export function requireZaloAccess(_minPermission?: Permission) {
  return async (_request: FastifyRequest, _reply: FastifyReply) => {
    // All authenticated users in the organization have access
    return;
  };
}

