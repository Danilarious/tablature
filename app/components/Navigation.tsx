'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, BookOpen, Music, Radio, Guitar, Sliders, Menu, X, Printer, Download } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'QUICK CAPTURE', href: '/quick-capture', icon: Zap, hint: 'Fast Entry' },
    { label: 'LIBRARY', href: '/library', icon: BookOpen, hint: 'Archive & Filter' },
    { label: 'COMPOSITIONS', href: '/compositions', icon: Music, hint: 'C-###' },
    { label: 'TUNINGS', href: '/tunings', icon: Radio, hint: 'T-###' },
    { label: 'INSTRUMENTS', href: '/instruments', icon: Guitar, hint: 'Setups & Gauges' },
    { label: 'STRING LAB', href: '/string-lab', icon: Sliders, hint: 'Tension Physics' },
  ];

  return (
    <header className="no-print border-b border-stone-200 bg-paper-50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Wordmark */}
          <div className="flex items-center gap-4">
            <Link href="/quick-capture" className="flex items-center gap-3 group">
              <div className="w-8 h-8 border border-stone-800 bg-stone-900 text-stone-100 flex items-center justify-center font-mono text-xs font-bold tracking-widest group-hover:bg-stone-700 transition-colors">
                BxB
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs tracking-widest uppercase font-bold text-stone-900">
                  Music Notebook
                </span>
                <span className="text-[10px] tracking-wider text-stone-500 uppercase font-mono">
                  Local-First Archive
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/quick-capture' && pathname?.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-mono tracking-wider transition-colors rounded ${
                    isActive
                      ? 'bg-stone-900 text-stone-50 font-semibold'
                      : 'text-stone-700 hover:text-stone-950 hover:bg-stone-200/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 opacity-80" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Quick Actions (Export / Print / Mobile Menu) */}
          <div className="flex items-center gap-2">
            <a
              href="/api/export?type=full"
              title="Export Full Library as JSON"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-stone-300 text-stone-700 hover:bg-stone-100 rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-stone-600" />
              <span>EXPORT</span>
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 border border-stone-300 text-stone-700 rounded hover:bg-stone-100"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-stone-200 bg-paper-100 px-4 pt-3 pb-5 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/quick-capture' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded text-sm font-mono tracking-wider ${
                  isActive
                    ? 'bg-stone-900 text-stone-50 font-semibold'
                    : 'text-stone-800 hover:bg-stone-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                <span className="text-xs text-stone-500 uppercase">{item.hint}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-stone-200">
            <a
              href="/api/export?type=full"
              className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-mono border border-stone-300 bg-stone-50 text-stone-800 rounded font-semibold"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT FULL ARCHIVE (JSON)</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
