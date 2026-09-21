"use client";
import { useState } from "react";
export default function PlanButton({ planId, label }: { planId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/host-billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout", planId }) });
      if (response.status === 401) { window.location.assign(`/sign-in?redirect_url=${encodeURIComponent('/pricing')}`); return; }
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || "Checkout is unavailable.");
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Checkout is unavailable."); setBusy(false); }
  }
  return <div><button type="button" className="billing-button" disabled={busy} onClick={() => void checkout()}>{busy ? "Opening checkout…" : label}</button>{error && <p role="alert" className="billing-error">{error}</p>}</div>;
}
