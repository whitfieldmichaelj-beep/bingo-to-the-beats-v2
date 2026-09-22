type GameTrack = { name: string; artist: string; filePath?: string | null };
type LiveTrack = { title: string; artist: string; displayText: string; filePath?: string | null };
const exact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const base = (value: string) => exact(value.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " "));
const specialVersion = (value: string) => /\binstrumental\b/i.test(value) ? "instrumental" : /\ba[\s-]*cap+p?ella\b/i.test(value) ? "acapella" : "vocal";
/** Preserve version labels first. Never choose the first of several loose matches. */
export function findSeratoTrackIndex(tracks: GameTrack[], live: LiveTrack): number {
  // A unique local file identifies the recording even when its tags are missing.
  // Preserve case and punctuation: distinct filesystem paths must not be merged.
  if (live.filePath) {
    const paths = tracks.flatMap((track, index) => track.filePath === live.filePath ? [index] : []);
    if (paths.length) return paths.length === 1 ? paths[0] : -1;
  }
  const title = exact(live.title), artist = exact(live.artist), whole = exact(live.displayText);
  if (!title) return -1;
  const exactMatches = tracks.flatMap((track, index) => exact(track.name) === title && ((artist && exact(track.artist) === artist) || whole === exact(`${track.artist} ${track.name}`)) ? [index] : []);
  if (exactMatches.length) return exactMatches.length === 1 ? exactMatches[0] : -1;
  const candidates = tracks.flatMap((track, index) => {
    const gameArtist = exact(track.artist);
    return base(track.name) === base(live.title) && base(live.title) !== "" && gameArtist !== "" && artist === gameArtist && specialVersion(track.name) === specialVersion(live.title) ? [index] : [];
  });
  return candidates.length === 1 ? candidates[0] : -1;
}
