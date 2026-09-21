export class DjDetectionGate {
  private initialized = false;
  private previous: string | null = null;
  accept(id: string | null): boolean {
    if (!this.initialized) { this.initialized = true; this.previous = id; return false; }
    if (!id || id === this.previous) return false;
    this.previous = id;
    return true;
  }
}
