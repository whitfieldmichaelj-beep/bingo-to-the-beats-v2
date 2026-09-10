import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const games = await prisma.game.findMany({
    where: { host: { clerkId: userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, playlistName: true, joinCode: true,
      status: true, playlistTrackCount: true, createdAt: true,
      _count: { select: { cards: true } },
    },
  });

  return (
    <main style={{ minHeight: "100vh", padding: "50px 24px 80px", background: "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)", color: "white" }}>
      <section style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(42px,6vw,72px)" }}>DJ Dashboard</h1>
        <div style={buttonRowStyle}>
          <Link href="/game/new" style={buttonStyle}>Create New Game</Link>
          <Link href="/music" style={buttonStyle}>Music Library</Link>
          <Link href="/music/upload" style={buttonStyle}>Import Serato CSV</Link>
        </div>
        <h2 style={{ marginTop: 40 }}>Your Saved Games</h2>
        {games.length === 0 && <section style={panelStyle}>No saved games yet. Create a new game to get started.</section>}
        {games.map((game) => {
          const ended = game.status === "COMPLETED" || game.status === "CANCELLED";
          return (
            <section key={game.id} style={panelStyle}>
              <p style={eyebrowStyle}>{game.status}</p>
              <h2>{game.title || game.playlistName}</h2>
              <p>Playlist: {game.playlistName} · {game.playlistTrackCount} songs</p>
              <p>Player Join Code: {game.joinCode} · Cards Generated: {game._count.cards}</p>
              <p>Created: {game.createdAt.toISOString().slice(0, 10)}</p>
              <Link href={`/dj-console?gameId=${encodeURIComponent(game.id)}`} prefetch={false} style={buttonStyle}>
                {ended ? "View Game" : "Resume Game"}
              </Link>
            </section>
          );
        })}
      </section>
    </main>
  );
}

const panelStyle = {
  marginTop: "40px",
  padding: "30px",
  borderRadius: "22px",
  background: "rgba(15,23,42,.92)",
  border: "1px solid #334155",
};

const eyebrowStyle = {
  margin: 0,
  color: "#a78bfa",
  fontWeight: 900,
  letterSpacing: ".12em",
  textTransform: "uppercase" as const,
  fontSize: "13px",
};

const buttonRowStyle = {
  display: "flex",
  gap: "16px",
  flexWrap: "wrap" as const,
  marginTop: "25px",
};

const buttonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  textDecoration: "none",
  fontWeight: 900,
};
