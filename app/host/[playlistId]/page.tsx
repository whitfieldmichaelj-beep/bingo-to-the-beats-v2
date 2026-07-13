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
  item?: SpotifyTrack | null;
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

  const [clipLength, setClipLength] = useState("20");
  const [cardCount, setCardCount] = useState("100");

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
  .map((entry: PlaylistItem) => entry.item ?? entry.track ?? null)
  .filter(
    (track: SpotifyTrack | null): track is SpotifyTrack =>
      Boolean(track && (track.id || track.uri) && track.name)
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

  function continueToGameSetup() {
    const safeCardCount = Math.min(
      200,
      Math.max(1, Number(cardCount) || 1)
    );

    const query = new URLSearchParams({
      name: playlistName,
      clipLength,
      cardCount: String(safeCardCount),
      trackCount: String(tracks.length),
    });

    router.push(
      `/host/${playlistId}/game?${query.toString()}`
    );
  }

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
          htmlFor="clipLength"
          style={{
            display: "block",
            marginTop: "24px",
            fontWeight: 700,
          }}
        >
          Clip length
        </label>

        <select
          id="clipLength"
          value={clipLength}
          onChange={(event) =>
            setClipLength(event.target.value)
          }
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
          htmlFor="cardCount"
          style={{
            display: "block",
            marginTop: "20px",
            fontWeight: 700,
          }}
        >
          Number of bingo cards
        </label>

        <input
          id="cardCount"
          type="number"
          min="1"
          max="200"
          value={cardCount}
          onChange={(event) =>
            setCardCount(event.target.value)
          }
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
          onClick={continueToGameSetup}
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
