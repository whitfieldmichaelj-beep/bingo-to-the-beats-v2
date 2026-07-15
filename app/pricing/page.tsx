"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BillingPeriod,
  getPlanPrice,
  ratePlans,
} from "@/lib/ratePlans";

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("monthly");

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
          width: "min(100%, 1180px)",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            maxWidth: "760px",
            margin: "0 auto",
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
            Host Plans
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 72px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Pricing based on your audience
          </h1>

          <p
            style={{
              maxWidth: "680px",
              margin: "22px auto 0",
              color: "#cbd5e1",
              fontSize: "19px",
              lineHeight: 1.7,
            }}
          >
            Choose the player capacity you need, then select weekly
            or monthly access.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              width: "min(100%, 430px)",
              margin: "32px auto 0",
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
                  note: "7 days",
                },
                {
                  value: "monthly",
                  label: "Monthly",
                  note: "30 days",
                },
              ] as const
            ).map((option) => {
              const selected =
                billingPeriod === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setBillingPeriod(option.value)
                  }
                  style={{
                    padding: "14px 12px",
                    border: selected
                      ? "1px solid #a78bfa"
                      : "1px solid transparent",
                    borderRadius: "13px",
                    background: selected
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
                      marginTop: "4px",
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
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "22px",
            marginTop: "52px",
          }}
        >
          {ratePlans.map((plan) => {
            const price = getPlanPrice(
              plan,
              billingPeriod
            );

            const playerRange =
              plan.maximumPlayers === null
                ? `${plan.minimumPlayers}+ players`
                : plan.minimumPlayers === 1
                  ? `Up to ${plan.maximumPlayers} players`
                  : `${plan.minimumPlayers}–${plan.maximumPlayers} players`;

            const featured = plan.id === "pro";

            return (
              <article
                key={plan.id}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "500px",
                  padding: "30px",
                  borderRadius: "24px",
                  background: featured
                    ? "linear-gradient(180deg, rgba(88,28,135,.75), rgba(15,23,42,.96))"
                    : "rgba(15, 23, 42, 0.94)",
                  border: featured
                    ? "1px solid #a78bfa"
                    : "1px solid #334155",
                  boxShadow: featured
                    ? "0 24px 70px rgba(126, 34, 206, 0.3)"
                    : "0 18px 50px rgba(0, 0, 0, 0.18)",
                }}
              >
                {featured && (
                  <span
                    style={{
                      position: "absolute",
                      top: "18px",
                      right: "18px",
                      padding: "7px 11px",
                      borderRadius: "999px",
                      background: "#a78bfa",
                      color: "#1e1b4b",
                      fontSize: "11px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                    }}
                  >
                    Most Popular
                  </span>
                )}

                <p
                  style={{
                    margin: 0,
                    color: "#c4b5fd",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {playerRange}
                </p>

                <h2
                  style={{
                    margin: "14px 0 0",
                    fontSize: "31px",
                  }}
                >
                  {plan.name}
                </h2>

                <p
                  style={{
                    margin: "20px 0 0",
                    color: "#a3e635",
                    fontSize: "35px",
                    fontWeight: 900,
                  }}
                >
                  {price === null
                    ? "Custom"
                    : `$${price.toFixed(2)}`}
                </p>

                <p
                  style={{
                    margin: "5px 0 0",
                    color: "#94a3b8",
                    fontSize: "14px",
                    textTransform: "capitalize",
                  }}
                >
                  {price === null
                    ? "Contact us"
                    : `${billingPeriod} access`}
                </p>

                <p
                  style={{
                    margin: "22px 0 0",
                    color: "#cbd5e1",
                    lineHeight: 1.7,
                  }}
                >
                  {plan.description}
                </p>

                <ul
                  style={{
                    flex: 1,
                    margin: "24px 0 0",
                    paddingLeft: "20px",
                    color: "#e2e8f0",
                    lineHeight: 2,
                  }}
                >
                  <li>Unlimited games during access period</li>
                  <li>Unique bingo cards</li>
                  <li>Live host and caller screens</li>
                  <li>Player joining by game code</li>
                  <li>Music-provider access</li>
                </ul>

                <Link
                  href={
                    plan.id === "enterprise"
                      ? "/sign-up"
                      : `/game/new?players=${
                          plan.maximumPlayers ?? 201
                        }&billing=${billingPeriod}`
                  }
                  style={{
                    display: "block",
                    marginTop: "26px",
                    padding: "15px 20px",
                    borderRadius: "999px",
                    background: featured
                      ? "#a3e635"
                      : "#a78bfa",
                    color: "#172554",
                    textAlign: "center",
                    textDecoration: "none",
                    fontWeight: 900,
                  }}
                >
                  {plan.id === "enterprise"
                    ? "Contact Us"
                    : "Select Plan"}
                </Link>
              </article>
            );
          })}
        </section>

        <section
          style={{
            maxWidth: "850px",
            margin: "70px auto 0",
            padding: "34px",
            textAlign: "center",
            borderRadius: "22px",
            background: "rgba(30, 41, 59, 0.76)",
            border: "1px solid #334155",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "30px",
            }}
          >
            Players always join free
          </h2>

          <p
            style={{
              margin: "14px auto 0",
              color: "#cbd5e1",
              lineHeight: 1.7,
            }}
          >
            Only the host needs a paid plan. Players can register
            and participate without purchasing a host subscription.
          </p>

          <Link
            href="/game/new"
            style={{
              display: "inline-block",
              marginTop: "24px",
              color: "#c4b5fd",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            Find your plan →
          </Link>
        </section>
      </section>
    </main>
  );
}