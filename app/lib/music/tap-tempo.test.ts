import { expect, it } from 'vitest';
import { tempoTap } from './tap-tempo';
it('derives a stable candidate, ignores bounce, resets on pauses and outliers', () => {
  let times: number[] = [];
  for (const time of [0, 500, 1000, 1505]) times = tempoTap(times, time).times;
  expect(tempoTap(times, 2000).bpm).toBe(120);
  expect(tempoTap(times, 1550).times).toEqual(times);
  expect(tempoTap(times, 4000).bpm).toBeNull();
  expect(tempoTap(times, 2400).times).toEqual([2400]);
});
