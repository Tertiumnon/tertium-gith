// Weeks start on Monday. Dates are local time.
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The most frequent key, ties broken by the key's name so the result is stable.
export function top(counts: Map<string, number>): [string, number] | undefined {
  let best: [string, number] | undefined;
  for (const [key, count] of counts) {
    if (!best || count > best[1] || (count === best[1] && key < best[0]))
      best = [key, count];
  }
  return best;
}

export function count(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}
