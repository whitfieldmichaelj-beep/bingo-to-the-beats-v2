import Link from "next/link";

const providers = [
  {
    name: "Spotify",
    description:
      "Connect Spotify and select one of your existing playlists.",
    status: "Available",
    href: "/api/spotify/login",
    accent: "#1ed760",
    icon: "♫",
  },
  {
    name: "Apple Music",
    description:
      "Connect your Apple Music account and browse your playlists.",
    status: "Setup in progress",
    href: "/music/apple",
    accent: "#fa2d48",
    icon: "♪",
  },
  {
    name: "Manual Playlist",
    description:
      "Create a playlist by entering song titles and artists yourself.",
    status: "Available",
    href: "/music/upload",
    accent: "#a78bfa",
    icon: "✎",
  },
  {
    name: "Upload CSV",
    description:
      "Import a prepared song list from a CSV spreadsheet.",
    status: "Available",
    href: "#",
    accent: "#38bdf8",
    icon: "↑",
  },
];

export default function MusicPage() {
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
          width: "min(100%, 1120px)",
          margin: "0 auto",
        }}
      >
        <div
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
            Music Library
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 72px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Choose your music source
          </h1>

          <p
            style={{
              margin: "22px auto 0",
              maxWidth: "680px",
              color: "#cbd5e1",
              fontSize: "19px",
              lineHeight: 1.7,
            }}
          >
            Select where Bingo to the Beats should load the music for
            your next game.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "22px",
            marginTop: "52px",
          }}
        >
          {providers.map((provider) => {
            const unavailable = provider.href === "#";

            return (
              <Link
                key={provider.name}
                href={provider.href}
                aria-disabled={unavailable}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                  pointerEvents: unavailable ? "none" : "auto",
                  opacity: unavailable ? 0.65 : 1,
                }}
              >
                <article
                  style={{
                    height: "100%",
                    padding: "30px",
                    borderRadius: "22px",
                    background: "rgba(15, 23, 42, 0.94)",
                    border: `1px solid ${provider.accent}66`,
                    boxShadow: `0 20px 55px ${provider.accent}18`,
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "18px",
                      background: `${provider.accent}22`,
                      color: provider.accent,
                      fontSize: "34px",
                      fontWeight: 900,
                    }}
                  >
                    {provider.icon}
                  </div>

                  <span
                    style={{
                      display: "inline-block",
                      marginTop: "24px",
                      padding: "6px 11px",
                      borderRadius: "999px",
                      background: `${provider.accent}22`,
                      color: provider.accent,
                      fontSize: "12px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                    }}
                  >
                    {provider.status}
                  </span>

                  <h2
                    style={{
                      margin: "18px 0 0",
                      fontSize: "29px",
                    }}
                  >
                    {provider.name}
                  </h2>

                  <p
                    style={{
                      margin: "13px 0 0",
                      color: "#cbd5e1",
                      lineHeight: 1.7,
                    }}
                  >
                    {provider.description}
                  </p>

                  <p
                    style={{
                      margin: "26px 0 0",
                      color: provider.accent,
                      fontWeight: 900,
                    }}
                  >
                    {unavailable ? "Coming soon" : "Continue →"}
                  </p>
                </article>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}