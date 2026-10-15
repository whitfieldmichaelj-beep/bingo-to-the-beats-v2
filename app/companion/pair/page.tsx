"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function CompanionPairPageInner() {
  const searchParams = useSearchParams();
  const code = useMemo(
    () =>
      (searchParams.get("code") || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6),
    [searchParams]
  );

  const [message, setMessage] = useState(
    code
      ? "Approve only if this code matches the BTTB Companion on your DJ computer."
      : "Open this page from the BTTB Companion on your DJ computer."
  );
  const [working, setWorking] = useState(false);
  const [paired, setPaired] = useState(false);

  async function pair() {
    if (working || paired || code.length !== 6) return;
    setWorking(true);
    setMessage("Pairing this computer...");

    try {
      const response = await fetch("/api/companion/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Pairing failed.");
      }

      setPaired(true);
      setMessage(
        "Paired. This computer may share its Serato crate and song metadata with your BTTB account while you remain connected."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Pairing failed."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 620px)",
          margin: "0 auto",
          padding: "28px",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: "20px",
          background: "rgba(15,23,42,.78)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Pair BTTB Companion</h1>
        <p>
          Pairing lets this signed-in BTTB account receive Serato crate,
          song, and now-playing metadata from this DJ computer. Audio files
          and full local file paths are not uploaded.
        </p>

        <div
          style={{
            margin: "28px 0",
            padding: "18px",
            textAlign: "center",
            borderRadius: "14px",
            background: "rgba(255,255,255,.08)",
            fontSize: "32px",
            fontWeight: 800,
            letterSpacing: "0.18em",
          }}
        >
          {code || "NO CODE"}
        </div>

        <p role="status">{message}</p>

        <button
          type="button"
          onClick={pair}
          disabled={working || paired || code.length !== 6}
          style={{
            width: "100%",
            padding: "14px 18px",
            border: 0,
            borderRadius: "12px",
            fontWeight: 800,
            cursor: working || paired ? "default" : "pointer",
          }}
        >
          {paired
            ? "Computer Paired"
            : working
              ? "Pairing..."
              : "Pair this computer"}
        </button>

        <p style={{ marginBottom: 0, opacity: 0.8 }}>
          Logging out of BTTB disconnects this pairing and removes the
          synced local-library snapshot from your account.
        </p>
      </section>
    </main>
  );
}


export default function CompanionPairPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#030712",
            color: "white",
          }}
        >
          Preparing Companion pairing...
        </main>
      }
    >
      <CompanionPairPageInner />
    </Suspense>
  );
}
