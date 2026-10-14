import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { widgetSnapshot } from "./snapshot";

type Owner = { id: string; userId: string; gameId: string; clientId: string };
type Action = { id: string; type: "mode" | "console" | "close"; value?: string };
type Heartbeat = { closed: boolean; updatedAt: number; ready?: boolean };
const idPattern = /^[a-f0-9-]{36}$/;
const root = path.join(process.cwd(), ".bttb-widget");
async function read<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return null; }
}
async function write(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temporary, file);
}
export class WidgetError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export async function widgetSession(userId: string, body: Record<string, unknown>) {
  await fs.mkdir(path.join(root, "sessions"), { recursive: true, mode: 0o700 });
  if (body.action === "start") {
    if (!idPattern.test(String(body.clientId)) || typeof body.gameId !== "string") throw new WidgetError("Invalid widget request.");
    const previous = await read<Owner>(path.join(root, "active.json"));
    if (previous && idPattern.test(previous.id)) {
      const directory = path.join(root, "sessions", previous.id);
      const heartbeat = await read<Heartbeat>(path.join(directory, "widget.json"));
      const snapshot = await read<{ closed?: boolean }>(path.join(directory, "snapshot.json"));
      const alive = snapshot && !snapshot.closed && heartbeat && !heartbeat.closed && Date.now() - heartbeat.updatedAt < 10000;
      if (alive && previous.userId !== userId) throw new WidgetError("A widget is already open for another host on this computer.", 409);
      if (alive && previous.clientId === body.clientId && previous.gameId === body.gameId) return { id: previous.id };
      if (previous.userId === userId) await write(path.join(directory, "snapshot.json"), { closed: true });
    }
    const electronDirectory = path.join(process.cwd(), "node_modules", "electron");
    const electronRelative = (await fs.readFile(path.join(electronDirectory, "path.txt"), "utf8").catch(() => "")).trim();
    if (!electronRelative) throw new WidgetError("The desktop widget needs its local runtime installed.", 503);
    const executable = path.resolve(electronDirectory, "dist", electronRelative);
    if (!executable.startsWith(path.join(electronDirectory, "dist") + path.sep)) throw new WidgetError("Invalid desktop runtime.", 503);
    await fs.access(executable);
    await fs.access(path.join(root, "dist", "index.html"));
    const owner: Owner = { id: randomUUID(), userId, gameId: body.gameId, clientId: String(body.clientId) };
    const directory = path.join(root, "sessions", owner.id);
    await fs.mkdir(directory, { mode: 0o700 });
    await write(path.join(directory, "owner.json"), owner);
    await write(path.join(directory, "snapshot.json"), widgetSnapshot(body.snapshot));
    await write(path.join(root, "active.json"), owner);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(env)) if (/SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY|PRIVATE_KEY/.test(key)) delete env[key];
    const child = spawn(executable, [path.join(process.cwd(), "native", "dj-widget", "main.cjs"), directory], { detached: true, stdio: "ignore", env, windowsHide: true });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    for (let attempt = 0; attempt < 150; attempt++) {
      const heartbeat = await read<Heartbeat>(path.join(directory, "widget.json"));
      if (heartbeat?.closed) throw new WidgetError("The widget display could not start. Your game is unchanged; try Float widget again.", 503);
      if (heartbeat && !heartbeat.closed && heartbeat.ready === true) return { id: owner.id };
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await write(path.join(directory, "snapshot.json"), { closed: true });
    throw new WidgetError("The desktop widget could not open. The console is still available here.", 503);
  }
  if (!idPattern.test(String(body.id))) throw new WidgetError("Invalid widget session.");
  const directory = path.join(root, "sessions", String(body.id));
  const owner = await read<Owner>(path.join(directory, "owner.json"));
  if (!owner || owner.userId !== userId || owner.clientId !== body.clientId) throw new WidgetError("Widget session not found.", 404);
  if (body.action === "close") {
    await write(path.join(directory, "snapshot.json"), { closed: true });
    return { closed: true };
  }
  if (body.action !== "update") throw new WidgetError("Unknown widget action.");
  const previousSnapshot = await read<{ closed?: boolean }>(path.join(directory, "snapshot.json"));
  if (!previousSnapshot || previousSnapshot.closed) return { closed: true };
  const heartbeat = await read<Heartbeat>(path.join(directory, "widget.json"));
  if (!heartbeat || heartbeat.closed || Date.now() - heartbeat.updatedAt > 10000) return { closed: true };
  await write(path.join(directory, "snapshot.json"), widgetSnapshot(body.snapshot));
  const command = await read<Action>(path.join(directory, "command.json"));
  return { closed: false, command };
}

const queue = globalThis as typeof globalThis & { bttbWidgetQueue?: Promise<unknown> };
export function serializedWidgetSession(userId: string, body: Record<string, unknown>) {
  const result = (queue.bttbWidgetQueue ?? Promise.resolve()).catch(() => {}).then(() => widgetSession(userId, body));
  queue.bttbWidgetQueue = result;
  return result;
}
