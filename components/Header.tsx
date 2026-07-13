import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="bttb-header">
      <Link href="/" className="bttb-brand">
        <Image
          src="/logo.png"
          alt="Bingo to the Beats"
          width={90}
          height={90}
          priority
          className="bttb-logo"
        />

        <div>
          <div className="bttb-brand-name">Bingo to the Beats</div>
          <div className="bttb-tagline">
            Where Bingo Meets The Beats
          </div>
        </div>
      </Link>

      <nav className="bttb-nav" aria-label="Main navigation">
        <Link href="/">Home</Link>
        <Link href="/api/spotify/login">Host a Game</Link>
        <Link href="/join">Join a Game</Link>
        <Link href="/music">Music</Link>
      </nav>
    </header>
  );
}