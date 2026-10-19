// The next highlighted index after moving by delta, wrapping at both ends.
export function moveIndex(
  index: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

// The set of checked indexes with index added, or removed when it was already checked.
export function toggled(checked: Set<number>, index: number): Set<number> {
  const next = new Set(checked);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}
