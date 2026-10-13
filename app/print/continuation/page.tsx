'use client';

import React, { useState } from 'react';
import TabGrid from '@/app/components/TabGrid';

export default function ContinuationPrintPage() {
  const [stringCount, setStringCount] = useState<number>(6);
  const [title, setTitle] = useState('');
  const [compId, setCompId] = useState('C-');
  const [pageNumber, setPageNumber] = useState('2');

  const defaultPitches = stringCount === 7
    ? ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4']
    : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

  const emptyColumns = Array.from({ length: 12 }, (_, i) => ({
    id: `col-${i}`,
    notes: [],
  }));

  return (
    <div className="bg-white min-h-screen text-black font-sans p-4 sm:p-8">
      {/* Onscreen config bar */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-4 bg-paper-100 border border-stone-300 rounded flex flex-wrap items-center justify-between font-mono text-xs gap-3">
        <div className="flex items-center gap-3">
          <label className="font-bold">STRING COUNT:</label>
          <select
            value={stringCount}
            onChange={(e) => setStringCount(parseInt(e.target.value, 10))}
            className="border border-stone-300 rounded px-2 py-1 bg-white"
          >
            <option value={6}>6 Strings</option>
            <option value={7}>7 Strings</option>
            <option value={5}>5 Strings</option>
          </select>

          <label className="font-bold ml-2">C-###:</label>
          <input
            type="text"
            value={compId}
            onChange={(e) => setCompId(e.target.value)}
            className="w-20 border border-stone-300 rounded px-1.5 py-1 bg-white"
          />

          <label className="font-bold ml-2">PAGE:</label>
          <input
            type="text"
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            className="w-12 border border-stone-300 rounded px-1.5 py-1 bg-white text-center"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
          className="px-4 py-2 bg-stone-900 text-stone-50 font-bold rounded shadow hover:bg-stone-800"
        >
          PRINT CONTINUATION SHEET
        </button>
      </div>

      {/* US Letter Portrait Page Master */}
      <div className="max-w-[8in] mx-auto border technical-rule p-8 space-y-6 font-mono text-xs">
        {/* Header */}
        <div className="border-b-2 technical-rule pb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-stone-600 uppercase">
              BxB Music Notebook • {stringCount}-String Tablature Continuation Sheet
            </div>
            <h1 className="font-serif font-bold text-xl text-black mt-1">
              {title || 'Composition Continuation & Notation'}
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-block border-2 technical-rule font-bold px-2 py-0.5 text-xs">
              {compId}
            </span>
            <div className="text-[10px] text-stone-600 mt-1 uppercase">
              PAGE {pageNumber}
            </div>
          </div>
        </div>

        {/* 4 Blank/Continuation TAB Staves with ample handwriting clearance */}
        {Array.from({ length: 4 }).map((_, staffIdx) => (
          <div key={staffIdx} className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-stone-500 pb-0.5 border-b technical-rule">
              <span>SYSTEM {staffIdx + 1}</span>
              <span>SECTION / PHRASE: ____________________</span>
            </div>
            <TabGrid
              stringCount={stringCount}
              pitches={defaultPitches}
              columns={emptyColumns}
              activeColumnIndex={-1}
              onSelectColumn={() => {}}
              onUpdateColumn={() => {}}
              onAddColumn={() => {}}
              onDeleteColumn={() => {}}
            />
          </div>
        ))}

        {/* Bottom Notes Zone */}
        <div className="border-t technical-rule pt-3">
          <span className="text-[9px] text-stone-500 uppercase tracking-wider block mb-1">
            SYSTEM ANNOTATIONS & PERFORMANCE TOUCH
          </span>
          <div className="border technical-rule min-h-[45px] p-2 text-stone-400 italic text-[11px]">
            [ Space for handwritten dynamics, capo adjustments, or phrase connections ]
          </div>
        </div>

        {/* Footer */}
        <div className="border-t technical-rule pt-2 flex items-center justify-between text-[9px] text-stone-500">
          <span>BxB Music Notebook Continuation Worksheet</span>
          <span>US Letter 8.5" × 11" Portrait</span>
        </div>
      </div>
    </div>
  );
}
