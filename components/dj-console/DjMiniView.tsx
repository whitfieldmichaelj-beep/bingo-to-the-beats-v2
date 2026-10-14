"use client";

import { useEffect, useState } from "react";
import type { BingoClaim } from "@/hooks/useBingoClaims";
import type { LivePlayer } from "@/hooks/useGameRoster";
import "./dj-mini-view.css";

export type MiniViewProps = {
  mode: "compact" | "standard";
  onModeChange: (mode: "compact" | "standard") => void;
  onOpenConsole: () => void;
  onFloat?: () => void;
  gameCode: string;
  gameStatus: string;
  connection: "loading" | "connected" | "error";
  providerName: string;
  providerConnected: boolean;
  track: { name: string; artist: string } | null;
  progress: number;
  secondsRemaining: number;
  songStatus: string;
  calledCount: number;
  totalSongs: number;
  players: Pick<LivePlayer, "playerName" | "connected" | "cardNumbers" | "cardQuantity">[];
  claim: Pick<BingoClaim, "id" | "playerName" | "cardNumber"> | null;
  claimConnectionLost?: boolean;
};

export function playerTicker(players: MiniViewProps["players"]) {
  return players.filter(player => player.connected).flatMap(player =>
    (player.cardNumbers ?? []).map(number => `${player.playerName} — Card #${number}`)
  );
}

export default function DjMiniView(props: MiniViewProps) {
  const [expiredClaimId, setExpiredClaimId] = useState<string | null>(null);
  const [tickerPaused, setTickerPaused] = useState(false);
  const claimId = props.claim?.id;
  useEffect(() => {
    if (!claimId) return;
    const timer = window.setTimeout(() => setExpiredClaimId(claimId), 15000);
    return () => window.clearTimeout(timer);
  }, [claimId]);
  const alert = props.claim && props.claim.id !== expiredClaimId ? props.claim : null;
  const players = props.players.filter(player => player.connected);
  const ticker = playerTicker(props.players);
  const text = ticker.join("   •   ");
  const progress = Number.isFinite(props.progress) ? Math.min(100, Math.max(0, props.progress)) : 0;

  return <section className={`dj-mini dj-mini--${props.mode}`} aria-label="BTTB DJ Mini View">
    <div className="dj-mini-row">
      <strong className="dj-mini-brand">♫ BTTB</strong>
      <span className={`dj-mini-connection is-${props.connection}`}>BTTB: {props.connection === "error" ? "Connection lost" : props.connection === "loading" ? "Loading" : "Connected"}</span>
      <span className={props.providerConnected ? "dj-mini-good" : "dj-mini-muted"}>{props.providerName}: {props.providerConnected ? "Connected" : "Disconnected"}</span>
      <strong className="dj-mini-game">{props.gameCode || "Loading game"} <span>{props.gameStatus}</span></strong>
      <div className="dj-mini-now-playing"><strong>{props.track?.name || "Waiting for a song"}</strong><span>{props.track?.artist || "No track detected"}</span></div>
      <div className="dj-mini-counts"><span>Songs called <b>{props.calledCount} / {props.totalSongs}</b></span><span>Active <b>{players.length} players · {players.reduce((sum, player) => sum + player.cardQuantity, 0)} cards</b></span></div>
      <div className="dj-mini-controls">
        <button type="button" aria-pressed={props.mode === "compact"} onClick={() => props.onModeChange(props.mode === "compact" ? "standard" : "compact")}>{props.mode === "compact" ? "Standard" : "Compact"}</button>
        {props.onFloat && <button type="button" onClick={props.onFloat}>Float widget</button>}
        <button type="button" onClick={props.onOpenConsole}>{props.claim ? "Review BINGO · " : ""}Open Full BTTB</button>
      </div>
    </div>
    {props.claimConnectionLost && <div className="dj-mini-warning" role="alert">BINGO checks interrupted — retrying automatically. Claims may be delayed.</div>}
    <div className="dj-mini-progress-row"><span>{props.songStatus} · {Math.max(0, Math.ceil(props.secondsRemaining))}s remaining</span><progress aria-label="Bingo song countdown progress" max={100} value={progress} /></div>
    {alert ? <div className="dj-mini-alert" role="alert"><strong>★ BINGO CLAIM — {alert.playerName} — Card #{alert.cardNumber}</strong><button type="button" onClick={props.onOpenConsole}>Review claim</button></div>
      : <div className="dj-mini-ticker-row"><div className="dj-mini-ticker" tabIndex={0} aria-label={text || "Waiting for active players"}><div className={`dj-mini-crawl ${tickerPaused ? "is-paused" : ""}`} style={{ animationDuration: `${Math.max(20, text.length / 6)}s` }}><span>{text || "Waiting for active players to join…"}</span>{text && <span aria-hidden="true">{text}</span>}</div></div>{ticker.length > 0 && <button type="button" aria-pressed={tickerPaused} onClick={() => setTickerPaused(!tickerPaused)}>{tickerPaused ? "Resume ticker" : "Pause ticker"}</button>}</div>}
  </section>;
}
