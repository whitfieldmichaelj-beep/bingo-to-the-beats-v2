"use client";

import { useEffect, useState } from "react";
import { CARD_LIMITS, parseGameEntry, type GameEntry } from "@/lib/game/entry";

export default function GameEntryPanel({ gameId, editable, playerCount, onDirtyChange }: { gameId: string; editable: boolean; playerCount: number; onDirtyChange?: (dirty: boolean) => void }) {
  const [saved, setSaved] = useState<GameEntry | null>(null);
  const [draft, setDraft] = useState<GameEntry | null>(null);
  const [practice, setPractice] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading entry settings…");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => controller.abort(), 15000);
    void fetch(`/api/game/${encodeURIComponent(gameId)}/entry`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        const entry = parseGameEntry(data.entry);
        if (!response.ok || !entry) throw new Error(data.message || "Unable to load entry settings.");
        if (cancelled) return;
        setSaved(entry); setDraft(entry); setPractice(data.isPractice === true); setLocked(data.locked === true); setMessage("");
      }).catch(error => { if (!cancelled) setMessage(error instanceof Error && error.name !== "AbortError" ? error.message : "Entry settings took too long to load. Try again."); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [gameId, attempt]);
  const disabled = !editable || locked || practice || playerCount > 0 || busy;
  const dirty = draft && saved && (draft.mode !== saved.mode || draft.maxCardsPerPlayer !== saved.maxCardsPerPlayer);
  useEffect(() => { onDirtyChange?.(Boolean(dirty) || busy || !saved); }, [dirty, busy, saved, onDirtyChange]);
  async function save() {
    if (!draft || disabled) return;
    setBusy(true); setMessage("Saving entry settings…");
    try {
      const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/entry`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: draft }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) { if (response.status === 409) setLocked(true); throw new Error(data.message || "Unable to save entry settings."); }
      const entry = parseGameEntry(data.entry);
      if (!entry) throw new Error("Unable to confirm entry settings. Reload and try again.");
      setSaved(entry); setDraft(entry); setMessage("Entry settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save entry settings. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="game-prize-panel" aria-labelledby="game-entry-title">
    <div><h2 id="game-entry-title">Player entry</h2><p>Choose whether players pay to join, independently of the prize. Winning still depends on the songs called and the bingo pattern.</p></div>
    {draft && <div className="game-prize-fields">
      <label>Entry type<select value={draft.mode} disabled={disabled} onChange={event => setDraft({ ...draft, mode: event.target.value as GameEntry["mode"] })}>
        <option value="free">Free entry — no payment</option><option value="paid">Paid entry — existing card prices</option>
      </select></label>
      <label>Maximum cards per player<select value={draft.maxCardsPerPlayer} disabled={disabled} onChange={event => setDraft({ ...draft, maxCardsPerPlayer: Number(event.target.value) as GameEntry["maxCardsPerPlayer"] })}>
        {CARD_LIMITS.map(limit => <option value={limit} key={limit}>{limit} {limit === 1 ? "card" : "cards"}</option>)}
      </select></label>
      <button type="button" onClick={() => void save()} disabled={disabled || (draft.mode === saved?.mode && draft.maxCardsPerPlayer === saved?.maxCardsPerPlayer)}>{busy ? "Saving…" : "Save entry settings"}</button>
    </div>}
    {dirty && <button type="button" disabled={busy} onClick={() => { setDraft(saved); setMessage(""); if (locked) setAttempt(value => value + 1); }}>Discard entry changes</button>}
    {saved && <p className="game-prize-saved">Saved: <strong>{saved.mode === "free" ? "Free entry" : "Paid entry"} · Maximum {saved.maxCardsPerPlayer} {saved.maxCardsPerPlayer === 1 ? "card" : "cards"} per player</strong></p>}
    <p>{practice ? "Practice includes 1–10 free cards per player, with up to five players." : locked || playerCount > 0 || !editable ? "Entry settings are locked for this game." : "Save before sharing the code. These settings lock when the first player joins or the game starts."}</p>
    <p>Returning players keep their assigned cards. Player limits use this browser’s saved player identity; they do not verify one person across different devices.</p>
    <p role="status">{dirty && !busy && !disabled ? "Unsaved changes. Save entry settings before sharing the code." : message}</p>
    {!saved && <button type="button" onClick={() => { setMessage("Loading entry settings…"); setAttempt(value => value + 1); }}>Reload entry settings</button>}
  </section>;
}
