"use client";

import type { CSSProperties } from "react";

export type SeratoPlaylistItem = {
  id: string;
  name: string;
  trackCount: number;
  source?: string;
  path?: string;
};

type CrateListProps = {
  playlists: SeratoPlaylistItem[];
  selectedPlaylistId: string;
  search: string;
  loading: boolean;

  onSearchChange: (search: string) => void;
  onSelectPlaylist: (playlist: SeratoPlaylistItem) => void;
  onRefresh: () => void;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function CrateList({
  playlists,
  selectedPlaylistId,
  search,
  loading,
  onSearchChange,
  onSelectPlaylist,
  onRefresh,
}: CrateListProps) {
  const isLoading = loading === true;

  return (
    <section style={cratePanelStyle}>
      <div style={sectionHeadingStyle}>
        <div>
          <p style={sectionLabelStyle}>Serato Library</p>

          <h2 style={sectionTitleStyle}>
            Choose a Crate
          </h2>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          style={{
            ...smallButtonStyle,
            opacity: isLoading ? 0.55 : 1,
            cursor: isLoading
              ? "not-allowed"
              : "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(event) =>
          onSearchChange(event.target.value)
        }
        placeholder="Search Serato crates..."
        aria-label="Search Serato crates"
        disabled={isLoading}
        style={{
          ...searchInputStyle,
          opacity: isLoading ? 0.7 : 1,
          cursor: isLoading
            ? "not-allowed"
            : "text",
        }}
      />

      <div style={crateListStyle}>
        {isLoading ? (
          <p style={emptyStyle}>
            Reading Serato crates...
          </p>
        ) : playlists.length === 0 ? (
          <p style={emptyStyle}>
            No matching crates were found.
          </p>
        ) : (
          playlists.map((playlist) => {
            const selected =
              playlist.id === selectedPlaylistId;

            return (
              <button
                key={playlist.id}
                type="button"
                onClick={() =>
                  onSelectPlaylist(playlist)
                }
                aria-pressed={selected}
                disabled={false}
                style={{
                  ...crateButtonStyle,
                  borderColor: selected
                    ? "#a78bfa"
                    : "#334155",
                  background: selected
                    ? "linear-gradient(135deg, rgba(124, 58, 237, 0.32), rgba(37, 99, 235, 0.18))"
                    : "rgba(2, 6, 23, 0.72)",
                  boxShadow: selected
                    ? "0 0 0 1px rgba(167, 139, 250, 0.25)"
                    : "none",
                }}
              >
                <span style={crateIconStyle}>
                  ♫
                </span>

                <span style={crateCopyStyle}>
                  <strong style={crateNameStyle}>
                    {playlist.name}
                  </strong>

                  <small style={crateCountStyle}>
                    {playlist.trackCount > 0
                      ? `${formatNumber(
                          playlist.trackCount
                        )} songs`
                      : "Song count available after creation"}
                  </small>
                </span>

                <span
                  aria-hidden="true"
                  style={{
                    ...selectedDotStyle,
                    background: selected
                      ? "#a3e635"
                      : "#475569",
                  }}
                />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

const cratePanelStyle: CSSProperties = {
  // BTTB_SERATO_CRATELIST_EXACT_V5
  // BTTB_SERATO_MATCH_GAME_BUILDER_HEIGHT_V6
  minHeight: "680px",
  minWidth: 0,
  alignSelf: "stretch",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",

  /*
   * The Game Builder is the height reference for this grid row.
   * Size containment prevents the full crate collection from making
   * the left column taller than the Game Builder. The inner list
   * handles vertical scrolling instead.
   */
  contain: "size",
  overflow: "hidden",

  padding: "26px",
  border: "1px solid #334155",
  borderRadius: "24px",
  background: "rgba(15, 23, 42, 0.92)",
};

const sectionHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "15px",
};

const sectionLabelStyle: CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
};

const sectionTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "27px",
};

const smallButtonStyle: CSSProperties = {
  padding: "9px 13px",
  border: "1px solid #475569",
  borderRadius: "10px",
  background: "#111827",
  color: "white",
  fontWeight: 800,
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: "22px",
  padding: "15px 17px",
  border: "1px solid #475569",
  borderRadius: "14px",
  background: "#020617",
  color: "white",
  fontSize: "15px",
  outline: "none",
};

const crateListStyle: CSSProperties = {
  // BTTB_SERATO_COMPLETE_PLAYLIST_ROWS_V2
  gridAutoRows: "max-content",
  alignItems: "start",
  display: "grid",
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
  alignContent: "start",
  gap: "10px",
  marginTop: "16px",
  paddingRight: "5px",

  /*
   * Scroll only inside the playlist list. Horizontal movement is
   * explicitly disabled.
   */
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehaviorX: "none",
  scrollbarGutter: "stable",
};

const crateButtonStyle: CSSProperties = {
  height: "auto",
  minHeight: "72px",
  alignSelf: "start",
  overflow: "visible",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "15px",
  border: "1px solid",
  borderRadius: "15px",
  color: "white",
  cursor: "pointer",
  textAlign: "left",
};

const crateIconStyle: CSSProperties = {
  width: "42px",
  height: "42px",
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: "12px",
  background: "rgba(99, 102, 241, 0.17)",
  color: "#c4b5fd",
  fontSize: "18px",
};

const crateCopyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignSelf: "stretch",
  overflow: "visible",
  minWidth: 0,
  flex: 1,
};

const crateNameStyle: CSSProperties = {
  overflow: "visible",
  textOverflow: "clip",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.3,
  // BTTB_SERATO_FULL_PLAYLIST_NAMES_V1
  display: "block",
  minWidth: 0,
  fontSize: "15px",
};

const crateCountStyle: CSSProperties = {
  lineHeight: 1.3,
  whiteSpace: "normal",
  overflow: "visible",
  display: "block",
  marginTop: "5px",
  color: "#94a3b8",
};

const selectedDotStyle: CSSProperties = {
  width: "10px",
  height: "10px",
  flexShrink: 0,
  borderRadius: "999px",
};

const emptyStyle: CSSProperties = {
  padding: "50px 18px",
  border: "1px dashed #475569",
  borderRadius: "16px",
  color: "#94a3b8",
  textAlign: "center",
};