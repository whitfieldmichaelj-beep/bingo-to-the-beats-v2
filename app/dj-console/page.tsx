import { redirect } from "next/navigation";
import DjConsole from "./DjConsole";

export default async function DjConsolePage({ searchParams }: {
  searchParams: Promise<{ gameId?: string | string[] }>;
}) {
  const { gameId } = await searchParams;
  if (typeof gameId !== "string" || !gameId.trim()) redirect("/dashboard");
  return <DjConsole key={gameId} gameId={gameId} />;
}
