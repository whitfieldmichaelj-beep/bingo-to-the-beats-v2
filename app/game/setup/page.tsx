import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { expireGames } from "@/lib/game/expiration";
import { readGamePrize } from "@/lib/game/prize";
import GameSetup from "./GameSetup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entry & Prize Setup" };

export default async function GameSetupPage({ searchParams }: { searchParams: Promise<{ gameId?: string | string[] }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { gameId } = await searchParams;
  if (typeof gameId !== "string" || !gameId.trim()) redirect("/dashboard");
  await expireGames({ id: gameId, host: { clerkId: userId } });
  const game = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } },
    select: { id: true, title: true, playlistName: true, status: true, startedAt: true, playbackConfig: true, _count: { select: { purchases: true } } } });
  if (!game) redirect("/dashboard");
  if (["COMPLETED", "CANCELLED"].includes(game.status)) redirect(`/dashboard/games/${encodeURIComponent(game.id)}`);
  const editable = !game.startedAt && ["DRAFT", "READY"].includes(game.status);
  const playbackSource = game.playbackConfig && typeof game.playbackConfig === "object" && !Array.isArray(game.playbackConfig)
    ? String((game.playbackConfig as { source?: unknown }).source ?? "")
    : "";
  const browserHosted = playbackSource === "apple";
  const controlHref = browserHosted
    ? `/game/control?gameId=${encodeURIComponent(game.id)}`
    : `/dj-console?gameId=${encodeURIComponent(game.id)}`;
  const controlLabel = browserHosted ? "Browser Host Controls" : "DJ Console";
  return <main className="dashboard-page"><div className="dashboard-container game-setup">
    <Link href="/dashboard" className="dashboard-secondary">← Saved games</Link>
    <header className="dashboard-heading"><div>
      <p className="dashboard-eyebrow">GAME SETUP → {browserHosted ? "BROWSER HOST" : "DJ CONSOLE"}</p>
      <h1>Entry &amp; Prize Setup</h1>
      <p>{game.title || game.playlistName}</p>
    </div></header>
    <p>Choose entry and prize details here. {browserHosted ? "Your browser host controls" : "Your DJ Console"} will show the saved terms while you run the game.</p>
    <GameSetup key={game.id} gameId={game.id} initialPrize={readGamePrize(game.playbackConfig)} editable={editable} playerCount={game._count.purchases} controlHref={controlHref} controlLabel={controlLabel} />
  </div></main>;
}
