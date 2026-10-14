import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HostAccessError, requireGameHostAccess } from "@/lib/billing/access";
import { expireGameInTransaction } from "@/lib/game/expiration";
import { parseGameEntry, readGameEntry } from "@/lib/game/entry";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ gameId: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const select = { isPractice: true, status: true, startedAt: true, playbackConfig: true, _count: { select: { purchases: true } } } as const;
const isLocked = (game: { status: string; startedAt: Date | null; _count: { purchases: number } }) =>
  Boolean(game.startedAt) || !["DRAFT", "READY"].includes(game.status) || game._count.purchases > 0;

async function handle(request: NextRequest, { params }: Context, saving: boolean) {
  const { userId } = await auth();
  if (!userId) return reply({ message: "Host authentication is required." }, 401);
  const { gameId } = await params;
  const entry = saving ? parseGameEntry((await request.json().catch(() => null))?.entry) : null;
  if (saving && !entry) return reply({ message: "Choose free or paid entry and a card limit of 1, 2, 3, 5, or 10." }, 400);
  try {
    const owned = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { id: true } });
    if (!owned) return reply({ message: "Game not found for this host." }, 404);
    await requireGameHostAccess(gameId, userId);
    if (!saving) {
      const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select });
      return reply({ ok: true, entry: readGameEntry(game.playbackConfig, game.isPractice), isPractice: game.isPractice, locked: isLocked(game) });
    }
    const result = await prisma.$transaction(async tx => {
      // Enrollment takes the same row lock before reading price/limit settings.
      await expireGameInTransaction(tx, gameId);
      const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, select });
      if (isLocked(game)) return { status: 409, body: { message: "Entry settings lock when the first player joins or the game starts." } };
      if (game.isPractice && (entry!.mode !== "free" || entry!.maxCardsPerPlayer !== 10)) {
        return { status: 400, body: { message: "Practice games include up to ten free cards per player. Use a full game for other entry settings." } };
      }
      const config = game.playbackConfig && typeof game.playbackConfig === "object" && !Array.isArray(game.playbackConfig) ? game.playbackConfig : {};
      await tx.game.update({ where: { id: gameId }, data: { playbackConfig: { ...config, entry: entry! } } });
      return { status: 200, body: { ok: true, entry, isPractice: game.isPractice, locked: false } };
    }, { maxWait: 10_000, timeout: 10_000 });
    return reply(result.body, result.status);
  } catch (error) {
    if (error instanceof HostAccessError) return reply({ message: error.message }, error.status);
    return reply({ message: "Unable to load or save entry settings. Please try again." }, 500);
  }
}

export async function GET(request: NextRequest, context: Context) { return handle(request, context, false); }
export async function PATCH(request: NextRequest, context: Context) { return handle(request, context, true); }
