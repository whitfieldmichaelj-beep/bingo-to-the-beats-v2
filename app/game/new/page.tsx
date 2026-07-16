"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BillingPeriod,
  getPlanPrice,
  getRatePlan,
} from "@/lib/ratePlans";

export default function CreateGamePage() {
  const [playerCount, setPlayerCount] = useState(25);
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("monthly");
  const [winningPattern, setWinningPattern] =
  useState<WinningPattern>("any-line");
  const selectedPlan = useMemo(
    () => getRatePlan(playerCount),
    [playerCount]
  );

  const selectedPrice = selectedPlan
    ? getPlanPrice(selectedPlan, billingPeriod)
    : null;

  function updatePlayerCount(value: string) {
    if (value === "") {
      setPlayerCount(0);
      return;
    }

    const nextValue = Number(value);

    if (Number.isFinite(nextValue)) {
      setPlayerCount(Math.max(0, Math.floor(nextValue)));
    }
  }
type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

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
          width: "min(100%, 780px)",
          margin: "0 auto",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            color: "#c4b5fd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to Dashboard
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
            Create Game
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 70px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Choose your player capacity
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
            Your expected player count determines your plan.
            Choose weekly or monthly access before continuing.
          </p>
        </header>

        <section
          style={{
            marginTop: "42px",
            padding: "34px",
            borderRadius: "24px",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid #334155",
          }}
        >
          <label
            htmlFor="playerCount"
            style={{
              display: "block",
              fontSize: "17px",
              fontWeight: 900,
            }}
          >
            Expected number of players
          </label>

          <input
            id="playerCount"
            type="number"
            min="1"
            max="10000"
            value={playerCount || ""}
            onChange={(event) =>
              updatePlayerCount(event.target.value)
            }
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "14px",
              padding: "18px",
              borderRadius: "16px",
              border: "1px solid #475569",
              background: "#020617",
              color: "white",
              fontSize: "28px",
              fontWeight: 900,
              textAlign: "center",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(90px, 1fr))",
              gap: "10px",
              marginTop: "16px",
            }}
          >
            {[25, 50, 75, 100, 200].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setPlayerCount(amount)}
                style={{
                  padding: "12px",
                  borderRadius: "999px",
                  border:
                    playerCount === amount
                      ? "1px solid #a78bfa"
                      : "1px solid #475569",
                  background:
                    playerCount === amount
                      ? "rgba(167, 139, 250, 0.2)"
                      : "transparent",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {amount}
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: "32px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "17px",
                fontWeight: 900,
              }}
            >
              Billing period
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginTop: "14px",
                padding: "6px",
                borderRadius: "18px",
                background: "#020617",
                border: "1px solid #334155",
              }}
            >
              {(
                [
                  {
                    value: "weekly",
                    label: "Weekly",
                    note: "7 days of access",
                  },
                  {
                    value: "monthly",
                    label: "Monthly",
                    note: "Best overall value",
                  },
                ] as const
              ).map((option) => {
                const isSelected =
                  billingPeriod === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setBillingPeriod(option.value)
                    }
                    style={{
                      padding: "16px 12px",
                      border: isSelected
                        ? "1px solid #a78bfa"
                        : "1px solid transparent",
                      borderRadius: "14px",
                      background: isSelected
                        ? "rgba(167, 139, 250, 0.2)"
                        : "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <strong
                      style={{
                        display: "block",
                        fontSize: "17px",
                      }}
                    >
                      {option.label}
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: "5px",
                        color: "#94a3b8",
                        fontSize: "12px",
                      }}
                    >
                      {option.note}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
<div
  style={{
    marginTop: "32px",
  }}
>
  <p
    style={{
      margin: 0,
      fontSize: "17px",
      fontWeight: 900,
    }}
  >
    Winning pattern
  </p>

  <p
    style={{
      margin: "8px 0 0",
      color: "#94a3b8",
      fontSize: "14px",
      lineHeight: 1.6,
    }}
  >
    Choose the pattern players must complete to win this game.
  </p>

  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "12px",
      marginTop: "16px",
    }}
  >
    {[
      {
        value: "any-line",
        label: "Any 5 in a Row",
        note: "Across, down, or diagonal",
      },
      {
        value: "across",
        label: "Across Only",
        note: "Complete one horizontal row",
      },
      {
        value: "down",
        label: "Down Only",
        note: "Complete one vertical column",
      },
      {
        value: "diagonal",
        label: "Diagonal Only",
        note: "Complete either diagonal",
      },
      {
        value: "x-pattern",
        label: "X Pattern",
        note: "Complete both diagonals",
      },
      {
        value: "blackout",
        label: "Blackout",
        note: "Mark all 25 spaces",
      },
    ].map((option) => {
      const selected =
        winningPattern === option.value;

      return (
        <button
          key={option.value}
          type="button"
         onClick={() => {
  const pattern = option.value as WinningPattern;

  setWinningPattern(pattern);
  sessionStorage.setItem("bttbWinningPattern", pattern);
}}
          style={{
            padding: "18px",
            borderRadius: "16px",
            border: selected
              ? "1px solid #a78bfa"
              : "1px solid #475569",
            background: selected
              ? "rgba(167, 139, 250, 0.2)"
              : "rgba(2, 6, 23, 0.45)",
            color: "white",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <strong
            style={{
              display: "block",
              fontSize: "16px",
            }}
          >
            {option.label}
          </strong>

          <span
            style={{
              display: "block",
              marginTop: "6px",
              color: "#94a3b8",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {option.note}
          </span>
        </button>
      );
    })}
  </div>
</div>
          {selectedPlan ? (
            
            <div
              style={{
                marginTop: "30px",
                padding: "26px",
                borderRadius: "18px",
                background:
                  "rgba(167, 139, 250, 0.12)",
                border:
                  "1px solid rgba(167, 139, 250, 0.35)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#c4b5fd",
                  fontSize: "13px",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Recommended Plan
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  flexWrap: "wrap",
                  gap: "14px",
                  marginTop: "10px",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "34px",
                  }}
                >
                  {selectedPlan.name}
                </h2>

                <span
                  style={{
                    padding: "7px 12px",
                    borderRadius: "999px",
                    background:
                      "rgba(163, 230, 53, 0.12)",
                    color: "#bef264",
                    fontSize: "13px",
                    fontWeight: 900,
                    textTransform: "capitalize",
                  }}
                >
                  {billingPeriod}
                </span>
              </div>

              <p
                style={{
                  margin: "12px 0 0",
                  color: "#cbd5e1",
                  lineHeight: 1.6,
                }}
              >
                {selectedPlan.description}
              </p>

              <p
                style={{
                  margin: "20px 0 0",
                  color: "#a3e635",
                  fontSize: "30px",
                  fontWeight: 900,
                }}
              >
                {selectedPrice === null
                  ? "Custom pricing"
                  : `$${selectedPrice.toFixed(2)}`}
              </p>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#94a3b8",
                }}
              >
                {selectedPrice === null
                  ? "Contact BTTB for a custom event plan."
                  : billingPeriod === "weekly"
                    ? "Billed once for 7 days of access."
                    : "Billed once for 30 days of access."}
              </p>

              <p
                style={{
                  margin: "18px 0 0",
                  color: "#94a3b8",
                  fontSize: "14px",
                }}
              >
                Supports{" "}
                {selectedPlan.maximumPlayers === null
                  ? `${selectedPlan.minimumPlayers}+`
                  : `up to ${selectedPlan.maximumPlayers}`}{" "}
                players per game.
              </p>
            </div>
          ) : (
            <p
              style={{
                marginTop: "24px",
                color: "#fda4af",
                textAlign: "center",
              }}
            >
              Enter at least one player to see your plan.
            </p>
          )}

<Link
  href={
    selectedPlan?.id === "enterprise"
      ? "/pricing"
      : `/game/details?players=${playerCount}&billing=${billingPeriod}&pattern=${winningPattern}`
  }
  aria-disabled={!selectedPlan}
  style={{
    display: "block",
    marginTop: "30px",
    padding: "16px 24px",
    borderRadius: "999px",
    background: selectedPlan
      ? "#a3e635"
      : "#475569",
    color: "#172554",
    textAlign: "center",
    textDecoration: "none",
    fontWeight: 900,
    pointerEvents: selectedPlan
      ? "auto"
      : "none",
  }}
>
  {selectedPlan?.id === "enterprise"
    ? "View Enterprise Options"
    : "Continue to Event Details"}
</Link>
        </section>
      </section>
    </main>
  );
}