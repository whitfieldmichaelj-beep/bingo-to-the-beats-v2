import Link from "next/link";

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
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "24px 28px",
        }}
      >
        <div>
          <strong style={{ fontSize: "20px" }}>
            Bingo to the Beats
          </strong>
        </div>

        <a
          href="https://www.instagram.com/bingotothebeats"
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#c4b5fd",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          @bingotothebeats
        </a>
      </nav>

      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "90px 28px 70px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "#a78bfa",
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          DJ Mike Doelo Presents
        </p>

        <h1
          style={{
            marginTop: "18px",
            fontSize: "clamp(52px, 10vw, 104px)",
            lineHeight: 0.95,
            fontWeight: 900,
            letterSpacing: "-0.05em",
          }}
        >
          Bingo to
          <br />
          the Beats
        </h1>

        <p
          style={{
            margin: "28px auto 0",
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
            marginTop: "42px",
          }}
        >
          <Link
            href="/api/spotify/login"
            style={{
              padding: "16px 26px",
              borderRadius: "999px",
              background: "#1ed760",
              color: "#052e16",
              textDecoration: "none",
              fontSize: "17px",
              fontWeight: 900,
            }}
          >
            Connect Spotify
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
        {[
          {
            number: "01",
            title: "Choose Your Music",
            text: "Connect Spotify and select the perfect playlist for your event.",
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
        ].map((item) => (
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

      <footer
        style={{
          padding: "24px",
          textAlign: "center",
          borderTop: "1px solid #1f2937",
          color: "#9ca3af",
        }}
      >
        DJ Mike Doelo Presents · Bingo to the Beats
      </footer>
    </main>
  );
}
