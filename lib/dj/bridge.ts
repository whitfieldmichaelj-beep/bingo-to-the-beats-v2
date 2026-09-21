import type { DjProvider } from "./providers";
import type { DjAdapter } from "./types";
export async function getDjAdapter(provider:DjProvider):Promise<DjAdapter> {
  switch(provider) {
    case "serato": return (await import("./serato")).seratoAdapter;
    case "rekordbox": return (await import("./rekordbox")).rekordboxAdapter;
    case "virtualdj": return (await import("./virtualdj")).virtualdjAdapter;
  }
}
