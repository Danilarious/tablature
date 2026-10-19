'use client';

import React from 'react';
import { calculateSoundingPitch } from '@/app/lib/music/pitch';
import { getStandardTabRows, neckFretFromTabFret, tabFretFromNeckFret } from '@/app/lib/music/string-order';

export type FretboardMode = 'map' | 'tab';
export interface FretboardNote {
  stringIndex: number;
  fret: number;
}

export interface FretboardEditorProps {
  stringCount: number;
  pitches: string[];
  capoFrets?: (number | null)[];
  mode?: FretboardMode;
  onModeChange?: (mode: FretboardMode) => void;
  activeNotes?: { stringIndex: number; fret: number | string }[];
  mapNotes?: FretboardNote[];
  onNoteClick?: (stringIndex: number, fret: number) => void;
  onMapNoteClick?: (stringIndex: number, fret: number) => void;
  maxFret?: number;
  readOnly?: boolean;
}

const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

export function mappedFretboardExtent(
  notes: FretboardNote[],
  capoFrets: (number | null)[] = [],
  minimum = 15
): number {
  return notes.reduce((highest, note) => {
    const physicalFret = neckFretFromTabFret(note.fret, capoFrets[note.stringIndex] ?? null);
    return Math.max(highest, physicalFret);
  }, minimum);
}

export default function FretboardEditor({
  stringCount,
  pitches,
  capoFrets = [],
  mode = 'tab',
  onModeChange,
  activeNotes = [],
  mapNotes = [],
  onNoteClick,
  onMapNoteClick,
  maxFret = 15,
  readOnly = false,
}: FretboardEditorProps) {
  const safePitches = pitches.length >= stringCount
    ? pitches.slice(0, stringCount)
    : [...pitches, ...Array(stringCount - pitches.length).fill('?')];
  const rows = getStandardTabRows(stringCount, safePitches);

  const isSelected = (stringIndex: number, tabFret: number, capoFret: number | null) => {
    const notes = mode === 'map' ? mapNotes : activeNotes;
    const match = notes.some((note) => note.stringIndex === stringIndex && note.fret === tabFret);
    if (!match) return false;
    return neckFretFromTabFret(tabFret, capoFret) >= 0;
  };

  const clickNote = (stringIndex: number, tabFret: number) => {
    if (readOnly) return;
    if (mode === 'map') onMapNoteClick?.(stringIndex, tabFret);
    else onNoteClick?.(stringIndex, tabFret);
  };

  return (
    <div className="w-full bg-paper-100 border border-stone-300 rounded overflow-hidden select-none">
      <div className="px-3 py-2 bg-stone-900 text-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider uppercase">FRETBOARD MAP</span>
            <span className="text-stone-400">({stringCount}-STRING SYSTEM)</span>
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            {mode === 'map'
              ? 'Mark every position that belongs to this idea, shape, scale, or tonal area.'
              : 'Enter one note per string into the active TAB event.'}
          </div>
        </div>
        {!readOnly && onModeChange && (
          <div className="flex rounded border border-stone-600 overflow-hidden">
            <button
              type="button"
              onClick={() => onModeChange('map')}
              className={`px-2.5 py-1 ${mode === 'map' ? 'bg-editorial-amber text-stone-950 font-bold' : 'bg-stone-800 text-stone-300'}`}
            >
              MAP
            </button>
            <button
              type="button"
              onClick={() => onModeChange('tab')}
              className={`px-2.5 py-1 ${mode === 'tab' ? 'bg-editorial-amber text-stone-950 font-bold' : 'bg-stone-800 text-stone-300'}`}
            >
              TAB ENTRY
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto p-4 bg-paper-50">
        <div className="min-w-[700px] flex flex-col">
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

          <div className="relative py-2 space-y-3">
            {rows.map(({ index: strIdx, stringNumber }, displayRow) => {
              const openPitch = safePitches[strIdx] || 'E2';
              const capoFret = capoFrets[strIdx] ?? null;
              const openSounding = calculateSoundingPitch(openPitch, capoFret, 0);
              const openSelected = isSelected(strIdx, 0, capoFret);

              return (
                <div key={strIdx} className="flex items-center group/str" data-row-string-index={strIdx}>
                  <div className="w-20 pr-3 flex items-center justify-between font-mono text-xs">
                    <span className="text-stone-500 font-semibold">#{stringNumber}</span>
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-stone-900">{openPitch}</span>
                      {capoFret !== null && capoFret > 0 && (
                        <span className="text-[10px] text-editorial-amber">Capo {capoFret} ({openSounding})</span>
                      )}
                    </div>
                  </div>

                  <div className="w-10 flex justify-center">
                    <button
                      type="button"
                      onClick={() => clickNote(strIdx, 0)}
                      disabled={readOnly}
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs transition-colors border ${
                        openSelected
                          ? 'bg-stone-900 text-stone-100 border-stone-900 font-bold shadow'
                          : readOnly
                            ? 'opacity-0 border-transparent'
                            : 'bg-white text-stone-700 border-stone-300 hover:border-stone-800'
                      }`}
                      title={`String ${stringNumber} ${capoFret && capoFret > 0 ? 'at capo (TAB 0)' : 'open'}: ${openSounding}`}
                    >
                      0
                    </button>
                  </div>

                  <div className="flex-1 flex relative items-center">
                    <div
                      className="absolute inset-x-0 h-px bg-stone-400 z-0"
                      style={{ height: `${1 + (stringCount - 1 - displayRow) * 0.4}px` }}
                    />

                    {Array.from({ length: maxFret }, (_, i) => i + 1).map((neckFret) => {
                      const sounding = calculateSoundingPitch(openPitch, 0, neckFret);
                      const tabFret = tabFretFromNeckFret(neckFret, capoFret);
                      const capoHere = capoFret === neckFret;
                      const selected = tabFret !== null && tabFret > 0 && isSelected(strIdx, tabFret, capoFret);

                      return (
                        <div
                          key={neckFret}
                          className="flex-1 h-8 border-r border-stone-300 flex items-center justify-center relative z-10 group/fret"
                        >
                          {capoHere && (
                            <div
                              className="absolute inset-y-0 -left-1 w-2 bg-amber-600/30 border-l-2 border-amber-600 z-20 pointer-events-none"
                              title={`Capo on String ${stringNumber} at Fret ${neckFret}`}
                            />
                          )}
                          {tabFret !== null && (
                            <button
                              type="button"
                              onClick={() => clickNote(strIdx, tabFret)}
                              disabled={readOnly}
                              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] transition-all ${
                                selected
                                  ? 'bg-stone-950 text-stone-100 font-bold scale-110 shadow ring-2 ring-stone-900'
                                  : readOnly
                                    ? 'opacity-0'
                                    : 'opacity-0 group-hover/fret:opacity-100 bg-stone-200 text-stone-900 hover:bg-stone-900 hover:text-white'
                              }`}
                              title={`String ${stringNumber}, neck fret ${neckFret}${tabFret !== neckFret ? ` = TAB ${tabFret} above capo` : ''} (${sounding})`}
                              data-tab-fret={tabFret}
                            >
                              {tabFret}
                            </button>
                          )}
                          {!readOnly && (
                            <div className="absolute -top-5 hidden group-hover/fret:block bg-stone-900 text-stone-100 text-[9px] font-mono px-1 py-0.5 rounded pointer-events-none z-30">
                              {sounding}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex pl-20 pt-2 border-t border-stone-300 text-[10px] font-mono text-stone-500">
            <div className="w-10" />
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
