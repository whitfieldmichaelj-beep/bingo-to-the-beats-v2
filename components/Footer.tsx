"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  // BTTB_PLAYER_FLOW_NO_SITE_CHROME_V1
  const isPlayerFlow =
    pathname === "/join-access" ||
    pathname.startsWith("/join-access/") ||
    pathname === "/join" ||
    pathname.startsWith("/join/") ||
    pathname === "/game/cards" ||
    pathname.startsWith("/game/cards/") ||
    pathname === "/game/caller" ||
    pathname.startsWith("/game/caller/");

  if (isPlayerFlow) {
    return null;
  }

  return (
    <footer className="bttb-footer">
      <p>© 2026 Bingo to the Beats</p>
      <p>Where Bingo Meets The Beats</p>

      <a
        href="https://www.instagram.com/bingotothebeats"
        target="_blank"
        rel="noreferrer"
      >
        @bingotothebeats
      </a>
    </footer>
  );
}
