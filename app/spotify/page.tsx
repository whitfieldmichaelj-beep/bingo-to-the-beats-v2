"use client";

import { useEffect, useState } from "react";

type Playlist = {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  tracks?: { total: number };
};

export default function SpotifyPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading your playlists...");

  useEffect(() => {
    async function loadPlaylists() {
      try {
        const response = await fetch("/api/spotify/playlists", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.error || "Unable to load playlists.");
          return;
        }

        const items = data.items || [];

        setPlaylists(items);
        setMessage(
          items.length > 0
            ? "Choose a playlist to start building your game."
            : "No playlists were found."
        );
      } catch (error) {
        console.error(error);
        setMessage("Unable to load playlists.");
      } finally {
        setLoading(false);
      }
    }

    loadPlaylists();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#111827",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <a href="/" style={{ color: "#93c5fd", textDecoration: "none" }}>
        ← Back to Home
      </a>

      <h1 style={{ marginTop: "24px", fontSize: "36px" }}>
        Spotify Playlists
      </h1>

      <p style={{ marginTop: "12px", color: "#d1d5db" }}>
        {loading ? "Loading..." : message}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "20px",
          marginTop: "32px",
        }}
      >
        {playlists.map((playlist) => (
          <article
            key={playlist.id}
            style={{
              background: "#1f2937",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            {playlist.images?.[0]?.url && (
              <img
                src={playlist.images[0].url}
                alt={playlist.name}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: "10px",
                }}
              />
            )}

            <h2 style={{ marginTop: "14px", fontSize: "18px" }}>
              {playlist.name}
            </h2>

            <p style={{ marginTop: "6px", color: "#9ca3af" }}>
              {playlist.tracks?.total ?? 0} songs
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
