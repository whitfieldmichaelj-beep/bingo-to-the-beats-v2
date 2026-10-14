import Image from "next/image";
import Link from "next/link";

const steps = [
  { title: "Join your game", text: "Enter the code from your host and get your bingo cards. No player account needed." },
  { title: "Listen and mark", text: "Hear a song on your card? Tap it after the host calls it. Search helps you find songs quickly." },
  { title: "Make your BINGO", text: "Complete the winning pattern shown on your card, then watch for the winner confirmation." },
];

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="home-eyebrow">WHERE BINGO MEETS THE BEATS</p>
          <h1 id="home-title">Great music.<br />Your next game night.</h1>
          <p className="home-description">Hear the songs. Find them on your card. Celebrate a BINGO together.</p>
          <div className="home-actions">
            <Link href="/join" className="home-button home-button-primary">Join a Game <span aria-hidden="true">→</span></Link>
            <Link href="/host-access" className="home-button home-button-secondary">Host a Game</Link>
          </div>
          <p className="home-join-hint">Playing? You only need your host’s game code.<br /><Link href="/join-access">Scan a QR code instead</Link></p>
        </div>
        <div className="home-art" aria-hidden="true">
          <Image src="/logo.png" alt="" width={440} height={440} priority
            sizes="(max-width: 700px) 200px, (max-width: 1000px) 36vw, 440px" />
        </div>
      </section>

      <section className="home-how" aria-labelledby="home-how-title">
        <p className="home-eyebrow">NEW TO MUSIC BINGO?</p>
        <h2 id="home-how-title">Three steps to the fun.</h2>
        <ol className="home-steps">
          {steps.map((step, index) => <li key={step.title}>
            <span className="home-step-number" aria-hidden="true">0{index + 1}</span>
            <h3>{step.title}</h3><p>{step.text}</p>
          </li>)}
        </ol>
      </section>

      <section className="home-host" aria-labelledby="home-host-title">
        <div><p className="home-eyebrow">FOR THE HOST</p><h2 id="home-host-title">Hosting tonight?</h2>
          <p>Choose your music, create your cards, and share the game code. Your DJ Console keeps the songs, players, and Bingo claims together.</p></div>
        <div className="home-host-actions">
          <Link href="/host-access" className="home-button home-button-secondary">Start Hosting</Link>
          <Link href="/dashboard">Return to your saved games →</Link>
        </div>
      </section>
    </main>
  );
}
