export function describe(
  message?: string,
  file?: string,
  change?: string,
  regex = false,
): string {
  const parts: string[] = [];
  if (message !== undefined) parts.push(`message "${message}"`);
  if (file !== undefined) parts.push(`file "${file}"`);
  if (change !== undefined)
    parts.push(`${regex ? "regex" : "change"} "${change}"`);
  return parts.join(" and ");
}
