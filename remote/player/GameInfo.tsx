export default function GameInfo({ joinCode }: { joinCode?: string | null }) {
  return <p style={{ textAlign: "center", color: "#c4b5fd" }}>
    Private practice · Game <strong>{joinCode}</strong>
  </p>;
}
