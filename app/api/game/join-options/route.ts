import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return reply({ message: "Enter a valid game code." }, 400);
  try {
    const game = await prisma.game.findUnique({ where: { joinCode: code }, select: { isPractice: true, status: true } });
    if (!game) return reply({ message: "Game not found. Check the code with your host." }, 404);
    if (["COMPLETED", "CANCELLED"].includes(game.status)) return reply({ message: "This game has ended." }, 409);
    return reply({ isPractice: game.isPractice });
  } catch {
    return reply({ message: "Unable to check this game. Please try again." }, 503);
  }
}
