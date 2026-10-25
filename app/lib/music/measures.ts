import type { TabColumn, TabDuration } from '@/app/components/TabGrid';

// Version 2 is an additive event envelope: legacy arrays are never rewritten on read.
export interface Measure { id: string; meter: string; events: TabColumn[] }
export const durationTicks: Record<TabDuration, number> = { '1': 192, '1/2': 96, '1/4': 48, '1/8': 24, '1/16': 12, 'dotted 1/4': 72, 'triplet 1/8': 16 };
export function capacity(meter: string): number {
  if (!/^(?:[1-9]|1[0-6])\/(?:2|4|8|16)$/.test(meter)) throw new Error('Choose a supported time signature first.');
  const [n, d] = meter.split('/').map(Number); return n * 192 / d;
}
export function ticks(event: TabColumn): number { return event.kind === 'grace' ? 0 : durationTicks[event.duration as TabDuration] ?? 0; }
export function adaptTabData(events: TabColumn[]): { version: 1; mode: 'free'; events: TabColumn[] } | { version: 2; mode: 'measured'; measures: Measure[] } {
  if (!events.length || !events.every(e => e.rhythmVersion === 2 && e.measureId && e.meter)) return { version: 1, mode: 'free', events };
  const measures: Measure[] = [];
  for (const event of events) {
    let measure = measures[measures.length - 1];
    if (!measure || measure.id !== event.measureId) { measure = { id: event.measureId!, meter: event.meter!, events: [] }; measures.push(measure); }
    measure.events.push(event);
  }
  return { version: 2, mode: 'measured', measures };
}
const uid = () => globalThis.crypto.randomUUID();
function rests(total: number, template: TabColumn): TabColumn[] {
  const result: TabColumn[] = [];
  const choices = Object.entries(durationTicks).sort((a,b) => b[1]-a[1]) as [TabDuration,number][];
  const reachable: ([TabDuration,number] | undefined)[] = Array(total+1);
  for (let amount=1; amount<=total; amount++) reachable[amount] = choices.find(([,value]) => value <= amount && (value === amount || reachable[amount-value]));
  if (total && !reachable[total]) throw new Error('This duration leaves an unrepresentable rest. Choose another duration.');
  while (total > 0) {
    const choice = reachable[total]!;
    result.push({ id: uid(), notes: [], duration: choice[0], rest: true, autoRest: true, rhythmVersion: 2, measureId: template.measureId, meter: template.meter }); total -= choice[1];
  }
  return result;
}
export function emptyMeasure(meter: string): TabColumn[] {
  capacity(meter);
  const [n,d] = meter.split('/').map(Number); const measureId = uid();
  return Array.from({length:n}, () => ({ id: uid(), notes: [], duration: (d === 2 ? '1/2' : `1/${d}`) as TabDuration, rest: true, autoRest: true, rhythmVersion: 2 as const, measureId, meter }));
}
export function measureStatus(measure: Measure): string {
  if (measure.events.some(e => e.kind !== 'grace' && !e.duration)) return 'Unknown duration';
  const delta = measure.events.reduce((sum,e) => sum+ticks(e),0)-capacity(measure.meter);
  return delta === 0 ? 'Complete' : `${delta < 0 ? 'Underfill' : 'Overflow'} ${Math.abs(delta)/48} quarter beats`;
}
export function displayColumns(events: TabColumn[]): TabColumn[] {
  const model = adaptTabData(events); if (model.mode === 'free') return events;
  return model.measures.flatMap(m => m.events.map((e,i) => ({ ...e, barlineAfter: i === m.events.length-1 ? (e.barlineAfter === 'double' || e.barlineAfter === 'final' ? e.barlineAfter : 'single') : null })));
}
export function editMeasured(events: TabColumn[], index: number, updated: TabColumn): TabColumn[] {
  const old = events[index]; if (!old?.measureId) return events.map((e,i) => i === index ? updated : e);
  if (!updated.duration && updated.kind !== 'grace') throw new Error('Measured events need a duration. Choose a duration or keep the current event.');
  const next = { ...updated, autoRest: updated.autoRest && !updated.notes.length && updated.rest === true && !updated.technique && updated.kind !== 'grace' };
  const delta = ticks(next)-ticks(old); const result = [...events];
  // Only contiguous generated rests after the event may be consumed. Explicit events retain their onset.
  let end = index+1; let available = 0;
  while (end < events.length && events[end].measureId === old.measureId && events[end].autoRest && !events[end].notes.length && events[end].kind !== 'grace') { available += ticks(events[end]); end++; }
  if (delta > available) throw new Error('Duration conflicts with an explicit event or measure boundary. Keep the current duration, shorten it, or add a new measure for the phrase.');
  const boundary = events[end-1]?.barlineAfter;
  const fill = delta <= 0 ? [...rests(-delta,old), ...events.slice(index+1,end)] : rests(available-delta,old);
  result.splice(index,end-index,next,...fill);
  if (boundary && (boundary === 'double' || boundary === 'final')) result[index+fill.length] = { ...result[index+fill.length], barlineAfter: boundary };
  return result;
}
export function durationLabel(duration: TabColumn['duration']): string {
  const labels: Record<string,string> = { '1':'𝅝 whole', '1/2':'𝅗𝅥 half', '1/4':'♩ quarter', '1/8':'♪ eighth', '1/16':'♬ sixteenth', 'dotted 1/4':'♩· dotted quarter', 'triplet 1/8':'♪₃ triplet eighth' };
  return duration ? labels[duration] ?? duration : 'Free';
}
