"use client";

import type { CSSProperties } from "react";

export type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

export type SelectedSeratoPlaylist = {
  id: string;
  name: string;
  trackCount: number;
};

export type SeratoGameDetails = {
  gameName?: string;
  venueName?: string;
  hostName?: string;
};

type GameSettingsProps = {
  selectedPlaylist: SelectedSeratoPlaylist | null;
  gameDetails: SeratoGameDetails | null;

  cardCount: number;
  clipLength: number;
  winningPattern: WinningPattern;
  shuffle: boolean;

  loading: boolean;
  creating: boolean;
  createDisabled: boolean;
  error: string;
  message: string;

  onCardCountChange: (cardCount: number) => void;
  onClipLengthChange: (clipLength: number) => void;
  onWinningPatternChange: (
    winningPattern: WinningPattern
  ) => void;
  onShuffleChange: (shuffle: boolean) => void;
  onCreateGame: () => void;
};

const WINNING_PATTERNS: Array<{
  value: WinningPattern;
  label: string;
}> = [
  {
    value: "any-line",
    label: "Any 5 in a Row",
  },
  {
    value: "across",
    label: "Across Only",
  },
  {
    value: "down",
    label: "Down Only",
  },
  {
    value: "diagonal",
    label: "Diagonal Only",
  },
  {
    value: "x-pattern",
    label: "X Pattern",
  },
  {
    value: "blackout",
    label: "Blackout",
  },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function GameSettings({
  selectedPlaylist,
  gameDetails,
  cardCount,
  clipLength,
  winningPattern,
  shuffle,
  loading,
  creating,
  createDisabled,
  error,
  message,
  onCardCountChange,
  onClipLengthChange,
  onWinningPatternChange,
  onShuffleChange,
  onCreateGame,
}: GameSettingsProps) {
  const eventDescription = [
    gameDetails?.venueName,
    gameDetails?.hostName,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <aside style={settingsPanelStyle}>
      <p style={sectionLabelStyle}>Game Builder</p>

      <h2 style={sectionTitleStyle}>Game Settings</h2>

      <div style={selectedCrateStyle}>
        <span style={summaryLabelStyle}>
          Selected crate
        </span>

        <strong style={summaryValueStyle}>
          {selectedPlaylist?.name || "No crate selected"}
        </strong>

        <small style={summaryNoteStyle}>
          {selectedPlaylist
            ? selectedPlaylist.trackCount > 0
              ? `${formatNumber(
                  selectedPlaylist.trackCount
                )} songs available`
              : "Song count available after game creation"
            : "Choose a crate from the library"}
        </small>
      </div>

      {gameDetails?.gameName && (
        <div style={eventDetailsStyle}>
          <span style={summaryLabelStyle}>Event</span>

          <strong style={summaryValueStyle}>
            {gameDetails.gameName}
          </strong>

          <small style={summaryNoteStyle}>
            {eventDescription || "Event setup is ready"}
          </small>
        </div>
      )}

      <div style={formGridStyle}>
        <label style={labelStyle}>
          Bingo cards

          <input
            type="number"
            min={1}
            max={500}
            value={cardCount}
            disabled={loading || creating}
            onChange={(event) => {
              const nextCardCount = Math.max(
                1,
                Math.min(
                  500,
                  Number(event.target.value) || 1
                )
              );

              onCardCountChange(nextCardCount);
            }}
            style={{
              ...inputStyle,
              opacity: loading || creating ? 0.65 : 1,
            }}
          />
        </label>

        <label style={labelStyle}>
          Clip length

          <select
            value={clipLength}
            disabled={loading || creating}
            onChange={(event) =>
              onClipLengthChange(
                Number(event.target.value)
              )
            }
            style={{
              ...inputStyle,
              opacity: loading || creating ? 0.65 : 1,
            }}
          >
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Winning pattern

        <select
          value={winningPattern}
          disabled={loading || creating}
          onChange={(event) =>
            onWinningPatternChange(
              event.target.value as WinningPattern
            )
          }
          style={{
            ...inputStyle,
            opacity: loading || creating ? 0.65 : 1,
          }}
        >
          {WINNING_PATTERNS.map((pattern) => (
            <option
              key={pattern.value}
              value={pattern.value}
            >
              {pattern.label}
            </option>
          ))}
        </select>
      </label>

      <label style={toggleStyle}>
        <span>
          <strong style={toggleTitleStyle}>
            Shuffle crate
          </strong>

          <small style={toggleDescriptionStyle}>
            Randomize the song order before opening the
            console.
          </small>
        </span>

        <input
          type="checkbox"
          checked={shuffle}
          disabled={loading || creating}
          onChange={(event) =>
            onShuffleChange(event.target.checked)
          }
          style={{
            ...checkboxStyle,
            opacity: loading || creating ? 0.65 : 1,
          }}
        />
      </label>

      {error && <div style={errorStyle}>{error}</div>}

      <button
        type="button"
        disabled={createDisabled}
        onClick={onCreateGame}
        style={{
          ...createButtonStyle,
          opacity: createDisabled ? 0.55 : 1,
          cursor: createDisabled
            ? "not-allowed"
            : "pointer",
        }}
      >
        {creating
          ? "Creating Game..."
          : "Create Game & Open DJ Console"}
      </button>

      <p style={messageStyle}>{message}</p>
    </aside>
  );
}

const settingsPanelStyle: CSSProperties = {
  alignSelf: "start",
  padding: "26px",
  border: "1px solid #334155",
  borderRadius: "24px",
  background: "rgba(15, 23, 42, 0.96)",
  position: "sticky",
  top: "18px",
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

const selectedCrateStyle: CSSProperties = {
  marginTop: "20px",
  padding: "18px",
  border: "1px solid rgba(167, 139, 250, 0.28)",
  borderRadius: "16px",
  background: "rgba(124, 58, 237, 0.11)",
};

const eventDetailsStyle: CSSProperties = {
  marginTop: "12px",
  padding: "18px",
  border: "1px solid #334155",
  borderRadius: "16px",
  background: "rgba(2, 6, 23, 0.58)",
};

const summaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const summaryValueStyle: CSSProperties = {
  display: "block",
  marginTop: "7px",
  fontSize: "18px",
};

const summaryNoteStyle: CSSProperties = {
  display: "block",
  marginTop: "6px",
  color: "#94a3b8",
  lineHeight: 1.5,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginTop: "22px",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginTop: "18px",
  color: "#e2e8f0",
  fontSize: "13px",
  fontWeight: 850,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: "9px",
  padding: "13px 14px",
  border: "1px solid #475569",
  borderRadius: "12px",
  background: "#020617",
  color: "white",
  fontSize: "15px",
  outline: "none",
};

const toggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  marginTop: "20px",
  padding: "17px",
  border: "1px solid #334155",
  borderRadius: "15px",
  background: "rgba(2, 6, 23, 0.56)",
};

const toggleTitleStyle: CSSProperties = {
  display: "block",
  fontSize: "15px",
};

const toggleDescriptionStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#94a3b8",
  lineHeight: 1.5,
};

const checkboxStyle: CSSProperties = {
  width: "22px",
  height: "22px",
  flexShrink: 0,
  accentColor: "#8b5cf6",
};

const errorStyle: CSSProperties = {
  marginTop: "18px",
  padding: "14px",
  border: "1px solid rgba(244, 63, 94, 0.4)",
  borderRadius: "13px",
  background: "rgba(244, 63, 94, 0.1)",
  color: "#fda4af",
  fontSize: "13px",
  lineHeight: 1.6,
};

const createButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: "22px",
  padding: "16px",
  border: 0,
  borderRadius: "999px",
  background:
    "linear-gradient(90deg, #2563eb, #9333ea)",
  color: "white",
  boxShadow:
    "0 15px 36px rgba(99, 102, 241, 0.28)",
  fontSize: "15px",
  fontWeight: 900,
};

const messageStyle: CSSProperties = {
  minHeight: "42px",
  margin: "14px 0 0",
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: 1.6,
};