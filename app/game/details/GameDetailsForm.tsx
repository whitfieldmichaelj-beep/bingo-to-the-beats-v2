"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function GameDetailsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const players = searchParams.get("players") || "25";
  const billing = searchParams.get("billing") || "monthly";

  const [gameName, setGameName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [hostName, setHostName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#a78bfa");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!gameName.trim()) {
      setError("Please enter a game or event name.");
      return;
    }

    if (!eventDate) {
      setError("Please select the event date.");
      return;
    }

    const nextParams = new URLSearchParams({
      players,
      billing,
      gameName: gameName.trim(),
      venueName: venueName.trim(),
      eventDate,
      eventTime,
      hostName: hostName.trim(),
      primaryColor,
    });

    router.push(`/music?${nextParams.toString()}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px 100px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 44%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 820px)",
          margin: "0 auto",
        }}
      >
        <Link
          href={`/game/new?players=${encodeURIComponent(
            players
          )}&billing=${encodeURIComponent(billing)}`}
          style={{
            color: "#c4b5fd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to Player Plan
        </Link>

        <header
          style={{
            marginTop: "34px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#a78bfa",
              fontSize: "14px",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Step 2 of 6
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 70px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Tell us about your event
          </h1>

          <p
            style={{
              margin: "22px auto 0",
              maxWidth: "650px",
              color: "#cbd5e1",
              fontSize: "18px",
              lineHeight: 1.7,
            }}
          >
            Add the details players will see when they join your
            Bingo to the Beats game.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: "30px",
            padding: "34px",
            borderRadius: "24px",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid #334155",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "22px",
            }}
          >
            <label style={labelStyle}>
              Game or event name *

              <input
                type="text"
                value={gameName}
                onChange={(event) => setGameName(event.target.value)}
                placeholder="90s Hip-Hop Bingo Night"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Venue name

              <input
                type="text"
                value={venueName}
                onChange={(event) => setVenueName(event.target.value)}
                placeholder="Aloft Harlem"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Event date *

              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Start time

              <input
                type="time"
                value={eventTime}
                onChange={(event) => setEventTime(event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              DJ or host name

              <input
                type="text"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
                placeholder="DJ Mike Doelo"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Event accent color

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginTop: "10px",
                }}
              >
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(event) =>
                    setPrimaryColor(event.target.value)
                  }
                  style={{
                    width: "58px",
                    height: "52px",
                    padding: "4px",
                    borderRadius: "12px",
                    border: "1px solid #475569",
                    background: "#020617",
                    cursor: "pointer",
                  }}
                />

                <input
                  type="text"
                  value={primaryColor}
                  onChange={(event) =>
                    setPrimaryColor(event.target.value)
                  }
                  style={{
                    ...inputStyle,
                    marginTop: 0,
                    flex: 1,
                  }}
                />
              </div>
            </label>
          </div>

          <section
            style={{
              marginTop: "28px",
              padding: "24px",
              borderRadius: "18px",
              background: "rgba(2, 6, 23, 0.56)",
              border: "1px solid #334155",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#a78bfa",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Current Plan Selection
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "12px",
              }}
            >
              <strong style={{ fontSize: "20px" }}>
                {players} expected players
              </strong>

              <span
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  background: "rgba(163, 230, 53, 0.12)",
                  color: "#bef264",
                  fontSize: "13px",
                  fontWeight: 900,
                  textTransform: "capitalize",
                }}
              >
                {billing}
              </span>
            </div>
          </section>

          {error && (
            <div
              style={{
                marginTop: "24px",
                padding: "16px",
                borderRadius: "14px",
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fda4af",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: "28px",
              padding: "16px 24px",
              border: 0,
              borderRadius: "999px",
              background: "#a3e635",
              color: "#172554",
              fontSize: "17px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Continue to Music
          </button>
        </form>
      </section>
    </main>
  );
}

const labelStyle = {
  display: "block",
  color: "#e2e8f0",
  fontSize: "15px",
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginTop: "10px",
  padding: "15px 16px",
  borderRadius: "14px",
  border: "1px solid #475569",
  background: "#020617",
  color: "white",
  fontSize: "16px",
  outline: "none",
};