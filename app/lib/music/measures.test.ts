import { describe, expect, it } from 'vitest';
import { adaptTabData, capacity, displayColumns, editMeasured, emptyMeasure, measureStatus, ticks } from './measures';
import { tabDataSchema } from '../validation/schemas';
import type { TabColumn } from '@/app/components/TabGrid';

describe('versioned measured rhythm', () => {
  it.each([['4/4',4,192],['3/4',3,144],['2/4',2,96],['6/8',6,144],['7/8',7,168],['2/2',2,192]])('initializes %s', (meter,count,total) => {
    const events = emptyMeasure(meter as string); expect(events).toHaveLength(count as number);
    expect(events.every(e => e.autoRest && e.rest)).toBe(true);
    expect(events.reduce((n,e) => n+ticks(e),0)).toBe(total); expect(capacity(meter as string)).toBe(total);
  });
  it('shortens notes with inserted rests, lengthens through generated rests, preserves explicit onsets', () => {
    const events = emptyMeasure('4/4'); events[0] = {...events[0],notes:[{stringIndex:0,fret:3}],rest:false,autoRest:false};
    events[2] = {...events[2],notes:[{stringIndex:0,fret:7}],rest:false,autoRest:false};
    const short = editMeasured(events,0,{...events[0],duration:'1/8'});
    expect(short[1].autoRest).toBe(true); expect(short[1].duration).toBe('1/8');
    expect(short.find(e => e.id === events[2].id)).toEqual(events[2]);
    const long = editMeasured(short,0,{...short[0],duration:'1/2'});
    expect(long[1]).toEqual(events[2]); expect(long.reduce((n,e) => n+ticks(e),0)).toBe(192);
    expect(() => editMeasured(events,0,{...events[0],duration:'1'})).toThrow(/conflicts/);
    expect(events[2].notes[0].fret).toBe(7);
  });
  it('inserts an eighth rest immediately after a shortened quarter before explicit notes', () => {
    const events=emptyMeasure('4/4').map(e => ({...e,autoRest:false,rest:false,notes:[{stringIndex:0,fret:2}]}));
    const result=editMeasured(events,0,{...events[0],duration:'1/8'});
    expect(result[1]).toMatchObject({duration:'1/8',rest:true,autoRest:true}); expect(result[2]).toEqual(events[1]);
  });
  it('does not consume explicit rests or cross measures', () => {
    const events=emptyMeasure('2/4'); events[1].autoRest=false;
    expect(() => editMeasured(events,0,{...events[0],duration:'1/2'})).toThrow();
    const both=[...emptyMeasure('2/4'),...emptyMeasure('2/4')];
    expect(() => editMeasured(both,1,{...both[1],duration:'1/2'})).toThrow();
  });
  it('grace notes consume no time and preserve measure completeness', () => {
    const events=emptyMeasure('3/4'); const result=editMeasured(events,0,{...events[0],kind:'grace',rest:false,notes:[{stringIndex:0,fret:2}]});
    expect(ticks(result[0])).toBe(0); const model=adaptTabData(result); expect(model.mode).toBe('measured');
    if(model.mode==='measured') expect(measureStatus(model.measures[0])).toBe('Complete');
  });
  it('adapts legacy data without mutation or inferred measures', () => {
    const events: TabColumn[]=[{id:'legacy',notes:[{stringIndex:0,fret:3}],barlineAfter:'double'}];
    const snapshot=JSON.stringify(events); expect(adaptTabData(events)).toEqual({version:1,mode:'free',events});
    expect(displayColumns(events)).toBe(events); expect(JSON.stringify(events)).toBe(snapshot);
  });
  it('persists metadata and derives boundaries while preserving final choice', () => {
    const events=emptyMeasure('6/8'); events[5].barlineAfter='final';
    const loaded=tabDataSchema.parse(JSON.parse(JSON.stringify(events)));
    expect(loaded).toEqual(events); expect(displayColumns(loaded)[5].barlineAfter).toBe('final');
    const model=adaptTabData(loaded); if(model.mode==='measured') {
      expect(measureStatus({...model.measures[0],events:loaded.slice(1)})).toMatch(/Underfill/);
      expect(measureStatus({...model.measures[0],events:[...loaded,loaded[0]]})).toMatch(/Overflow/);
    }
  });
});

