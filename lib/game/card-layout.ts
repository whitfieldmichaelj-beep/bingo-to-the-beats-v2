export type CardSize = 3 | 5;

/** Missing values are old clients: preserve their 5×5 games. */
export function parseCardSize(value: unknown): CardSize {
  if (value === undefined) return 5;
  if (value === 3 || value === 5) return value;
  throw new Error("Choose a 3×3 or 5×5 card size.");
}

/** Shared by the player preview and authoritative server win checks. */
export function patternGroups(pattern: string, rows = 5, columns = rows): number[][] {
  if ((rows !== 3 && rows !== 5) || columns !== rows) return [];
  const horizontal = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => r * columns + c));
  const vertical = Array.from({ length: columns }, (_, c) =>
    Array.from({ length: rows }, (_, r) => r * columns + c));
  const diagonals = [
    Array.from({ length: rows }, (_, i) => i * columns + i),
    Array.from({ length: rows }, (_, i) => i * columns + columns - 1 - i),
  ];
  switch (pattern) {
    case "four-corners": return [[0, columns - 1, (rows - 1) * columns, rows * columns - 1]];
    case "x-pattern": return [[...new Set(diagonals.flat())]];
    case "full-card": case "blackout": return [Array.from({ length: rows * columns }, (_, i) => i)];
    case "across": return horizontal;
    case "down": return vertical;
    case "diagonal": return diagonals;
    default: return [...horizontal, ...vertical, ...diagonals];
  }
}
