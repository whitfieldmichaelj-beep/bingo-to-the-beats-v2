"use client";

import Link from "next/link";
import { useState } from "react";

type SavedGame = {
  id: string;
  title: string | null;
  playlistName: string;
  joinCode: string;
  status: string;
  playlistTrackCount: number;
  createdAt: string;
  cardCount: number;
  winners: { name: string; cardNumber: number }[];
  prize?: string | null;
};
const ended = (game: SavedGame) => ["COMPLETED", "CANCELLED"].includes(game.status);
const needsSetup = (game: SavedGame) => ["DRAFT", "READY"].includes(game.status);
const actionLabel = (game: SavedGame) => ended(game) ? "View Game" : needsSetup(game) ? "Entry & Prize Setup" : "Resume Game";
const statusLabels: Record<string, string> = {
  DRAFT: "Draft", READY: "Ready to start", LIVE: "Live", PAUSED: "Paused",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
};

export default function SavedGames({ games }: { games: SavedGame[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const query = search.trim().toLowerCase();
  const visible = games.filter(game =>
    (filter === "all" || (filter === "open" ? !ended(game) : ended(game))) &&
    [game.title, game.playlistName, game.joinCode].some(value => value?.toLowerCase().includes(query))
  );
  const openCount = games.filter(game => !ended(game)).length;

  if (!games.length) return <section className="dashboard-empty">
    <h2>Your first game starts here</h2>
    <p>Choose your music and create your cards. Your saved games will appear here.</p>
    <Link className="dashboard-primary" href="/game/new">Create New Game</Link>
  </section>;

  return <section aria-labelledby="saved-games-title">
    <div className="dashboard-section-heading">
      <h2 id="saved-games-title">Your saved games</h2>
      <span>{games.length} saved</span>
    </div>
    <p className="dashboard-expiry-note">For an unstarted game, open <strong>Entry &amp; Prize Setup</strong> to choose free or paid entry, the card limit, and the prize.</p>
    <p className="dashboard-expiry-note">Unfinished games close after 24 hours without host activity, or when you create a new game. All past games stay here to view, including their winners. Closed games cannot restart or accept players.</p>
    <div className="dashboard-toolbar">
      <label className="dashboard-search">Find a game
        <input type="search" placeholder="Search playlist or game code" value={search}
          onChange={event => setSearch(event.target.value)} aria-controls="saved-games-list" />
      </label>
      <div className="dashboard-filters" role="group" aria-label="Filter saved games">
        {[["all", `All (${games.length})`], ["open", `Open games (${openCount})`], ["ended", `Ended (${games.length - openCount})`]].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        )}
      </div>
    </div>
    <p className="dashboard-result-count" role="status">{visible.length} {visible.length === 1 ? "game" : "games"} shown</p>
    <div id="saved-games-list" className="dashboard-games">
      {visible.map(game => <article key={game.id} className="dashboard-game">
        <div className="dashboard-game-top">
          <span className={`dashboard-status status-${game.status.toLowerCase()}`}>{statusLabels[game.status] ?? game.status}</span>
          <time dateTime={game.createdAt}>{new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(new Date(game.createdAt))}</time>
        </div>
        <h3>{game.title || game.playlistName}</h3>
        {game.title && game.title !== game.playlistName && <p className="dashboard-playlist">{game.playlistName}</p>}
        <p className="dashboard-game-meta">{game.playlistTrackCount} {game.playlistTrackCount === 1 ? "song" : "songs"} <span aria-hidden="true">·</span> {game.cardCount} {game.cardCount === 1 ? "card" : "cards"} generated</p>
        {ended(game) && <p className="dashboard-winner">{game.winners.length
          ? game.winners.map(winner => `Winner: ${winner.name} · Card #${winner.cardNumber}`).join("; ")
          : "No confirmed winner"}</p>}
        {game.prize && <p className="dashboard-game-meta">Prize: {game.prize}</p>}
        <div className="dashboard-game-bottom">
          <div className="dashboard-code"><span>{ended(game) ? "Game code" : "Player join code"}</span><strong>{game.joinCode}</strong></div>
          <Link href={ended(game) ? `/dashboard/games/${encodeURIComponent(game.id)}` : needsSetup(game) ? `/game/setup?gameId=${encodeURIComponent(game.id)}` : `/dj-console?gameId=${encodeURIComponent(game.id)}`} prefetch={false}
            className={ended(game) ? "dashboard-secondary" : "dashboard-primary"}
            aria-label={`${actionLabel(game)}: ${game.title || game.playlistName} (${game.joinCode})`}>
            {actionLabel(game)}<span aria-hidden="true"> →</span>
          </Link>
        </div>
      </article>)}
    </div>
    {!visible.length && <div className="dashboard-empty">
      <h3>No matching games</h3><p>Try another playlist name or game code, or show all your saved games.</p>
      <button type="button" className="dashboard-secondary" onClick={() => {setSearch("");setFilter("all");}}>Clear search & filters</button>
    </div>}
  </section>;
}
