type Activity = {
  track: { id: string; name: string; artist: string };
  detectedAt: string;
};

// Older consoles recorded a raw observation immediately before its matched row.
// Hide only those adjacent pairs; preserve different versions and later replays.
export function visibleDjActivity<T extends Activity>(items: T[]): T[] {
  return items.filter((item, index) => {
    const matched = items[index - 1];
    if (!matched || !item.track.id.startsWith("serato-") || matched.track.id.startsWith("serato-")) return true;
    const difference = Date.parse(matched.detectedAt) - Date.parse(item.detectedAt);
    return !(difference >= 0 && difference <= 1000 &&
      matched.track.name === item.track.name && matched.track.artist === item.track.artist);
  });
}

export function restoredDjActivity<T extends { id: string }>(
  tracks: Array<{ track: T; calledAt?: string | null }>
): Array<{ id: string; track: T; detectedAt: string }> {
  return tracks.flatMap(({ track, calledAt }) =>
    calledAt && Number.isFinite(Date.parse(calledAt))
      ? [{ id: `saved-${track.id}`, track, detectedAt: calledAt }]
      : []
  ).sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt)).slice(0, 20);
}
