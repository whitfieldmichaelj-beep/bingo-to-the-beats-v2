export const CARD_LIMITS = [1, 2, 3, 5, 10] as const;
export type GameEntry = { mode: "free" | "paid"; maxCardsPerPlayer: typeof CARD_LIMITS[number] };

export function parseGameEntry(value: unknown): GameEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (entry.mode !== "free" && entry.mode !== "paid") return null;
  if (!CARD_LIMITS.some(limit => limit === entry.maxCardsPerPlayer)) return null;
  return { mode: entry.mode, maxCardsPerPlayer: entry.maxCardsPerPlayer as GameEntry["maxCardsPerPlayer"] };
}

export function readSavedGameEntry(config: unknown): GameEntry | null {
  return config && typeof config === "object" ? parseGameEntry((config as Record<string, unknown>).entry) : null;
}

// Practice is always free; paid game pricing remains unchanged.
export function readGameEntry(config: unknown, isPractice = false): GameEntry {
  if (isPractice) return { mode: "free", maxCardsPerPlayer: 10 };
  return readSavedGameEntry(config) ?? { mode: "paid", maxCardsPerPlayer: 10 };
}

export class EntrySettingsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
