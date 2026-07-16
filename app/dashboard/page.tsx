import Link from "next/link";

const quickActions = [
  {
    title: "Create New Game",
    href: "/game/new",
    icon: "🎮",
  },
  {
    title: "Import Serato CSV",
    href: "/music/upload",
    icon: "📁",
  },
  {
    title: "Spotify",
    href: "/music",
    icon: "🎵",
  },
  {
    title: "DJ Control",
    href: "/game/control",
    icon: "🎧",
  },
];

export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "50px 24px 80px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #111827 45%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(42px,6vw,72px)",
          }}
        >
          DJ Dashboard
        </h1>

        <p
          style={{
            marginTop: "12px",
            color: "#cbd5e1",
            fontSize: "18px",
          }}
        >
          Welcome back, DJ Mike Doelo
        </p>

        {/* Active Game */}

        <section
          style={{
            marginTop: "40px",
            padding: "30px",
            borderRadius: "22px",
            background: "rgba(15,23,42,.92)",
            border: "1px solid #334155",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#a78bfa",
              fontWeight: 900,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              fontSize: "13px",
            }}
          >
            Active Game
          </p>

          <h2
            style={{
              marginTop: "12px",
              fontSize: "34px",
            }}
          >
            90's Hip-Hop Night
          </h2>

          <p
            style={{
              color: "#cbd5e1",
              lineHeight: 1.8,
            }}
          >
            Venue: Aloft Harlem
            <br />
            Playlist: 82 Songs
            <br />
            Players: 75
            <br />
            Status: 🟢 Ready
          </p>

          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              marginTop: "25px",
            }}
          >
            <Link
              href="/game/control"
              style={buttonStyle}
            >
              Resume Game
            </Link>

            <Link
              href="/game/new"
              style={secondaryButtonStyle}
            >
              New Game
            </Link>
          </div>
        </section>

        {/* Quick Actions */}

        <h2
          style={{
            marginTop: "50px",
            marginBottom: "20px",
          }}
        >
          Quick Actions
        </h2>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(220px,1fr))",
            gap: "20px",
          }}
        >
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              style={{
                textDecoration: "none",
                color: "white",
              }}
            >
              <article
                style={{
                  padding: "26px",
                  borderRadius: "20px",
                  background: "rgba(15,23,42,.92)",
                  border: "1px solid #334155",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "42px",
                  }}
                >
                  {action.icon}
                </div>

                <h3
                  style={{
                    marginTop: "16px",
                  }}
                >
                  {action.title}
                </h3>
              </article>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}

const buttonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  background: "#a3e635",
  color: "#172554",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryButtonStyle = {
  padding: "15px 24px",
  borderRadius: "999px",
  border: "1px solid #64748b",
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
};
