import { redirect } from "next/navigation";
import DjConsole from "./DjConsole";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { readGameEntry } from "@/lib/game/entry";
import { expireGames } from "@/lib/game/expiration";

export default async function DjConsolePage({ searchParams }: {
  searchParams: Promise<{ gameId?: string | string[] }>;
}) {
  const { gameId } = await searchParams;
  if (typeof gameId !== "string" || !gameId.trim()) redirect("/dashboard");
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  await expireGames({ id: gameId, host: { clerkId: userId } });
  const game = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { status: true, isPractice: true, playbackConfig: true } });
  if (!game) redirect("/dashboard");
  if (["COMPLETED", "CANCELLED"].includes(game.status)) redirect(`/dashboard/games/${encodeURIComponent(gameId)}`);
  return <DjConsole key={gameId} gameId={gameId} entry={readGameEntry(game.playbackConfig, game.isPractice)} />;
}
