import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Choose Your Music",
    text: "Connect your music provider and select the perfect playlist for your event.",
  },
  {
    number: "02",
    title: "Create the Game",
    text: "Choose the clip length and generate unique bingo cards.",
  },
  {
    number: "03",
    title: "Start the Party",
    text: "Call songs, track winners, and keep the room moving.",
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "60px 28px 70px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            margin: "0 auto 28px",
          }}
        >
          <Image
            src="/logo.png"
            alt="Bingo to the Beats"
            width={560}
            height={560}
            priority
            style={{
              display: "block",
              width: "min(100%, 520px)",
              height: "auto",
              objectFit: "contain",
              filter:
                "drop-shadow(0 18px 42px rgba(167, 139, 250, 0.32))",
            }}
          />
        </div>

        <p
          style={{
            margin: "0 auto",
            maxWidth: "650px",
            fontSize: "22px",
            lineHeight: 1.6,
            color: "#d1d5db",
          }}
        >
          Where bingo meets the music you love. Choose a playlist,
          generate your game, and bring the party to life.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "16px",
            marginTop: "36px",
          }}
        >
          <Link
            href="/music"
            style={{
              padding: "16px 26px",
              borderRadius: "999px",
              background: "#a78bfa",
              color: "#1e1b4b",
              textDecoration: "none",
              fontSize: "17px",
              fontWeight: 900,
            }}
          >
            Choose Your Music
          </Link>

          <Link
            href="/join"
            style={{
              padding: "16px 26px",
              borderRadius: "999px",
              border: "1px solid #6b7280",
              color: "white",
              textDecoration: "none",
              fontSize: "17px",
              fontWeight: 800,
            }}
          >
            Join a Game
          </Link>
        </div>
      </section>

      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "20px 28px 90px",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}
      >
        {steps.map((item) => (
          <article
            key={item.number}
            style={{
              padding: "28px",
              borderRadius: "18px",
              background: "rgba(31, 41, 55, 0.72)",
              border: "1px solid rgba(167, 139, 250, 0.25)",
            }}
          >
            <span
              style={{
                color: "#a78bfa",
                fontWeight: 900,
                fontSize: "15px",
              }}
            >
              {item.number}
            </span>

            <h2
              style={{
                marginTop: "16px",
                fontSize: "24px",
              }}
            >
              {item.title}
            </h2>

            <p
              style={{
                marginTop: "12px",
                color: "#cbd5e1",
                lineHeight: 1.6,
              }}
            >
              {item.text}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}