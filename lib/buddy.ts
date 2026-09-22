import { prisma } from "@/lib/db";
import { customAlphabet } from "nanoid";
import { Prisma } from "@prisma/client";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const generateCode = customAlphabet(CODE_ALPHABET, 6);
const CODE_TTL_MINUTES = 15;

/** Returns the paired buddy's user id, or null if the user has no buddy. */
export async function getBuddyId(userId: string): Promise<string | null> {
  const pair = await prisma.buddyPair.findFirst({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
  });
  if (!pair) return null;
  return pair.userAId === userId ? pair.userBId : pair.userAId;
}

/** Generates a fresh 6-char pairing code for the user, replacing any existing one. */
export async function createPairingCode(userId: string) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  return prisma.pairingCode.upsert({
    where: { userId },
    create: { userId, code, expiresAt },
    update: { code, expiresAt },
  });
}

/** Redeems a pairing code, creating a buddy pair between the code owner and `userId`. */
export async function connectWithCode(userId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  const pairingCode = await prisma.pairingCode.findUnique({
    where: { code: normalized },
  });

  if (!pairingCode) return { ok: false as const, error: "That code isn't valid." };
  if (pairingCode.expiresAt.getTime() < Date.now()) {
    await prisma.pairingCode.delete({ where: { id: pairingCode.id } }).catch(() => {});
    return { ok: false as const, error: "That code has expired. Ask for a new one." };
  }
  if (pairingCode.userId === userId) {
    return { ok: false as const, error: "You can't connect with your own code." };
  }

  const existingA = await getBuddyId(userId);
  const existingB = await getBuddyId(pairingCode.userId);
  if (existingA || existingB) {
    return { ok: false as const, error: "One of you is already connected with a buddy." };
  }

  try {
    await prisma.$transaction([
      prisma.buddyPair.create({
        data: { userAId: pairingCode.userId, userBId: userId },
      }),
      prisma.pairingCode.delete({ where: { id: pairingCode.id } }),
    ]);
  } catch (err) {
    // Concurrent connect attempt already paired one of these users — the
    // @@unique constraints on userAId/userBId caught it after our pre-check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false as const, error: "One of you is already connected with a buddy." };
    }
    throw err;
  }

  return { ok: true as const };
}

/** Removes the buddy pair involving the given user, if one exists. */
export async function disconnectBuddy(userId: string) {
  await prisma.buddyPair.deleteMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
  });
}
