// Cosmetic, in-memory colors only. A peer or group keeps its color while the
// app runs; a fresh launch starts a new shuffled palette without persisted data.
const palette = [
  '#EAC0CB',
  '#BDD3F0',
  '#D3C1ED',
  '#EDC9A8',
  '#B6D8CF',
  '#E6D89E',
  '#C0CDEA',
  '#D0DDB7',
];
const assigned = new Map<string, string>();
let remaining: string[] = [];

export function fallbackAvatarColor(identity: string): string {
  const existing = assigned.get(identity);
  if (existing) return existing;
  if (!remaining.length) {
    remaining = [...palette];
    for (let index = remaining.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [remaining[index], remaining[other]] = [remaining[other]!, remaining[index]!];
    }
  }
  const color = remaining.pop()!;
  assigned.set(identity, color);
  return color;
}
