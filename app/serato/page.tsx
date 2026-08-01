"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import CrateList from "../../components/serato/CrateList";
import GameSettings from "../../components/serato/GameSettings";
import Hero from "../../components/serato/SeratoHero";
import { useSeratoWorkspace } from "../../hooks/useSeratoWorkspace";

export default function SeratoWorkspacePage() {
  const workspace = useSeratoWorkspace();

  /*
   * The server and the browser must initially render the same markup.
   * The interactive Serato controls are therefore displayed only after
   * the hook confirms that hydration has completed.
   */
  if (!workspace.status.isHydrated) {
    return (
      <main style={pageStyle}>
        <div style={backgroundGlowOneStyle} />
        <div style={backgroundGlowTwoStyle} />

        <header style={topbarStyle}>
          <div style={brandStyle}>
            <div style={logoStyle}>♫</div>

            <div>
              <p style={brandLabelStyle}>
                Bingo to the Beats
              </p>

              <h1 style={brandTitleStyle}>
                Serato Workspace
              </h1>
            </div>
          </div>

          <nav style={navStyle}>
            <Link href="/music" style={navLinkStyle}>
              Music Sources
            </Link>

            <Link href="/dashboard" style={navLinkStyle}>
              Dashboard
            </Link>

            <Link href="/dj-console" style={navLinkStyle}>
              DJ Console
            </Link>
          </nav>
        </header>

        <div style={contentStyle}>
          <section style={loadingPanelStyle}>
            <div style={loadingIconStyle}>♫</div>

            <p style={loadingLabelStyle}>
              Serato Library
            </p>

            <h2 style={loadingTitleStyle}>
              Preparing Your Workspace
            </h2>

            <p style={loadingMessageStyle}>
              Connecting to your local Serato crates...
            </p>
          </section>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .serato-workspace-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={backgroundGlowOneStyle} />
      <div style={backgroundGlowTwoStyle} />

      <header style={topbarStyle}>
        <div style={brandStyle}>
          <div style={logoStyle}>♫</div>

          <div>
            <p style={brandLabelStyle}>
              Bingo to the Beats
            </p>

            <h1 style={brandTitleStyle}>
              Serato Workspace
            </h1>
          </div>
        </div>

        <nav style={navStyle}>
          <Link href="/music" style={navLinkStyle}>
            Music Sources
          </Link>

          <Link href="/dashboard" style={navLinkStyle}>
            Dashboard
          </Link>

          <Link href="/dj-console" style={navLinkStyle}>
            DJ Console
          </Link>
        </nav>
      </header>

      <div style={contentStyle}>
        <Hero
          loading={workspace.hero.loading}
          playlistCount={workspace.hero.playlistCount}
          libraryTrackCount={
            workspace.hero.libraryTrackCount
          }
          hasError={workspace.hero.hasError}
        />

        <section
          className="serato-workspace-grid"
          style={workspaceGridStyle}
        >
          <CrateList
            playlists={workspace.crates.playlists}
            selectedPlaylistId={
              workspace.crates.selectedPlaylistId
            }
            search={workspace.crates.search}
            loading={workspace.crates.loading}
            onSearchChange={
              workspace.crates.onSearchChange
            }
            onSelectPlaylist={(playlist) => {
              workspace.crates.onSelectPlaylist(
                playlist.id
              );
            }}
            onRefresh={() => {
              void workspace.crates.onRefresh();
            }}
          />

          <GameSettings
            selectedPlaylist={
              workspace.settings.selectedPlaylist
            }
            gameDetails={workspace.settings.gameDetails}
            cardCount={workspace.settings.cardCount}
            clipLength={workspace.settings.clipLength}
            winningPattern={
              workspace.settings.winningPattern
            }
            shuffle={workspace.settings.shuffle}
            loading={workspace.status.loading}
            creating={workspace.settings.creating}
            createDisabled={
              workspace.settings.createDisabled
            }
            error={workspace.settings.error}
            message={workspace.settings.message}
            onCardCountChange={
              workspace.settings.onCardCountChange
            }
            onClipLengthChange={
              workspace.settings.onClipLengthChange
            }
            onWinningPatternChange={
              workspace.settings.onWinningPatternChange
            }
            onShuffleChange={
              workspace.settings.onShuffleChange
            }
            onCreateGame={() => {
              void workspace.settings.onCreateGame();
            }}
          />
        </section>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .serato-workspace-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

const pageStyle: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  overflow: "hidden",
  background:
    "radial-gradient(circle at top, #24205f 0%, #0f172a 42%, #020617 100%)",
  color: "white",
};

const backgroundGlowOneStyle: CSSProperties = {
  position: "fixed",
  width: "430px",
  height: "430px",
  left: "-180px",
  top: "150px",
  borderRadius: "999px",
  background: "rgba(124, 58, 237, 0.2)",
  filter: "blur(110px)",
  pointerEvents: "none",
};

const backgroundGlowTwoStyle: CSSProperties = {
  position: "fixed",
  width: "430px",
  height: "430px",
  right: "-180px",
  bottom: "-100px",
  borderRadius: "999px",
  background: "rgba(37, 99, 235, 0.16)",
  filter: "blur(120px)",
  pointerEvents: "none",
};

const topbarStyle: CSSProperties = {
  position: "relative",
  zIndex: 2,
  minHeight: "78px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "18px",
  padding: "15px 24px",
  borderBottom:
    "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(2, 6, 23, 0.88)",
  backdropFilter: "blur(18px)",
};

const brandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
};

const logoStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  display: "grid",
  placeItems: "center",
  borderRadius: "15px",
  background:
    "linear-gradient(135deg, #2563eb, #9333ea)",
  boxShadow:
    "0 12px 30px rgba(124, 58, 237, 0.3)",
  fontSize: "23px",
};

const brandLabelStyle: CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
};

const brandTitleStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: "22px",
};

const navStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "9px",
};

const navLinkStyle: CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #334155",
  borderRadius: "11px",
  color: "#e2e8f0",
  textDecoration: "none",
  fontSize: "13px",
  fontWeight: 800,
};

const contentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "min(100% - 32px, 1280px)",
  margin: "0 auto",
  padding: "34px 0 80px",
};

const workspaceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1.55fr) minmax(330px, 0.75fr)",
  gap: "22px",
  marginTop: "22px",
};

const loadingPanelStyle: CSSProperties = {
  minHeight: "420px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px",
  border: "1px solid #334155",
  borderRadius: "24px",
  background: "rgba(15, 23, 42, 0.92)",
  textAlign: "center",
};

const loadingIconStyle: CSSProperties = {
  width: "72px",
  height: "72px",
  display: "grid",
  placeItems: "center",
  borderRadius: "22px",
  background:
    "linear-gradient(135deg, #2563eb, #9333ea)",
  boxShadow:
    "0 18px 45px rgba(124, 58, 237, 0.35)",
  fontSize: "32px",
};

const loadingLabelStyle: CSSProperties = {
  margin: "24px 0 0",
  color: "#a78bfa",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const loadingTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "30px",
};

const loadingMessageStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#94a3b8",
  lineHeight: 1.6,
};