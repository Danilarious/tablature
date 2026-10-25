'use client';

import React from 'react';
import { displayColumns, durationLabel, ticks, withTabNotes, toggleTabRest } from '@/app/lib/music/measures';
import { Plus, Trash2 } from 'lucide-react';
import { getStandardTabRows } from '@/app/lib/music/string-order';

export const TAB_DURATIONS = ['1', '1/2', '1/4', '1/8', '1/16', 'dotted 1/4', 'triplet 1/8'] as const;
export type TabDuration = (typeof TAB_DURATIONS)[number];
export type TabBarline = 'single' | 'double' | 'final';
export type TabColumnKind = 'regular' | 'grace';

export interface TabNote {
  /** Canonical index: 0 = physical bass-side string. */
  stringIndex: number;
  fret: number | 'x';
}

export interface TabColumn {
  rhythmVersion?: 2;
  measureId?: string;
  meter?: string;
  autoRest?: boolean;
  id: string;
  notes: TabNote[];
  duration?: TabDuration | null;
  technique?: string | null;
  rest?: boolean;
  kind?: TabColumnKind;
  barlineAfter?: TabBarline | null;
}

export interface TabGridProps {
  stringCount: number;
  /** Open pitches in canonical order (index 0 = bass-side string). */
  pitches: string[];
  columns: TabColumn[];
  activeColumnIndex?: number;
  /** Render without editing controls (safe for server-rendered print pages). */
  readOnly?: boolean;
  onSelectColumn?: (index: number) => void;
  onUpdateColumn?: (index: number, updated: TabColumn) => void;
  onAddColumn?: () => void;
  onDeleteColumn?: (index: number) => void;
}

export const MAX_TAB_FRET = 36;

export function parseTabCellInput(raw: string): number | 'x' | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.toLowerCase() === 'x') return 'x';
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n <= MAX_TAB_FRET ? n : undefined;
  }
  return undefined;
}

function barlineClass(barline: TabBarline | null | undefined): string {
  if (barline === 'double') return 'border-r-[5px] border-double border-stone-800';
  if (barline === 'final') return 'border-r-[7px] border-double border-stone-950';
  if (barline === 'single') return 'border-r-2 border-stone-800';
  return '';
}

