"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

type SpotifyOwner = {
  display_name?: string | null;
};

type SpotifyPlaylist = {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[];
  owner?: SpotifyOwner;
  public?: boolean;
  items?: {
    total?: number;
  };
  tracks?: {
    total?: number;
  };
};

type PlaylistApiResponse = {
  items?: SpotifyPlaylist[];
  total?: number;
  error?: string;
};

export default function SpotifyPage() {
  console.log("SpotifyPage rendered");
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    console.log("useEffect started");
    let cancelled = false;

    async function loadPlaylists() {
      setLoading(true);
      setErrorMessage("");

      try {
        console.log("About to fetch playlists");
        const response = await fetch("/api/spotify/playlists", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        const data = (await response.json()) as PlaylistApiResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setErrorMessage(
            data.error || "Unable to load your Spotify playlists."
          );
          setPlaylists([]);
          return;
        }

        setPlaylists(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        console.error("Spotify playlist page error:", error);

        if (!cancelled) {
          setErrorMessage(
            "The app could not load your Spotify playlists. Please try again."
          );
          setPlaylists([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPlaylists = playlists.filter((playlist) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    const name = playlist.name?.toLowerCase() || "";
    const owner = playlist.owner?.display_name?.toLowerCase() || "";

    return name.includes(query) || owner.includes(query);
  });

  function getTrackTotal(playlist: SpotifyPlaylist) {
    return playlist.items?.total ?? playlist.tracks?.total ?? 0;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070713] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-150px] top-20 h-[420px] w-[420px] rounded-full bg-purple-700/30 blur-[140px]" />
        <div className="absolute right-[-180px] top-52 h-[450px] w-[450px] rounded-full bg-pink-600/20 blur-[150px]" />
        <div className="absolute bottom-[-220px] left-1/3 h-[520px] w-[520px] rounded-full bg-blue-700/20 blur-[170px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/music"
            className="inline-flex items-center gap-2 text-sm font-bold text-purple-300 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Back to Music Sources
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Dashboard
          </Link>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-950/90 via-[#111126] to-pink-950/60 p-7 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-green-300/20 bg-green-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-green-200">
                Spotify Connected
              </span>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                Choose a Spotify Playlist
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Select the playlist you want to use for your next Bingo to the
                Beats game.
              </p>
            </div>

            {!loading && !errorMessage && (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Playlists Found
                </p>

                <p className="mt-1 text-3xl font-black text-white">
                  {playlists.length}
                </p>
              </div>
            )}
          </div>
        </section>

        {!loading && !errorMessage && playlists.length > 0 && (
          <section className="mt-7">
            <label
              htmlFor="playlist-search"
              className="mb-2 block text-sm font-bold text-slate-300"
            >
              Search playlists
            </label>

            <input
              id="playlist-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by playlist or owner..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-purple-400/60 focus:bg-white/[0.1] focus:ring-4 focus:ring-purple-500/10"
            />
          </section>
        )}

        {loading && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] p-10 text-center shadow-xl backdrop-blur-xl">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-green-400" />

            <h2 className="mt-5 text-xl font-black text-white">
              Loading your Spotify playlists
            </h2>

            <p className="mt-2 text-slate-400">
              This should only take a moment.
            </p>
          </section>
        )}

        {!loading && errorMessage && (
          <section className="mt-8 rounded-3xl border border-red-400/20 bg-red-500/10 p-8 shadow-xl backdrop-blur-xl">
            <h2 className="text-2xl font-black text-red-100">
              Spotify playlists could not be loaded
            </h2>

            <p className="mt-3 text-red-100/80">{errorMessage}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:scale-[1.02]"
              >
                Try Again
              </button>

              <Link
                href="/api/spotify/login"
                className="rounded-xl bg-[#1DB954] px-5 py-3 text-sm font-black text-black transition hover:scale-[1.02] hover:bg-[#25d366]"
              >
                Reconnect Spotify
              </Link>
            </div>
          </section>
        )}

        {!loading &&
          !errorMessage &&
          playlists.length === 0 && (
            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] p-10 text-center shadow-xl backdrop-blur-xl">
              <div className="text-5xl" aria-hidden="true">
                ♫
              </div>

              <h2 className="mt-5 text-2xl font-black">
                No Spotify playlists found
              </h2>

              <p className="mt-3 text-slate-400">
                Create a playlist in Spotify, then return here and refresh the
                page.
              </p>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-6 rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-500"
              >
                Refresh Playlists
              </button>
            </section>
          )}

        {!loading &&
          !errorMessage &&
          playlists.length > 0 &&
          filteredPlaylists.length === 0 && (
            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center backdrop-blur-xl">
              <h2 className="text-xl font-black">No matching playlists</h2>

              <p className="mt-2 text-slate-400">
                Try a different playlist name.
              </p>
            </section>
          )}

        {!loading &&
          !errorMessage &&
          filteredPlaylists.length > 0 && (
            <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredPlaylists.map((playlist) => {
                const artwork = playlist.images?.[0]?.url;
                const trackTotal = getTrackTotal(playlist);
                const owner =
                  playlist.owner?.display_name || "Spotify";

                return (
                  <Link
                    key={playlist.id}
                    href={`/host/${playlist.id}?name=${encodeURIComponent(
                      playlist.name
                    )}&source=spotify`}
                    className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-purple-400/50 hover:bg-white/[0.1]"
                  >
                    <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-purple-900 via-[#19192d] to-pink-900">
                      {artwork ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={artwork}
                          alt={`${playlist.name} playlist cover`}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-6xl text-white/40">
                          ♫
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                      <span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">
                        {trackTotal} {trackTotal === 1 ? "song" : "songs"}
                      </span>
                    </div>

                    <div className="p-5">
                      <h2 className="line-clamp-2 text-xl font-black text-white">
                        {playlist.name}
                      </h2>

                      <p className="mt-2 text-sm text-slate-400">
                        By {owner}
                      </p>

                      {playlist.description && (
                        <p
                          className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300"
                          dangerouslySetInnerHTML={{
                            __html: playlist.description,
                          }}
                        />
                      )}

                      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                        <span className="text-sm font-black text-green-300">
                          Select Playlist
                        </span>

                        <span
                          className="text-xl text-green-300 transition group-hover:translate-x-1"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}
      </div>
    </main>
  );

}
