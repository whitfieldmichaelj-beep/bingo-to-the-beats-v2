export default function BackstagePass({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`backstage-pass${compact ? " backstage-pass-compact" : ""}`} aria-label="Backstage Pass beta night">
      <p className="backstage-pass-kicker">The Original BTTB Test Crew</p>
      <p className="backstage-pass-title">Backstage Pass</p>
      <p className="backstage-pass-subtitle">Bingo to the Beats · Beta Night</p>
      {!compact && <p className="backstage-pass-tagline">Hear the hits. Mark your card. Help shape the show.</p>}
    </aside>
  );
}
