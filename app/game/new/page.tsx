"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "../../billing/billing.css";
type HostType = "dj" | "other";
export default function CreateGamePage() {
  const [hostType, setHostType] = useState<HostType | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem("bttb-host-type");
    if (saved === "dj" || saved === "other") setHostType(saved);
  }, []);
  function selectHost(type: HostType) {
    setHostType(type);
    localStorage.setItem("bttb-host-type", type);
  }
  return <main className="billing-page"><div className="billing-container">
    <header className="billing-heading"><p className="billing-eyebrow">WELCOME TO BINGO TO THE BEATS</p><h1>How will you host?</h1><p>Select DJ or Other host to see your music options. You can change this anytime.</p></header>
    <section className="host-type-options" aria-label="Choose your host type">
      <button type="button" className={`host-type-card ${hostType === "dj" ? "selected" : ""}`} aria-pressed={hostType === "dj"} onClick={() => selectHost("dj")}><strong>I’m a DJ</strong><span>Play in Serato, Rekordbox, or Virtual DJ and run your bingo game here.</span></button>
      <button type="button" className={`host-type-card ${hostType === "other" ? "selected" : ""}`} aria-pressed={hostType === "other"} onClick={() => selectHost("other")}><strong>Other host</strong><span>Play at home with friends, or host at a hotel, bar, restaurant, or event.</span></button>
    </section>
    {hostType && <section className="billing-card host-next-step" aria-live="polite"><p className="billing-eyebrow">{hostType === "dj" ? "DJ MUSIC OPTIONS" : "YOUR GAME NIGHT"}</p><h2>{hostType === "dj" ? "Choose the music for your show" : "Connect your streaming service"}</h2><p>{hostType === "dj" ? "Choose your DJ software, select a local crate or playlist, and launch your game in the DJ Console." : "Choose a playlist from your supported music service and invite your group. No DJ equipment required."}</p><div className="billing-actions">{hostType === "dj" && <><Link className="billing-button" href="/dj">Choose DJ Software</Link><Link href="/music/upload">Import a Serato song list</Link></>}{hostType === "other" && <Link className="billing-button" href={`/music?host=${hostType}`}>Music options</Link>}</div><Link href={`/pricing?host=${hostType}`}>View weekly &amp; monthly plans →</Link></section>}
    <section className="billing-faq"><p>Already have a game? <Link href="/dashboard">Resume it from your dashboard.</Link></p><Link href="/billing">Manage your subscription</Link></section>
  </div></main>;
}
