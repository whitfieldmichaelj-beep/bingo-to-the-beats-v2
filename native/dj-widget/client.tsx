import { createRoot } from "react-dom/client";
import DjMiniView from "../../components/dj-console/DjMiniView";
import type { WidgetSnapshot } from "../../lib/dj-widget/snapshot";

declare global {
  interface Window {
    bttbWidget: { receive: (callback: (snapshot: WidgetSnapshot) => void) => void; send: (type: string, value?: unknown) => void };
  }
}
const send = (type: string, value?: unknown) => window.bttbWidget.send(type, value);
const root = createRoot(document.getElementById("widget")!);
let latest: WidgetSnapshot | null = null;
let localMode: WidgetSnapshot["mode"] | null = null;
let consoleRequestedAt: number | null = null;
function render() {
  if (!latest) return;
  const stale = Date.now() - latest.updatedAt > 8000;
  root.render(<>
    {consoleRequestedAt !== null && <div className="dj-mini-notice" role="status">{Date.now() - consoleRequestedAt < 5000
      ? "Opening full BTTB in your console tab…"
      : "Return to your open BTTB browser tab to continue. You can still close this widget here."}</div>}
    {stale && <div className="dj-mini-notice" role="status">Console updates paused — return to the open BTTB tab to reconnect.</div>}
    <DjMiniView {...latest} mode={localMode ?? latest.mode}
      connection={stale ? "error" : latest.connection}
      providerConnected={!stale && latest.providerConnected}
      songStatus={stale ? "Last received countdown" : latest.songStatus}
      onModeChange={mode => { localMode = mode; send("mode", mode); render(); }}
      onOpenConsole={() => { consoleRequestedAt = Date.now(); send("console"); render(); }} />
    <button className="widget-close" aria-label="Close widget" title="Close widget" onClick={() => send("close")}>×</button>
  </>);
}
window.bttbWidget.receive(snapshot => {
  if (localMode === snapshot.mode) localMode = null;
  latest = snapshot;
  render();
});
window.setInterval(render, 1000);
new ResizeObserver(() => send("size", document.getElementById("widget")!.getBoundingClientRect().height)).observe(document.getElementById("widget")!);
