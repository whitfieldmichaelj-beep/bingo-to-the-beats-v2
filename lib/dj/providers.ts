export const DJ_PROVIDERS = {
  serato: { name: "Serato", collection: "crate", collections: "crates", icon: "◉" },
  rekordbox: { name: "Rekordbox", collection: "playlist", collections: "playlists", icon: "◈" },
  virtualdj: { name: "VirtualDJ", collection: "playlist", collections: "playlists", icon: "◎" },
} as const;
export type DjProvider = keyof typeof DJ_PROVIDERS;
export function isDjProvider(value: unknown): value is DjProvider {
  return typeof value === "string" && Object.hasOwn(DJ_PROVIDERS, value);
}
export function djProvider(value: unknown): DjProvider {
  return isDjProvider(value) ? value : "serato";
}
export const DJ_PROVIDER_KEY = "bttb-dj-provider";
