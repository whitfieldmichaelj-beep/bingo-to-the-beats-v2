"use client";

type Props = {
  playlist: string;
  pattern: string;
  players: number;
  cards: number;
  currentSong: number;
  totalSongs: number;
  status: string;
};

export default function EventStatus({
  playlist,
  pattern,
  players,
  cards,
  currentSong,
  totalSongs,
  status,
}: Props) {
  return (
    <section className="dj-event-status">

      <div className="dj-event-item">
        <span>Playlist</span>
        <strong>{playlist}</strong>
      </div>

      <div className="dj-event-item">
        <span>Pattern</span>
        <strong>{pattern}</strong>
      </div>

      <div className="dj-event-item">
        <span>Players</span>
        <strong>{players}</strong>
      </div>

      <div className="dj-event-item">
        <span>Cards</span>
        <strong>{cards}</strong>
      </div>

      <div className="dj-event-item">
        <span>Song</span>
        <strong>
          {currentSong}/{totalSongs}
        </strong>
      </div>

      <div className="dj-event-item">
        <span>Status</span>
        <strong>{status}</strong>
      </div>

    </section>
  );
}