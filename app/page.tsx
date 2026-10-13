import Link from 'next/link';
import { Zap, BookOpen, Music, Radio, Guitar, Sliders, ArrowRight, Printer } from 'lucide-react';
import { getDatabase } from '@/app/db/client';
import { compositions, motifs, tunings, instruments } from '@/app/db/schema';

export default async function HomePage() {
  const { db } = getDatabase();

  const [comps, mots, tuns, insts] = await Promise.all([
    db.select().from(compositions),
    db.select().from(motifs),
    db.select().from(tunings),
    db.select().from(instruments),
  ]);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-12 space-y-12">
      {/* Editorial Title Block */}
      <div className="border-b-2 border-stone-900 pb-8 space-y-4">
        <div className="flex items-center gap-2 font-mono text-xs text-stone-500 uppercase tracking-widest">
          <span>BxB Development</span>
          <span>•</span>
          <span>Music Notation & Tablature</span>
        </div>

        <h1 className="font-serif font-bold text-4xl sm:text-5xl text-stone-950 tracking-tight">
          BxB Music Notebook
        </h1>

        <p className="font-serif text-lg text-stone-700 max-w-2xl leading-relaxed">
          A personal, local-first music notebook for alternate tunings, 6- and 7-string guitars, partial capos, reusable primary positions, motifs, and compositions. Structured records are the source of truth.
        </p>

        {/* Quick Capture Hero CTA */}
        <div className="pt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/quick-capture"
            className="flex items-center gap-2 px-5 py-3 bg-stone-900 text-stone-50 font-mono text-xs font-bold tracking-wider uppercase rounded shadow hover:bg-stone-800 transition-all"
          >
            <Zap className="w-4 h-4 text-editorial-amber" />
            <span>LAUNCH QUICK CAPTURE</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/library"
            className="flex items-center gap-2 px-4 py-3 border border-stone-300 bg-white text-stone-800 font-mono text-xs font-bold tracking-wider uppercase rounded hover:bg-stone-100 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-stone-500" />
            <span>EXPLORE ARCHIVE</span>
          </Link>
        </div>
      </div>

      {/* Snapshot Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="border border-stone-300 bg-white p-4 rounded">
          <span className="text-stone-400 block text-[10px] uppercase font-bold">COMPOSITIONS</span>
          <span className="text-2xl font-serif font-bold text-stone-900">{comps.length}</span>
          <span className="text-[11px] text-stone-500 block mt-1">C-### records</span>
        </div>
        <div className="border border-stone-300 bg-white p-4 rounded">
          <span className="text-stone-400 block text-[10px] uppercase font-bold">MOTIFS</span>
          <span className="text-2xl font-serif font-bold text-stone-900">{mots.length}</span>
          <span className="text-[11px] text-stone-500 block mt-1">M-### phrases</span>
        </div>
        <div className="border border-stone-300 bg-white p-4 rounded">
          <span className="text-stone-400 block text-[10px] uppercase font-bold">TUNINGS</span>
          <span className="text-2xl font-serif font-bold text-stone-900">{tuns.length}</span>
          <span className="text-[11px] text-stone-500 block mt-1">T-### catalog</span>
        </div>
        <div className="border border-stone-300 bg-white p-4 rounded">
          <span className="text-stone-400 block text-[10px] uppercase font-bold">INSTRUMENTS</span>
          <span className="text-2xl font-serif font-bold text-stone-900">{insts.length}</span>
          <span className="text-[11px] text-stone-500 block mt-1">Seeded & Custom</span>
        </div>
      </div>

      {/* Primary Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
        <Link
          href="/compositions"
          className="border border-stone-300 bg-white p-5 rounded hover:border-stone-900 transition-colors shadow-sm space-y-2 block"
        >
          <div className="flex items-center gap-2 font-bold text-stone-900">
            <Music className="w-4 h-4 text-editorial-amber" />
            <span>COMPOSITIONS</span>
          </div>
          <p className="font-serif text-xs text-stone-600">
            Piece maps, tonal centers, multi-instrument setups, lyrics, and master overview records.
          </p>
        </Link>

        <Link
          href="/tunings"
          className="border border-stone-300 bg-white p-5 rounded hover:border-stone-900 transition-colors shadow-sm space-y-2 block"
        >
          <div className="flex items-center gap-2 font-bold text-stone-900">
            <Radio className="w-4 h-4 text-editorial-amber" />
            <span>TUNINGS ARCHIVE</span>
          </div>
          <p className="font-serif text-xs text-stone-600">
            Unambiguous pitch and octave definitions, reentrant banjo, and 7-string extended range systems.
          </p>
        </Link>

        <Link
          href="/string-lab"
          className="border border-stone-300 bg-white p-5 rounded hover:border-stone-900 transition-colors shadow-sm space-y-2 block"
        >
          <div className="flex items-center gap-2 font-bold text-stone-900">
            <Sliders className="w-4 h-4 text-editorial-amber" />
            <span>STRING LAB</span>
          </div>
          <p className="font-serif text-xs text-stone-600">
            Physical string tension calculations, speaking length compensation, and catalog gauge matching.
          </p>
        </Link>
      </div>

      {/* Print Templates Footer */}
      <div className="border border-stone-300 bg-paper-100 p-5 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs">
        <div>
          <span className="font-bold text-stone-900 block">CANONICAL PRINTABLE WORKSHEETS</span>
          <span className="text-stone-500 font-serif italic text-xs">
            US Letter portrait templates formatted with 0.5-inch margins for printing on actual home printers.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/print/continuation"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-300 text-stone-900 rounded font-bold hover:bg-stone-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>CONTINUATION PAGE</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
