'use client';

import React from 'react';
import { Plus, Trash2, Copy, ArrowLeft, ArrowRight } from 'lucide-react';

export interface TabNote {
  stringIndex: number;
  fret: number | string; // e.g. 0, 2, 'x'
}

export interface TabColumn {
  id: string;
  notes: TabNote[];
  duration?: string; // e.g. "1/4", "1/8", or null for free-rhythm
  technique?: string; // e.g. "h", "p", "/"
}

export interface TabGridProps {
  stringCount: number;
  pitches: string[];
  columns: TabColumn[];
  activeColumnIndex: number;
  onSelectColumn: (index: number) => void;
  onUpdateColumn: (index: number, updated: TabColumn) => void;
  onAddColumn: () => void;
  onDeleteColumn: (index: number) => void;
  onInsertColumn?: (index: number) => void;
}

export default function TabGrid({
  stringCount,
  pitches,
  columns,
  activeColumnIndex,
  onSelectColumn,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
  onInsertColumn,
}: TabGridProps) {
  // String rows displayed high to low (String 1 on top)
  const stringIndices = Array.from({ length: stringCount }, (_, i) => i).reverse();

  // Helper to handle note value change in cell
  const handleCellChange = (colIdx: number, strIdx: number, valueStr: string) => {
    const col = columns[colIdx];
    const trimmed = valueStr.trim();

    let newNotes = [...col.notes];
    const existingNoteIdx = newNotes.findIndex(n => n.stringIndex === strIdx);

    if (!trimmed) {
      // Remove note
      if (existingNoteIdx !== -1) {
        newNotes.splice(existingNoteIdx, 1);
      }
    } else {
      let finalVal: number | string = trimmed;
      if (!isNaN(Number(trimmed)) && trimmed !== '') {
        finalVal = parseInt(trimmed, 10);
      } else if (trimmed.toLowerCase() === 'x') {
        finalVal = 'x';
      }

      if (existingNoteIdx !== -1) {
        newNotes[existingNoteIdx] = { stringIndex: strIdx, fret: finalVal };
      } else {
        newNotes.push({ stringIndex: strIdx, fret: finalVal });
      }
    }

    onUpdateColumn(colIdx, { ...col, notes: newNotes });
  };

  return (
    <div className="w-full bg-paper-50 border border-stone-300 rounded overflow-hidden select-none">
      {/* Header controls */}
      <div className="px-4 py-2 bg-stone-900 text-stone-100 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider uppercase">TABLATURE STAFF</span>
          <span className="text-stone-400">({stringCount} STRINGS)</span>
          <span className="text-[11px] text-stone-400 bg-stone-800 px-2 py-0.5 rounded">
            Free-Rhythm Mode Active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddColumn}
            className="flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-950 font-bold rounded hover:bg-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ADD COLUMN</span>
          </button>
        </div>
      </div>

      {/* Main Staff Grid */}
      <div className="overflow-x-auto p-4">
        <div className="flex">
          {/* Left Staff Clef & Tuning Labels */}
          <div className="w-24 flex-shrink-0 border-r-2 border-stone-800 pr-2">
            <div className="h-6"></div> {/* Spacer matching column metadata */}
            <div className="space-y-4 py-2">
              {stringIndices.map((strIdx) => (
                <div key={strIdx} className="h-7 flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-stone-900">{pitches[strIdx] || 'E'}</span>
                  <span className="text-stone-400 text-[10px]">Str {strIdx + 1}</span>
                </div>
              ))}
            </div>
            <div className="h-6"></div> {/* Spacer matching bottom buttons */}
          </div>

          {/* Sequential TAB Columns */}
          <div className="flex divide-x divide-stone-200">
            {columns.map((col, colIdx) => {
              const isActive = colIdx === activeColumnIndex;

              return (
                <div
                  key={col.id || colIdx}
                  onClick={() => onSelectColumn(colIdx)}
                  className={`w-14 flex-shrink-0 flex flex-col items-center cursor-pointer transition-colors ${
                    isActive ? 'bg-amber-100/50 ring-1 ring-amber-500' : 'hover:bg-stone-100/60'
                  }`}
                >
                  {/* Column Header / Duration / Technique */}
                  <div className="h-6 w-full flex items-center justify-center font-mono text-[10px] text-stone-500 border-b border-stone-200">
                    <span>{col.duration || colIdx + 1}</span>
                  </div>

                  {/* Vertical String Lines & Inputs */}
                  <div className="space-y-4 py-2 w-full flex flex-col items-center">
                    {stringIndices.map((strIdx) => {
                      const note = col.notes.find(n => n.stringIndex === strIdx);
                      const val = note ? note.fret.toString() : '';

                      return (
                        <div key={strIdx} className="h-7 w-full flex items-center justify-center relative">
                          {/* Continuous staff line behind cell */}
                          <div className="absolute inset-x-0 h-px bg-stone-300 pointer-events-none" />

                          {/* Editable Cell */}
                          <input
                            type="text"
                            maxLength={2}
                            value={val}
                            onChange={(e) => handleCellChange(colIdx, strIdx, e.target.value)}
                            onFocus={() => onSelectColumn(colIdx)}
                            placeholder="—"
                            className={`w-8 h-6 text-center font-mono text-xs font-bold rounded z-10 transition-colors ${
                              val !== ''
                                ? 'bg-stone-900 text-stone-50 border border-stone-900'
                                : 'bg-white/80 text-stone-400 border border-stone-300 focus:bg-white focus:text-stone-900'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Column Bottom Actions */}
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
                </div>
              );
            })}

            {/* Quick Add Column Button at end of grid */}
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
          </div>
        </div>
      </div>
    </div>
  );
}
