"use client";

import Link from "next/link";
import { useState, useEffect, type CSSProperties } from "react";
import { DJ_PROVIDERS, DJ_PROVIDER_KEY, djProvider, type DjProvider } from "@/lib/dj/providers";

import CrateList from "../../components/serato/CrateList";
import GameSettings from "../../components/serato/GameSettings";
import Hero from "../../components/serato/SeratoHero";
import { useSeratoWorkspace } from "../../hooks/useSeratoWorkspace";

export default function SeratoWorkspacePage() {
  const [provider, setProvider] = useState<DjProvider>("serato");
  useEffect(() => {
    // Restore the device preference once after hydration; the server has no localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setProvider(djProvider(new URLSearchParams(window.location.search).get("provider") || localStorage.getItem(DJ_PROVIDER_KEY))); } catch {}
  }, []);
  return <DjWorkspace key={provider} provider={provider} onProviderChange={value => {
    try {localStorage.setItem(DJ_PROVIDER_KEY,value);} catch {}
    setProvider(value);
  }} />;
}
function DjWorkspace({provider,onProviderChange}:{provider:DjProvider;onProviderChange:(value:DjProvider)=>void}) {
  const labels=DJ_PROVIDERS[provider];
  const workspace = useSeratoWorkspace(provider);

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
                {labels.name} Workspace
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
              {labels.name} Library
            </p>

            <h2 style={loadingTitleStyle}>
              Preparing Your Workspace
            </h2>

            <p style={loadingMessageStyle}>
              Connecting to your local {labels.name} {labels.collections}...
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
              {labels.name} Workspace
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
        <label style={{display:"block",marginBottom:20}}>DJ Software{" "}
          <select aria-label="DJ Software" value={provider} onChange={event=>onProviderChange(djProvider(event.target.value))} style={{padding:12,background:"#0f172a",color:"white",borderRadius:10}}>
            {Object.entries(DJ_PROVIDERS).map(([id,p])=><option key={id} value={id}>{p.icon} {p.name}</option>)}
          </select>
        </label>
        <Hero provider={provider}
          loading={workspace.hero.loading}
          playlistCount={workspace.hero.playlistCount}
          libraryTrackCount={
            workspace.hero.libraryTrackCount
          }
          hasError={workspace.hero.hasError}
        />

        {provider === "virtualdj" && (
          <section aria-label="Virtual DJ library locations" style={{ margin: "20px 0", padding: "18px", border: "1px solid #475569", borderRadius: "14px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: "18px" }}>Virtual DJ library locations</h2>
            <p style={{ color: "#cbd5e1" }}>BTTB reads playlists from these folders. Keep your external music drive connected while playing.</p>
            <p style={{ color: "#cbd5e1", overflowWrap: "anywhere" }}><strong>Windows PC:</strong> <code>{String.raw`%LOCALAPPDATA%\VirtualDJ`}</code> (usually <code>{String.raw`C:\Users\YourName\AppData\Local\VirtualDJ`}</code>). Older installations may use <code>{String.raw`%USERPROFILE%\Documents\VirtualDJ`}</code>.</p>
            <p style={{ color: "#cbd5e1", overflowWrap: "anywhere" }}><strong>Mac:</strong> <code>~/Library/Application Support/VirtualDJ</code>. Older installations may use <code>~/Documents/VirtualDJ</code>.</p>
            <p style={{ color: "#cbd5e1" }}>External-drive libraries may be in <code>{String.raw`D:\VirtualDJ`}</code> on Windows (the drive letter varies), or <code>/Volumes/YourDrive/VirtualDJ</code> on Mac. Playlists are inside <code>MyLists</code> or <code>Playlists</code>.</p>
            <p style={{ color: "#cbd5e1" }}>To find your exact folder, open Virtual DJ → Settings → Options and click the folder icon in the lower-right corner.</p>
            <ul style={{ paddingLeft: "20px" }}>
              {workspace.hero.libraryLocations.map((location) => (
                <li key={location} style={{ marginTop: "10px" }}>
                  <strong>Detected library</strong>
                  <div style={{ overflowWrap: "anywhere", marginTop: "4px", color: "#cbd5e1" }}>{location}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          className="serato-workspace-grid"
          style={workspaceGridStyle}
        >
          <CrateList provider={provider}
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

          <GameSettings provider={provider}
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
            advisor={workspace.settings.advisor}
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
            onOptimizeGame={
              workspace.settings.onOptimizeGame
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
  alignItems: "stretch",
  minWidth: 0,
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
