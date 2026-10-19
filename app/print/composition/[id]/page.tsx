import React from 'react';
import { getDatabase } from '@/app/db/client';
import {
  compositions,
  compositionMotifs,
  compositionPositions,
  compositionSetups,
  motifs,
  positions,
  setups,
  instruments,
  tunings,
} from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import PrimaryPositionDiamond from '@/app/components/PrimaryPositionDiamond';
import PrintableTablature from '@/app/components/PrintableTablature';
import PrintButton from '@/app/components/PrintButton';
import { notFound } from 'next/navigation';

export default async function PrintCompositionPage({ params }: { params: { id: string } }) {
  const { db } = getDatabase();

  const [comp] = await db.select().from(compositions).where(eq(compositions.id, params.id));
  if (!comp) notFound();

  // Fetch linked motifs, positions, and setups
  const compMots = await db.select().from(compositionMotifs).where(eq(compositionMotifs.compositionId, comp.id));
  const compPos = await db.select().from(compositionPositions).where(eq(compositionPositions.compositionId, comp.id));
  const compSets = await db.select().from(compositionSetups).where(eq(compositionSetups.compositionId, comp.id));

  const allMotifs = await db.select().from(motifs);
  const allPositions = await db.select().from(positions);
  const allSetups = await db.select().from(setups);
  const allInstruments = await db.select().from(instruments);
  const allTunings = await db.select().from(tunings);

  const motifMap = new Map<string, any>(allMotifs.map(m => [m.id, m]));
  const posMap = new Map<string, any>(allPositions.map(p => [p.id, p]));
  const setupMap = new Map<string, any>(allSetups.map(s => [s.id, s]));
  const instMap = new Map<string, any>(allInstruments.map(i => [i.id, i]));
  const tunMap = new Map<string, any>(allTunings.map(t => [t.id, t]));

  const linkedMotifRecords = compMots.map(cm => motifMap.get(cm.motifId)).filter(Boolean);
  const linkedPosRecords = compPos.map(cp => posMap.get(cp.positionId)).filter(Boolean);
  const firstSetup = compSets[0] ? setupMap.get(compSets[0].setupId) : null;
  const instrument = firstSetup ? instMap.get(firstSetup.instrumentId!) : null;
  const tuning = firstSetup ? tunMap.get(firstSetup.tuningId!) : null;

  const stringCount = instrument?.stringCount || tuning?.stringCount || 6;
  const pitches = tuning?.pitches ? JSON.parse(tuning.pitches) : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

  return (
    <div className="bg-white min-h-screen text-black font-sans p-4 sm:p-8">
      {/* Onscreen action bar (hidden in print) */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-4 bg-paper-100 border border-stone-300 rounded flex items-center justify-between font-mono text-xs">
        <div>
          <span className="font-bold text-stone-900 block">US LETTER PRINT PREVIEW</span>
          <span className="text-stone-500">8.5" × 11" Portrait • 0.5" live margins</span>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
        </div>
      </div>

      {/* Printable Master Page */}
      <div className="max-w-[8in] mx-auto border technical-rule p-8 space-y-6 font-mono text-xs">
        {/* Top Header */}
        <div className="border-b-2 technical-rule pb-3 flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-widest text-stone-600 uppercase">
              BxB Music Notebook • Composition Record
            </div>
            <h1 className="font-serif font-bold text-2xl text-black mt-1">
              {comp.title}
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-block border-2 technical-rule font-bold px-2 py-0.5 text-sm">
              {comp.humanId}
            </span>
            <div className="text-[10px] text-stone-600 mt-1 uppercase">
              STATUS: {comp.status}
            </div>
          </div>
        </div>

        {/* Setup Block */}
        <div className="border technical-rule p-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px]">
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">INSTRUMENT</span>
            <span className="font-bold">{instrument?.name || 'Primary Guitar'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">TUNING</span>
            <span className="font-bold">{tuning ? `${tuning.humanId} (${tuning.name})` : 'Standard'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">TONAL CENTER / HOME</span>
            <span className="font-bold">{comp.tonalCenter || '—'}</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[9px] uppercase font-bold">TEMPO & FEEL</span>
            <span className="font-bold">{comp.tempo ? `${comp.tempo} BPM` : 'Rubato'}</span>
          </div>
        </div>

        {/* Primary Positions Block */}
        <div className="space-y-2">
          <div className="border-b technical-rule pb-1 flex items-center justify-between">
            <span className="font-bold tracking-wider uppercase text-[11px]">
              PRIMARY POSITIONS
            </span>
            <span className="text-[10px] text-stone-500">VOICING & FINGERBOARD ARCHETYPES</span>
          </div>

          {linkedPosRecords.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 py-2">
              {linkedPosRecords.slice(0, 6).map((pos: any) => {
                const frets = pos.frets ? JSON.parse(pos.frets) : [];
                const fingers = pos.fingers ? JSON.parse(pos.fingers) : [];
                return (
                  <PrimaryPositionDiamond
                    key={pos.id}
                    humanId={pos.humanId}
                    name={pos.name}
                    stringCount={pos.stringCount || stringCount}
                    baseFret={pos.baseFret}
                    frets={frets}
                    fingers={fingers}
                    compact
                  />
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed technical-rule p-4 text-center text-stone-500 italic text-[11px]">
              No Primary Positions linked to this composition record.
            </div>
          )}
        </div>

        {/* Piece Map Freeform Zone */}
        <div className="space-y-1">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            PIECE MAP (STRUCTURE)
          </span>
          <div className="border technical-rule p-3 min-h-[60px] text-xs font-mono font-medium">
            {comp.pieceMap || 'Intro -> Section A -> Development -> Outro'}
          </div>
        </div>

        {/* Core Motifs Transcriptions */}
        <div className="space-y-4">
          <span className="font-bold tracking-wider uppercase text-[10px] text-stone-600 block">
            CORE MOTIF TRANSCRIPTIONS
          </span>

          {linkedMotifRecords.length > 0 ? (
            linkedMotifRecords.map((m: any) => {
              const tabCols = m.tabData ? JSON.parse(m.tabData) : [];
              const motifSetup = m.setupId ? setupMap.get(m.setupId) : null;
              const motifInstrument = (m.instrumentId ? instMap.get(m.instrumentId) : null)
                || (motifSetup?.instrumentId ? instMap.get(motifSetup.instrumentId) : null)
                || instrument;
              const motifTuning = (m.tuningId ? tunMap.get(m.tuningId) : null)
                || (motifSetup?.tuningId ? tunMap.get(motifSetup.tuningId) : null)
                || tuning;
              const motifStringCount = motifInstrument?.stringCount || motifTuning?.stringCount || stringCount;
              const motifPitches = motifTuning?.pitches
                ? JSON.parse(motifTuning.pitches)
                : Array(motifStringCount).fill('?');
              return (
                <div key={m.id} className="border technical-rule p-3 space-y-2">
                  <div className="flex items-center justify-between border-b technical-rule pb-1 gap-3">
                    <span className="font-bold">{m.humanId} — {m.name}</span>
                    <span className="text-[10px] uppercase text-stone-600 text-right">
                      {m.function} · {motifInstrument?.name || `${motifStringCount}-string`} · {motifTuning?.name || 'Unknown tuning'}
                    </span>
                  </div>
                  <PrintableTablature
                    stringCount={motifStringCount}
                    pitches={motifPitches}
                    columns={tabCols}
                  />
                </div>
              );
            })
          ) : (
            <div className="border technical-rule p-8 text-center text-stone-400 italic">
              [ TAB continuation staff space reserved for handwritten transcription ]
            </div>
          )}
        </div>

        {/* General Notes */}
        {comp.notes && (
          <div className="border-t technical-rule pt-2 space-y-1">
            <span className="font-bold text-[10px] uppercase text-stone-600 block">NOTES</span>
            <p className="font-sans text-xs italic text-stone-800">
              "{comp.notes}"
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
