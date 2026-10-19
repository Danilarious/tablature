import React from 'react';
import { getStandardTabRows } from '@/app/lib/music/string-order';
import type { TabColumn, TabBarline } from './TabGrid';

interface PrintableTablatureProps {
  stringCount: number;
  pitches: string[];
  columns: TabColumn[];
  columnsPerSystem?: number;
}

function groups<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function boundaryStyle(barline: TabBarline | null | undefined): React.CSSProperties {
  if (barline === 'final') return { borderRight: '6px double #111827' };
  if (barline === 'double') return { borderRight: '4px double #1f2937' };
  if (barline === 'single') return { borderRight: '2px solid #1f2937' };
  return { borderRight: '1px solid #e7e5e4' };
}

export function restGlyph(duration: string | null | undefined): string {
  switch (duration) {
    case '1':
    case 'whole':
      return '𝄻';
    case '1/2':
    case 'half':
      return '𝄼';
    case '1/4':
    case 'quarter':
      return '𝄽';
    case '1/8':
    case 'eighth':
      return '𝄾';
    case '1/16':
    case 'sixteenth':
      return '𝄿';
    case 'dotted 1/4':
    case 'dotted-quarter':
      return '𝄽·';
    case 'triplet 1/8':
    case 'triplet-eighth':
      return '𝄾₃';
    default:
      return 'R';
  }
}

export default function PrintableTablature({
  stringCount,
  pitches,
  columns,
  columnsPerSystem = 12,
}: PrintableTablatureProps) {
  const rows = getStandardTabRows(stringCount, pitches);
  const systems = groups(columns, columnsPerSystem);

  return (
    <div className="space-y-5 print:space-y-4">
      {systems.map((system, systemIndex) => (
        <div key={systemIndex} className="break-inside-avoid">
          <div className="flex border border-stone-400 bg-white">
            <div className="w-20 shrink-0 border-r-2 border-stone-800">
              <div className="h-6 px-1 flex items-center font-mono text-[8px] text-stone-500 border-b border-stone-300">
                {systemIndex === 0 ? 'EVENT' : 'CONT.'}
              </div>
              {rows.map((row) => (
                <div key={row.index} className="h-7 px-1 flex items-center justify-between font-mono text-[9px] border-b border-stone-200 last:border-b-0">
                  <span className="font-bold">{row.pitch ?? '?'}</span>
                  <span className="text-stone-400">S{row.stringNumber}</span>
                </div>
              ))}
              <div className="h-5" />
            </div>

            <div className="flex-1 flex min-w-0">
              {system.map((column, columnIndex) => {
                const absoluteIndex = systemIndex * columnsPerSystem + columnIndex;
                const caption = [
                  column.kind === 'grace' ? 'grace' : null,
                  column.duration,
                  column.technique,
                  column.rest ? 'rest' : null,
                ].filter(Boolean).join(' ') || String(absoluteIndex + 1);

                return (
                  <div
                    key={column.id || absoluteIndex}
                    className="flex-1 min-w-0"
                    style={boundaryStyle(column.barlineAfter)}
                  >
                    <div className="h-6 px-0.5 flex items-center justify-center font-mono text-[8px] text-stone-600 border-b border-stone-300 truncate">
                      {caption}
                    </div>
                    {rows.map((row) => {
                      const note = column.notes.find((candidate) => candidate.stringIndex === row.index);
                      return (
                        <div key={row.index} className="h-7 relative flex items-center justify-center border-b border-stone-200 last:border-b-0">
                          <div className="absolute inset-x-0 h-px bg-stone-500" />
                          {column.rest && row.index === rows[Math.floor(rows.length / 2)]?.index ? (
                            <span className="relative bg-white px-1 text-stone-700 font-serif text-sm">{restGlyph(column.duration)}</span>
                          ) : note ? (
                            <span className={`relative bg-white px-1 font-mono font-bold ${column.kind === 'grace' ? 'text-[8px] -translate-y-1' : 'text-[11px]'}`}>
                              {note.fret}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="h-5 flex items-center justify-center font-mono text-[8px] text-stone-400">
                      {absoluteIndex + 1}
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, columnsPerSystem - system.length) }).map((_, emptyIndex) => (
                <div key={`empty-${emptyIndex}`} className="flex-1 min-w-0 border-r border-stone-200">
                  <div className="h-6 border-b border-stone-300" />
                  {rows.map((row) => (
                    <div key={row.index} className="h-7 relative border-b border-stone-200 last:border-b-0">
                      <div className="absolute inset-x-0 top-1/2 h-px bg-stone-300" />
                    </div>
                  ))}
                  <div className="h-5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
