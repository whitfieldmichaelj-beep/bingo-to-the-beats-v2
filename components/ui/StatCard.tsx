import Card from "./Card";

export default function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <span className="bttb-eyebrow">
        {label}
      </span>
      <strong
        style={{
          display: "block",
          marginTop: "8px",
          fontSize: "28px",
        }}
      >
        {value}
      </strong>
    </Card>
  );
}
