"use client";

import QRCode from "react-qr-code";
import { useEffect, useMemo, useState } from "react";

type GameAccessPanelProps = {
  joinCode?: string | null;
  title?: string;
  compact?: boolean;
  showOpenButton?: boolean;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export default function GameAccessPanel({
  joinCode,
  title = "Players Join",
  compact = false,
  showOpenButton = true,
}: GameAccessPanelProps) {
  const [browserOrigin, setBrowserOrigin] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  const normalizedCode = (joinCode ?? "")
    .trim()
    .toUpperCase();

  const joinUrl = useMemo(() => {
    if (!normalizedCode || !browserOrigin) {
      return "";
    }

    const configuredUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim();

    const origin =
      configuredUrl && configuredUrl.length > 0
        ? normalizeBaseUrl(configuredUrl)
        : normalizeBaseUrl(browserOrigin);

    return `${origin}/join?code=${encodeURIComponent(
      normalizedCode
    )}`;
  }, [browserOrigin, normalizedCode]);

  async function copyText(
    text: string,
    successMessage: string
  ) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage("Copy failed. Select and copy it manually.");
    }

    window.setTimeout(() => setMessage(""), 2200);
  }

  if (!normalizedCode) {
    return (
      <section style={panelStyle}>
        <p style={labelStyle}>{title}</p>
        <p style={emptyStyle}>
          Create a game to generate its join code and QR code.
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <p style={labelStyle}>{title}</p>

      <div style={codeBlockStyle}>
        <span style={codeLabelStyle}>Game Code</span>
        <strong style={codeStyle}>{normalizedCode}</strong>
      </div>

      {joinUrl && (
        <div
          style={{
            ...qrWrapStyle,
            padding: compact ? "12px" : "18px",
          }}
        >
          <QRCode
            value={joinUrl}
            size={compact ? 150 : 190}
            level="M"
            bgColor="#ffffff"
            fgColor="#020617"
            style={{
              width: "100%",
              maxWidth: compact ? "150px" : "190px",
              height: "auto",
            }}
          />
        </div>
      )}

      <p style={scanTextStyle}>
        Scan to join or enter the code at the join page.
      </p>

      {joinUrl && (
        <div style={urlBoxStyle} title={joinUrl}>
          {joinUrl}
        </div>
      )}

      <div style={buttonGridStyle}>
        <button
          type="button"
          onClick={() =>
            void copyText(
              normalizedCode,
              "Game code copied."
            )
          }
          style={secondaryButtonStyle}
        >
          Copy Code
        </button>

        <button
          type="button"
          onClick={() =>
            void copyText(
              joinUrl,
              "Invite link copied."
            )
          }
          disabled={!joinUrl}
          style={{
            ...secondaryButtonStyle,
            opacity: joinUrl ? 1 : 0.5,
          }}
        >
          Copy Link
        </button>

        {showOpenButton && joinUrl && (
          <button
            type="button"
            onClick={() =>
              window.open(
                joinUrl,
                "_blank",
                "noopener,noreferrer"
              )
            }
            style={primaryButtonStyle}
          >
            Open Join Page
          </button>
        )}
      </div>

      {message && (
        <p role="status" style={messageStyle}>
          {message}
        </p>
      )}

      {browserOrigin.includes("localhost") &&
        !process.env.NEXT_PUBLIC_APP_URL && (
          <p style={networkNoteStyle}>
            For phone scanning, open the host page with your
            computer&apos;s Network address instead of localhost,
            or set NEXT_PUBLIC_APP_URL.
          </p>
        )}
    </section>
  );
}

const panelStyle = {
  padding: "22px",
  border: "1px solid #334155",
  borderRadius: "20px",
  background: "rgba(15, 23, 42, 0.96)",
  color: "white",
  textAlign: "center" as const,
};

const labelStyle = {
  margin: 0,
  color: "#a78bfa",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.13em",
  textTransform: "uppercase" as const,
};

const codeBlockStyle = {
  marginTop: "15px",
  padding: "16px",
  border: "1px solid rgba(167, 139, 250, 0.35)",
  borderRadius: "16px",
  background: "rgba(124, 58, 237, 0.12)",
};

const codeLabelStyle = {
  display: "block",
  color: "#cbd5e1",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};

const codeStyle = {
  display: "block",
  marginTop: "7px",
  color: "#ffffff",
  fontSize: "clamp(28px, 5vw, 42px)",
  letterSpacing: "0.16em",
};

const qrWrapStyle = {
  width: "fit-content",
  margin: "18px auto 0",
  borderRadius: "16px",
  background: "#ffffff",
};

const scanTextStyle = {
  margin: "15px 0 0",
  color: "#cbd5e1",
  fontSize: "13px",
  lineHeight: 1.5,
};

const urlBoxStyle = {
  marginTop: "12px",
  padding: "11px",
  border: "1px solid #334155",
  borderRadius: "11px",
  background: "#020617",
  color: "#93c5fd",
  fontSize: "11px",
  lineHeight: 1.45,
  overflowWrap: "anywhere" as const,
};

const buttonGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(110px, 1fr))",
  gap: "9px",
  marginTop: "15px",
};

const secondaryButtonStyle = {
  padding: "11px 12px",
  border: "1px solid #475569",
  borderRadius: "11px",
  background: "#111827",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle = {
  padding: "11px 12px",
  border: 0,
  borderRadius: "11px",
  background:
    "linear-gradient(90deg, #2563eb, #9333ea)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const messageStyle = {
  margin: "12px 0 0",
  color: "#bef264",
  fontSize: "12px",
  fontWeight: 800,
};

const networkNoteStyle = {
  margin: "13px 0 0",
  padding: "10px",
  borderRadius: "10px",
  background: "rgba(251, 191, 36, 0.1)",
  color: "#fde68a",
  fontSize: "11px",
  lineHeight: 1.5,
};

const emptyStyle = {
  margin: "14px 0 0",
  color: "#94a3b8",
  lineHeight: 1.5,
};

