import React from 'react';
import { getDatabase } from '@/app/db/client';
import { tunings, positions, motifs } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import PrimaryPositionDiamond from '@/app/components/PrimaryPositionDiamond';
import FretboardEditor from '@/app/components/FretboardEditor';
import { notFound } from 'next/navigation';

export default async function PrintTuningPage({ params }: { params: { id: string } }) {
  const { db } = getDatabase();

  const [tuning] = await db.select().from(tunings).where(eq(tunings.id, params.id));
  if (!tuning) notFound();

  const linkedPositions = await db.select().from(positions).where(eq(positions.tuningId, tuning.id));
  const linkedMotifs = await db.select().from(motifs).where(eq(motifs.tuningId, tuning.id));

  const pitches: string[] = JSON.parse(tuning.pitches);
  const stringCount = tuning.stringCount;

  return (
    <div className="bg-white min-h-screen text-black font-sans p-4 sm:p-8">
      {/* Onscreen action bar */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-4 bg-paper-100 border border-stone-300 rounded flex items-center justify-between font-mono text-xs">
        <div>
          <span className="font-bold text-stone-900 block">US LETTER TUNING RECORD PREVIEW</span>
          <span className="text-stone-500">8.5" × 11" Portrait • 0.5" live margins</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
          className="px-4 py-2 bg-stone-900 text-stone-50 font-bold rounded shadow hover:bg-stone-800"
        >
          PRINT RECORD (PDF)
        </button>
      </div>

      {/* Printable Master Page */}
      <div className="max-w-[8in] mx-auto border technical-rule p-8 space-y-6 font-mono text-xs">
        {/* Header */}
        <div className="border-b-2 technical-rule pb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-stone-600 uppercase">
              BxB Music Notebook • Tuning Record
            </div>
            <h1 className="font-serif font-bold text-2xl text-black mt-1">
              {tuning.name}
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-block border-2 technical-rule font-bold px-2 py-0.5 text-sm">
              {tuning.humanId}
            </span>
            <div className="text-[10px] text-stone-600 mt-1 uppercase">
              {tuning.stringCount} STRINGS
            </div>
          </div>
        </div>

        {/* Pitch assignments & Tonal Center */}
        <div className="border technical-rule p-4 grid grid-cols-2 gap-4">
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">
              OPEN-STRING PITCHES (EXACT OCTAVE)
            </span>
            <span className="font-bold text-base tracking-widest font-mono">
              {pitches.join('   ')}
            </span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">
              TONAL CENTER / HOME
            </span>
            <span className="font-bold text-base">{tuning.tonalCenter || 'Unassigned'}</span>
          </div>
        </div>

        {/* Fretboard Taxonomy */}
        <div className="space-y-2">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            FRETBOARD TAXONOMY
          </span>
          <FretboardEditor
            stringCount={stringCount}
            pitches={pitches}
            maxFret={15}
          />
        </div>

        {/* Primary Positions in this Tuning */}
        <div className="space-y-2">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            PRIMARY POSITIONS IN {tuning.humanId}
          </span>
          {linkedPositions.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 py-2 border technical-rule p-3">
              {linkedPositions.map((pos) => {
                const frets = pos.frets ? JSON.parse(pos.frets) : [];
                const fingers = pos.fingers ? JSON.parse(pos.fingers) : [];
                return (
                  <PrimaryPositionDiamond
                    key={pos.id}
                    humanId={pos.humanId}
                    name={pos.name}
                    stringCount={stringCount}
                    baseFret={pos.baseFret}
                    frets={frets}
                    fingers={fingers}
                    compact
                  />
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed technical-rule p-6 text-center text-stone-400 italic">
              [ Reserved for Primary Position diagrams ]
            </div>
          )}
        </div>

        {/* Practical Notes & Discoveries */}
        <div className="border-t technical-rule pt-3 space-y-2">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            PRACTICAL NOTES & HARMONIC TERRITORY
          </span>
          <p className="font-sans text-xs italic text-stone-800 leading-relaxed">
            {tuning.notes || 'No tuning notes recorded yet.'}
          </p>
        </div>

        {/* Footer */}
        <div className="border-t technical-rule pt-2 flex items-center justify-between text-[9px] text-stone-500">
          <span>BxB Music Notebook Archive Master</span>
          <span>Printed from local-first record</span>
        </div>
      </div>
    </div>
  );
}
