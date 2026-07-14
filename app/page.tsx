import Image from "next/image";
import Link from "next/link";

const features = [
  {
    icon: "🎵",
    title: "Connect Your Music",
    text: "Choose a Spotify playlist now, with Apple Music and manual playlists coming next.",
  },
  {
    icon: "🎲",
    title: "Generate Unique Cards",
    text: "Create randomized bingo cards for every player in just a few clicks.",
  },
  {
    icon: "🏆",
    title: "Run Live Events",
    text: "Call songs, manage the room, track winners, and keep the party moving.",
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
          maxWidth: "1050px",
          margin: "0 auto",
          padding: "56px 28px 76px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "18px",
          }}
        >
          <Image
            src="/logo.png"
            alt="Bingo to the Beats"
            width={620}
            height={620}
            priority
            style={{
              width: "min(100%, 590px)",
              height: "auto",
              objectFit: "contain",
              filter:
                "drop-shadow(0 22px 50px rgba(167, 139, 250, 0.38))",
            }}
          />
        </div>

        <h1
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            fontSize: "clamp(34px, 5vw, 58px)",
            lineHeight: 1.08,
            fontWeight: 900,
            letterSpacing: "-0.035em",
          }}
        >
          Host unforgettable music bingo events in minutes.
        </h1>

        <p
          style={{
            maxWidth: "760px",
            margin: "24px auto 0",
            fontSize: "clamp(18px, 2vw, 22px)",
            lineHeight: 1.65,
            color: "#d1d5db",
          }}
        >
          Connect your music, generate unique bingo cards, run live
          games, and keep players engaged from the first song to the
          last.
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
              padding: "16px 28px",
              borderRadius: "999px",
              background: "#a78bfa",
              color: "#1e1b4b",
              textDecoration: "none",
              fontSize: "17px",
              fontWeight: 900,
              boxShadow: "0 10px 30px rgba(167, 139, 250, 0.25)",
            }}
          >
            Start Hosting
          </Link>

          <Link
            href="/join"
            style={{
              padding: "16px 28px",
              borderRadius: "999px",
              border: "1px solid #64748b",
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
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "10px 28px 96px",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto 34px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#a78bfa",
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Why Bingo to the Beats
          </p>

          <h2
            style={{
              margin: "12px 0 0",
              fontSize: "clamp(30px, 4vw, 46px)",
              lineHeight: 1.1,
            }}
          >
            Everything you need to host a great game night
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "22px",
          }}
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              style={{
                padding: "30px",
                borderRadius: "20px",
                background: "rgba(31, 41, 55, 0.78)",
                border: "1px solid rgba(167, 139, 250, 0.26)",
                boxShadow: "0 18px 50px rgba(0, 0, 0, 0.18)",
              }}
            >
              <div
                style={{
                  width: "58px",
                  height: "58px",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "16px",
                  background: "rgba(167, 139, 250, 0.14)",
                  fontSize: "30px",
                }}
              >
                {feature.icon}
              </div>

              <h3
                style={{
                  margin: "22px 0 0",
                  fontSize: "25px",
                }}
              >
                {feature.title}
              </h3>

              <p
                style={{
                  margin: "12px 0 0",
                  color: "#cbd5e1",
                  lineHeight: 1.7,
                }}
              >
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "0 28px 100px",
        }}
      >
        <div
          style={{
            padding: "42px 30px",
            textAlign: "center",
            borderRadius: "24px",
            background:
              "linear-gradient(135deg, rgba(126,34,206,.32), rgba(30,41,59,.92))",
            border: "1px solid rgba(196, 181, 253, 0.3)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(30px, 4vw, 46px)",
            }}
          >
            Ready to bring the party to life?
          </h2>

          <p
            style={{
              maxWidth: "680px",
              margin: "16px auto 0",
              color: "#d1d5db",
              fontSize: "18px",
              lineHeight: 1.65,
            }}
          >
            Choose your music, create your game, and start hosting
            Bingo to the Beats.
          </p>

          <Link
            href="/music"
            style={{
              display: "inline-block",
              marginTop: "28px",
              padding: "15px 26px",
              borderRadius: "999px",
              background: "#a3e635",
              color: "#172554",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Create Your First Game
          </Link>
        </div>
      </section>
    </main>
  );
}