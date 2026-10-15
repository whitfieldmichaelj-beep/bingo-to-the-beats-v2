"use client";

import { useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PairResponse = {
  ok?: boolean;
  paired?: boolean;
  requiresRelogin?: boolean;
  code?: string;
  message?: string;
  error?: string;
};

function CompanionPairPageInner() {
  const searchParams = useSearchParams();
  const { signOut } = useClerk();
  const attempted = useRef(false);

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
      ? "Checking this Companion against your signed-in BTTB account..."
      : "Open this page from BTTB Companion on the DJ computer."
  );
  const [working, setWorking] =
    useState(false);
  const [paired, setPaired] =
    useState(false);
  const [
    requiresRelogin,
    setRequiresRelogin,
  ] = useState(false);

  async function pair() {
    if (
      working ||
      paired ||
      code.length !== 6
    ) {
      return;
    }

    setWorking(true);
    setRequiresRelogin(false);
    setMessage(
      "Checking the BTTB Companion connection..."
    );

    try {
      const response = await fetch(
        "/api/companion/pair",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({ code }),
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as
          PairResponse;

      if (data.requiresRelogin) {
        setRequiresRelogin(true);
        setMessage(
          data.message ||
            "Log out of BTTB and sign back in once to finish connecting this computer."
        );
        return;
      }

      if (
        !response.ok ||
        !data.ok ||
        !data.paired
      ) {
        throw new Error(
          data.error ||
            data.message ||
            "Pairing failed."
        );
      }

      setPaired(true);
      setMessage(
        data.message ||
          "BTTB Companion is connected to this account."
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

  useEffect(() => {
    if (
      code.length !== 6 ||
      attempted.current
    ) {
      return;
    }

    attempted.current = true;
    void pair();
    // Pair once when this signed-in page instance opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function reconnect() {
    if (
      working ||
      code.length !== 6
    ) {
      return;
    }

    setWorking(true);
    setMessage(
      "Disconnecting this BTTB login. Sign back in to finish pairing..."
    );

    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      }).catch(() => undefined);

      const returnTo =
        `/companion/pair?code=${encodeURIComponent(
          code
        )}`;

      await signOut({
        redirectUrl:
          `/sign-in?companion=1&returnTo=${encodeURIComponent(
            returnTo
          )}`,
      });
    } catch (error) {
      setWorking(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "BTTB could not restart the login connection."
      );
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
          border:
            "1px solid rgba(255,255,255,.18)",
          borderRadius: "20px",
          background:
            "rgba(15,23,42,.78)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>
          Connect BTTB Companion
        </h1>

        <p>
          BTTB Companion runs on this
          DJ computer so the hosted BTTB
          site can read Serato crates and
          now-playing information. It sends
          the metadata BTTB needs; audio
          files and full local file paths are
          not uploaded.
        </p>

        <div
          style={{
            margin: "28px 0",
            padding: "18px",
            textAlign: "center",
            borderRadius: "14px",
            background:
              "rgba(255,255,255,.08)",
            fontSize: "32px",
            fontWeight: 800,
            letterSpacing: "0.18em",
          }}
        >
          {code || "NO CODE"}
        </div>

        <p role="status">
          {message}
        </p>

        {requiresRelogin ? (
          <button
            type="button"
            onClick={() => {
              void reconnect();
            }}
            disabled={working}
            style={{
              width: "100%",
              padding: "14px 18px",
              border: 0,
              borderRadius: "12px",
              fontWeight: 800,
              cursor: working
                ? "wait"
                : "pointer",
            }}
          >
            {working
              ? "Logging out..."
              : "Log out & sign back in"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              attempted.current = true;
              void pair();
            }}
            disabled={
              working ||
              paired ||
              code.length !== 6
            }
            style={{
              width: "100%",
              padding: "14px 18px",
              border: 0,
              borderRadius: "12px",
              fontWeight: 800,
              cursor:
                working || paired
                  ? "default"
                  : "pointer",
            }}
          >
            {paired
              ? "Companion Connected"
              : working
                ? "Checking..."
                : "Check connection"}
          </button>
        )}

        <p
          style={{
            marginBottom: 0,
            opacity: 0.8,
          }}
        >
          Logging out later disconnects
          the Companion from that BTTB
          account and removes its synced
          local-library snapshot. Another
          DJ account cannot inherit it.
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
