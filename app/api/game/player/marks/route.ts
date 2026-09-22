import { NextRequest, NextResponse } from "next/server";
import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";
import { hasUnavailableDispute } from "@/lib/payments/disputes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest, writing: boolean) {
  const session = await readPlayerSession(request);
  if (!session) return NextResponse.json({ message: "A valid player session is required." }, { status: 401 });
  const body = writing ? await request.json().catch(() => null) : null;
  const gameId = writing ? body?.gameId : request.nextUrl.searchParams.get("gameId");
  if (typeof gameId !== "string" || !gameId || (writing &&
    (!Array.isArray(body?.marks) || body.marks.length > 2500 || body.marks.some((m: {cardId?: unknown; position?: unknown} | null) =>
      !m || typeof m.cardId !== "string" || !Number.isInteger(m.position))))) {
    return NextResponse.json({ message: "Invalid card marks." }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize saves with winner confirmation so no selection can change after completion.
      await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR UPDATE`;
      const game = await tx.game.findUnique({ where: { id: gameId }, select: { status: true } });
      const purchase = await tx.purchase.findUnique({
        where: { gameId_playerKey: { gameId, playerKey: session.playerId } },
        include: { disputes: true },
      });
      if (!game || purchase?.status !== "PAID" || hasUnavailableDispute(purchase.disputes)) {
        return { status: 403, data: { message: "These cards are not available to this player." } };
      }
      const cards = await tx.bingoCard.findMany({
        where: { gameId, playerKey: session.playerId, purchaseId: purchase.id, status: { not: "VOID" } },
        include: { squares: true },
      });
      if (writing) {
        if (game.status === "COMPLETED" || game.status === "CANCELLED") {
          return { status: 409, data: { message: "This game has ended. Card marks are locked." } };
        }
        const called = await tx.gameTrack.findMany({ where: { gameId, called: true }, select: { trackId: true } });
        const allowed = new Set(called.map((t) => t.trackId));
        const squares = cards.flatMap((c) => c.squares);
        const selected = new Set<string>();
        for (const mark of body.marks) {
          const square = squares.find((s) => s.cardId === mark.cardId && s.position === mark.position);
          if (!square || !allowed.has(square.trackId)) {
            return { status: 400, data: { message: "Only played songs on your cards can be marked." } };
          }
          selected.add(square.id);
        }
        const cardIds = cards.map((c) => c.id);
        await tx.cardSquare.updateMany({ where: { cardId: { in: cardIds }, marked: true, id: { notIn: [...selected] } }, data: { marked: false, markedAt: null } });
        await tx.cardSquare.updateMany({ where: { cardId: { in: cardIds }, marked: false, id: { in: [...selected] } }, data: { marked: true, markedAt: new Date() } });
      }
      const marks = await tx.cardSquare.findMany({
        where: { cardId: { in: cards.map((c) => c.id) }, marked: true },
        select: { cardId: true, position: true },
      });
      return { status: 200, data: { ok: true, marks, gameStatus: game.status } };
    });
    return NextResponse.json(result.data, { status: result.status });
  } catch {
    return NextResponse.json({ message: "Unable to save or load card marks. Please try again." }, { status: 500 });
  }
}

export const GET = (request: NextRequest) => handle(request, false);
export const PUT = (request: NextRequest) => handle(request, true);
