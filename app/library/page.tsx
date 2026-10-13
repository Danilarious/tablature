'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import PrimaryPositionDiamond from '@/app/components/PrimaryPositionDiamond';
import {
  Search,
  Filter,
  Music,
  Radio,
  Guitar,
  Sliders,
  FileText,
  Volume2,
  Printer,
  ExternalLink,
  Layers,
} from 'lucide-react';

export default function LibraryPage() {
  const [data, setData] = useState<any>({
    compositions: [],
    motifs: [],
    tunings: [],
    instruments: [],
    setups: [],
    positions: [],
    attachments: [],
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'compositions' | 'motifs' | 'tunings' | 'positions' | 'instruments'>('all');
  const [filterInstrumentId, setFilterInstrumentId] = useState<string>('');
  const [filterTuningId, setFilterTuningId] = useState<string>('');

  useEffect(() => {
    async function fetchLibrary() {
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('q', searchQuery);
        if (filterInstrumentId) params.set('instrumentId', filterInstrumentId);
        if (filterTuningId) params.set('tuningId', filterTuningId);

        const res = await fetch(`/api/library?${params.toString()}`);
        const result = await res.json();
        setData(result);
      } catch (err) {
        console.error('Failed to fetch library', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLibrary();
  }, [searchQuery, filterInstrumentId, filterTuningId]);

  const { compositions, motifs, tunings, instruments, setups, positions, attachments } = data;

  const tuningMap = new Map<string, any>(tunings.map((t: any) => [t.id, t]));
  const instrumentMap = new Map<string, any>(instruments.map((i: any) => [i.id, i]));
  const setupMap = new Map<string, any>(setups.map((s: any) => [s.id, s]));

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-200 gap-3">
        <div>
          <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
            LIBRARY & RELATIONSHIP ARCHIVE
          </h1>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            Structured cross-references between Instruments, Tunings, Setups, Positions, Motifs, and Compositions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/quick-capture"
            className="px-3 py-1.5 bg-stone-900 text-stone-50 font-mono text-xs font-bold rounded hover:bg-stone-800 transition-colors"
          >
            + NEW CAPTURE
          </Link>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-paper-100 border border-stone-300 rounded p-4 space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Text search */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search working titles, identifiers (C-001, M-001, T-001), tags, or notes..."
              className="w-full bg-white border border-stone-300 rounded pl-9 pr-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-800"
            />
          </div>

          {/* Filter by Instrument */}
          <div className="sm:w-56">
            <select
              value={filterInstrumentId}
              onChange={(e) => setFilterInstrumentId(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded px-2.5 py-2 text-xs text-stone-900"
            >
              <option value="">All Instruments</option>
              {instruments.map((inst: any) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Tuning */}
          <div className="sm:w-56">
            <select
              value={filterTuningId}
              onChange={(e) => setFilterTuningId(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded px-2.5 py-2 text-xs text-stone-900"
            >
              <option value="">All Tunings</option>
              {tunings.map((tun: any) => (
                <option key={tun.id} value={tun.id}>
                  {tun.humanId} — {tun.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-200">
          {[
            { id: 'all', label: `ALL (${compositions.length + motifs.length + tunings.length + positions.length})` },
            { id: 'compositions', label: `COMPOSITIONS (${compositions.length})`, icon: Music },
            { id: 'motifs', label: `MOTIFS (${motifs.length})`, icon: Layers },
            { id: 'tunings', label: `TUNINGS (${tunings.length})`, icon: Radio },
            { id: 'positions', label: `PRIMARY POSITIONS (${positions.length})`, icon: Sliders },
            { id: 'instruments', label: `INSTRUMENTS (${instruments.length})`, icon: Guitar },
          ].map((tab: any) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1 rounded text-[11px] font-mono tracking-wider transition-colors ${
                activeTab === tab.id
                  ? 'bg-stone-900 text-stone-50 font-bold'
                  : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Results Grid */}
      {loading ? (
        <div className="p-8 text-center font-mono text-sm text-stone-500">Loading library archive...</div>
      ) : (
        <div className="space-y-8">
          {/* 1. Compositions Section */}
          {(activeTab === 'all' || activeTab === 'compositions') && compositions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 font-mono text-xs">
                <span className="font-bold tracking-widest text-stone-900 uppercase">
                  COMPOSITIONS ({compositions.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {compositions.map((comp: any) => (
                  <div
                    key={comp.id}
                    className="border border-stone-300 bg-white p-4 rounded flex flex-col justify-between hover:border-stone-800 transition-colors shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                        <span className="font-bold text-stone-900 px-1.5 py-0.5 bg-stone-100 border border-stone-300 rounded">
                          {comp.humanId}
                        </span>
                        <span className="text-stone-500 uppercase">{comp.status}</span>
                      </div>
                      <h3 className="font-serif font-bold text-base text-stone-900 mt-1 mb-2">
                        {comp.title}
                      </h3>
                      {comp.tonalCenter && (
                        <div className="font-mono text-xs text-stone-600 mb-2">
                          <span className="text-stone-400">HOME:</span> {comp.tonalCenter}
                          {comp.tempo && <span className="ml-2">({comp.tempo} BPM)</span>}
                        </div>
                      )}
                      {comp.pieceMap && (
                        <p className="font-mono text-[11px] text-stone-500 line-clamp-2 mb-3 bg-stone-50 p-2 rounded border border-stone-200">
                          {comp.pieceMap}
                        </p>
                      )}
                      {/* Linked Motifs & Attachments */}
                      <div className="flex flex-wrap gap-2 text-[10px] font-mono text-stone-600">
                        {comp.linkedMotifs?.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-stone-100 rounded border border-stone-300">
                            {comp.linkedMotifs.length} Linked Motifs
                          </span>
                        )}
                        {comp.linkedAttachments?.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-300 flex items-center gap-1">
                            <Volume2 className="w-3 h-3" />
                            {comp.linkedAttachments.length} Media
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-stone-200 flex items-center justify-between font-mono text-xs">
                      <Link
                        href={`/print/composition/${comp.id}`}
                        className="flex items-center gap-1 text-stone-600 hover:text-stone-950 font-semibold"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>PRINT VIEW</span>
                      </Link>
                      <a
                        href={`/api/export?type=composition&id=${comp.id}`}
                        className="text-stone-500 hover:text-stone-900 text-[11px]"
                      >
                        JSON EXPORT
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Motifs Section */}
          {(activeTab === 'all' || activeTab === 'motifs') && motifs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 font-mono text-xs">
                <span className="font-bold tracking-widest text-stone-900 uppercase">
                  MOTIFS ({motifs.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {motifs.map((motif: any) => {
                  const parentTuning = motif.effectiveTuningId ? tuningMap.get(motif.effectiveTuningId) : null;
                  const parentInst = motif.effectiveInstrumentId ? instrumentMap.get(motif.effectiveInstrumentId) : null;
                  const tabCols = motif.tabData ? JSON.parse(motif.tabData) : [];

                  return (
                    <div
                      key={motif.id}
                      className="border border-stone-300 bg-white p-4 rounded flex flex-col justify-between hover:border-stone-800 transition-colors shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                          <span className="font-bold text-stone-900 px-1.5 py-0.5 bg-stone-100 border border-stone-300 rounded">
                            {motif.humanId}
                          </span>
                          <span className="text-stone-500 uppercase">{motif.function}</span>
                        </div>
                        <h3 className="font-serif font-bold text-sm text-stone-900 mt-1 mb-1">
                          {motif.name}
                        </h3>
                        <div className="font-mono text-[11px] text-stone-500 mb-2">
                          {parentTuning && <span>{parentTuning.humanId} ({parentTuning.name})</span>}
                          {parentInst && <span className="ml-1.5">• {parentInst.name}</span>}
                        </div>

                        {/* Abbreviated TAB summary */}
                        <div className="bg-paper-100 border border-stone-200 rounded p-2 font-mono text-[10px] text-stone-700 mb-2">
                          <span>{tabCols.length} Columns captured</span>
                        </div>

                        {motif.notes && (
                          <p className="font-sans text-xs text-stone-600 line-clamp-2 mb-2 italic">
                            "{motif.notes}"
                          </p>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-stone-200 flex items-center justify-between font-mono text-xs">
                        <Link
                          href={`/print/motif/${motif.id}`}
                          className="flex items-center gap-1 text-stone-600 hover:text-stone-950 font-semibold"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>PRINT MOTIF</span>
                        </Link>
                        <a
                          href={`/api/export?type=motif&id=${motif.id}`}
                          className="text-stone-500 hover:text-stone-900 text-[11px]"
                        >
                          JSON EXPORT
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Primary Positions Section */}
          {(activeTab === 'all' || activeTab === 'positions') && positions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 font-mono text-xs">
                <span className="font-bold tracking-widest text-stone-900 uppercase">
                  PRIMARY POSITIONS ({positions.length})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {positions.map((pos: any) => {
                  const frets = pos.frets ? JSON.parse(pos.frets) : [];
                  const fingers = pos.fingers ? JSON.parse(pos.fingers) : [];

                  return (
                    <div
                      key={pos.id}
                      className="border border-stone-300 bg-white p-3 rounded flex flex-col items-center justify-center hover:border-stone-800 transition-colors shadow-sm"
                    >
                      <PrimaryPositionDiamond
                        humanId={pos.humanId}
                        name={pos.name}
                        stringCount={pos.stringCount}
                        baseFret={pos.baseFret}
                        frets={frets}
                        fingers={fingers}
                        compact
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Tunings Section */}
          {(activeTab === 'all' || activeTab === 'tunings') && tunings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 font-mono text-xs">
                <span className="font-bold tracking-widest text-stone-900 uppercase">
                  TUNINGS ARCHIVE ({tunings.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {tunings.map((tun: any) => {
                  const pitchArr: string[] = JSON.parse(tun.pitches);

                  return (
                    <div
                      key={tun.id}
                      className="border border-stone-300 bg-white p-4 rounded flex flex-col justify-between hover:border-stone-800 transition-colors shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                          <span className="font-bold text-stone-900 px-1.5 py-0.5 bg-stone-100 border border-stone-300 rounded">
                            {tun.humanId}
                          </span>
                          <span className="text-stone-500">{tun.stringCount}-String</span>
                        </div>
                        <h3 className="font-serif font-bold text-sm text-stone-900 mt-1 mb-1">
                          {tun.name}
                        </h3>
                        <div className="font-mono text-xs font-semibold text-editorial-amber mb-2">
                          {pitchArr.join('  ')}
                        </div>
                        {tun.tonalCenter && (
                          <div className="text-[11px] font-mono text-stone-600 mb-1">
                            Home: {tun.tonalCenter}
                          </div>
                        )}
                        {tun.notes && (
                          <p className="font-sans text-xs text-stone-500 line-clamp-2 italic">
                            {tun.notes}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-stone-200 flex items-center justify-between font-mono text-xs">
                        <Link
                          href={`/print/tuning/${tun.id}`}
                          className="flex items-center gap-1 text-stone-600 hover:text-stone-950 font-semibold"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>PRINT RECORD</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Instruments Section */}
          {(activeTab === 'all' || activeTab === 'instruments') && instruments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 font-mono text-xs">
                <span className="font-bold tracking-widest text-stone-900 uppercase">
                  INSTRUMENTS & HARDWARE ({instruments.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {instruments.map((inst: any) => (
                  <div
                    key={inst.id}
                    className="border border-stone-300 bg-white p-4 rounded flex flex-col justify-between hover:border-stone-800 transition-colors shadow-sm font-mono text-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-stone-500 uppercase">{inst.family.replace(/_/g, ' ')}</span>
                        <span className="font-bold text-stone-900">{inst.stringCount} Strings</span>
                      </div>
                      <h3 className="font-serif font-bold text-sm text-stone-900 mt-1 mb-2">
                        {inst.name}
                      </h3>
                      <div className="space-y-1 text-stone-600 text-[11px]">
                        <div>
                          Scale: {inst.defaultScaleLength ? `${inst.defaultScaleLength} in` : (
                            <span className="text-amber-700 italic">Unknown / Incomplete</span>
                          )}
                        </div>
                        {inst.maker && <div>Maker: {inst.maker}</div>}
                        {inst.notes && <div className="text-stone-500 italic mt-1 font-sans">{inst.notes}</div>}
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-stone-200 flex items-center justify-between text-[11px]">
                      <Link
                        href={`/instruments`}
                        className="text-stone-700 hover:text-stone-950 font-bold"
                      >
                        MANAGE SETUPS
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
