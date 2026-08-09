/**
 * Next code in a `PREFIX-NNN` series, from the highest number in use.
 *
 * The same rule as selectors.ts `nextCode` and as the backend's lib/codes.ts —
 * max rather than count, so deleting a record never hands out a code twice.
 * Lifted out so the API overlay can suggest a code without importing the whole
 * selector module.
 */
export function nextCodeFrom(existing: readonly string[], prefix: string, pad: number): string {
  let max = 0;
  for (const value of existing) {
    const match = /(\d+)\s*$/.exec(value ?? "");
    if (match?.[1]) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}