it('preserves special boundary choices through shortening and lengthening', () => {
  const events=emptyMeasure('2/4'); events[1].barlineAfter='double';
  const shorter=editMeasured(events,1,{...events[1],duration:'1/8',notes:[{stringIndex:0,fret:2}],rest:false,autoRest:false});
  expect(displayColumns(shorter).at(-1)?.barlineAfter).toBe('double');
  const longer=editMeasured(shorter,1,{...shorter[1],duration:'1/4'});
  expect(displayColumns(longer).at(-1)?.barlineAfter).toBe('double');
});
it('rejects fractional residuals rather than rounding or changing explicit onsets', () => {
  const events=emptyMeasure('4/4'); events[0].duration='1/8';
  expect(() => editMeasured(events,0,{...events[0],duration:'triplet 1/8'})).toThrow(/unrepresentable/);
  expect(events).toHaveLength(4);
});
it('rejects invalid measured envelopes at the persistence boundary', () => {
  const events=emptyMeasure('4/4');
  expect(() => tabDataSchema.parse([{...events[0],notes:[{stringIndex:0,fret:1}]}])).toThrow();
  expect(() => tabDataSchema.parse([...events,{id:'legacy',notes:[]}])).toThrow();
});

it('rebuilds only one pristine measure and protects all explicit/touched material', async () => {
  const {canRebuildEmptyMeasure}=await import('./measures');
  expect(canRebuildEmptyMeasure(emptyMeasure('4/4'))).toBe(true);
  const events=emptyMeasure('4/4');
  for (const patch of [
    {notes:[{stringIndex:0,fret:3}],rest:false,autoRest:false},
    {technique:'h',autoRest:false}, {kind:'grace' as const,autoRest:false},
    {autoRest:false}, {duration:'1/8' as const}, {barlineAfter:'final' as const},
  ]) expect(canRebuildEmptyMeasure([{...events[0],...patch},...events.slice(1)])).toBe(false);
  expect(canRebuildEmptyMeasure([...events,...emptyMeasure('3/4')])).toBe(false);
  expect(canRebuildEmptyMeasure([{id:'legacy',notes:[]}])).toBe(false);
});
it('cycles generated and explicit rests without producing blank measured events', async () => {
  const {toggleTabRest,withTabNotes}=await import('./measures');
  const generated=emptyMeasure('4/4')[0];
  const explicit=toggleTabRest(generated);
  expect(explicit).toMatchObject({notes:[],rest:true,autoRest:false});
  const editable=toggleTabRest(explicit);
  expect(editable).toMatchObject({notes:[],rest:true,autoRest:true});
  const note=withTabNotes(editable,[{stringIndex:0,fret:3}]);
  expect(note).toMatchObject({rest:false,autoRest:false});
  expect(withTabNotes(note,[])).toMatchObject({notes:[],rest:true,autoRest:true});
  const emptyWithTechnique=withTabNotes({...note,technique:'h'},[]);
  expect(emptyWithTechnique).toMatchObject({rest:true,autoRest:false,technique:'h'});
  for(const event of [generated,explicit,editable,note,withTabNotes(note,[]),emptyWithTechnique]) expect(tabDataSchema.parse([event])).toEqual([event]);
  const blank={...generated,rest:false,autoRest:false};
  expect(()=>tabDataSchema.parse([blank])).toThrow(/notes or be rests/);
  expect(()=>editMeasured([generated],0,blank)).toThrow(/notes or be a rest/);
  // Free rhythm retains the existing empty-event semantics.
  expect(tabDataSchema.parse([{id:'free',notes:[],rest:false}])).toHaveLength(1);
});
it('formats status amounts as exact musical fractions', async () => {
  const {quarterBeatLabel}=await import('./measures');
  expect(quarterBeatLabel(16)).toBe('1/3 quarter-note beat');
  expect(quarterBeatLabel(80)).toBe('1 2/3 quarter-note beats');
  expect(quarterBeatLabel(12)).toBe('1/4 quarter-note beat');
  const events=emptyMeasure('4/4'); events.push({...events[0],id:'triplet',duration:'triplet 1/8'});
  expect(measureStatus({id:events[0].measureId!,meter:'4/4',events})).toBe('Overflow 1/3 quarter-note beat');
});
