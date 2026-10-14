import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { localWidgetRequest } from "@/lib/dj-widget/local-access";
import { serializedWidgetSession, WidgetError } from "@/lib/dj-widget/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (!localWidgetRequest(request)) return response({ message: "Open the desktop widget from BTTB on this computer using localhost." }, 403);
  const { userId } = await auth();
  if (!userId) return response({ message: "Sign in to BTTB to open the widget." }, 401);
  try {
    if (Number(request.headers.get("content-length")) > 500000) return response({ message: "Widget update too large." }, 413);
    const text = await request.text();
    if (text.length > 500000) return response({ message: "Widget update too large." }, 413);
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ message: "Invalid widget request." }, 400);
    if (body.action === "start") {
      if (typeof body.gameId !== "string") return response({ message: "Select a game first." }, 400);
      const game = await prisma.game.findFirst({ where: { id: body.gameId, host: { clerkId: userId } }, select: { id: true } });
      if (!game) return response({ message: "Game not found for this host." }, 404);
    }
    return response({ ok: true, ...await serializedWidgetSession(userId, body) });
  } catch (error) {
    if (error instanceof WidgetError) return response({ message: error.message }, error.status);
    if (error instanceof SyntaxError) return response({ message: "Invalid widget request." }, 400);
    console.error("Desktop widget unavailable:", error instanceof Error ? error.message : "Unknown error");
    return response({ message: "The desktop widget is unavailable. Your game is unchanged." }, 503);
  }
}
