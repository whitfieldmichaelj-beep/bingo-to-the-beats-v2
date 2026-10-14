"use client";

import { useSearchParams } from "next/navigation";

export default function LogoutLibraryNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("library") !== "disconnected") return null;

  return (
    <div
      role="status"
      style={{
        margin: "0 auto 24px",
        padding: "14px 16px",
        maxWidth: "480px",
        border: "1px solid rgba(255,255,255,.28)",
        borderRadius: "12px",
        background: "rgba(15,23,42,.78)",
        lineHeight: 1.45,
      }}
    >
      <strong>You’re disconnected.</strong>
      <div>
        Your computer and local music library are no longer connected to Bingo to the Beats and are not being shared through your account.
      </div>
    </div>
  );
}