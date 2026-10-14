'use client';

import React from 'react';

interface PrintButtonProps {
  label?: string;
  className?: string;
}

export default function PrintButton({
  label = 'PRINT RECORD (PDF)',
  className = 'px-4 py-2 bg-stone-900 text-stone-50 font-bold rounded shadow hover:bg-stone-800 transition-colors',
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.print();
        }
      }}
      className={className}
    >
      {label}
    </button>
  );
}
