/**
 * Auth service — handles setup, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  orgId: string;
}

// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const count = await prisma.user.count();
  return { needsSetup: count === 0 };
}

// Create the initial organization + owner user, return JWT payload
export async function setup(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
): Promise<JwtPayload> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const err = new Error('Setup already completed') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName,
        role: 'owner',
      },
    });
    return { org, user };
  });

  logger.info(`Setup complete — org=${result.org.id}, user=${result.user.id}`);

  return {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    orgId: result.org.id,
  };
}

// Verify credentials, return JWT payload
export async function login(email: string, password: string): Promise<JwtPayload> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.isActive) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return { id: user.id, email: user.email, role: user.role, orgId: user.orgId };
}

// Return safe user profile (no password hash)
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      orgId: true,
      teamId: true,
      isActive: true,
      createdAt: true,
      org: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return user;
}
