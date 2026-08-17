"use client";

import Link from "next/link";

type HeaderProps = {
  onOpenCaller: () => void;
};

export default function Header({
  onOpenCaller,
}: HeaderProps) {
  return (
    <header className="dj-topbar">
      <div className="dj-brand">
        <div className="dj-logo">♫</div>

        <div>
          <p className="dj-brand-kicker">
            Bingo to the Beats
          </p>

          <h1 className="dj-brand-title">
            DJ Console
          </h1>
        </div>
      </div>

      <nav className="dj-nav">
        <Link href="/dashboard">
          Dashboard
        </Link>

        <Link href="/music">
          Music
        </Link>

        <Link href="/serato">
          Serato
        </Link>

        <Link href="/game/control">
          Game Control
        </Link>

        <button
          type="button"
          className="dj-primary-button"
          onClick={onOpenCaller}
        >
          Open Caller Screen
        </button>
      </nav>
    </header>
  );
}