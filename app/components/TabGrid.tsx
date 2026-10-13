'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getStandardTabRows } from '@/app/lib/music/string-order';

export interface TabNote {
  /** Canonical index: 0 = physical bass-side string. */
  stringIndex: number;
  fret: number | 'x'; // fret number or 'x' (muted)
}

export interface TabColumn {
  id: string;
  notes: TabNote[];
  duration?: string | null; // e.g. "1/4", "1/8", or null for free-rhythm
  technique?: string | null; // e.g. "h", "p", "/"
  rest?: boolean;
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

/** Parses a TAB cell entry. Returns undefined for invalid input (ignored), null to clear. */
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
  // Treble-side string on top, labelled with its physical string number.
  const rows = getStandardTabRows(stringCount, pitches);

  const handleCellChange = (colIdx: number, strIdx: number, valueStr: string) => {
    if (readOnly || !onUpdateColumn) return;
    const parsed = parseTabCellInput(valueStr);
    if (parsed === undefined) return; // reject invalid characters / out-of-range frets
    const col = columns[colIdx];
    const newNotes = col.notes.filter((n) => n.stringIndex !== strIdx);
    if (parsed !== null) newNotes.push({ stringIndex: strIdx, fret: parsed });
    onUpdateColumn(colIdx, { ...col, notes: newNotes, rest: newNotes.length > 0 ? false : col.rest });
  };

  return (
    <div className="w-full bg-paper-50 border border-stone-300 rounded overflow-hidden select-none">
      {/* Header controls */}
      <div className="px-4 py-2 bg-stone-900 text-stone-100 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider uppercase">TABLATURE STAFF</span>
          <span className="text-stone-400">({stringCount} STRINGS)</span>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && onAddColumn && (
            <button
              type="button"
              onClick={onAddColumn}
              className="flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-950 font-bold rounded hover:bg-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD COLUMN</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Staff Grid */}
      <div className="overflow-x-auto p-4">
        <div className="flex">
          {/* Left Staff Clef & Tuning Labels */}
          <div className="w-24 flex-shrink-0 border-r-2 border-stone-800 pr-2">
            <div className="h-6"></div> {/* Spacer matching column metadata */}
            <div className="space-y-4 py-2">
              {rows.map((row) => (
                <div key={row.index} className="h-7 flex items-center justify-between font-mono text-xs" data-row-string-index={row.index}>
                  <span className="font-bold text-stone-900">{row.pitch ?? '?'}</span>
                  <span className="text-stone-400 text-[10px]">Str {row.stringNumber}</span>
                </div>
              ))}
            </div>
            <div className="h-6"></div> {/* Spacer matching bottom buttons */}
          </div>

          {/* Sequential TAB Columns */}
          <div className="flex divide-x divide-stone-200">
            {columns.map((col, colIdx) => {
              const isActive = colIdx === activeColumnIndex;
              const header = [col.duration, col.technique].filter(Boolean).join(' ') || (col.rest ? 'rest' : String(colIdx + 1));

              return (
                <div
                  key={col.id || colIdx}
                  onClick={() => onSelectColumn?.(colIdx)}
                  className={`w-14 flex-shrink-0 flex flex-col items-center ${readOnly ? '' : 'cursor-pointer'} transition-colors ${
                    isActive ? 'bg-amber-100/50 ring-1 ring-amber-500' : readOnly ? '' : 'hover:bg-stone-100/60'
                  }`}
                >
                  {/* Column Header / Duration / Technique */}
                  <div className="h-6 w-full flex items-center justify-center font-mono text-[10px] text-stone-500 border-b border-stone-200 truncate px-0.5" title={header}>
                    <span>{header}</span>
                  </div>

                  {/* Vertical String Lines & Inputs */}
                  <div className="space-y-4 py-2 w-full flex flex-col items-center">
                    {rows.map((row) => {
                      const strIdx = row.index;
                      const note = col.notes.find((n) => n.stringIndex === strIdx);
                      const val = note ? note.fret.toString() : '';

                      return (
                        <div key={strIdx} className="h-7 w-full flex items-center justify-center relative">
                          {/* Continuous staff line behind cell */}
                          <div className="absolute inset-x-0 h-px bg-stone-300 pointer-events-none" />

                          {readOnly ? (
                            <span
                              className="w-8 h-6 flex items-center justify-center font-mono text-xs font-bold z-10 bg-white"
                              data-cell-string-index={strIdx}
                            >
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
                              placeholder="—"
                              className={`w-8 h-6 text-center font-mono text-xs font-bold rounded z-10 transition-colors ${
                                val !== ''
                                  ? 'bg-stone-900 text-stone-50 border border-stone-900'
                                  : 'bg-white/80 text-stone-400 border border-stone-300 focus:bg-white focus:text-stone-900'
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Column Bottom Actions */}
                  {!readOnly && onDeleteColumn && (
                    <div className="h-6 w-full flex items-center justify-center border-t border-stone-200 opacity-60 hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteColumn(colIdx);
                        }}
                        title="Delete Column"
                        className="text-stone-400 hover:text-red-700 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick Add Column Button at end of grid */}
            {!readOnly && onAddColumn && (
              <div className="w-12 flex-shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={onAddColumn}
                  title="Append Column"
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
