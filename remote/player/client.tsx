import BackstagePass from "../../components/game/BackstagePass";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import JoinPage from "../../app/join/page";
import CardsPage from "../../app/game/cards/page";

type Result = { gameStatus?: string; winner?: { playerName: string; cardNumber: number } | null };
function Results() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("gameId");
    const abort = new AbortController();
    void fetch(`/api/game/${encodeURIComponent(id || "")}/called-tracks`, { signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load results. Reopen your invitation and try again."); return response.json(); })
      .then(setResult).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, []);
  return <main className="backstage-page" style={{ textAlign: "center", padding: 32 }}>
    <BackstagePass compact />
    <h1>{result?.winner ? `${result.winner.playerName} wins!` : "Game results"}</h1>
    <p role="status">{error || (result?.winner ? `BINGO! Card #${result.winner.cardNumber} · Game over` : result ? "No winner has been confirmed." : "Loading results…")}</p>
    <a href="/game/cards">Back to my card</a>
  </main>;
}

createRoot(document.getElementById("player")!).render(
  location.pathname === "/game/cards" ? <CardsPage /> :
    location.pathname === "/game/results" ? <Results /> : <JoinPage />
);
