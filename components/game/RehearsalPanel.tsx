"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { rehearsalScenarios, type RehearsalTask } from "@/lib/game/rehearsal";
type State = { task?: Omit<RehearsalTask, "playerKey"> | null; tasks?: RehearsalTask[]; players?: { playerKey: string; playerName: string | null }[]; closed: boolean };
const box = { padding: 18, border: "1px solid #caa45c", borderRadius: 16, background: "#181021", color: "#f8fafc", margin: "16px 0" };
const field = { display: "block", width: "100%", padding: 10, margin: "8px 0", background: "#1e293b", color: "white", border: "1px solid #64748b", borderRadius: 8 };
const button = { padding: "10px 14px", margin: "6px 8px 6px 0", borderRadius: 8, background: "#c7d2fe", color: "#111827", border: 0, cursor: "pointer" };
export default function RehearsalPanel({ gameId, host = false }: { gameId: string; host?: boolean }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("all");
  const [instruction, setInstruction] = useState(rehearsalScenarios[0].text);
  const [note, setNote] = useState("");
  const [reportingTask, setReporting] = useState<string | null>(null);
  const sequence = useRef(0);
  const writing = useRef(false);
  const url = host ? `/api/game/${encodeURIComponent(gameId)}/rehearsal` : `/api/game/player/rehearsal?gameId=${encodeURIComponent(gameId)}`;
  const refresh = useCallback(async () => {
    if (writing.current) return;
    const version = ++sequence.current;
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (version !== sequence.current) return;
      if (!response.ok) throw new Error(result.message || "Could not load instructions.");
      setData(result); setError("");
    } catch (e) { if (version === sequence.current) setError(e instanceof Error ? e.message : "Could not refresh instructions."); }
  }, [url]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (active) timer = setTimeout(poll, 5000); };
    void poll();
    return () => {
      active = false; clearTimeout(timer);
      // Invalidate outstanding requests, not a DOM ref cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
    };
  }, [refresh]);
  async function send(body: object) {
    if (writing.current) return;
    writing.current = true; ++sequence.current; setBusy(true); setError("");
    try {
      const response = await fetch(url.split("?")[0], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId, ...body }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Your change was not confirmed. Please retry.");
      setData(result); setReporting(null); setNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { writing.current = false; setBusy(false); }
  }
  const task = data?.task;
  const reporting = Boolean(task && reportingTask === task.id);
  if (!host && !task) return error ? <div style={box} role="status">Test instructions are temporarily unavailable. Your card still works. <button style={button} onClick={() => void refresh()}>Retry</button></div> : null;
  const content = <>
    {error && <p role="alert">{error} <button style={button} onClick={() => void refresh()}>Refresh instructions</button></p>}
    {host ? <>
      <p>Send test instructions above player cards. Responses survive refresh and reconnect. Sending a new task replaces the selected players’ current task and response.</p>
      <label>Send to<select aria-label="Instruction recipient" style={field} value={target} onChange={e => setTarget(e.target.value)}><option value="all">All joined players</option>{data?.players?.map(player => <option key={player.playerKey} value={player.playerKey}>{player.playerName || "Player"}</option>)}</select></label>
      <label>Scenario<select aria-label="Test scenario" style={field} onChange={e => setInstruction(rehearsalScenarios[Number(e.target.value)].text)} defaultValue="0">{rehearsalScenarios.map((scenario, i) => <option value={i} key={scenario.title}>{scenario.title}</option>)}</select></label>
      <label>Instruction<textarea style={field} rows={4} maxLength={600} value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
      <button style={button} disabled={busy || !data || data.closed || !instruction.trim() || !data.players?.length} onClick={() => void send({ action: "send", target, text: instruction })}>Send instruction</button>
      <button style={button} disabled={busy || !data || data.closed || !data.players?.length} onClick={() => void send({ action: "assign", target })}>Assign varied scenarios</button>
      <button style={button} disabled={busy || !data || data.closed || !data.tasks?.length} onClick={() => void send({ action: "clear", target })}>Clear selected instructions</button>
      {!data?.players?.length && <p>Instructions become available after players join.</p>}
      {data?.closed && <p>This game has ended. Test responses are read-only.</p>}
      <ul>{data?.tasks?.map(item => <li key={item.id} style={{ margin: "12px 0", overflowWrap: "anywhere" }}><strong>{data.players?.find(p => p.playerKey === item.playerKey)?.playerName || "Player"}: {item.response === "pending" ? "Awaiting response" : item.response === "done" ? "Done" : "Problem reported"}</strong><p>{item.text}</p>{item.note && <p>Player report: {item.note}</p>}</li>)}</ul>
    </> : task && <>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>Sound Check</h2><p style={{ color: "#e8c982", fontSize: 12 }}>Backstage Pass · Beta test mission</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{task.text}</p>
      {task.response !== "pending" && <p role="status">{task.response === "done" ? "Done — your host has your response." : "Problem reported to your host."} {task.note}</p>}
      {reporting && <label>What happened?<textarea style={field} maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} /></label>}
      <button style={button} disabled={busy || data?.closed} onClick={() => void send({ taskId: task.id, response: "done", note: "" })}>Done</button>
      <button style={button} disabled={busy || data?.closed} onClick={() => reporting ? void send({ taskId: task.id, response: "problem", note }) : (setNote(""), setReporting(task.id))}>{reporting ? "Send problem report" : "Report a problem"}</button>
    </>}
    {busy && <p role="status">Saving…</p>}
  </>;
  return host ? <details style={box}><summary style={{ cursor: "pointer", fontWeight: 800 }}>Sound Checks · Player test instructions</summary>{content}</details> : <section style={box} aria-label="Sound Check — player test instruction">{content}</section>;
}
