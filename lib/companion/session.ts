import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const COMPANION_HEARTBEAT_TTL_MS = 90_000;

export function hashCompanionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createCompanionToken() {
  return randomBytes(32).toString("base64url");
}

export async function revokeCompanionSessions(clerkId: string) {
  const now = new Date();
  const [, result] = await prisma.$transaction([
    prisma.companionLibrarySnapshot.deleteMany({ where: { clerkId } }),
    prisma.companionSession.updateMany({
      where: { clerkId, isActive: true },
      data: { isActive: false, revokedAt: now },
    }),
  ]);
  return result.count;
}

export async function verifyCompanionToken(token: string) {
  const tokenHash = hashCompanionToken(token);
  const session = await prisma.companionSession.findUnique({ where: { tokenHash } });
  if (!session || !session.isActive) return null;

  if (Date.now() - session.lastHeartbeatAt.getTime() > COMPANION_HEARTBEAT_TTL_MS) {
    await prisma.companionLibrarySnapshot.deleteMany({
      where: {
        clerkId: session.clerkId,
        deviceId: session.deviceId,
      },
    });
  }

  return session;
}