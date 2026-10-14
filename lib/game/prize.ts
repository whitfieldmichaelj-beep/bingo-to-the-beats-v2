export const PRIZE_KINDS = [
  { value: "tickets", label: "Concert or event tickets" },
  { value: "gift-card", label: "Gift card" },
  { value: "merchandise", label: "Merchandise or another item" },
  { value: "experience", label: "Experience" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Another prize" },
  { value: "none", label: "Just for fun — no prize" },
] as const;
export type GamePrize = { kind: typeof PRIZE_KINDS[number]["value"]; description: string };
export const MAX_PRIZE_DESCRIPTION = 200;

export function parseGamePrize(input: unknown): GamePrize | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!PRIZE_KINDS.some(kind => kind.value === value.kind)) return null;
  if (value.kind === "none") return { kind: "none", description: "Just for fun — no prize" };
  if (typeof value.description !== "string") return null;
  const description = value.description.trim().replace(/\s+/g, " ");
  if (!description || description.length > MAX_PRIZE_DESCRIPTION) return null;
  return { kind: value.kind as GamePrize["kind"], description };
}

export function readGamePrize(saved: unknown): GamePrize | null {
  return saved && typeof saved === "object" ? parseGamePrize((saved as Record<string, unknown>).prize) : null;
}
