import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TabGrid, { TabColumn, parseTabCellInput } from './TabGrid';
import FretboardEditor from './FretboardEditor';
import { mappedFretboardExtent } from '@/app/lib/music/string-order';
import PrintableTablature, { restGlyph } from './PrintableTablature';

const STANDARD_6 = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
const BANJO_OPEN_G = ['G4', 'D3', 'G3', 'B3', 'D4'];

/** Depth-first walk of a host-element tree returned by a hook-free function component. */
function walk(node: unknown, visit: (el: React.ReactElement<any>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (!React.isValidElement(node)) return;
  const el = node as React.ReactElement<any>;
  visit(el);
  walk(el.props?.children, visit);
}

function rowOrder(html: string): number[] {
  return Array.from(html.matchAll(/data-row-string-index="(\d+)"/g)).map((m) => Number(m[1]));
}

describe('TabGrid display order and labels', () => {
  it('standard guitar: high E labelled Str 1 on top, low E labelled Str 6 at the bottom', () => {
    const html = renderToStaticMarkup(<TabGrid stringCount={6} pitches={STANDARD_6} columns={[]} readOnly />);
    expect(rowOrder(html)).toEqual([5, 4, 3, 2, 1, 0]);
    const labels = Array.from(html.matchAll(/data-row-string-index="(\d+)"><span[^>]*>([^<]*)<\/span><span[^>]*>Str (\d+)<\/span>/g)).map(
      (m) => ({ index: Number(m[1]), pitch: m[2], stringNumber: Number(m[3]) })
    );
    expect(labels[0]).toEqual({ index: 5, pitch: 'E4', stringNumber: 1 });
    expect(labels[5]).toEqual({ index: 0, pitch: 'E2', stringNumber: 6 });
  });

  it('read-only TAB places a stored note in the row of its canonical string index', () => {
    const cols: TabColumn[] = [{ id: 'c1', notes: [{ stringIndex: 0, fret: 3 }, { stringIndex: 5, fret: 0 }] }];
    const html = renderToStaticMarkup(<TabGrid stringCount={6} pitches={STANDARD_6} columns={cols} readOnly />);
    const cells = Array.from(html.matchAll(/data-cell-string-index="(\d+)"[^>]*>([^<]*)</g)).map((m) => ({ index: Number(m[1]), text: m[2] }));
    expect(cells.map((c) => c.index)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(cells[0].text).toBe('0'); // top row = String 1 = index 5
    expect(cells[5].text).toBe('3'); // bottom row = String 6 = index 0
  });

  it('banjo: physical 5th string (G4, index 0) is the bottom TAB row', () => {
    const html = renderToStaticMarkup(<TabGrid stringCount={5} pitches={BANJO_OPEN_G} columns={[]} readOnly />);
    expect(rowOrder(html)).toEqual([4, 3, 2, 1, 0]);
    expect(html).toMatch(/data-row-string-index="0"><span[^>]*>G4<\/span><span[^>]*>Str 5<\/span>/);
  });

  it('accepts only 0-36 or x for cell input', () => {
    expect(parseTabCellInput('0')).toBe(0);
    expect(parseTabCellInput('12')).toBe(12);
    expect(parseTabCellInput('x')).toBe('x');
    expect(parseTabCellInput('X')).toBe('x');
    expect(parseTabCellInput('')).toBeNull();
    expect(parseTabCellInput('37')).toBeUndefined();
    expect(parseTabCellInput('-1')).toBeUndefined();
    expect(parseTabCellInput('a')).toBeUndefined();
    expect(parseTabCellInput('1.5')).toBeUndefined();
  });
});

describe('TAB input and fretboard clicks reference the same canonical string index', () => {
  it('typing in the top TAB row and clicking the top fretboard row both target index 5 (String 1)', () => {
    let tabUpdate: TabColumn | null = null;
    const tabTree = TabGrid({
      stringCount: 6,
      pitches: STANDARD_6,
      columns: [{ id: 'c1', notes: [] }],
      activeColumnIndex: 0,
      onUpdateColumn: (_i, col) => {
        tabUpdate = col;
      },
    });
    let topInput: React.ReactElement<any> | null = null;
    walk(tabTree, (el) => {
      if (el.type === 'input' && el.props['aria-label'] === 'String 1 column 1') topInput = el;
    });
    expect(topInput).not.toBeNull();
    (topInput as any).props.onChange({ target: { value: '7' } });
    expect(tabUpdate!.notes).toEqual([{ stringIndex: 5, fret: 7 }]);

    const clicks: [number, number][] = [];
    const fbTree = FretboardEditor({ stringCount: 6, pitches: STANDARD_6, onNoteClick: (s, f) => clicks.push([s, f]) });
    const rows: React.ReactElement<any>[] = [];
    walk(fbTree, (el) => {
      if (el.props?.['data-row-string-index'] !== undefined) rows.push(el);
    });
    expect(rows.map((r) => r.props['data-row-string-index'])).toEqual([5, 4, 3, 2, 1, 0]);
    // Click fret 7 on the top visual row.
    walk(rows[0], (el) => {
      if (el.type === 'button' && el.props['data-tab-fret'] === 7) el.props.onClick();
    });
    expect(clicks).toEqual([[5, 7]]);
  });

  it('hides unselected open strings in a read-only fretboard map', () => {
    const tree = FretboardEditor({
      stringCount: 6,
      pitches: STANDARD_6,
      mode: 'map',
      mapNotes: [{ stringIndex: 5, fret: 0 }],
      readOnly: true,
    });
    const openButtons: React.ReactElement<any>[] = [];
    walk(tree, (el) => {
      if (el.type === 'button' && el.props['data-tab-fret'] === undefined && /open:|at capo/.test(el.props.title ?? '')) openButtons.push(el);
    });
    expect(openButtons).toHaveLength(6);
    expect(openButtons.filter((button) => !String(button.props.className).includes('opacity-0'))).toHaveLength(1);
  });

  it('does not duplicate a TAB-zero marker at the physical capo fret', () => {
    const tree = FretboardEditor({
      stringCount: 6,
      pitches: STANDARD_6,
      capoFrets: [2, 2, 2, 2, 2, 2],
      mode: 'map',
      mapNotes: [{ stringIndex: 0, fret: 0 }],
      readOnly: true,
    });
    const visibleMarkers: React.ReactElement<any>[] = [];
    walk(tree, (el) => {
      if (el.type === 'button' && !String(el.props.className).includes('opacity-0')) visibleMarkers.push(el);
    });
    expect(visibleMarkers).toHaveLength(1);
    expect(visibleMarkers[0].props.title).toContain('at capo (TAB 0)');
  });

  it('extends a printed map to its highest physical fret, including capo offset', () => {
    expect(mappedFretboardExtent([{ stringIndex: 0, fret: 16 }], [], 15)).toBe(16);
    expect(mappedFretboardExtent([{ stringIndex: 0, fret: 16 }], [5], 15)).toBe(21);
    expect(mappedFretboardExtent([{ stringIndex: 0, fret: 2 }], [], 15)).toBe(15);
  });

  it('prints one duration-correct rest marker per TAB event rather than one per string', () => {
    const html = renderToStaticMarkup(
      <PrintableTablature
        stringCount={6}
        pitches={STANDARD_6}
        columns={[{ id: 'rest', notes: [], rest: true, duration: '1/4' }]}
      />
    );
    expect(html.match(/𝄽/g)).toHaveLength(1);
    expect(restGlyph('1')).toBe('𝄻');
    expect(restGlyph('1/2')).toBe('𝄼');
    expect(restGlyph('1/8')).toBe('𝄾');
    expect(restGlyph('1/16')).toBe('𝄿');
    expect(restGlyph('dotted 1/4')).toBe('𝄽·');
    expect(restGlyph('triplet 1/8')).toBe('𝄾₃');
    expect(restGlyph('quarter')).toBe('𝄽');
    expect(restGlyph('eighth')).toBe('𝄾');
    expect(restGlyph('dotted-quarter')).toBe('𝄽·');
    expect(restGlyph('triplet-eighth')).toBe('𝄾₃');
    expect(restGlyph(null)).toBe('R');
  });

  it('with a capo, a fretboard click records the capo-relative TAB fret on the same index', () => {
    const clicks: [number, number][] = [];
    const fbTree = FretboardEditor({
      stringCount: 6,
      pitches: STANDARD_6,
      capoFrets: [2, 2, 2, 2, 2, 2],
      onNoteClick: (s, f) => clicks.push([s, f]),
    });
    const rows: React.ReactElement<any>[] = [];
    walk(fbTree, (el) => {
      if (el.props?.['data-row-string-index'] !== undefined) rows.push(el);
    });
    const bottom = rows[rows.length - 1]; // String 6, index 0
    const buttons: React.ReactElement<any>[] = [];
    walk(bottom, (el) => {
      if (el.type === 'button') buttons.push(el);
    });
    // Neck frets 1 and 2 (at/behind capo) have no note button; neck fret 5 records TAB 3.
    expect(buttons.some((b) => /neck fret 1(?!\d)/.test(b.props.title ?? ''))).toBe(false);
    expect(buttons.some((b) => /neck fret 2(?!\d)/.test(b.props.title ?? ''))).toBe(false);
    const neck5 = buttons.find((b) => /neck fret 5(?!\d)/.test(b.props.title ?? ''))!;
    expect(neck5.props.title).toContain('(A2)');
    neck5.props.onClick();
    expect(clicks).toEqual([[0, 3]]);
  });
});
