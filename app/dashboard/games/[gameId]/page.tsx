import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { expireGames } from "@/lib/game/expiration";
import { readSavedGameEntry } from "@/lib/game/entry";
import { readGamePrize } from "@/lib/game/prize";
import { readRehearsal } from "@/lib/game/rehearsal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Past game" };

export default async function GameHistory({ params }: { params: Promise<{ gameId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { gameId } = await params;
  await expireGames({ id: gameId, host: { clerkId: userId } });
  const game = await prisma.game.findFirst({
    where: { id: gameId, host: { clerkId: userId } },
    include: {
      winners: { where: { verified: true }, include: { card: true } },
      tracks: { orderBy: { position: "asc" }, include: { track: true } },
      cards: { orderBy: { cardNumber: "asc" }, include: { squares: { orderBy: { position: "asc" }, include: { track: true } } } },
    },
  });
  if (!game) notFound();
  if (!["COMPLETED", "CANCELLED"].includes(game.status)) redirect(`/dj-console?gameId=${encodeURIComponent(game.id)}`);
  const called = game.tracks.filter(track => track.called);
  const prize = readGamePrize(game.playbackConfig);
  const entry = readSavedGameEntry(game.playbackConfig);
  const tasks = readRehearsal(game.playbackConfig);
  const responses = {
    done: tasks.filter(task => task.response === "done").length,
    problem: tasks.filter(task => task.response === "problem").length,
    pending: tasks.filter(task => task.response === "pending").length,
  };
  const time = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
  const showTime = (value: string | Date | null) => {
    if (!value) return "Not recorded";
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? "Not recorded" : time.format(timestamp);
  };
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return <main className="dashboard-page"><div className="dashboard-container game-history">
    <Link className="dashboard-secondary" href="/dashboard">← All saved games</Link>
    <header className="dashboard-heading"><div>
      <p className="dashboard-eyebrow">PAST GAME · VIEW ONLY</p>
      <h1>{game.title || game.playlistName}</h1>
      <p>Game {game.joinCode} · {date.format(game.createdAt)}</p>
    </div><span className={`dashboard-status status-${game.status.toLowerCase()}`}>{game.status === "COMPLETED" ? "Completed" : "Cancelled"}</span></header>
    <p className="dashboard-expiry-note">This game is saved for your records. It cannot restart, accept players, or change its cards and results.</p>
    <section className="dashboard-game" aria-labelledby="past-winner">
      <h2 id="past-winner">{game.winners.length ? "Confirmed winner" : "No confirmed winner"}</h2>
      {game.winners.map(winner => <p className="history-winner" key={winner.id}>{winner.card.playerName || "Player"} <span>· Card #{winner.card.cardNumber}</span></p>)}
      {!game.winners.length && <p>This game ended without a confirmed Bingo winner.</p>}
      <p className="game-prize-display"><strong>Prize:</strong> {prize?.description ?? "No prize was recorded for this game."}</p>
      <p>{called.length} of {game.tracks.length} songs called · {game.cards.length} cards generated</p>
      <p>Playlist: {game.playlistName}</p>
      <p>Started: {showTime(game.startedAt)} · Ended: {showTime(game.completedAt)}</p>
      {entry && <p>{entry.mode === "free" ? "Free entry" : "Paid entry"} · Maximum {entry.maxCardsPerPlayer} cards per player</p>}
    </section>
    {tasks.length > 0 && <section aria-labelledby="past-scenarios">
      <h2 id="past-scenarios">Player test results</h2>
      <p>{responses.done} reported done · {responses.problem} reported a problem · {responses.pending} unanswered</p>
      <p>These are player confirmations, not automatic verification of each step. This record contains the last instruction saved for each player.</p>
      {tasks.map(task => <article className="dashboard-game" key={task.id}>
        <h3>{game.cards.find(card => card.playerKey === task.playerKey)?.playerName || "Player"} · {task.response === "done" ? "Done (player reported)" : task.response === "problem" ? "Problem reported" : "No response recorded"}</h3>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{task.text}</p>
        {task.note && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>Player report:</strong> {task.note}</p>}
        <p>Sent: {showTime(task.sentAt)} · Response: {showTime(task.respondedAt)}</p>
      </article>)}
    </section>}
    <section aria-labelledby="past-cards"><h2 id="past-cards">Saved player cards</h2>
      {game.cards.map(card => <details className="dashboard-game" key={card.id}>
        <summary>Card #{card.cardNumber} · {card.playerName || "Unassigned"}{card.status === "WINNER" ? " · Winner" : ""}</summary>
        <p>{card.squares.filter(square => square.marked).length} marked · View only</p>
        <div className="history-card" style={{ gridTemplateColumns: `repeat(${card.columns}, minmax(0, 1fr))` }}>
          {card.squares.map(square => <div key={square.id} className={square.marked ? "marked" : ""}>
            <strong>{square.marked ? "✓ " : ""}{square.track.title}</strong><span>{square.track.artist}</span>
          </div>)}
        </div>
      </details>)}
    </section>
    <details className="dashboard-game"><summary>Saved playlist · {game.tracks.length} songs</summary>
      <ol className="history-playlist">{game.tracks.map(track => <li key={track.id}><strong>{track.track.title}</strong> — {track.track.artist} <span>{track.called ? "Called" : "Not called"}</span></li>)}</ol>
    </details>
  </div></main>;
}