export default function TabGrid({
  stringCount,
  pitches,
  columns,
  activeColumnIndex = -1,
  readOnly = false,
  onSelectColumn,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
}: TabGridProps) {
  columns = displayColumns(columns);
  const rows = getStandardTabRows(stringCount, pitches);
  const activeColumn = columns[activeColumnIndex];

  const updateColumn = (index: number, patch: Partial<TabColumn>) => {
    if (readOnly || !onUpdateColumn || !columns[index]) return;
    onUpdateColumn(index, { ...columns[index], ...patch });
  };

  const handleCellChange = (colIdx: number, strIdx: number, valueStr: string) => {
    if (readOnly || !onUpdateColumn) return;
    const parsed = parseTabCellInput(valueStr);
    if (parsed === undefined) return;
    const col = columns[colIdx];
    const newNotes = col.notes.filter((n) => n.stringIndex !== strIdx);
    if (parsed !== null) newNotes.push({ stringIndex: strIdx, fret: parsed });
    onUpdateColumn(colIdx, withTabNotes(col, newNotes));
  };

  const cycleBarline = (index: number) => {
    const current = columns[index]?.barlineAfter;
    if (columns[index]?.measureId && columns[index+1]?.measureId === columns[index].measureId) return;
    const next: TabBarline | null =
      !current ? 'single' : current === 'single' ? 'double' : current === 'double' ? 'final' : null;
    updateColumn(index, { barlineAfter: next });
  };

  return (
    <div className="w-full bg-paper-50 border border-stone-300 rounded overflow-hidden select-none">
      <div className="px-4 py-2 bg-stone-900 text-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider uppercase">TABLATURE STAFF</span>
          <span className="text-stone-400">({stringCount} STRINGS)</span>
        </div>
        {!readOnly && onAddColumn && (
          <button
            type="button"
            onClick={onAddColumn}
            className="flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-950 font-bold rounded hover:bg-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ADD EVENT</span>
          </button>
        )}
      </div>

      {!readOnly && activeColumn && (
        <div className="px-3 py-2 border-b border-stone-300 bg-stone-100 flex flex-wrap items-end gap-2 font-mono text-[11px]">
          <label className="space-y-1">
            <span className="block text-stone-500 uppercase">Length</span>
            <select
              value={activeColumn.duration ?? ''}
              onChange={(e) => updateColumn(activeColumnIndex, { duration: (e.target.value || null) as TabDuration | null })}
              className="bg-white border border-stone-300 rounded px-2 py-1"
            >
              <option value="">Free</option>
              {TAB_DURATIONS.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-stone-500 uppercase">Technique</span>
            <select
              value={activeColumn.technique ?? ''}
              onChange={(e) => updateColumn(activeColumnIndex, { technique: e.target.value || null })}
              className="bg-white border border-stone-300 rounded px-2 py-1"
            >
              <option value="">None</option>
              <option value="h">h · hammer-on</option>
              <option value="p">p · pull-off</option>
              <option value="/">/ · slide up</option>
              <option value="\\">\ · slide down</option>
              <option value="b">b · bend</option>
              <option value="r">r · release</option>
              <option value="~">~ · vibrato</option>
              <option value="harm">harmonic</option>
              <option value="pm">palm mute</option>
              <option value="let ring">let ring</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => updateColumn(activeColumnIndex, {
              kind: activeColumn.kind === 'grace' ? 'regular' : 'grace',
              rest: activeColumn.kind === 'grace' && !activeColumn.notes.length, autoRest: activeColumn.kind === 'grace' && !activeColumn.notes.length && !activeColumn.technique,
            })}
            className={`px-2 py-1 border rounded ${activeColumn.kind === 'grace' ? 'bg-amber-200 border-amber-500' : 'bg-white border-stone-300'}`}
          >
            Grace / passing note
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeColumn.notes.length && !window.confirm('Replace the notes in this event with an explicit rest?')) return;
              updateColumn(activeColumnIndex, toggleTabRest(activeColumn));
            }}
            disabled={!!activeColumn.measureId && (activeColumn.kind === 'grace' || (!!activeColumn.rest && !!activeColumn.technique))}
            title={activeColumn.measureId ? 'Generated rest → explicit rest; explicit rest → editable generated rest. Remove any technique first.' : 'Toggle rest'}
            className={`px-2 py-1 border rounded disabled:opacity-50 ${activeColumn.rest ? 'bg-amber-200 border-amber-500' : 'bg-white border-stone-300'}`}
          >
            {activeColumn.measureId ? activeColumn.autoRest ? 'Make explicit rest' : activeColumn.rest ? 'Make editable rest' : 'Rest' : 'Rest'}
          </button>
          <label className="space-y-1">
            <span className="block text-stone-500 uppercase">Bar after</span>
            <select
              disabled={!!activeColumn.measureId && columns[activeColumnIndex+1]?.measureId === activeColumn.measureId}
              value={activeColumn.barlineAfter ?? ''}
              onChange={(e) => updateColumn(activeColumnIndex, { barlineAfter: (e.target.value || null) as TabBarline | null })}
              className="bg-white border border-stone-300 rounded px-2 py-1"
            >
              <option value="">None</option>
              <option value="single">Measure</option>
              <option value="double">Section</option>
              <option value="final">Final</option>
            </select>
          </label>
          <span className="text-stone-500">Grace notes lead into the next primary event; techniques connect toward the next note.</span>
          <span className="text-stone-500 ml-auto self-center">Editing event {activeColumnIndex + 1}</span>
        </div>
      )}

      <div className="overflow-x-auto p-4" role="region" aria-label="Scrollable tablature" tabIndex={0}>
        <div className="flex w-max min-w-full pr-2">
          <div className="w-24 flex-shrink-0 border-r-2 border-stone-800 pr-2">
            <div className="h-10" />
            <div className="space-y-4 py-2">
              {rows.map((row) => (
                <div key={row.index} className="h-7 flex items-center justify-between font-mono text-xs" data-row-string-index={row.index}>
                  <span className="font-bold text-stone-900">{row.pitch ?? '?'}</span>
                  <span className="text-stone-400 text-[10px]">Str {row.stringNumber}</span>
                </div>
              ))}
            </div>
            <div className="h-6" />
          </div>

          <div className="flex divide-x divide-stone-200">
            {columns.map((col, colIdx) => {
              const isActive = colIdx === activeColumnIndex;
              const start = !!col.measureId && columns[colIdx-1]?.measureId !== col.measureId;
              const offset = columns.slice(0,colIdx).filter(e => e.measureId === col.measureId).reduce((sum,e) => sum+ticks(e),0);
              const compoundGroup = col.meter === '6/8' && offset === 72;
              const header = [
                col.kind === 'grace' ? 'grace' : null,
                durationLabel(col.duration),
                col.technique,
                col.rest ? 'rest' : null,
              ].filter(Boolean).join(' ') || String(colIdx + 1);

              return (
                <div
                  key={col.id || colIdx}
                  data-tab-event={colIdx + 1}
                  data-barline={col.barlineAfter || undefined}
                  data-measure-start={start || undefined}
                  data-compound-group={compoundGroup || undefined}
                  style={{ ...(compoundGroup ? { borderLeft: '3px dashed #a8a29e', marginLeft: 8 } : {}), ...(col.barlineAfter ? { borderRight: col.barlineAfter === 'single' ? '2px solid #292524' : col.barlineAfter === 'double' ? '5px double #292524' : '7px double #0c0a09' } : {}) }}
                  onClick={() => onSelectColumn?.(colIdx)}
                  className={`${col.kind === 'grace' ? 'w-24' : 'w-28'} relative group/column flex-shrink-0 flex flex-col items-center ${barlineClass(col.barlineAfter)} ${readOnly ? '' : 'cursor-pointer'} transition-colors ${
                    isActive ? 'bg-amber-100/50 ring-1 ring-amber-500' : readOnly ? '' : 'hover:bg-stone-100/60'
                  }`}
                >
                  <div className="min-h-10 w-full flex items-center justify-center font-mono text-[10px] text-stone-500 border-b border-stone-200 text-center leading-tight px-0.5" title={header}>
                    <span>{header}</span>
                  </div>
                  {!readOnly && (!col.measureId || columns[colIdx+1]?.measureId !== col.measureId) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); cycleBarline(colIdx); }}
                      title="Cycle barline after this event"
                      aria-label={`Barline after event ${colIdx + 1}`}
                      className="absolute -right-1.5 top-0 z-20 h-6 w-3 opacity-100 bg-stone-700 text-white text-[8px] rounded"
                    >
                      |
                    </button>
                  )}

                  <div className="space-y-4 py-2 w-full flex flex-col items-center">
                    {rows.map((row) => {
                      const strIdx = row.index;
                      const note = col.notes.find((n) => n.stringIndex === strIdx);
                      const val = note ? note.fret.toString() : '';

                      return (
                        <div key={strIdx} className="h-7 w-full flex items-center justify-center relative">
                          <div className="absolute inset-x-0 h-px bg-stone-300 pointer-events-none" />
                          {col.rest && (
                            <span className="absolute z-10 bg-white px-1 text-stone-500 font-serif text-sm">𝄽</span>
                          )}
                          {readOnly ? (
                            <span className={`w-8 h-6 flex items-center justify-center font-mono font-bold z-10 bg-white ${col.kind === 'grace' ? 'text-[9px] align-super' : 'text-xs'}`} data-cell-string-index={strIdx}>
                              {val}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              value={val}
                              aria-label={`String ${row.stringNumber} column ${colIdx + 1}`}
                              data-cell-string-index={strIdx}
                              onChange={(e) => handleCellChange(colIdx, strIdx, e.target.value)}
                              onFocus={() => onSelectColumn?.(colIdx)}
                              placeholder={col.rest ? '' : '—'}
                              disabled={!!col.rest && !col.autoRest}
                              className={`w-8 h-6 text-center font-mono font-bold rounded z-10 transition-colors ${col.kind === 'grace' ? 'text-[9px]' : 'text-xs'} ${
                                val !== ''
                                  ? 'bg-stone-900 text-stone-50 border border-stone-900'
                                  : 'bg-white/80 text-stone-400 border border-stone-300 focus:bg-white focus:text-stone-900 disabled:opacity-0'
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!readOnly && onDeleteColumn && (
                    <div className="h-6 w-full flex items-center justify-center border-t border-stone-200 opacity-60 hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteColumn(colIdx); }}
                        title="Delete event"
                        className="text-stone-400 hover:text-red-700 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {!readOnly && onAddColumn && (
              <div className="w-12 flex-shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={onAddColumn}
                  title="Append event"
                  className="w-8 h-8 rounded border border-dashed border-stone-400 hover:border-stone-900 hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
