"use client";

import type { CSSProperties } from "react";

type HeroProps = {
  loading: boolean;
  playlistCount: number;
  libraryTrackCount: number;
  hasError: boolean;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function SeratoHero({
  loading,
  playlistCount,
  libraryTrackCount,
  hasError,
}: HeroProps) {
  return (
    <section style={heroStyle}>
      <div>
        <p style={eyebrowStyle}>
          Serato DJ Pro Integration
        </p>

        <h2 style={heroTitleStyle}>
          Build a game from your Serato crates
        </h2>

        <p style={heroTextStyle}>
          Choose a crate, configure the game, and launch
          directly into the live DJ Console.
        </p>
      </div>

      <div style={statusGridStyle}>
        <div style={statusCardStyle}>
          <strong style={statusNumberStyle}>
            {loading ? "—" : formatNumber(playlistCount)}
          </strong>

          <span style={statusLabelStyle}>
            Crates
          </span>
        </div>

        <div style={statusCardStyle}>
          <strong style={statusNumberStyle}>
            {loading
              ? "—"
              : formatNumber(libraryTrackCount)}
          </strong>

          <span style={statusLabelStyle}>
            Library Tracks
          </span>
        </div>

        <div style={statusCardStyle}>
          <strong
            style={{
              ...statusNumberStyle,
              color: hasError
                ? "#fda4af"
                : "#bef264",
            }}
          >
            {hasError ? "Issue" : "Ready"}
          </strong>

          <span style={statusLabelStyle}>
            Library Status
          </span>
        </div>
      </div>
    </section>
  );
}

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  flexWrap: "wrap",
  gap: "28px",
  padding: "34px",
  border:
    "1px solid rgba(167, 139, 250, 0.18)",
  borderRadius: "26px",
  background:
    "linear-gradient(135deg, rgba(30, 27, 75, 0.94), rgba(15, 23, 42, 0.9))",
  boxShadow:
    "0 28px 70px rgba(0, 0, 0, 0.32)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#c4b5fd",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
};

const heroTitleStyle: CSSProperties = {
  maxWidth: "700px",
  margin: "10px 0 0",
  fontSize: "clamp(35px, 5vw, 58px)",
  lineHeight: 1,
  letterSpacing: "-0.04em",
};

const heroTextStyle: CSSProperties = {
  maxWidth: "680px",
  margin: "18px 0 0",
  color: "#cbd5e1",
  fontSize: "17px",
  lineHeight: 1.7,
};

const statusGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(3, minmax(115px, 1fr))",
  gap: "10px",
};

const statusCardStyle: CSSProperties = {
  minWidth: "115px",
  padding: "17px",
  border: "1px solid #334155",
  borderRadius: "16px",
  background: "rgba(2, 6, 23, 0.58)",
  textAlign: "center",
};

const statusNumberStyle: CSSProperties = {
  display: "block",
  fontSize: "23px",
};

const statusLabelStyle: CSSProperties = {
  display: "block",
  marginTop: "5px",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
};