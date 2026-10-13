'use client';

import React from 'react';

export interface PrimaryPositionProps {
  humanId?: string | null;
  name?: string | null;
  stringCount?: number;
  baseFret?: number;
  frets: (number | string | null)[]; // e.g. [0, 0, 0, 2, 0, 0] or [null, 3, 2, 0, 3, 0]
  fingers?: (string | null)[]; // e.g. [null, '2', '1', null, '3', null]
  compact?: boolean;
}

export default function PrimaryPositionDiamond({
  humanId,
  name,
  stringCount = 6,
  baseFret = 1,
  frets = [],
  fingers = [],
  compact = false,
}: PrimaryPositionProps) {
  const strings = Array.from({ length: stringCount }, (_, i) => i);
  // Total frets shown in diagram window: 4 frets
  const fretCount = 4;

  const size = compact ? 120 : 160;
  const padding = compact ? 16 : 22;
  const innerSize = size - padding * 2;

  return (
    <div className="flex flex-col items-center select-none text-stone-900 group">
      {/* Container with diamond frame */}
      <div className="relative flex flex-col items-center">
        {/* Diamond SVG */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Outer rotated diamond border */}
          <rect
            x={padding}
            y={padding}
            width={innerSize}
            height={innerSize}
            fill="#ffffff"
            stroke="#1a1917"
            strokeWidth="1.5"
            transform={`rotate(45 ${size / 2} ${size / 2})`}
            className="filter drop-shadow-sm"
          />

          {/* Base fret indicator badge */}
          <g transform={`translate(${padding - 6}, ${size / 2 - 10})`}>
            <rect
              x="0"
              y="0"
              width="16"
              height="18"
              fill="#1a1917"
              rx="2"
            />
            <text
              x="8"
              y="13"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {baseFret}
            </text>
          </g>

          {/* Internal Grid Lines & Fret Positions */}
          <g>
            {/* Draw strings vertically inside the diamond center */}
            {strings.map((strIdx) => {
              const xSpan = innerSize * 0.7;
              const xStep = stringCount > 1 ? xSpan / (stringCount - 1) : 0;
              const x = size / 2 - xSpan / 2 + strIdx * xStep;

              // String state
              const rawFret = frets[strIdx];
              const isMuted = rawFret === null || rawFret === 'x' || rawFret === 'X' || rawFret === -1;
              const isOpen = rawFret === 0 || rawFret === '0';
              const isFretted = typeof rawFret === 'number' && rawFret > 0;
              const fretNum = isFretted ? (rawFret as number) : 0;
              const finger = fingers?.[strIdx] || null;

              // Vertical line for this string inside diamond
              const yTop = size / 2 - innerSize * 0.35;
              const yBottom = size / 2 + innerSize * 0.35;

              return (
                <g key={strIdx}>
                  {/* String Line */}
                  <line
                    x1={x}
                    y1={yTop}
                    x2={x}
                    y2={yBottom}
                    stroke="#555550"
                    strokeWidth={0.75 + (stringCount - 1 - strIdx) * 0.15}
                  />

                  {/* Open / Muted Symbol at top */}
                  {isMuted && (
                    <text
                      x={x}
                      y={yTop - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill="#777169"
                    >
                      ×
                    </text>
                  )}
                  {isOpen && (
                    <circle
                      cx={x}
                      cy={yTop - 8}
                      r="3.5"
                      fill="none"
                      stroke="#1a1917"
                      strokeWidth="1.2"
                    />
                  )}

                  {/* Fretted Dot inside the diamond */}
                  {isFretted && (
                    (() => {
                      const relativeFret = fretNum - baseFret + 1;
                      const clampedFret = Math.max(1, Math.min(fretCount, relativeFret));
                      const yPos = yTop + (clampedFret - 0.5) * ((yBottom - yTop) / fretCount);

                      return (
                        <g>
                          <circle
                            cx={x}
                            cy={yPos}
                            r={compact ? 5 : 6.5}
                            fill="#1a1917"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          {finger && (
                            <text
                              x={x}
                              y={yPos + 3.5}
                              textAnchor="middle"
                              fontSize="8"
                              fill="#ffffff"
                              fontFamily="sans-serif"
                              fontWeight="bold"
                            >
                              {finger}
                            </text>
                          )}
                        </g>
                      );
                    })()
                  )}
                </g>
              );
            })}

            {/* Horizontal Fret Lines */}
            {Array.from({ length: fretCount + 1 }).map((_, fIdx) => {
              const yTop = size / 2 - innerSize * 0.35;
              const yBottom = size / 2 + innerSize * 0.35;
              const y = yTop + (fIdx * (yBottom - yTop)) / fretCount;
              const xSpan = innerSize * 0.7;
              const x1 = size / 2 - xSpan / 2;
              const x2 = size / 2 + xSpan / 2;

              return (
                <line
                  key={fIdx}
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke="#88857f"
                  strokeWidth={fIdx === 0 ? '1.5' : '0.6'}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Label and Badge Underneath */}
      <div className="mt-1 flex flex-col items-center text-center">
        {humanId && (
          <span className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 border border-stone-300 bg-stone-100 rounded text-stone-800 font-bold mb-0.5">
            {humanId}
          </span>
        )}
        <span className="font-mono text-xs tracking-tight text-stone-900 font-medium max-w-[140px] truncate">
          {name || 'Untitled Position'}
        </span>
      </div>
    </div>
  );
}
