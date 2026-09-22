export class DjDetectionGate {
  private initialized = false;
  private previous: string | null = null;
  constructor(previous?: string | null) {
    if (previous !== undefined) { this.initialized = true; this.previous = previous; }
  }
  get lastId(): string | null | undefined { return this.initialized ? this.previous : undefined; }
  accept(id: string | null): boolean {
    if (!this.initialized) { this.initialized = true; this.previous = id; return false; }
    if (!id || id === this.previous) return false;
    this.previous = id;
    return true;
  }
}
export function readDjConnection(value: string | null): { enabled: boolean; lastId?: string | null } | null {
  try {
    const data = JSON.parse(value ?? "null");
    if (!data || typeof data.enabled !== "boolean" ||
      (data.lastId !== undefined && data.lastId !== null && typeof data.lastId !== "string")) return null;
    return { enabled: data.enabled, lastId: data.lastId };
  } catch { return null; }
}
export const djConnectionKey = (gameId: string, provider: string) => `bttb-dj-connection:${provider}:${gameId}`;
