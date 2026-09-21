import { getSeratoPlaylists } from "../serato/playlists";
import { getSeratoSmartCrates, isSeratoSmartCrate, loadSeratoSmartCrate } from "../serato/smart-crates";
import { loadPlaylist } from "../serato/playlist-reader";
import { findSeratoLibraries } from "../serato/finder";
import { getLatestSessionPath, getSessionSongs, hasSeratoV4Database, getLatestSessionSongsV4 } from "serato-connect";
import { normalizeDjTrack } from "./normalize";
import type { DjAdapter, DjPlaylist } from "./types";
const list = async () => [...await getSeratoPlaylists(), ...await getSeratoSmartCrates()];
export const seratoAdapter: DjAdapter = {
  async listPlaylists() {
    return Promise.all((await list()).map(async p => {
      const loaded = isSeratoSmartCrate(p) ? await loadSeratoSmartCrate(p) : await loadPlaylist(p);
      return {...loaded, tracks: loaded.tracks.map(t => normalizeDjTrack("serato", t))};
    }));
  },
  async loadPlaylist(id): Promise<DjPlaylist | null> {
    const p = (await list()).find(p => p.id === id);
    if (!p) return null;
    const loaded = isSeratoSmartCrate(p) ? await loadSeratoSmartCrate(p) : await loadPlaylist(p);
    return {...loaded, tracks: loaded.tracks.map(t => normalizeDjTrack("serato", t))};
  },
  async nowPlaying() {
    const legacySongs = (await Promise.all((await findSeratoLibraries()).map(async root => {
      const session = getLatestSessionPath(root);
      return session ? getSessionSongs(session) : [];
    }))).flat();
    const songs = [...legacySongs, ...(hasSeratoV4Database() ? getLatestSessionSongsV4() : [])].filter(t => t.playing && t.startTime && !t.playTime);
    const track = songs.sort((a,b) => b.startTime!.getTime() - a.startTime!.getTime())[0];
    if (!track) return null;
    return { id: `${track.filePath}:${track.startTime!.toISOString()}`, title: track.title, artist: track.artist, filePath: track.filePath, displayText: `${track.artist} - ${track.title}`, playedAtText: track.startTime!.toISOString() };
  },
};
