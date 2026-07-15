"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    MusicKit?: {
      configure: (configuration: {
        developerToken: string;
        app: {
          name: string;
          build: string;
        };
      }) => void | Promise<void>;

      getInstance: () => {
        authorize: () => Promise<string>;
        unauthorize: () => Promise<void>;
        isAuthorized?: boolean;
      };
    };
  }
}

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "not-configured"
  | "error";

export default function AppleMusicConnectionPage() {
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] =
    useState<ConnectionState>("idle");

  const [message, setMessage] = useState(
    "Connect your Apple Music account to browse your playlists."
  );

  async function connectAppleMusic() {
    if (!scriptReady || !window.MusicKit) {
      setStatus("error");
      setMessage(
        "Apple Music is still loading. Please try again in a moment."
      );
      return;
    }

    setStatus("connecting");
    setMessage("Connecting to Apple Music...");

    try {
      const response = await fetch("/api/apple-music/token", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.developerToken) {
        if (response.status === 503) {
          setStatus("not-configured");
          setMessage(
            "The Apple Music page is ready, but the developer credentials still need to be added."
          );
          return;
        }

        throw new Error(
          data.error || "Unable to prepare Apple Music."
        );
      }

      await window.MusicKit.configure({
        developerToken: data.developerToken,
        app: {
          name: "Bingo to the Beats",
          build: "2.0.0",
        },
      });

      const music = window.MusicKit.getInstance();

      await music.authorize();

      setStatus("connected");
      setMessage(
        "Apple Music connected successfully. Playlist browsing comes next."
      );
    } catch (error) {
      console.error("Apple Music connection error:", error);

      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect Apple Music."
      );
    }
  }

  return (
    <>
      <Script
        src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => {
          setStatus("error");
          setMessage(
            "The Apple Music connection library could not be loaded."
          );
        }}
      />

      <main
        style={{
          minHeight: "100vh",
          padding: "72px 24px 100px",
          background:
            "radial-gradient(circle at top, #4c0519 0%, #111827 44%, #030712 100%)",
          color: "white",
        }}
      >
        <section
          style={{
            width: "min(100%, 760px)",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <Link
            href="/music"
            style={{
              display: "inline-block",
              marginBottom: "26px",
              color: "#fda4af",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            ← Back to Music Providers
          </Link>

        <div
  style={{
    display: "flex",
    justifyContent: "center",
    marginTop: "10px",
    marginBottom: "28px",
  }}
>
  <Image
    src="/logo.png"
    alt="Bingo to the Beats"
    width={210}
    height={210}
    priority
    style={{
      width: "190px",
      height: "auto",
    }}
  />
</div>

          <p
            style={{
              margin: "24px 0 0",
              color: "#fb7185",
              fontSize: "14px",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Apple Music
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 70px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Connect your music library
          </h1>

          <p
            style={{
              maxWidth: "650px",
              margin: "24px auto 0",
              color: "#d1d5db",
              fontSize: "19px",
              lineHeight: 1.7,
            }}
          >
            Sign in with Apple Music to browse your playlists and
            select music for your Bingo to the Beats game.
          </p>

          <section
            style={{
              marginTop: "42px",
              padding: "36px",
              borderRadius: "24px",
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid rgba(251, 113, 133, 0.38)",
              boxShadow:
                "0 24px 70px rgba(76, 5, 25, 0.32)",
            }}
          >
            <div
              style={{
                width: "82px",
                height: "82px",
                display: "grid",
                placeItems: "center",
                margin: "0 auto",
                borderRadius: "22px",
                background:
                  "linear-gradient(145deg, #fb7185, #e11d48)",
                fontSize: "42px",
              }}
            >
              ♪
            </div>

            <h2
              style={{
                margin: "24px 0 0",
                fontSize: "30px",
              }}
            >
              Apple Music Connection
            </h2>

            <p
              style={{
                margin: "14px auto 0",
                color:
                  status === "error" ||
                  status === "not-configured"
                    ? "#fda4af"
                    : status === "connected"
                      ? "#bef264"
                      : "#cbd5e1",
                lineHeight: 1.7,
              }}
            >
              {message}
            </p>

            <button
              type="button"
              onClick={connectAppleMusic}
              disabled={
                status === "connecting" ||
                status === "connected"
              }
              style={{
                width: "100%",
                marginTop: "28px",
                padding: "16px 24px",
                border: 0,
                borderRadius: "999px",
                background:
                  status === "connected"
                    ? "#84cc16"
                    : "#fa2d48",
                color: "white",
                fontSize: "17px",
                fontWeight: 900,
                cursor:
                  status === "connecting" ||
                  status === "connected"
                    ? "default"
                    : "pointer",
                opacity:
                  status === "connecting" ? 0.7 : 1,
              }}
            >
              {status === "connecting"
                ? "Connecting..."
                : status === "connected"
                  ? "Apple Music Connected"
                  : "Connect Apple Music"}
            </button>

            <p
              style={{
                margin: "20px 0 0",
                color: "#94a3b8",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              Apple will ask for permission before Bingo to the
              Beats can access your Apple Music account.
            </p>
          </section>
        </section>
      </main>
    </>
  );
}