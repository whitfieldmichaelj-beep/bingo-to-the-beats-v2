export const rehearsalScenarios = [
  { title: "Refresh your card", text: "Note your card number and marked squares. Refresh this page. Check that the same card and marks return, then tap Done. Report a problem if anything changed." },
  { title: "Close and reopen", text: "Note your card number and marks. Close this tab, then reopen your invitation in the same browser. Check that your card and marks are still there, then tap Done." },
  { title: "Reconnect", text: "Note your card number and marks. Turn Wi-Fi off briefly, then reconnect (or switch to mobile data if available). Return to this card and check that your card and marks remain. Tap Done after reconnecting." },
  { title: "Check a called song", text: "Wait for the host to call a song on your card. Check that its square highlights, then tap it to mark it. Refresh and check that the mark remains. Tap Done, or report what went wrong." },
];
export type RehearsalTask = { id: string; playerKey: string; title: string; text: string; sentAt: string; response: "pending" | "done" | "problem"; note: string; respondedAt: string | null };
export function readRehearsal(config: unknown): RehearsalTask[] {
  if (!config || typeof config !== "object" || !("rehearsal" in config) || !Array.isArray(config.rehearsal)) return [];
  return config.rehearsal.filter((item): item is RehearsalTask => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.playerKey === "string" && typeof item.text === "string"));
}
export function playerTask(tasks: RehearsalTask[], playerKey: string) {
  const task = tasks.find(item => item.playerKey === playerKey);
  if (!task) return null;
  const { playerKey: _privateKey, ...visible } = task;
  void _privateKey;
  return visible;
}
