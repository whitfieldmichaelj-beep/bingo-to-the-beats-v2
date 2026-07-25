"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import {
  hasActiveGame,
  prepareUniversalLogout,
} from "@/app/lib/sessionManager";

export default function LogoutButton() {
  const { signOut } = useClerk();

  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  async function completeLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await prepareUniversalLogout();

      /*
       * Sign out of Bingo to the Beats through Clerk.
       * We handle the final navigation after Clerk finishes.
       */
      await signOut();

      window.location.replace("/sign-in");
    } catch (error) {
      console.error("Universal logout failed:", error);

      /*
       * Attempt Clerk sign-out even when one of the provider
       * cleanup operations unexpectedly fails.
       */
      try {
        await signOut();
      } finally {
        window.location.replace("/sign-in");
      }
    }
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    if (hasActiveGame()) {
      const confirmed = window.confirm(
        [
          "End Current Game & Log Out?",
          "",
          "Logging out will:",
          "• End the current game",
          "• Disconnect Spotify",
          "• Disconnect Apple Music",
          "• Disconnect TIDAL when available",
          "• Sign you out of Bingo to the Beats",
          "",
          "Any players in the current game may be disconnected.",
        ].join("\n")
      );

      if (!confirmed) {
        return;
      }
    }

    await completeLogout();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      aria-label="Log out of Bingo to the Beats"
      style={{
        appearance: "none",
        background: "transparent",
        border: 0,
        color: "inherit",
        cursor: isLoggingOut ? "wait" : "pointer",
        font: "inherit",
        opacity: isLoggingOut ? 0.65 : 1,
        padding: 0,
      }}
    >
      {isLoggingOut ? "Logging Out..." : "Logout"}
    </button>
  );
}