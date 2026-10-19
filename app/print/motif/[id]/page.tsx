import React from 'react';
import { getDatabase } from '@/app/db/client';
import { motifs, setups, tunings, instruments, capoConfigurations } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import PrintableTablature from '@/app/components/PrintableTablature';
import FretboardEditor from '@/app/components/FretboardEditor';
import { mappedFretboardExtent } from '@/app/lib/music/string-order';
import PrintButton from '@/app/components/PrintButton';
import { notFound } from 'next/navigation';

export default async function PrintMotifPage({ params }: { params: { id: string } }) {
  const { db } = getDatabase();

  const [motif] = await db.select().from(motifs).where(eq(motifs.id, params.id));
  if (!motif) notFound();

  const [setup] = motif.setupId
    ? await db.select().from(setups).where(eq(setups.id, motif.setupId))
    : [null];

  const resolvedTuningId = motif.tuningId || setup?.tuningId;
  const [tuning] = resolvedTuningId
    ? await db.select().from(tunings).where(eq(tunings.id, resolvedTuningId))
    : [null];

  const resolvedInstrumentId = motif.instrumentId || setup?.instrumentId;
  const [instrument] = resolvedInstrumentId
    ? await db.select().from(instruments).where(eq(instruments.id, resolvedInstrumentId))
    : [null];

  const [capo] = setup?.capoConfigId
    ? await db.select().from(capoConfigurations).where(eq(capoConfigurations.id, setup.capoConfigId))
    : [null];

  const stringCount = instrument?.stringCount || tuning?.stringCount || 6;
  const pitches: string[] = tuning?.pitches ? JSON.parse(tuning.pitches) : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  const tabCols = motif.tabData ? JSON.parse(motif.tabData) : [];
  const fretboardMap = motif.fretboardMap ? JSON.parse(motif.fretboardMap) : [];
  const variations = motif.variations ? JSON.parse(motif.variations) : [];
  const capoFrets = capo?.stringFrets ? JSON.parse(capo.stringFrets) : [];
  const printFretboardExtent = mappedFretboardExtent(fretboardMap, capoFrets);

  return (
    <div className="bg-white min-h-screen text-black font-sans p-4 sm:p-8">
      {/* Onscreen bar */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-4 bg-paper-100 border border-stone-300 rounded flex items-center justify-between font-mono text-xs">
        <div>
          <span className="font-bold text-stone-900 block">US LETTER MOTIF RECORD PREVIEW</span>
          <span className="text-stone-500">8.5" × 11" Portrait • 0.5" live margins</span>
        </div>
        <PrintButton label="PRINT MOTIF (PDF)" />
      </div>

      {/* Printable Master Page */}
      <div className="max-w-[8in] mx-auto border technical-rule p-8 space-y-6 font-mono text-xs">
        {/* Header */}
        <div className="border-b-2 technical-rule pb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-stone-600 uppercase">
              BxB Music Notebook • Motif Record
            </div>
            <h1 className="font-serif font-bold text-2xl text-black mt-1">
              {motif.name}
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-block border-2 technical-rule font-bold px-2 py-0.5 text-sm">
              {motif.humanId}
            </span>
            <div className="text-[10px] text-stone-600 mt-1 uppercase">
              FUNCTION: {motif.function || 'RIFF'}
            </div>
          </div>
        </div>

        {/* Setup Context */}
        <div className="border technical-rule p-3 grid grid-cols-2 sm:grid-cols-5 gap-4 text-[11px]">
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">INSTRUMENT</span>
            <span className="font-bold">{instrument?.name || 'Primary Instrument'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">TUNING</span>
            <span className="font-bold">{tuning ? `${tuning.humanId} (${tuning.name})` : 'Standard'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">PHYSICAL SETUP</span>
            <span className="font-bold">{setup?.name || 'Standard Setup'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">METER</span>
            <span className="font-bold">{motif.timeSignature && motif.timeSignature !== 'free' ? motif.timeSignature : 'Free'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">TEMPO</span>
            <span className="font-bold">{motif.tempo ? `${motif.tempo} BPM` : 'Unspecified'}</span>
          </div>
        </div>

        {/* Primary Transcription Staff */}
        <div className="space-y-2">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            PRIMARY TRANSCRIPTION
          </span>
          <div className="border technical-rule p-3">
            <PrintableTablature
              stringCount={stringCount}
              pitches={pitches}
              columns={tabCols}
            />
          </div>
        </div>

        {fretboardMap.length > 0 && (
          <div className="space-y-2 break-inside-avoid">
            <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
              FRETBOARD MAP / TONAL AREA
            </span>
            <FretboardEditor
              stringCount={stringCount}
              pitches={pitches}
              capoFrets={capoFrets}
              mode="map"
              mapNotes={fretboardMap}
              maxFret={printFretboardExtent}
              readOnly
            />
          </div>
        )}

        {/* Optional Variations Staff */}
        <div className="space-y-2">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            VARIATION / ALTERNATE PHRASING
          </span>
          {variations.length > 0 ? (
            variations.map((v: any, vIdx: number) => (
              <div key={vIdx} className="border technical-rule p-3 space-y-1">
                <span className="font-bold text-[10px] block">{v.name || `Variation ${vIdx + 1}`}</span>
                <PrintableTablature
                  stringCount={stringCount}
                  pitches={pitches}
                  columns={v.tabData || []}
                />
              </div>
            ))
          ) : (
            <div className="border border-dashed technical-rule p-6 text-center text-stone-400 italic">
              [ Blank staff continuation space for variations ]
            </div>
          )}
        </div>

        {/* Performance Notes */}
        {motif.notes && (
          <div className="border-t technical-rule pt-2 space-y-1">
            <span className="font-bold text-[10px] uppercase text-stone-600 block">NOTES & TOUCH</span>
            <p className="font-sans text-xs italic text-stone-800">
              "{motif.notes}"
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t technical-rule pt-2 flex items-center justify-between text-[9px] text-stone-500">
          <span>BxB Music Notebook Archive Master</span>
          <span>Printed from local-first record</span>
        </div>
      </div>
    </div>
  );
}
