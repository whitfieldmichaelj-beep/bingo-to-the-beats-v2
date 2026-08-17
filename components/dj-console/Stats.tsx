"use client";

type Props = {
  status: string;
  cards: number;
  played: number;
  total: number;
  remaining: number;
};

function Item({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="dj-stat-card">

      <div className="dj-stat-value">
        {value}
      </div>

      <div className="dj-stat-label">
        {label}
      </div>

    </div>
  );
}

export default function Stats({
  status,
  cards,
  played,
  total,
  remaining,
}: Props) {
  return (
    <section className="dj-stats-row">

      <Item
        label="Status"
        value={status}
      />

      <Item
        label="Cards"
        value={cards}
      />

      <Item
        label="Played"
        value={played}
      />

      <Item
        label="Songs"
        value={total}
      />

      <Item
        label="Remaining"
        value={remaining}
      />

    </section>
  );
}