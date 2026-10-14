/**
 * Human-readable identifiers (T-###, P-###, M-###, C-###) are permanent once assigned.
 * New IDs are always max(existing) + 1, so gaps are never reused.
 */
export function generateNextHumanId(existing: readonly (string | null | undefined)[], prefix: 'T' | 'P' | 'M' | 'C'): string {
  let maxNum = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existing) {
    if (!id) continue;
    const match = id.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}
