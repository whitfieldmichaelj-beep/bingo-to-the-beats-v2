"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { BrowserQRCodeReader } from "@zxing/browser";

function normalizeGameCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function extractGameCode(scannedValue: string) {
  const raw = scannedValue.trim();

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(
      raw,
      window.location.origin
    );

    const queryCode =
      url.searchParams.get("code");

    if (queryCode) {
      return normalizeGameCode(queryCode);
    }
  } catch {
    // A QR code may contain only the game code.
  }

  return normalizeGameCode(raw);
}

export default function JoinAccessPage() {
  const router = useRouter();

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const controlsRef =
    useRef<{ stop: () => void } | null>(null);

  const [gameCode, setGameCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");

  const stopScanner = () => {
    try {
      controlsRef.current?.stop();
    } catch {
      // Scanner may already be stopped.
    }

    controlsRef.current = null;
    setScannerOpen(false);
    setScannerStarting(false);
  };

  useEffect(() => {
    return () => {
      try {
        controlsRef.current?.stop();
      } catch {
        // Scanner may already be stopped.
      }
    };
  }, []);

  function continueWithCode(code: string) {
    const normalized =
      normalizeGameCode(code);

    if (normalized.length !== 6) {
      setScannerMessage(
        "Enter the 6-character game code shown by the host."
      );
      return;
    }

    stopScanner();

    router.push(
      `/join?code=${encodeURIComponent(
        normalized
      )}`
    );
  }

  function submitCode(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    continueWithCode(gameCode);
  }

  async function startScanner() {
    setScannerMessage("");

    if (
      typeof window !== "undefined" &&
      !window.isSecureContext
    ) {
      setScannerMessage(
        "Camera scanning requires a secure HTTPS connection. You can still enter the game code below."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage(
        "Camera access is not available in this browser. Enter the game code below instead."
      );
      return;
    }

    setScannerOpen(true);
    setScannerStarting(true);

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() =>
        resolve()
      );
    });

    const video = videoRef.current;

    if (!video) {
      setScannerStarting(false);
      setScannerMessage(
        "The camera preview could not be opened. Enter the game code below instead."
      );
      return;
    }

    try {
      const reader =
        new BrowserQRCodeReader();

      const controls =
        await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: "environment",
              },
            },
          },
          video,
          (
            result,
            _error,
            callbackControls
          ) => {
            if (!result) {
              return;
            }

            const code =
              extractGameCode(
                result.getText()
              );

            if (code.length !== 6) {
              setScannerMessage(
                "That QR code does not contain a valid Bingo to the Beats game code."
              );
              return;
            }

            try {
              callbackControls.stop();
            } catch {
              // Continue navigation.
            }

            controlsRef.current = null;

            router.push(
              `/join?code=${encodeURIComponent(
                code
              )}`
            );
          }
        );

      controlsRef.current = controls;
      setScannerStarting(false);

      setScannerMessage(
        "Point your camera at the host's Bingo to the Beats QR code."
      );
    } catch (error) {
      controlsRef.current = null;
      setScannerOpen(false);
      setScannerStarting(false);

      const message =
        error instanceof Error
          ? error.message
          : "";

      if (
        /permission|denied|notallowed/i.test(
          message
        )
      ) {
        setScannerMessage(
          "Camera permission was not granted. You can enter the game code below."
        );
      } else {
        setScannerMessage(
          "The camera could not be started. You can enter the game code below."
        );
      }
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "clamp(20px, 5vw, 48px)",
        background:
          "radial-gradient(circle at top, rgba(124,58,237,0.22), transparent 38%), #020617",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          padding: "clamp(24px, 5vw, 44px)",
          border:
            "1px solid rgba(167,139,250,0.38)",
          borderRadius: "28px",
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.99), rgba(2,6,23,0.99))",
          boxShadow:
            "0 24px 70px rgba(0,0,0,0.45)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#c4b5fd",
            fontSize: "12px",
            fontWeight: 950,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          Bingo to the Beats
        </p>

        <h1
          style={{
            margin: "12px 0 0",
            fontSize: "clamp(36px, 7vw, 64px)",
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: "-0.045em",
          }}
        >
          Join a Game
        </h1>

        <p
          style={{
            maxWidth: "560px",
            margin: "18px auto 0",
            color: "#cbd5e1",
            fontSize: "clamp(16px, 2.5vw, 19px)",
            lineHeight: 1.55,
          }}
        >
          Scan the host&apos;s QR code with your camera
          or enter the 6-character game code.
        </p>

        <button
          type="button"
          onClick={
            scannerOpen
              ? stopScanner
              : () => void startScanner()
          }
          style={{
            width: "100%",
            marginTop: "30px",
            padding: "17px 22px",
            border: 0,
            borderRadius: "999px",
            background:
              scannerOpen
                ? "#334155"
                : "linear-gradient(90deg, #7c3aed, #9333ea)",
            color: "white",
            fontSize: "17px",
            fontWeight: 950,
            cursor: "pointer",
            boxShadow:
              scannerOpen
                ? "none"
                : "0 16px 38px rgba(124,58,237,0.30)",
          }}
        >
          {scannerOpen
            ? "Close Camera"
            : "Scan QR Code"}
        </button>

        {scannerOpen && (
          <div
            style={{
              marginTop: "18px",
              padding: "8px",
              borderRadius: "20px",
              border: "2px solid #8b5cf6",
              background: "#000000",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 3",
                overflow: "hidden",
                borderRadius: "14px",
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />

              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: "16%",
                  border: "3px solid #a3e635",
                  borderRadius: "18px",
                  boxShadow:
                    "0 0 0 9999px rgba(2,6,23,0.34)",
                  pointerEvents: "none",
                }}
              />

              {scannerStarting && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    background:
                      "rgba(2,6,23,0.72)",
                    fontWeight: 900,
                  }}
                >
                  Requesting camera access...
                </div>
              )}
            </div>
          </div>
        )}

        {scannerMessage && (
          <p
            role="status"
            style={{
              margin: "14px 0 0",
              padding: "11px 14px",
              borderRadius: "12px",
              background:
                "rgba(30,41,59,0.72)",
              color: "#e2e8f0",
              fontSize: "14px",
              lineHeight: 1.45,
            }}
          >
            {scannerMessage}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            margin: "28px 0",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#334155",
            }}
          />

          <span
            style={{
              color: "#94a3b8",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.12em",
            }}
          >
            OR
          </span>

          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#334155",
            }}
          />
        </div>

        <form onSubmit={submitCode}>
          <label
            htmlFor="gameCode"
            style={{
              display: "block",
              marginBottom: "10px",
              color: "#e2e8f0",
              fontSize: "14px",
              fontWeight: 900,
            }}
          >
            Enter Game Code
          </label>

          <input
            id="gameCode"
            name="gameCode"
            value={gameCode}
            onChange={(event) =>
              setGameCode(
                normalizeGameCode(
                  event.target.value
                )
              )
            }
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={6}
            placeholder="ABC123"
            aria-label="6-character game code"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "18px 16px",
              border: "2px solid #64748b",
              borderRadius: "16px",
              outline: "none",
              background: "#0f172a",
              color: "#ffffff",
              textAlign: "center",
              fontSize: "clamp(28px, 8vw, 42px)",
              fontWeight: 950,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          />

          <button
            type="submit"
            disabled={gameCode.length !== 6}
            style={{
              width: "100%",
              marginTop: "14px",
              padding: "17px 22px",
              border: 0,
              borderRadius: "999px",
              background:
                gameCode.length === 6
                  ? "linear-gradient(90deg, #84cc16, #65a30d)"
                  : "#334155",
              color:
                gameCode.length === 6
                  ? "#10210a"
                  : "#94a3b8",
              fontSize: "17px",
              fontWeight: 950,
              cursor:
                gameCode.length === 6
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            Continue to Game
          </button>
        </form>

        <p
          style={{
            margin: "24px 0 0",
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          Your camera is used only when you choose to scan
          the host&apos;s QR code.
        </p>
      </section>
    </main>
  );
}
