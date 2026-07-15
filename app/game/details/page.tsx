import { Suspense } from "react";
import GameDetailsForm from "./GameDetailsForm";

export default function GameDetailsPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background:
              "radial-gradient(circle at top, #312e81 0%, #111827 44%, #030712 100%)",
            color: "white",
          }}
        >
          Loading event details…
        </main>
      }
    >
      <GameDetailsForm />
    </Suspense>
  );
}