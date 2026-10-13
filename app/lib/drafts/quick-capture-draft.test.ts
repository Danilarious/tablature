import { describe, expect, it } from 'vitest';
import {
  clearDraft,
  loadDraft,
  parseDraft,
  QUICK_CAPTURE_DRAFT_KEY,
  QuickCaptureDraft,
  resolveDraftRestore,
  saveDraft,
  StorageLike,
} from './quick-capture-draft';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const draft = (overrides: Partial<QuickCaptureDraft> = {}): QuickCaptureDraft => ({
  version: 1,
  savedAt: 123,
  instrumentId: 'inst-6',
  tuningId: 'tun-6',
  capoMode: 'full',
  capoFret: 3,
  customCapoFrets: [],
  tabColumns: [{ id: 'c1', notes: [{ stringIndex: 5, fret: 2 }] }],
  activeColumnIndex: 0,
  title: 'Morning idea',
  motifFunction: 'riff',
  tags: 'modal',
  notes: 'thumb drone',
  ...overrides,
});

const empty = () => draft({ title: '', tags: '', notes: '', tabColumns: [{ id: 'c1', notes: [] }] });

describe('Quick Capture draft storage', () => {
  it('round-trips instrument, tuning, capo, TAB, title, tags and notes', () => {
    const s = memoryStorage();
    expect(saveDraft(s, draft())).toBe(true);
    expect(loadDraft(s)).toEqual(draft());
  });

  it('does not save an empty draft and never clears an existing one on empty state', () => {
    const s = memoryStorage();
    saveDraft(s, draft());
    expect(saveDraft(s, empty())).toBe(false);
    expect(loadDraft(s)?.title).toBe('Morning idea');
  });

  it('clears only when asked', () => {
    const s = memoryStorage();
    saveDraft(s, draft());
    clearDraft(s);
    expect(s.data.has(QUICK_CAPTURE_DRAFT_KEY)).toBe(false);
    expect(loadDraft(s)).toBeNull();
  });

  it('ignores corrupt, invalid or other-version drafts', () => {
    expect(parseDraft('{not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft(), version: 2 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft(), tabColumns: [{ id: 'c1', notes: [{ stringIndex: -1, fret: 0 }] }] }))).toBeNull();
    expect(loadDraft(null)).toBeNull();
  });

  it('survives storage that throws (quota / privacy mode)', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(saveDraft(throwing, draft())).toBe(false);
    expect(loadDraft(throwing)).toBeNull();
    expect(() => clearDraft(throwing)).not.toThrow();
  });
});

describe('resolveDraftRestore', () => {
  const instruments = [
    { id: 'inst-6', stringCount: 6 },
    { id: 'inst-5', stringCount: 5 },
  ];
  const tunings = [
    { id: 'tun-6', stringCount: 6 },
    { id: 'tun-5', stringCount: 5 },
  ];

  it('restores everything when the instrument and tuning still exist and match', () => {
    const plan = resolveDraftRestore(draft(), instruments, tunings)!;
    expect(plan).toMatchObject({ instrumentId: 'inst-6', tuningId: 'tun-6', warnings: [] });
    expect(plan.tabColumns).toEqual(draft().tabColumns);
  });

  it('never restores a tuning whose string count differs from the instrument', () => {
    const plan = resolveDraftRestore(draft({ instrumentId: 'inst-5', tuningId: 'tun-6', tabColumns: [] }), instruments, tunings)!;
    expect(plan.tuningId).toBe('tun-5');
    expect(plan.warnings.length).toBe(1);
  });

  it('does not restore TAB that references strings the instrument lacks', () => {
    const plan = resolveDraftRestore(draft({ instrumentId: 'missing' }), [{ id: 'inst-5', stringCount: 5 }], tunings)!;
    expect(plan.instrumentId).toBe('inst-5');
    expect(plan.tabColumns).toBeNull();
    expect(plan.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('drops custom capo frets of the wrong length', () => {
    expect(resolveDraftRestore(draft({ capoMode: 'custom', customCapoFrets: [null, 2, 2, 2, 2] }), instruments, tunings)!.customCapoFrets).toEqual([]);
    expect(resolveDraftRestore(draft({ capoMode: 'custom', customCapoFrets: [null, 2, 2, 2, 2, 2] }), instruments, tunings)!.customCapoFrets).toHaveLength(6);
  });

  it('returns null when there are no instruments at all', () => {
    expect(resolveDraftRestore(draft(), [], tunings)).toBeNull();
  });
});
