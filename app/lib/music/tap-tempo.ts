/** Reject accidental double taps, long pauses, and intervals far from the recent median. */
export function tempoTap(previous: number[], now: number): { times: number[]; bpm: number | null } {
  const gap = previous.length ? now - previous[previous.length - 1] : 0;
  if (!previous.length || gap > 2500) return { times: [now], bpm: null };
  if (gap < 150) return { times: previous, bpm: null };
  const intervals = previous.slice(1).map((time, i) => time - previous[i]);
  if (intervals.length >= 2) {
    const sorted = [...intervals].sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (gap < median * 0.65 || gap > median * 1.5) return { times: [now], bpm: null };
  }
  const times = [...previous.slice(-7), now];
  const gaps = times.slice(1).map((time, i) => time - times[i]).sort((a,b) => a-b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return { times, bpm: gaps.length >= 2 ? Math.round(60000 / median) : null };
}
