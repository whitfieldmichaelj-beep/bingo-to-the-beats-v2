"use client";

import "../ui/bttb.css";

import { useGameRoster } from "@/hooks/useGameRoster";

type LivePlayerRosterProps = {
  gameId?: string | null;
};

export default function LivePlayerRoster({
  gameId,
}: LivePlayerRosterProps) {
  const { roster, loading, error } =
    useGameRoster(gameId, 70, 10000);

  if (!gameId) {
    return (
      <section className="bttb-roster-panel">
        <h3 style={headingStyle}>Players Joined</h3>
        <p style={emptyStyle}>
          Create or load a game to view players.
        </p>
      </section>
    );
  }

  return (
    <section className="bttb-roster-panel">
      <div style={headerStyle}>
        <div>
          <p style={labelStyle}>Live Roster</p>
          <h3 style={headingStyle}>
            Live Player Activity
          </h3>
        </div>

        <span style={countBadgeStyle}>
          {roster.totals.totalPlayers} Paid
        </span>
      </div>

      {loading &&
      roster.players.length === 0 ? (
        <p style={emptyStyle}>
          Loading players...
        </p>
      ) : error ? (
        <p style={errorStyle}>{error}</p>
      ) : roster.players.length === 0 ? (
        <p style={emptyStyle}>
          No players have joined yet.
        </p>
      ) : (
        <div className="bttb-roster-list">
          {roster.players.map((player) => (
            <article
              key={player.playerId}
              style={playerRowStyle}
            >
              <span
                style={{
                  ...statusDotStyle,
                  background: player.connected
                    ? "#22c55e"
                    : "#f59e0b",
                }}
              />

              <div style={playerCopyStyle}>
                <strong style={playerNameStyle}>
                  {player.playerName}
                </strong>

                <small style={playerMetaStyle}>
                  {player.cardQuantity}{" "}
                  {player.cardQuantity === 1
                    ? "card"
                    : "cards"}
                  {" • "}
                  {(player.amountCents / 100).toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                    }
                  )}
                  {" • "}
                  <strong
                    style={{
                      color:
                        player.paymentStatus === "PAID"
                          ? "#22c55e"
                          : player.paymentStatus === "PENDING"
                            ? "#f59e0b"
                            : "#94a3b8",
                    }}
                  >
                    {player.paymentStatus === "PAID"
                      ? "PAID"
                      : player.paymentStatus === "PENDING"
                        ? "PAYMENT PENDING"
                        : "NO PAYMENT"}
                  </strong>
                </small>
              </div>

              <time style={timeStyle}>
                {new Date(
                  player.joinedAt
                ).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </article>
          ))}
        </div>
      )}

      <div style={totalsStyle}>
        <div style={totalBoxStyle}>
          <strong style={totalNumberStyle}>
            {roster.totals.totalPlayers}
          </strong>
          <span style={totalLabelStyle}>
            Paid Players
          </span>
        </div>

        <div style={totalBoxStyle}>
          <strong style={totalNumberStyle}>
            {roster.totals.totalCards}
          </strong>
          <span style={totalLabelStyle}>
            Cards Sold
          </span>
        </div>

        <div style={totalBoxStyle}>
          <strong style={totalNumberStyle}>
            {roster.totals.pendingPlayers}
          </strong>
          <span style={totalLabelStyle}>
            Pending
          </span>
        </div>

        <div style={totalBoxStyle}>
          <strong style={totalNumberStyle}>
            {(roster.totals.totalPotCents / 100).toLocaleString(
              "en-US",
              {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }
            )}
          </strong>
          <span style={totalLabelStyle}>
            Paid Pot
          </span>
        </div>

        <div style={totalBoxStyle}>
          <strong style={totalNumberStyle}>
            {roster.totals.connectedPlayers}
          </strong>
          <span style={totalLabelStyle}>
            Online
          </span>
        </div>
      </div>

      <div style={activityStyle}>
        <p style={labelStyle}>Recent Activity</p>

        {roster.activities.length === 0 ? (
          <p style={emptyActivityStyle}>
            Player activity will appear here.
          </p>
        ) : (
          roster.activities
            .slice(0, 5)
            .map((item) => (
              <div
                key={item.id}
                style={activityRowStyle}
              >
                <span>
                  <strong>
                    {item.playerName}
                  </strong>{" "}
                  joined with{" "}
                  {item.cardQuantity}{" "}
                  {item.cardQuantity === 1
                    ? "card"
                    : "cards"}
                </span>

                <time>
                  {new Date(
                    item.createdAt
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))
        )}
      </div>
    </section>
  );
}

const panelStyle = {
  marginTop: "16px",
  padding: "18px",
  border: "1px solid #334155",
  borderRadius: "16px",
  background: "rgba(8, 14, 25, 0.96)",
  color: "white",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const labelStyle = {
  margin: 0,
  color: "#a78bfa",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};

const headingStyle = {
  margin: "5px 0 0",
  fontSize: "19px",
};

const countBadgeStyle = {
  minWidth: "36px",
  height: "36px",
  display: "grid",
  placeItems: "center",
  borderRadius: "999px",
  background: "#7c3aed",
  fontWeight: 900,
};

const playerListStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "16px",
};

const playerRowStyle = {
  display: "grid",
  gridTemplateColumns: "10px 1fr auto",
  alignItems: "center",
  gap: "10px",
  padding: "11px",
  border: "1px solid #253149",
  borderRadius: "11px",
  background: "#080e19",
};

const statusDotStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "999px",
};

const playerCopyStyle = {
  minWidth: 0,
};

const playerNameStyle = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  fontSize: "13px",
};

const playerMetaStyle = {
  display: "block",
  marginTop: "3px",
  color: "#94a3b8",
  fontSize: "10px",
};

const timeStyle = {
  color: "#8b9ab1",
  fontSize: "10px",
};

const totalsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "8px",
  marginTop: "16px",
};

const totalBoxStyle = {
  padding: "12px 8px",
  border: "1px solid #29364e",
  borderRadius: "11px",
  background: "#070c16",
  textAlign: "center" as const,
};

const totalNumberStyle = {
  display: "block",
  fontSize: "21px",
};

const totalLabelStyle = {
  display: "block",
  marginTop: "3px",
  color: "#7f8da3",
  fontSize: "9px",
  fontWeight: 850,
  textTransform: "uppercase" as const,
};

const activityStyle = {
  marginTop: "16px",
  paddingTop: "14px",
  borderTop: "1px solid #26324a",
};

const activityRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "9px 0",
  borderBottom: "1px solid #1e293b",
  color: "#cbd5e1",
  fontSize: "11px",
};

const emptyStyle = {
  margin: "16px 0 0",
  color: "#64748b",
  fontSize: "12px",
  textAlign: "center" as const,
};

const emptyActivityStyle = {
  margin: "10px 0 0",
  color: "#64748b",
  fontSize: "11px",
};

const errorStyle = {
  margin: "16px 0 0",
  color: "#fca5a5",
  fontSize: "12px",
};
