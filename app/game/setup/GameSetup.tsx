"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GameEntryPanel from "@/components/game/GameEntryPanel";
import GamePrizePanel from "@/components/game/GamePrizePanel";
import type { GamePrize } from "@/lib/game/prize";

export default function GameSetup({ gameId, initialPrize, editable, playerCount }: {
  gameId: string; initialPrize: GamePrize | null; editable: boolean; playerCount: number;
}) {
  const router = useRouter();
  const [prize, setPrize] = useState(initialPrize);
  const [entryDirty, setEntryDirty] = useState(true);
  const [prizeDirty, setPrizeDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const unsaved = entryDirty || prizeDirty;
  return <>
    <div className="game-setup-grid">
      <GameEntryPanel gameId={gameId} editable={editable} playerCount={playerCount} onDirtyChange={setEntryDirty} />
      {editable ? <GamePrizePanel gameId={gameId} prize={prize} editable onSaved={setPrize} onDirtyChange={setPrizeDirty} /> :
        <section className="game-prize-panel"><h2>What will the winner receive?</h2><p className="game-prize-saved">{prize?.description ?? "Host to announce"}</p><p>The prize is locked once the game starts.</p></section>}
    </div>
    <div className="game-setup-continue">
      <p role="status">{unsaved ? "Save the changes above before opening the DJ Console." : "The songs and the winning bingo pattern determine the winner."}</p>
      <button className="dashboard-primary" type="button" disabled={unsaved || leaving} onClick={() => {
        if (unsaved || leaving) return;
        setLeaving(true); router.push(`/dj-console?gameId=${encodeURIComponent(gameId)}`); router.refresh();
      }}>{leaving ? "Opening console…" : "Continue to DJ Console →"}</button>
    </div>
  </>;
}
