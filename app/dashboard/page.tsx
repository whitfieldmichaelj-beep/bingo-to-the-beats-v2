import { expireGames } from "@/lib/game/expiration";
import Link from "next/link";
import SavedGames from "./SavedGames";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readGamePrize } from "@/lib/game/prize";

export const metadata = { title: "DJ Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  await expireGames({ host: { clerkId: userId } });
  const games = await prisma.game.findMany({
    where: { host: { clerkId: userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      playlistName: true,
      joinCode: true,
      status: true,
      playlistTrackCount: true,
      createdAt: true,
      playbackConfig: true,
      winners: { where: { verified: true }, orderBy: { verifiedAt: "asc" },
        select: { card: { select: { playerName: true, cardNumber: true } } } },
      _count: {
        select: {
          cards: true,
        },
      },
    },
  });

  return (
    <main className="dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div><p className="dashboard-eyebrow">YOUR HOST WORKSPACE</p><h1>DJ Dashboard</h1>
            <p>Start tonight’s game or pick up where you left off.</p></div>
          <Link href="/game/new" className="dashboard-primary">+ Create New Game</Link>
        </header>
        <nav className="dashboard-shortcuts" aria-label="Host tools">
          <Link href="/dj">DJ Software</Link><Link href="/music">Music Library</Link>
          <Link href="/music/upload">Import Serato CSV</Link><Link href="/billing">Billing & Subscription</Link>
        </nav>
        <SavedGames games={games.map(({playbackConfig, _count, winners, ...game}) => ({...game, createdAt:game.createdAt.toISOString(), cardCount:_count.cards, prize: readGamePrize(playbackConfig)?.description ?? null,
          source: playbackConfig && typeof playbackConfig === "object" && !Array.isArray(playbackConfig) ? String((playbackConfig as { source?: unknown }).source ?? "") : "",
          winners: winners.map(winner => ({name: winner.card.playerName || "Player", cardNumber: winner.card.cardNumber}))}))} />
      </div>
    </main>
  );
}
