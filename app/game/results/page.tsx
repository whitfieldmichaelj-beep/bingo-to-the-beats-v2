import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GameResults({ searchParams }: { searchParams: Promise<{ gameId?: string }> }) {
  const { gameId } = await searchParams;
  const game = gameId ? await prisma.game.findUnique({ where: { id: gameId }, select: {
    joinCode: true, status: true,
    winners: { where: { verified: true }, take: 1, select: { card: { select: { playerName: true, cardNumber: true } } } },
  } }) : null;
  const winner = game?.winners[0]?.card;
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#080d19", color: "#fff", textAlign: "center" }}>
    <section aria-label="Game results" style={{ maxWidth: 640 }}>
      <p>Bingo to the Beats{game ? ` • ${game.joinCode}` : ""}</p>
      <div aria-hidden="true" style={{ fontSize: 80 }}>🏆</div>
      <h1 style={{ fontSize: "clamp(40px, 8vw, 72px)" }}>{winner ? `${winner.playerName || "Player"} wins!` : game ? "Game results" : "Game not found"}</h1>
      <p role="status" style={{ fontSize: 26 }}>{winner ? `BINGO! Card #${winner.cardNumber} • Game over` : game?.status === "COMPLETED" || game?.status === "CANCELLED" ? "This game ended without a confirmed winner." : game ? "No winner has been confirmed yet." : "Check the game link and try again."}</p>
      <p>{winner ? "Congratulations! These results stay available after the game ends." : ""}</p>
      <Link href="/join" style={{ color: "#8edfff" }}>Join a game</Link>
    </section>
  </main>;
}
