"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function GameEndedDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="dj-ended-dialog" aria-labelledby="game-ended-title" aria-describedby="game-ended-description" onClose={onClose}>
      <p className="dj-eyebrow">Game complete</p>
      <h2 id="game-ended-title">This game has ended</h2>
      <p id="game-ended-description">Ready for another round? Create a new game and choose your music source.</p>
      <div className="dj-ended-actions">
        <Link autoFocus className="dj-ended-primary" href="/game/new">Create New Game</Link>
        <Link href="/dashboard">Back to Dashboard</Link>
        <button type="button" onClick={() => dialog.current?.close()}>Review Ended Game</button>
      </div>
    </dialog>
  );
}
