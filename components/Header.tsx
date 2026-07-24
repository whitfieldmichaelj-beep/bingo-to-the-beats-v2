"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

type MusicKitInstance = {
  unauthorize?: () => Promise<void>;
};

type MusicKitGlobal = {
  getInstance?: () => MusicKitInstance;
};

export default function Header() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function disconnectProviderSessions() {
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const details = await response.text();
        console.warn(
          `Provider logout returned ${response.status}:`,
          details
        );
      }
    } catch (error) {
      console.warn("Provider logout request failed:", error);
    }
  }

  async function disconnectAppleMusic() {
    try {
      const browserWindow = window as typeof window & {
        MusicKit?: MusicKitGlobal;
      };

      const appleMusic =
        browserWindow.MusicKit?.getInstance?.();

      if (appleMusic?.unauthorize) {
        await appleMusic.unauthorize();
      }
    } catch (error) {
      console.warn("Apple Music disconnect failed:", error);
    }
  }

  function clearBrowserSessions() {
    const storageKeys = [
      "spotify_access_token",
      "spotify_refresh_token",
      "spotify_token_expires_at",
      "apple_music_user_token",
      "musicUserToken",
      "tidal_access_token",
      "tidal_refresh_token",
      "bttb_game_session",
      "bttb_host_session",
      "bttb_player_session",
    ];

    for (const key of storageKeys) {
      try {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      } catch (error) {
        console.warn(`Could not clear ${key}:`, error);
      }
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await Promise.allSettled([
        disconnectProviderSessions(),
        disconnectAppleMusic(),
      ]);

      clearBrowserSessions();

      await signOut({
        redirectUrl: "/sign-in",
      });
    } catch (error) {
      console.error("Clerk logout failed:", error);
      setIsLoggingOut(false);
      window.alert(
        "Your account could not be signed out. Please refresh and try again."
      );
    }
  }

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
          <div className="bttb-brand-name">
            Bingo to the Beats
          </div>

          <div className="bttb-tagline">
            Where Bingo Meets The Beats
          </div>
        </div>
      </Link>

      <nav className="bttb-nav" aria-label="Main navigation">
        <Link href="/">Home</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/music">Music</Link>
        <Link href="/join">Join a Game</Link>

        {isLoaded && isSignedIn ? (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="header-logout-button"
          >
            {isLoggingOut ? "Logging Out..." : "Logout"}
          </button>
        ) : (
          <>
            <Link href="/sign-in">Log In</Link>

            <Link
              href="/sign-up"
              className="header-register-link"
            >
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}