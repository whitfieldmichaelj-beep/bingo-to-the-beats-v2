"use client";

import { useEffect, useRef, useState } from "react";
import DjMiniView, { type MiniViewProps } from "./DjMiniView";
import { widgetSnapshot } from "@/lib/dj-widget/snapshot";

type WidgetWindow = Window & { bttbDesktopWidgetActive?: boolean; documentPictureInPicture?: { window: Window | null } };
type WidgetReply = { ok?: boolean; message?: string; id?: string; closed?: boolean; command?: { id: string; type: string; value?: "compact" | "standard" } };

export default function FloatingMiniView(props: MiniViewProps & { gameId: string }) {
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const latest = useRef(props);
  const session = useRef<string | null>(null);
  const client = useRef("");
  const alive = useRef(true);
  const seenCommand = useRef("");
  const starting = useRef(false);
  const generation = useRef(0);
  useEffect(() => { latest.current = props; });

  async function request(action: string, keepalive = false, id = session.current): Promise<WidgetReply> {
    const response = await fetch("/api/dj-widget", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, clientId: client.current, gameId: latest.current.gameId,
        ...(action === "close" ? {} : { snapshot: widgetSnapshot(latest.current) }) }),
      keepalive, signal: keepalive ? undefined : AbortSignal.timeout(action === "start" ? 35000 : 12000),
    });
    const reply = await response.json() as WidgetReply;
    if (!response.ok || !reply.ok) throw new Error(reply.message || "The widget could not connect.");
    return reply;
  }
  function close() {
    generation.current++;
    if (session.current) void request("close", true).catch(() => {});
    session.current = null;
    (window as WidgetWindow).bttbDesktopWidgetActive = false;
  }
  function openConsole() {
    close(); window.focus(); latest.current.onOpenConsole();
  }
  useEffect(() => {
    alive.current = true;
    client.current ||= crypto.randomUUID();
    let busy = false;
    const tick = async () => {
      if (!session.current || busy) return;
      const requestedSession = session.current;
      const requestedGeneration = generation.current;
      busy = true;
      try {
        const reply = await request("update");
        if (!alive.current || requestedSession !== session.current || requestedGeneration !== generation.current) return;
        if (reply.closed) { close(); setNotice("Widget closed. Use Float widget to open it again."); return; }
        setNotice("Widget is floating above your DJ software. Keep this BTTB tab open.");
        const command = reply.command;
        if (command && command.id !== seenCommand.current) {
          seenCommand.current = command.id;
          if (command.type === "mode" && command.value) latest.current.onModeChange(command.value);
          if (command.type === "console") openConsole();
          if (command.type === "close") close();
        }
      } catch (error) {
        if (alive.current && requestedSession === session.current && requestedGeneration === generation.current)
          setNotice(error instanceof Error ? error.message : "Widget updates paused.");
      }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => void tick(), 1000);
    window.addEventListener("pagehide", close);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("pagehide", close); close(); };
    // The controller lives for this Mini View; changing data is read via latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function float() {
    if (starting.current) return;
    starting.current = true;
    const requestedGeneration = ++generation.current;
    setOpening(true);
    setNotice("Opening the desktop widget…");
    try {
      (window as WidgetWindow).documentPictureInPicture?.window?.close();
      const reply = await request("start");
      if (!alive.current || requestedGeneration !== generation.current) {
        if (reply.id) void request("close", true, reply.id).catch(() => {});
        return;
      }
      session.current = reply.id ?? null;
      (window as WidgetWindow).bttbDesktopWidgetActive = !!session.current;
      setNotice("Widget is floating above your DJ software. Drag the small grip at the top to move it.");
    } catch (error) {
      if (alive.current && requestedGeneration === generation.current)
        setNotice(error instanceof Error ? error.message : "The desktop widget could not open.");
    }
    finally { starting.current = false; if (alive.current && requestedGeneration === generation.current) setOpening(false); }
  }
  return <>
    <DjMiniView {...props} onOpenConsole={openConsole} onFloat={opening ? undefined : () => void float()} />
    {notice && <p className="dj-mini-notice" role="status">{notice}</p>}
  </>;
}
