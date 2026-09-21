import { RekordboxConnect } from "rekordbox-connect";
import type { DjAdapter, DjDetection, DjPlaylist } from "./types";
import { normalizeDjTrack } from "./normalize";
// Keep one read-only connection while in use; retire it after inactivity.
let client: RekordboxConnect | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let detected: DjDetection | null = null;
let failure: Error | undefined;
function connection() {
  if (!client) {
    const next = new RekordboxConnect({ dangerouslyModifyDatabase: false, pollIntervalMs: 500 });
    next.on("error", error => { failure = error; });
    next.on("history", ({rows}) => {
      const r = rows.at(-1);
      if (!r || typeof r.title !== "string" || typeof r.artist !== "string") return;
      detected = {id: `rekordbox:${r.rowid}`, title:r.title, artist:r.artist, filePath:typeof r.filePath === "string" ? r.filePath : undefined, displayText:`${r.artist} - ${r.title}`, playedAtText: new Date().toISOString()};
    });
    next.start();
    client = next;
  }
  if (failure) {
    client.stop(); client = undefined; detected = null;
    const error = failure; failure = undefined;
    throw new Error(`Rekordbox local library unavailable: ${error.message}`);
  }
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {client?.stop(); client=undefined; detected=null;}, 60000);
  idle.unref();
  return client;
}
function playlist(db: RekordboxConnect, id: string, name: string): DjPlaylist {
  const tracks = (db.loadPlaylistTracks(id) ?? []).map(r => normalizeDjTrack("rekordbox", {
    id:r.id, filePath:r.filePath, title:r.title, artist:r.artist ?? undefined, album:r.album ?? undefined,
    bpm:r.bpm === null ? null : r.bpm / 100, duration:r.length ?? undefined, key:r.key ?? undefined, version:r.subTitle ?? undefined,
  }));
  return {id:`rekordbox:${id}`, name, filePath:"", trackCount:tracks.length, tracks};
}
export const rekordboxAdapter: DjAdapter = {
  async listPlaylists() { const db=connection(); return (db.loadPlaylists() ?? []).filter(p=>p.Attribute===0).map(p=>playlist(db,p.ID,p.Name)); },
  async loadPlaylist(id) { const db=connection(); const p=(db.loadPlaylists() ?? []).find(p=>`rekordbox:${p.ID}`===id && p.Attribute===0); return p ? playlist(db,p.ID,p.Name) : null; },
  async nowPlaying() { connection(); return detected; },
};
