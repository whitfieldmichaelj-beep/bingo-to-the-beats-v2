"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export default function HostAccessPage() {
  const {
    isLoaded,
    isSignedIn,
  } = useAuth();

  return (
    <main
      style={{
        minHeight: "calc(100vh - 140px)",
        display: "grid",
        placeItems: "center",
        padding: "48px 20px",
        background:
          "radial-gradient(circle at top, rgba(124,58,237,0.20), transparent 34%), #020617",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(920px, 100%)",
          padding: "clamp(28px, 5vw, 52px)",
          borderRadius: "28px",
          border:
            "1px solid rgba(167,139,250,0.32)",
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
          boxShadow:
            "0 24px 70px rgba(0,0,0,0.42)",
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
            fontSize:
              "clamp(34px, 6vw, 62px)",
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: "-0.04em",
          }}
        >
          Start Hosting
        </h1>

        <p
          style={{
            maxWidth: "650px",
            margin: "20px auto 0",
            color: "#cbd5e1",
            fontSize:
              "clamp(16px, 2vw, 20px)",
            lineHeight: 1.6,
          }}
        >
          Hosts need an account before creating or managing a game.
          Log in to your existing host account or create a new host
          profile to get started.
        </p>

        {!isLoaded ? (
          <div
            style={{
              marginTop: "34px",
              color: "#94a3b8",
              fontWeight: 800,
            }}
          >
            Checking your account...
          </div>
        ) : isSignedIn ? (
          <div
            style={{
              marginTop: "36px",
              display: "grid",
              gap: "14px",
              justifyItems: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#bbf7d0",
                fontWeight: 900,
              }}
            >
              You are already logged in.
            </p>

            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                minWidth: "260px",
                padding: "16px 24px",
                borderRadius: "999px",
                background:
                  "linear-gradient(90deg, #2563eb, #9333ea)",
                color: "white",
                textDecoration: "none",
                fontSize: "17px",
                fontWeight: 950,
                boxShadow:
                  "0 16px 40px rgba(99,102,241,0.28)",
              }}
            >
              Continue to Host Dashboard
            </Link>
          </div>
        ) : (
          <div
            style={{
              marginTop: "38px",
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "18px",
            }}
          >
            <Link
              href="/sign-in"
              style={{
                display: "grid",
                alignContent: "center",
                minHeight: "168px",
                padding: "24px",
                borderRadius: "22px",
                border: "2px solid #8b5cf6",
                background:
                  "linear-gradient(145deg, rgba(76,29,149,0.36), rgba(30,27,75,0.72))",
                color: "white",
                textDecoration: "none",
                boxShadow:
                  "0 18px 40px rgba(76,29,149,0.20)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "24px",
                  fontWeight: 950,
                }}
              >
                Log In
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: "10px",
                  color: "#ddd6fe",
                  fontSize: "15px",
                  lineHeight: 1.5,
                }}
              >
                I already have a Bingo to the Beats host account.
              </span>
            </Link>

            <Link
              href="/sign-up"
              style={{
                display: "grid",
                alignContent: "center",
                minHeight: "168px",
                padding: "24px",
                borderRadius: "22px",
                border: "2px solid #a3e635",
                background:
                  "linear-gradient(145deg, rgba(77,124,15,0.28), rgba(20,83,45,0.48))",
                color: "white",
                textDecoration: "none",
                boxShadow:
                  "0 18px 40px rgba(77,124,15,0.14)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "24px",
                  fontWeight: 950,
                }}
              >
                Create Host Profile
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: "10px",
                  color: "#ecfccb",
                  fontSize: "15px",
                  lineHeight: 1.5,
                }}
              >
                I am new and want to create my host account.
              </span>
            </Link>
          </div>
        )}

        <p
          style={{
            margin: "30px 0 0",
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          Host access is separate from joining a game as a player.
        </p>
      </section>
    </main>
  );
}
