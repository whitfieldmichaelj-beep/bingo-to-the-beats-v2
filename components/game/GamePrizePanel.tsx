"use client";

import { useEffect, useState } from "react";
import { MAX_PRIZE_DESCRIPTION, PRIZE_KINDS, type GamePrize } from "@/lib/game/prize";

export default function GamePrizePanel({ gameId, prize, editable, onSaved, onDirtyChange }: {
  gameId: string; prize?: GamePrize | null; editable: boolean; onSaved: (prize: GamePrize) => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<GamePrize["kind"]>(prize?.kind ?? "tickets");
  const [description, setDescription] = useState(prize?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = kind !== (prize?.kind ?? "tickets") || description !== (prize?.description ?? "");
  useEffect(() => { onDirtyChange?.(dirty || saving); }, [dirty, saving, onDirtyChange]);
  async function save() {
    if (!editable || saving) return;
    setSaving(true); setMessage("Saving prize…");
    try {
      const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/prize`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize: { kind, description } }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Unable to save the prize.");
      onSaved(data.prize); setKind(data.prize.kind); setDescription(data.prize.description); setMessage("Prize saved. Players will see it on their cards.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the prize. Try again."); }
    finally { setSaving(false); }
  }
  if (!editable) return null;
  return <section className="game-prize-panel" aria-labelledby="game-prize-title">
    <div><h2 id="game-prize-title">What will the winner receive?</h2>
      <p>Set the prize before starting. For Twitch or in-person games, choose tickets, gifts, cash, or any reward you provide.</p></div>
    <div className="game-prize-fields">
      <label>Prize type<select value={kind} disabled={saving} onChange={event => setKind(event.target.value as GamePrize["kind"])}>
        {PRIZE_KINDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      {kind !== "none" && <label>Prize description<input maxLength={MAX_PRIZE_DESCRIPTION} disabled={saving}
        placeholder="Example: Two concert tickets to the show of your choice" value={description} onChange={event => setDescription(event.target.value)} /></label>}
      <button type="button" disabled={saving || (kind !== "none" && !description.trim())} onClick={() => void save()}>{saving ? "Saving…" : "Save prize"}</button>
    </div>
    {dirty && <button type="button" disabled={saving} onClick={() => { setKind(prize?.kind ?? "tickets"); setDescription(prize?.description ?? ""); setMessage(""); }}>Discard prize changes</button>}
    <p className="game-prize-saved">Saved prize: <strong>{prize?.description ?? "Not set yet"}</strong></p>
    <p role="status">{dirty && !saving ? "Unsaved changes. Save the prize before opening the console." : message || "The prize stays with the game and its winner in your saved history. It locks when the game starts."}</p>
  </section>;
}
