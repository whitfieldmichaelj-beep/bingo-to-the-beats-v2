"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

type ConnectionStatus =
  | "checking"
  | "connected"
  | "disconnected"
  | "error";

type MusicSourceCardProps = {
  title: string;
  description: string;
  status: string;
  statusStyle: string;
  icon: string;
  children?: React.ReactNode;
};

function MusicSourceCard({
  title,
  description,
  status,
  statusStyle,
  icon,
  children,
}: MusicSourceCardProps) {
  return (
    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-white/[0.09]">
      <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl transition group-hover:bg-purple-500/20" />

      <div className="relative">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-3xl shadow-lg">
              {icon}
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">
                {title}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {description}
              </p>
            </div>
          </div>

          <span
            className={`w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${statusStyle}`}
          >
            {status}
          </span>
        </div>

        {children && (
          <div className="mt-6 flex flex-wrap gap-3">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

function getStatusBadge(status: ConnectionStatus) {
  switch (status) {
    case "checking":
      return {
        label: "Checking",
        style:
          "border-yellow-300/30 bg-yellow-400/10 text-yellow-200",
      };

    case "connected":
      return {
        label: "Connected",
        style:
          "border-green-300/30 bg-green-400/10 text-green-200",
      };

    case "error":
      return {
        label: "Connection Error",
        style:
          "border-red-300/30 bg-red-400/10 text-red-200",
      };

    default:
      return {
        label: "Not Connected",
        style:
          "border-slate-300/20 bg-slate-400/10 text-slate-200",
      };
  }
}

export default function MusicPage() {
  const [spotifyStatus, setSpotifyStatus] =
    useState<ConnectionStatus>("checking");

  const [appleStatus, setAppleStatus] =
    useState<ConnectionStatus>("checking");

  const [appleScriptReady, setAppleScriptReady] =
    useState(false);

  const [appleConfigured, setAppleConfigured] =
    useState(false);

  const [appleMessage, setAppleMessage] =
    useState("Preparing Apple Music...");

  const [connectingApple, setConnectingApple] =
    useState(false);

  useEffect(() => {
    async function checkSpotify() {
      try {
        const response = await fetch("/api/spotify/status", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as {
          connected?: boolean;
        };

        setSpotifyStatus(
          response.ok && data.connected === true
            ? "connected"
            : "disconnected"
        );
      } catch (error) {
        console.error(
          "Spotify connection check failed:",
          error
        );

        setSpotifyStatus("error");
      }
    }

    void checkSpotify();
  }, []);

  useEffect(() => {
    if (!appleScriptReady) {
      return;
    }

    let cancelled = false;

    async function prepareAppleMusic() {
      try {
        setAppleStatus("checking");
        setAppleMessage("Checking Apple Music setup...");

        const tokenResponse = await fetch(
          "/api/apple-music/token",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const tokenData =
          (await tokenResponse.json()) as {
            developerToken?: string;
            error?: string;
          };

        if (
          !tokenResponse.ok ||
          !tokenData.developerToken
        ) {
          throw new Error(
            tokenData.error ||
              "Apple Music developer token is unavailable."
          );
        }

        if (!window.MusicKit) {
          throw new Error(
            "The Apple Music connection library did not load."
          );
        }

        await window.MusicKit.configure({
          developerToken:
            tokenData.developerToken,
          app: {
            name: "Bingo to the Beats",
            build: "2.0.0",
          },
        });

        const music =
          window.MusicKit.getInstance();

        if (cancelled) {
          return;
        }

        setAppleConfigured(true);

        const alreadyAuthorized =
          music.isAuthorized === true ||
          Boolean(music.musicUserToken);

        setAppleStatus(
          alreadyAuthorized
            ? "connected"
            : "disconnected"
        );

        setAppleMessage(
          alreadyAuthorized
            ? "Apple Music is connected and ready."
            : "Apple Music is configured. Connect your account to view playlists."
        );
      } catch (error) {
        console.error(
          "Apple Music setup check failed:",
          error
        );

        if (!cancelled) {
          setAppleConfigured(false);
          setAppleStatus("error");
          setAppleMessage(
            error instanceof Error
              ? error.message
              : "Apple Music could not be prepared."
          );
        }
      }
    }

    void prepareAppleMusic();

    return () => {
      cancelled = true;
    };
  }, [appleScriptReady]);

  async function connectAppleMusic() {
    if (
      !appleConfigured ||
      !window.MusicKit
    ) {
      setAppleStatus("error");
      setAppleMessage(
        "Apple Music is not ready yet. Refresh the page and try again."
      );
      return;
    }

    try {
      setConnectingApple(true);
      setAppleStatus("checking");
      setAppleMessage(
        "Waiting for Apple Music authorization..."
      );

      const music =
        window.MusicKit.getInstance();

      const musicUserToken =
        await music.authorize();

      if (!musicUserToken) {
        throw new Error(
          "Apple Music authorization was not completed."
        );
      }

      setAppleStatus("connected");
      setAppleMessage(
        "Apple Music is connected and ready."
      );
    } catch (error) {
      console.error(
        "Apple Music authorization failed:",
        error
      );

      setAppleStatus("disconnected");
      setAppleMessage(
        error instanceof Error
          ? error.message
          : "Apple Music authorization was cancelled."
      );
    } finally {
      setConnectingApple(false);
    }
  }

  const spotify = useMemo(
    () => getStatusBadge(spotifyStatus),
    [spotifyStatus]
  );

  const apple = useMemo(
    () => getStatusBadge(appleStatus),
    [appleStatus]
  );

  return (
    <>
      <Script
        src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
        strategy="afterInteractive"
        onLoad={() => {
          setAppleScriptReady(true);
        }}
        onError={() => {
          setAppleStatus("error");
          setAppleMessage(
            "The Apple Music connection library could not be loaded."
          );
        }}
      />

      <main className="relative min-h-screen overflow-hidden bg-[#070713] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-120px] top-20 h-96 w-96 rounded-full bg-purple-700/30 blur-[120px]" />
          <div className="absolute right-[-120px] top-40 h-96 w-96 rounded-full bg-pink-600/20 blur-[130px]" />
          <div className="absolute bottom-[-180px] left-1/3 h-[500px] w-[500px] rounded-full bg-blue-700/20 blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-purple-300 transition hover:text-white"
          >
            <span>←</span>
            Back to Dashboard
          </Link>

          <div className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-purple-950/80 via-[#111126] to-pink-950/50 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-purple-300/20 bg-purple-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-purple-200">
                Bingo to the Beats
              </span>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                Music Sources
              </h1>

              <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
                Connect a music platform, choose a playlist,
                and begin building your Version 2 musical bingo
                game.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6">
            <MusicSourceCard
              title="Spotify"
              description="Import Spotify playlists and prepare songs for live Bingo to the Beats games."
              status={spotify.label}
              statusStyle={spotify.style}
              icon="●"
            >
              <Link
                href="/api/spotify/login"
                className="rounded-xl bg-[#1DB954] px-5 py-3 text-sm font-black text-black shadow-lg transition hover:scale-[1.02] hover:bg-[#25d366]"
              >
                {spotifyStatus === "connected"
                  ? "Reconnect Spotify"
                  : "Connect Spotify"}
              </Link>

              <Link
                href="/spotify"
                className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                View Spotify Playlists
              </Link>
            </MusicSourceCard>

            <MusicSourceCard
              title="Apple Music"
              description="Import Apple Music playlists and use your Apple Music subscription to power live Bingo to the Beats games."
              status={apple.label}
              statusStyle={apple.style}
              icon=""
            >
              {appleStatus === "connected" ? (
                <>
                  <Link
                    href="/music/apple"
                    className="rounded-xl bg-[#FA2D48] px-5 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] hover:bg-[#ff4960]"
                  >
                    View Apple Playlists
                  </Link>

                  <button
                    type="button"
                    onClick={connectAppleMusic}
                    disabled={connectingApple}
                    className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {connectingApple
                      ? "Connecting..."
                      : "Reconnect Apple Music"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={connectAppleMusic}
                  disabled={
                    !appleConfigured ||
                    appleStatus === "checking" ||
                    connectingApple
                  }
                  className="rounded-xl bg-[#FA2D48] px-5 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] hover:bg-[#ff4960] disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 disabled:opacity-70"
                >
                  {connectingApple
                    ? "Connecting..."
                    : appleStatus === "checking"
                      ? "Checking Apple Music..."
                      : "Connect Apple Music"}
                </button>
              )}

              {appleConfigured &&
                appleStatus !== "connected" && (
                  <Link
                    href="/music/apple"
                    className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
                  >
                    Open Apple Music
                  </Link>
                )}

              <p className="w-full text-sm leading-6 text-slate-400">
                {appleMessage}
              </p>
            </MusicSourceCard>

            <MusicSourceCard
              title="TIDAL"
              description="TIDAL playlist support will be added after the Version 2 Apple Music and Spotify workflows are complete."
              status="Coming Soon"
              statusStyle="border-purple-300/30 bg-purple-400/10 text-purple-200"
              icon="◆"
            />

            <MusicSourceCard
              title="Serato"
              description="Import an exported Serato CSV playlist and use those tracks to generate musical bingo cards."
              status="Available"
              statusStyle="border-blue-300/30 bg-blue-400/10 text-blue-200"
              icon="♫"
            >
              <Link
                href="/serato"
                className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] hover:from-blue-500 hover:to-purple-500"
              >
                Import Serato Playlist
              </Link>
            </MusicSourceCard>
          </div>
        </div>
      </main>
    </>
  );
}

