import Link from "next/link";

const providers = [
  {
    name: "Apple Music",
    description:
      "Connect Apple Music to browse your library and choose playlists.",
    status: "Coming next",
    href: "/music/apple",
    accent: "#fa2d48",
  },
  {
    name: "Spotify",
    description:
      "Use the Spotify connection already available in BTTB v2.",
    status: "Beta",
    href: "/api/spotify/login",
    accent: "#1ed760",
  },
  {
    name: "Manual Playlist",
    description:
      "Build a game by entering song titles and artists directly.",
    status: "Planned",
    href: "/music/manual",
    accent: "#a78bfa",
  },
  {
    name: "Upload CSV",
    description:
      "Import an existing song list from a spreadsheet or CSV file.",
    status: "Planned",
    href: "/music/upload",
    accent: "#38bdf8",
  },
];

export default function MusicPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 28px 80px",
        background:
          "radial-gradient(circle at top, #312e81 0%, #0f172a 42%, #020617 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            color: "#a78bfa",
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Music Library
        </p>

        <h1
          style={{
            marginTop: "10px",
            fontSize: "clamp(42px, 7vw, 72px)",
            lineHeight: 1,
          }}
        >
          Choose your music source
        </h1>

        <p
          style={{
            maxWidth: "700px",
            marginTop: "18px",
            color: "#cbd5e1",
            fontSize: "19px",
            lineHeight: 1.7,
          }}
        >
          Select how you want to bring songs into your Bingo to the Beats
          game.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "20px",
            marginTop: "38px",
          }}
        >
          {providers.map((provider) => (
            <Link
              key={provider.name}
              href={provider.href}
              style={{
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <article
                style={{
                  height: "100%",
                  padding: "26px",
                  borderRadius: "18px",
                  background: "rgba(15, 23, 42, 0.9)",
                  border: `1px solid ${provider.accent}`,
                  boxShadow: `0 0 30px ${provider.accent}22`,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: `${provider.accent}22`,
                    color: provider.accent,
                    fontSize: "13px",
                    fontWeight: 900,
                  }}
                >
                  {provider.status}
                </span>

                <h2
                  style={{
                    marginTop: "20px",
                    fontSize: "28px",
                  }}
                >
                  {provider.name}
                </h2>

                <p
                  style={{
                    marginTop: "12px",
                    color: "#cbd5e1",
                    lineHeight: 1.65,
                  }}
                >
                  {provider.description}
                </p>

                <p
                  style={{
                    marginTop: "24px",
                    color: provider.accent,
                    fontWeight: 900,
                  }}
                >
                  Continue →
                </p>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}