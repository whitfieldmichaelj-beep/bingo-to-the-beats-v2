"use client";
import type { CardSize } from "@/lib/game/card-layout";

export default function CardSizeSelect({ value, onChange, disabled = false }: {
  value: CardSize; onChange: (value: CardSize) => void; disabled?: boolean;
}) {
  return <label style={{ display: "grid", gap: 9, margin: "18px 0", color: "#e2e8f0", fontWeight: 700 }}>
    Card size
    <select value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value) as CardSize)}
      style={{ width: "100%", padding: "13px 14px", border: "1px solid #64748b", borderRadius: 12, background: "#0f172a", color: "white", font: "inherit" }}>
      <option value={5}>5×5 — 25 songs per card</option>
      <option value={3}>3×3 — 9 songs per card</option>
    </select>
    <small style={{ color: "#c4b5fd", fontWeight: 400 }}>Every square is a song. Choose before creating cards.</small>
  </label>;
}
