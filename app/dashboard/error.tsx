"use client";

import Link from "next/link";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main style={{ minHeight: "70vh", padding: "60px 24px", background: "#0f172a", color: "white" }}>
      <section style={{ maxWidth: 680, margin: "0 auto" }}>
        <h1>Your saved games couldn’t be loaded</h1>
        <p>Your games have not been cleared. The app couldn’t connect to the service that stores them.</p>
        <p>Please try again once the connection is restored.</p>
        <button onClick={reset} style={{ padding: "12px 24px", cursor: "pointer" }}>Try Again</button>
        <p><Link href="/" style={{ color: "#c4b5fd" }}>Back to Home</Link></p>
      </section>
    </main>
  );
}
