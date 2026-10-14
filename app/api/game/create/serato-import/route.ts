import { parseCardSize } from "@/lib/game/card-layout";
import { excludedDjSong } from "@/lib/serato/song-filter";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createGame } from "@/lib/game/repository";
import { createGameFromPlaylist } from "@/lib/game/service";
import { makePlaybackConfig } from "@/lib/game/playback-config";
import { BETA_GAME_CARD_LIMIT, betaCardLimitMessage } from "@/lib/game/beta-limits";
import { HostAccessError } from "@/lib/billing/access";
import { requestOrigin } from "@/lib/http/request-origin";
import type { SeratoTrack } from "@/lib/serato/types";
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to create a game." }, { status: 401 });
  if (request.headers.get("origin") !== requestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 500000) return NextResponse.json({ error: "Choose a smaller song list (maximum 500 songs)." }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid song list." }, { status: 400 }); }
    if (!body || !Array.isArray(body.tracks) || body.tracks.length > 500) return NextResponse.json({ error: "Import up to 500 songs." }, { status: 400 });
    let cardSize;
    try { cardSize = parseCardSize(body.cardSize); }
    catch { return NextResponse.json({ ok: false, error: "Choose a 3×3 or 5×5 card size.", message: "Choose a 3×3 or 5×5 card size." }, { status: 400 }); }
    const songsPerCard = cardSize * cardSize;

    const seen = new Set<string>();
    const tracks: SeratoTrack[] = [];
    for (const item of body.tracks) {
      if (!item || typeof item.title !== "string" || typeof item.artist !== "string") continue;
      const title = item.title.trim().slice(0, 250), artist = item.artist.trim().slice(0, 250);
      const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
      if (!title || !artist || excludedDjSong(title, typeof item.filename === "string" ? item.filename : "") || seen.has(key)) continue;
      seen.add(key);
      tracks.push({ id: randomUUID(), title, artist, bpm: null, filePath: "", fileName: "" });
    }
    if (tracks.length < songsPerCard) return NextResponse.json({ error: `At least ${songsPerCard} eligible unique songs are required after excluding acapella, instrumental, and intro/outro edits.` }, { status: 400 });
    const cardCount = body.cardCount === 5 ? 5 : body.cardCount === BETA_GAME_CARD_LIMIT ? BETA_GAME_CARD_LIMIT : null;
    if (!cardCount) return NextResponse.json({ error: betaCardLimitMessage() }, { status: 400 });
    const playlist = { id: `serato-import-${randomUUID()}`, name: typeof body.name === "string" ? body.name.trim().slice(0, 120) || "DJ Set" : "DJ Set", filePath: "", trackCount: tracks.length, tracks };
    const game = createGameFromPlaylist(playlist, "any-line", cardCount === 5 ? 50 : cardCount, cardSize);
    game.playbackConfig = makePlaybackConfig("serato", body.clipLength, tracks);
    const saved = await createGame(game, userId, { practice: cardCount === 5 });
    return NextResponse.json({ game: { id: saved.id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HostAccessError ? error.message : "Could not create this game. Please try again." }, { status: error instanceof HostAccessError ? error.status : 500 });
  }
}
