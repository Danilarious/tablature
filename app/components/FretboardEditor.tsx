'use client';

import React from 'react';
import { calculateSoundingPitch } from '@/app/lib/music/pitch';
import { getStandardTabRows, neckFretFromTabFret, tabFretFromNeckFret } from '@/app/lib/music/string-order';

export interface FretboardEditorProps {
  stringCount: number; // 5, 6, 7
  pitches: string[]; // Open string pitches e.g. ["D2", "A2", "D3", "G3", "A3", "D4"]
  capoFrets?: (number | null)[]; // e.g. [null, 2, 2, 2, null, null]
  activeNotes?: { stringIndex: number; fret: number | string }[]; // Notes currently in active column
  onNoteClick?: (stringIndex: number, fret: number) => void;
  maxFret?: number; // default 15
}

const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

export default function FretboardEditor({
  stringCount,
  pitches,
  capoFrets = [],
  activeNotes = [],
  onNoteClick,
  maxFret = 15,
}: FretboardEditorProps) {
  // Defensive validation: ensure string count matches pitches length
  const safePitches = pitches.length >= stringCount
    ? pitches.slice(0, stringCount)
    : [...pitches, ...Array(stringCount - pitches.length).fill('?')];

  // Canonical order: index 0 = bass-side string. Display treble-side string (String 1) on top,
  // using the same row helper as TabGrid so a click and a TAB cell share one canonical index.
  const rows = getStandardTabRows(stringCount, safePitches);

  return (
    <div className="w-full bg-paper-100 border border-stone-300 rounded overflow-hidden select-none">
      {/* Header bar */}
      <div className="px-3 py-2 bg-stone-900 text-stone-100 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wider uppercase">FRETBOARD TAXONOMY</span>
          <span className="text-stone-400">({stringCount}-STRING SYSTEM)</span>
        </div>
        <div className="text-[11px] text-stone-400">
          Click string & fret to enter TAB
        </div>
      </div>

      {/* Interactive Fretboard Area */}
      <div className="overflow-x-auto p-4 bg-paper-50">
        <div className="min-w-[700px] flex flex-col">
          {/* Fret Number Markers */}
          <div className="flex pl-20 border-b border-stone-300 pb-1 text-[11px] font-mono text-stone-600">
            <div className="w-10 text-center font-bold text-stone-900">0</div>
            {Array.from({ length: maxFret }, (_, i) => i + 1).map((fret) => (
              <div
                key={fret}
                className={`flex-1 text-center font-mono ${
                  INLAY_FRETS.includes(fret) ? 'font-bold text-stone-950' : 'text-stone-400'
                }`}
              >
                {fret}
              </div>
            ))}
          </div>

          {/* Strings and Frets Grid */}
          <div className="relative py-2 space-y-3">
            {rows.map(({ index: strIdx, stringNumber }, displayRow) => {
              const openPitch = safePitches[strIdx] || 'E2';
              const capoFret = capoFrets[strIdx] ?? null;
              const openSounding = calculateSoundingPitch(openPitch, capoFret, 0);

              // Find active note on this string if any (TAB frets are capo-relative)
              const activeNote = activeNotes.find(n => n.stringIndex === strIdx);
              const activeFret = activeNote && typeof activeNote.fret === 'number' ? activeNote.fret : null;
              const activeNeckFret = activeFret !== null ? neckFretFromTabFret(activeFret, capoFret) : null;

              return (
                <div key={strIdx} className="flex items-center group/str" data-row-string-index={strIdx}>
                  {/* String Label Box */}
                  <div className="w-20 pr-3 flex items-center justify-between font-mono text-xs">
                    <span className="text-stone-500 font-semibold">
                      #{stringNumber}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-stone-900">{openPitch}</span>
                      {capoFret && capoFret > 0 && (
                        <span className="text-[10px] text-editorial-amber">
                          Capo {capoFret} ({openSounding})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nut / Open Fret (0) */}
                  <div className="w-10 flex justify-center">
                    <button
                      type="button"
                      onClick={() => onNoteClick?.(strIdx, 0)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs transition-colors border ${
                        activeFret === 0
                          ? 'bg-stone-900 text-stone-100 border-stone-900 font-bold shadow'
                          : 'bg-white text-stone-700 border-stone-300 hover:border-stone-800'
                      }`}
                      title={`String ${stringNumber} ${capoFret && capoFret > 0 ? `at capo (TAB 0)` : 'open'}: ${openSounding}`}
                    >
                      0
                    </button>
                  </div>

                  {/* Frets 1 to maxFret */}
                  <div className="flex-1 flex relative items-center">
                    {/* Underlying physical string wire */}
                    <div
                      className="absolute inset-x-0 h-px bg-stone-400 z-0"
                      style={{
                        height: `${1 + (stringCount - 1 - displayRow) * 0.4}px`,
                      }}
                    />

                    {Array.from({ length: maxFret }, (_, i) => i + 1).map((fret) => {
                      // `fret` here is the PHYSICAL neck fret; sounding = open + neck fret.
                      const sounding = calculateSoundingPitch(openPitch, 0, fret);
                      const tabFret = tabFretFromNeckFret(fret, capoFret);
                      const isCapoHere = capoFret === fret;
                      const isSelected = activeNeckFret !== null && activeFret !== 0 && activeNeckFret === fret;

                      return (
                        <div
                          key={fret}
                          className="flex-1 h-8 border-r border-stone-300 flex items-center justify-center relative z-10 group/fret"
                        >
                          {/* Capo Indicator */}
                          {isCapoHere && (
                            <div
                              className="absolute inset-y-0 -left-1 w-2 bg-amber-600/30 border-l-2 border-amber-600 z-20 pointer-events-none"
                              title={`Capo on String ${stringNumber} at Fret ${fret}`}
                            />
                          )}

                          {/* Interactive Note Button (records capo-relative TAB fret) */}
                          {tabFret !== null && (
                          <button
                            type="button"
                            onClick={() => onNoteClick?.(strIdx, tabFret)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] transition-all ${
                              isSelected
                                ? 'bg-stone-950 text-stone-100 font-bold scale-110 shadow ring-2 ring-stone-900'
                                : 'opacity-0 group-hover/fret:opacity-100 bg-stone-200 text-stone-900 hover:bg-stone-900 hover:text-white'
                            }`}
                            title={`String ${stringNumber}, neck fret ${fret}${tabFret !== fret ? ` = TAB ${tabFret} above capo` : ''} (${sounding})`}
                            data-tab-fret={tabFret}
                          >
                            {tabFret}
                          </button>
                          )}

                          {/* Sounding pitch tooltip on hover */}
                          <div className="absolute -top-5 hidden group-hover/fret:block bg-stone-900 text-stone-100 text-[9px] font-mono px-1 py-0.5 rounded pointer-events-none z-30">
                            {sounding}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fretboard Inlay Position Markers Legend */}
          <div className="flex pl-20 pt-2 border-t border-stone-300 text-[10px] font-mono text-stone-500">
            <div className="w-10"></div>
            {Array.from({ length: maxFret }, (_, i) => i + 1).map((fret) => (
              <div key={fret} className="flex-1 flex justify-center items-center">
                {fret === 12 ? (
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                  </div>
                ) : INLAY_FRETS.includes(fret) ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
