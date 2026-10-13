# BxB Music Notebook — Product Specification

## 1. Vision & Core Philosophy

**BxB Music Notebook** is a local-first personal music notebook and compositional archive engineered for instrumentalists who work with:
- Alternate and reentrant tunings
- Extended range instruments (5-, 6-, and 7-string guitars, banjos, archtops, baritones)
- Partial, drop, and Spider capos
- Varying speaking and scale lengths (from 18.5" quarter-size to 27" baritone)
- Reusable motifs, harmonic positions, and melodic fragments
- Multi-instrument compositional workflows
- Rapid ideation and "noodling" that demands capture without launching a DAW

### Core Principle
> **Structured records are the source of truth.**  
> Printable pages, PDF exports, and onscreen notation views are generated projections of structured, immutable musical data.

---

## 2. System Architecture

- **Runtime**: Node.js Next.js App Router (non-edge).
- **Database**: Embedded SQLite via Drizzle ORM.
- **Storage Strategy**: Local file system hierarchy beneath `storage/` (configurable via `MUSIC_NOTEBOOK_DATA_DIR`):
  - `storage/database/`: SQLite database file (`notebook.db`).
  - `storage/media/`: Audio recordings, photos, and file attachments.
  - `storage/backups/`: Scheduled and on-demand JSON and SQLite database snapshots.
- **Network & Access**: Single-user, local-first. Binds to localhost by default. Capable of headless deployment on a home NAS or Linux server accessible via Tailscale without architectural changes.
- **Design Language**: Sparse, high-contrast, black-and-white editorial aesthetic with fine technical rules, generous negative space, and custom diamond position diagrams grounded in the original print notation system.

---

## 3. Functional Modules

### 3.1 Quick Capture
- **Purpose**: Low-friction idea logging for an instrumentalist with an instrument in hand.
- **Workflow**:
  1. Select or quickly define Instrument.
  2. Select or define Tuning (T-###).
  3. Select active String Set (optional).
  4. Specify Capo Configuration (full fret or per-string partial/Spider capo).
  5. Save or reuse the calculated Setup snapshot.
  6. Compose a Motif (M-###) or append to a Composition (C-###).
  7. Input notes via interactive fretboard or direct numeric TAB grid.
  8. Attach memo description, tags, or capture an audio memo via microphone.
  9. Save immediately. Incomplete records enter an **Inbox / Needs Details** queue.

### 3.2 Primary Positions
- **Terminology**: Designated as **PRIMARY POSITIONS** (not "Chord Library").
- **Function**: Reusable harmonic/fingerboard archetypes (chords, clusters, intervals, drones, moveable shapes).
- **Notation**: 
  - Visual rotated diamond diagrams reflecting string order.
  - Per-string states: Fretted (with fret and finger number), Open (`O`), Muted (`X`), or Unused (`-`).
  - Optional `P-###` identifier and informal descriptive labels.

### 3.3 Synchronized TAB & Fretboard Editor
- **String Support**: Dynamically scales to 5, 6, or 7 strings based on Instrument / Setup.
- **Dual Input**: 
  - Interactive fretboard clicks add or modify notes in the active column.
  - Direct keyboard numeric input in the TAB grid.
- **Musical Features**:
  - Polyphonic vertical columns (chords / simultaneous attacks).
  - Open strings, muted strings (`X`), rests / blank columns, column insertion / deletion / reordering.
  - Relative to documented tuning and capo fret.
  - Real-time calculation of sounding pitch (e.g. string D3 capo 2 sounding E3).
  - Free-rhythm capture support (formal meter not required).

### 3.4 Composition Archive
- **Identifier**: `C-###` (e.g. C-001).
- **Data**: Working title, status (Idea, In Progress, Polished, Archived), tonal center/home, tempo/feel, piece map, sections, notes, and lyrics.
- **Relationships**: Multi-instrument and multi-setup support. References reusable Motifs (`M-###`) and Positions (`P-###`).

### 3.5 Tunings Archive
- **Identifier**: `T-###` (e.g. T-001).
- **Data**: Tuning name, string count, pitch sequence with exact octaves (e.g., `D2 A2 D3 F#3 A3 D4` for Open D, or reentrant banjo tunings `g4 D3 G3 B3 D4`), tags, tonal home, and discoveries.
- **Cross-Links**: Discoveries cataloging associated positions, motifs, and compositions.

### 3.6 String Lab
- **Purpose**: Practical physical calculation of string tension and gauge recommendations.
- **Physics**: Isolated module computing tension:
  $$T = \frac{UW \times (2 \times L \times F)^2}{386.4}$$
  *(for tension in pounds, unit weight in lbs/inch, speaking length in inches, frequency in Hz)*
- **Data Integrity**: Refuses to fabricate precision when unit weight is unavailable. Clearly flags missing technical data.
- **Recommendation Engine**: Matches desired target tension against indexed string products and ranks candidates with transparent provenance.

### 3.7 Media & Audio Memos
- File attachment handling for external audio, PDFs, and images.
- Built-in browser MediaRecorder for instant scratchpad voice/instrument memos stored directly in `storage/media/`.

### 3.8 Print Views & Data Portability
- Browser `@media print` layouts matching US Letter portrait wireframes with 0.5-inch margins.
- Comprehensive JSON export for single records and entire archives.
- SQLite snapshot backup and restore utility.
