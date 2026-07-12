"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";

type SpotifyImage = {
  url: string;
};

type SpotifyArtist = {
  name: string;
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album?: {
    images?: SpotifyImage[];
  };
};

type PlaylistItem = {
  track?: SpotifyTrack | null;
};

export default function HostPlaylistPage() {
  const params = useParams<{ playlistId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const playlistId = params.playlistId;
  const playlistName =
    searchParams.get("name") || "Selected Playlist";

  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Loading playlist songs..."
  );

  useEffect(() => {
    async function loadTracks() {
      try {
        const response = await fetch(
          `/api/spotify/playlists/${playlistId}/tracks`,
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.error || "Unable to load songs.");
          return;
        }

        const validTracks = (data.items || [])
          .map((item: PlaylistItem) => item.track)
          .filter(
            (
              track: SpotifyTrack | null | undefined
            ): track is SpotifyTrack => Boolean(track?.id)
          );

        setTracks(validTracks);

        setMessage(
          validTracks.length > 0
            ? `${validTracks.length} songs loaded.`
            : "No playable songs were found."
        );
      } catch (error) {
        console.error(error);
        setMessage("Unable to load songs.");
      } finally {
        setLoading(false);
      }
    }

    loadTracks();
  }, [playlistId]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#0f172a",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Link
        href="/spotify"
        style={{
          color: "#93c5fd",
          textDecoration: "none",
        }}
      >
        ← Choose Another Playlist
      </Link>

      <p
        style={{
          marginTop: "28px",
          color: "#1ed760",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        Host Setup
      </p>

      <h1
        style={{
          marginTop: "8px",
          fontSize: "42px",
        }}
      >
        {playlistName}
      </h1>

      <p
        style={{
          marginTop: "12px",
          color: "#cbd5e1",
        }}
      >
        {loading ? "Loading..." : message}
      </p>

      <section
        style={{
          marginTop: "32px",
          padding: "24px",
          background: "#1e293b",
          borderRadius: "16px",
          maxWidth: "700px",
        }}
      >
        <h2 style={{ fontSize: "24px" }}>
          Game Settings
        </h2>

        <label
          style={{
            display: "block",
            marginTop: "24px",
            fontWeight: 700,
          }}
        >
          Clip length
        </label>

        <select
          defaultValue="20"
          style={{
            width: "100%",
            marginTop: "8px",
            padding: "12px",
            borderRadius: "8px",
            color: "#111827",
          }}
        >
          <option value="10">10 seconds</option>
          <option value="15">15 seconds</option>
          <option value="20">20 seconds</option>
          <option value="30">30 seconds</option>
        </select>

        <label
          style={{
            display: "block",
            marginTop: "20px",
            fontWeight: 700,
          }}
        >
          Number of bingo cards
        </label>

        <input
          type="number"
          min="1"
          max="200"
          defaultValue="100"
          style={{
            width: "100%",
            marginTop: "8px",
            padding: "12px",
            borderRadius: "8px",
            color: "#111827",
          }}
        />

        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => {
            router.push(
              `/host/${playlistId}/game?name=${encodeURIComponent(
                playlistName
              )}`
            );
          }}
          style={{
            width: "100%",
            marginTop: "24px",
            padding: "15px",
            border: 0,
            borderRadius: "10px",
            background:
              tracks.length > 0 ? "#1ed760" : "#64748b",
            color: "#052e16",
            fontSize: "17px",
            fontWeight: 800,
            cursor:
              tracks.length > 0
                ? "pointer"
                : "not-allowed",
          }}
        >
          Continue to Game Setup
        </button>
      </section>

      <section
        style={{
          marginTop: "40px",
          maxWidth: "900px",
        }}
      >
        <h2 style={{ fontSize: "26px" }}>
          Playlist Songs
        </h2>

        <div style={{ marginTop: "18px" }}>
          {tracks.slice(0, 20).map((track, index) => (
            <div
              key={track.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "12px 0",
                borderBottom: "1px solid #334155",
              }}
            >
              <span
                style={{
                  width: "28px",
                  color: "#94a3b8",
                }}
              >
                {index + 1}
              </span>

              {track.album?.images?.[0]?.url && (
                <img
                  src={track.album.images[0].url}
                  alt=""
                  style={{
                    width: "50px",
                    height: "50px",
                    objectFit: "cover",
                    borderRadius: "6px",
                  }}
                />
              )}

              <div>
                <strong>{track.name}</strong>
                <p
                  style={{
                    marginTop: "4px",
                    color: "#94a3b8",
                  }}
                >
                  {track.artists
                    .map((artist) => artist.name)
                    .join(", ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
