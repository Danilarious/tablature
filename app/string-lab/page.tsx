'use client';

import React, { useState, useEffect } from 'react';
import { Sliders, AlertCircle, CheckCircle2, Search, ArrowRight, BookOpen, Layers } from 'lucide-react';
import { calculateStringLabTensions, rankCandidatesForTargetTension, resolveSpeakingLength, CatalogProduct } from '@/app/lib/music/string-lab';
import { fetchJson } from '@/app/lib/api/client';
import { filterCompatibleTunings, pickCompatibleTuningId } from '@/app/lib/music/compatibility';
import { physicalStringNumber } from '@/app/lib/music/string-order';

function safeJsonArray<T = unknown>(raw: unknown): T[] | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export default function StringLabPage() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [tunings, setTunings] = useState<any[]>([]);
  const [stringProducts, setStringProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Form selections
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [selectedTuningId, setSelectedTuningId] = useState<string>('');
  const [customScaleLength, setCustomScaleLength] = useState<number | ''>('');
  const [capoFret, setCapoFret] = useState<number>(0);
  const [targetTension, setTargetTension] = useState<number>(20.0); // 20 lbs per string target

  // Per-string assignments
  const [stringAssignments, setStringAssignments] = useState<{
    productId: string;
    overrideWeight: number | null;
  }[]>([]);

  // Candidate recommendation modal state
  const [modalStringIndex, setModalStringIndex] = useState<number | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [insts, tuns, prods] = await Promise.all([
          fetchJson<any[]>('/api/instruments'),
          fetchJson<any[]>('/api/tunings'),
          fetchJson<CatalogProduct[]>('/api/string-products'),
        ]);

        setInstruments(insts);
        setTunings(tuns);
        setStringProducts(prods);

        if (insts.length > 0) {
          setSelectedInstrumentId(insts[0].id);
          setCustomScaleLength(insts[0].defaultScaleLength ?? '');
          setSelectedTuningId(pickCompatibleTuningId(tuns, insts[0].stringCount, null));
        }
      } catch (err: any) {
        console.error(err);
        setLoadError(err?.message ?? 'Failed to load String Lab data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const currentInstrument = instruments.find((i) => i.id === selectedInstrumentId);
  const stringCount: number = currentInstrument?.stringCount || 6;
  const compatibleTunings = filterCompatibleTunings(tunings, stringCount);
  // Only a tuning whose string count matches the instrument is ever used.
  const currentTuning = compatibleTunings.find((t) => t.id === selectedTuningId);
  const tuningPitches = safeJsonArray<string>(currentTuning?.pitches) ?? [];
  const pitches: string[] = tuningPitches.length === stringCount ? tuningPitches : [];

  const perStringSpeakingLengths = safeJsonArray<number | null>(currentInstrument?.perStringSpeakingLengths);
  // "Scale length" field = default for strings without a per-string override.
  const defaultScaleForCalc = customScaleLength !== '' ? customScaleLength : currentInstrument?.defaultScaleLength ?? null;

  // Initialize or match string assignments
  useEffect(() => {
    if (stringProducts.length === 0) return;
    const initial = Array.from({ length: stringCount }, (_, idx) => {
      // Pick matching gauge product if available
      const defaultProd = stringProducts[Math.min(idx, stringProducts.length - 1)];
      return {
        productId: defaultProd?.id || '',
        overrideWeight: null,
      };
    });
    setStringAssignments(initial);
  }, [stringCount, stringProducts]);

  // Compute live tensions using domain module
  const calculationInputs = pitches.map((p, idx) => {
    const assigned = stringAssignments[idx];
    const product = stringProducts.find((sp) => sp.id === assigned?.productId);

    return {
      stringIndex: idx,
      openPitch: p,
      capoFret: capoFret > 0 ? capoFret : null,
      scaleLength: resolveSpeakingLength(idx, defaultScaleForCalc, perStringSpeakingLengths),
      stringProductId: product?.id,
      gauge: product?.nominalGauge,
      unitWeight: assigned?.overrideWeight ?? product?.unitWeight ?? null,
      targetTensionLbs: targetTension,
    };
  });

  const calculation = calculateStringLabTensions(calculationInputs);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-stone-900" />
            <h1 className="font-mono text-sm tracking-widest uppercase font-bold text-stone-900">
              STRING LAB & PHYSICAL TENSION CALCULATOR
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-serif italic mt-0.5">
            Physical string tension: T = (UW * (2 * L * F)^2) / 386.4. Honest missing weight reporting without fabricated precision.
          </p>
        </div>
      </div>

      {/* Control Bar: Instrument, Tuning, Scale Length, Capo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-paper-100 border border-stone-300 rounded font-mono text-xs">
        <div className="space-y-1">
          <label className="text-[11px] text-stone-600 font-bold uppercase">INSTRUMENT</label>
          <select
            value={selectedInstrumentId}
            onChange={(e) => {
              const inst = instruments.find((i) => i.id === e.target.value);
              if (!inst) return;
              setSelectedInstrumentId(inst.id);
              setCustomScaleLength(inst.defaultScaleLength ?? '');
              setSelectedTuningId(pickCompatibleTuningId(tunings, inst.stringCount, selectedTuningId));
            }}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs"
          >
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-stone-600 font-bold uppercase">TUNING ({stringCount}-STRING)</label>
          <select
            value={currentTuning ? selectedTuningId : ''}
            onChange={(e) => setSelectedTuningId(e.target.value)}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs"
          >
            {!currentTuning && <option value="">— No {stringCount}-string tuning —</option>}
            {compatibleTunings.map((tun) => (
              <option key={tun.id} value={tun.id}>
                {tun.humanId} — {tun.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-stone-600 font-bold uppercase" title="Used for strings without a per-string speaking-length override">DEFAULT SCALE LENGTH (IN)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={customScaleLength}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setCustomScaleLength(Number.isFinite(v) && v > 0 ? v : '');
            }}
            placeholder="Scale length"
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs font-bold"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-stone-600 font-bold uppercase">GLOBAL CAPO FRET</label>
          <select
            value={capoFret}
            onChange={(e) => setCapoFret(parseInt(e.target.value, 10))}
            className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-xs"
          >
            <option value={0}>0 (Open)</option>
            <option value={1}>Fret 1</option>
            <option value={2}>Fret 2</option>
            <option value={3}>Fret 3</option>
            <option value={4}>Fret 4</option>
            <option value={5}>Fret 5</option>
          </select>
          <p className="text-[10px] text-stone-500">Capo changes sounding pitch only; tension uses the open pitch at full length.</p>
        </div>
      </div>

      {loadError && (
        <div className="p-3 bg-red-50 border border-red-300 rounded font-mono text-xs text-red-800">{loadError}</div>
      )}
      {!loading && !currentTuning && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded font-mono text-xs text-amber-900">
          No {stringCount}-string tuning is selected. Choose or create a tuning with exactly {stringCount} pitches.
        </div>
      )}

      {/* Target Tension Slider / Config */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-stone-50 border border-stone-300 rounded font-mono text-xs gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-stone-900">REFERENCE TARGET TENSION:</span>
          <span className="font-bold text-stone-900 text-sm px-2 py-0.5 bg-white border border-stone-300 rounded">
            {targetTension} lbs / string
          </span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-64">
          <input
            type="range"
            min="12"
            max="32"
            step="0.5"
            value={targetTension}
            onChange={(e) => setTargetTension(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* Data Incomplete Warnings */}
      {calculation.hasIncompleteData && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded font-mono text-xs text-amber-900 space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span>Honest Technical Limitation: Data Incomplete</span>
          </div>
          <p className="text-[11px] text-amber-800">
            Total tension cannot be calculated because one or more strings lack verified unit-weight specifications or speaking lengths. We refuse to fabricate numbers from nominal gauge alone.
          </p>
        </div>
      )}

      {/* Tension Physics Table */}
      <div className="border border-stone-300 rounded overflow-hidden bg-white shadow-sm font-mono text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left divide-y divide-stone-200">
            <thead className="bg-stone-900 text-stone-100 text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-2.5 px-3">STRING</th>
                <th className="py-2.5 px-3">OPEN / SOUNDING</th>
                <th className="py-2.5 px-3">SPEAKING LENGTH</th>
                <th className="py-2.5 px-3">STRING PRODUCT & GAUGE</th>
                <th className="py-2.5 px-3">UNIT WEIGHT</th>
                <th className="py-2.5 px-3 text-right">TENSION (LBS)</th>
                <th className="py-2.5 px-3 text-right">TARGET DIFF</th>
                <th className="py-2.5 px-3 text-center">RECOMMEND</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800">
              {calculation.strings.map((str, idx) => {
                const assigned = stringAssignments[idx];
                const currentProd = stringProducts.find((p) => p.id === assigned?.productId);

                return (
                  <tr key={idx} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-3 font-bold text-stone-900">
                      S{physicalStringNumber(idx, calculation.strings.length)}
                      {idx === 0 && <span className="block text-[10px] font-normal text-stone-400">bass side</span>}
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-bold">{str.openPitch}</span>
                      <span className="text-[10px] text-stone-400 block">open (tension basis)</span>
                      {str.capoFret && str.capoFret > 0 && (
                        <span className="text-[11px] text-amber-700 block">
                          → sounds {str.soundingPitch} (Capo {str.capoFret})
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {str.scaleLength ? (
                        <span>
                          {str.scaleLength}"
                          {str.capoFret && str.capoFret > 0 && str.effectiveVibratingLength !== null && (
                            <span className="text-[10px] text-stone-500 block">
                              vibrating {str.effectiveVibratingLength.toFixed(2)}" above capo
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-700 italic">Unknown</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <select
                        value={assigned?.productId || ''}
                        onChange={(e) => {
                          const next = [...stringAssignments];
                          next[idx] = { ...next[idx], productId: e.target.value };
                          setStringAssignments(next);
                        }}
                        className="bg-white border border-stone-300 rounded px-2 py-1 text-xs max-w-[200px]"
                      >
                        {stringProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nominalGauge}" — {p.manufacturer} {p.productFamily || ''}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-3 text-stone-600 text-[11px]">
                      {str.unitWeight ? (
                        <span>{str.unitWeight}</span>
                      ) : (
                        <span className="text-amber-700 font-semibold italic">Missing UW</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-bold">
                      {str.tension.status === 'valid' && str.tension.tensionLbs !== null ? (
                        <span className="text-stone-900 text-sm">{str.tension.tensionLbs} lbs</span>
                      ) : (
                        <span className="text-stone-400 italic text-[11px]">Undetermined</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {str.targetTensionDiff !== null ? (
                        <span
                          className={`font-bold ${
                            Math.abs(str.targetTensionDiff) <= 1.5
                              ? 'text-emerald-700'
                              : str.targetTensionDiff > 0
                              ? 'text-amber-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {str.targetTensionDiff > 0 ? `+${str.targetTensionDiff}` : str.targetTensionDiff} lbs
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setModalStringIndex(idx)}
                        className="px-2 py-1 bg-stone-100 hover:bg-stone-900 hover:text-white rounded border border-stone-300 text-[10px] font-bold"
                      >
                        MATCH
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total Tension Footer */}
        <div className="bg-stone-100 p-4 border-t border-stone-300 flex flex-col sm:flex-row items-center justify-between font-mono text-xs gap-2">
          <span className="text-stone-600 font-bold uppercase tracking-wider">
            TOTAL INSTRUMENT STRING TENSION:
          </span>
          <div>
            {calculation.totalTensionLbs !== null ? (
              <span className="text-lg font-bold text-stone-950 font-mono">
                {calculation.totalTensionLbs} lbs total
              </span>
            ) : (
              <span className="text-amber-700 font-bold text-xs italic">
                Incomplete (Requires verified unit weights for all strings)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Candidate Recommendation Modal */}
      {modalStringIndex !== null && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-300 rounded shadow-2xl max-w-lg w-full p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
              <span className="font-bold tracking-wider text-stone-900 uppercase">
                RECOMMENDED STRING PRODUCTS (S{physicalStringNumber(modalStringIndex, calculation.strings.length)})
              </span>
              <button
                type="button"
                onClick={() => setModalStringIndex(null)}
                className="text-stone-400 hover:text-stone-800"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-stone-600">
              Ranked by distance from target tension ({targetTension} lbs) at open pitch{' '}
              <span className="font-bold text-stone-900">{pitches[modalStringIndex]}</span> over{' '}
              <span className="font-bold text-stone-900">
                {calculation.strings[modalStringIndex]?.scaleLength ?? 'unknown'}"
              </span>{' '}
              (this string's speaking length):
            </p>

            <div className="max-h-64 overflow-y-auto divide-y divide-stone-200 border border-stone-200 rounded">
              {rankCandidatesForTargetTension(
                pitches[modalStringIndex],
                calculation.strings[modalStringIndex]?.scaleLength ?? null,
                targetTension,
                stringProducts
              ).map((cand) => (
                <div
                  key={cand.product.id}
                  className="p-3 flex items-center justify-between hover:bg-stone-50 text-xs"
                >
                  <div>
                    <div className="font-bold text-stone-900">
                      {cand.product.nominalGauge}" ({cand.product.manufacturer})
                    </div>
                    <div className="text-[10px] text-stone-500">
                      {cand.product.productFamily || 'Standard'} • UW: {cand.product.unitWeight || 'None'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {cand.predictedTensionLbs !== null ? (
                        <span className="font-bold text-stone-900">{cand.predictedTensionLbs} lbs</span>
                      ) : (
                        <span className="text-amber-700 italic text-[10px]">No UW</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...stringAssignments];
                        next[modalStringIndex] = { ...next[modalStringIndex], productId: cand.product.id };
                        setStringAssignments(next);
                        setModalStringIndex(null);
                      }}
                      className="px-2.5 py-1 bg-stone-900 text-stone-50 rounded font-bold hover:bg-stone-800 text-[11px]"
                    >
                      APPLY
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Experimental Tension-Balancer Algorithm Specification Box */}
      <div className="border border-stone-300 rounded p-5 bg-paper-100 font-mono text-xs space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-editorial-amber" />
          <h2 className="font-bold tracking-wider text-stone-900 uppercase">
            EXPERIMENTAL SPECIFICATION: INTERVAL-TENSION BALANCER ALGORITHM
          </h2>
        </div>
        <p className="font-serif text-xs text-stone-600 leading-relaxed">
          The following algorithm specification defines future phase tension optimization for arbitrary multi-string instruments:
        </p>

        <div className="bg-white p-3.5 rounded border border-stone-300 font-mono text-[11px] text-stone-800 space-y-2">
          <div>
            <strong>1. Lock Selected String Pitches:</strong> Given an anchor string s_anchor with fixed pitch P_anchor and target tension T_target, freeze its sounding state.
          </div>
          <div>
            <strong>2. Preserve Interval Pattern:</strong> For desired modal chord shapes [I_1, I_2, ..., I_N], lock semitone intervals relative to the root.
          </div>
          <div>
            <strong>3. Tension Equalization:</strong> Solve for compatible open string pitches where T_min &le; T_i &le; T_max and overall tension variance approaches zero.
          </div>
          <div>
            <strong>4. Candidate Search:</strong> Query catalog products matching the required unit weight to minimize fingerboard stiffness.
          </div>
        </div>
      </div>
    </div>
  );
}
