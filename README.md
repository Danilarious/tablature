# BxB Music Notebook

A durable, local-first personal music notebook and compositional archive for instrumentalists working with alternate tunings, 6- and 7-string guitars, partial and Spider capos, extended and differing scale lengths, reusable primary positions, motifs, multi-instrument compositions, and string tension physics.

**Repository URL:** [https://github.com/Danilarious/tablature.git](https://github.com/Danilarious/tablature.git)

---

## ⚠️ Public Code, Private Music Data Guarantee

> [!IMPORTANT]
> **This repository is public. All personal music records, audio recordings, SQLite runtime databases, imports, exports, and backups are strictly local-first and excluded from version control via `.gitignore`.**

The repository enforces strict separation between application code and user data:
- **Never Committed:** `storage/database/*`, `storage/media/*`, `storage/backups/*`, `imports/*`, `exports/*`, audio files (`.wav`, `.mp3`, `.m4a`), environment secrets (`.env*`), and OS metadata (`.DS_Store`).
- **Committed:** Core application source, TypeScript definitions, Drizzle schemas, migrations, test suites, build configuration, documentation, vector assets, and empty directory placeholders (`.gitkeep`).
- **Sanitized Examples:** Fictional demonstration schemas with zero personal or private data are provided in [`app/data/examples/`](file:///Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature/app/data/examples/).

---

## 1. Core Principles

- **Structured records are the source of truth.** Printable pages and PDFs are generated views of structured records.
- **Local-first & single-user.** Embedded SQLite database owned by the application with zero cloud database or SaaS auth dependencies.
- **Physical setup immutability.** Setups freeze historical snapshots so future instrument modifications never invalidate past TAB or motifs.
- **Honest physics.** String Lab calculates tension using physical formulas ($T = (UW \times (2LF)^2) / 386.4$) and refuses to hallucinate precision when unit weight is unavailable.
- **Source material preservation.** Original Adobe Illustrator files, wireframes, and vector exports in `/assets/` remain pristine and untouched locally.

---

## 2. Current MVP Capabilities

- **Instruments & Hardware:** Complete catalog of 6- and 7-string instruments with customizable scale lengths, string counts, and setup notes. Full in-app editing and record updating with immediate persistence.
- **Quick Capture (`/quick-capture`):** Rapid, distraction-free logging optimized for having an instrument in hand. Supports fretboard clicking and direct numeric TAB entry with capo offsets.
- **Tunings Library (`/tunings`):** Preserves reentrant order (such as 5-string banjo high $g4$), exact octaves, and musical tonal centers (`T-001` to `T-008`).
- **Primary Positions:** Rotated diamond chord and voicing diagrams (`P-###`) for reusable fingerboard archetypes.
- **Motif & Composition Engine:** Cross-references motifs (`M-###`) and compositions (`C-###`) with frozen setup context snapshots.
- **String Lab (`/string-lab`):** String tension physics engine with speaking length compensation and unit-weight catalog ranking.
- **Printable Master Worksheets (`/print/...`):** US Letter portrait layouts with 0.5-inch margins for Composition Records, Tuning Records, Motif Records, and Blank/Filled Continuation TAB Sheets.
- **Desktop Quick-Start Launchers:** One-click macOS app bundle (`BxB Music Notebook.app`) and Terminal launcher (`BxB Music Notebook.command`) for starting the server and opening the browser.
- **Tailscale & Remote Access:** Built-in binding to `0.0.0.0` for access from iPads and mobile devices over Tailscale.

---

## 3. Quick Start & Commands

### Prerequisites
- Node.js v18+ (tested on Node v22)
- npm v9+

### Installation
```bash
npm install
```

### Database Seeding
Initializes the SQLite database at `storage/database/notebook.db` and populates starter instruments (including verified scale lengths like the 25" Dobro), starter tunings (`T-001` through `T-008`), manufacturer string products with unit weights, primary positions (`P-001` to `P-003`), starter motif (`M-001`), and starter composition (`C-001`):
```bash
npm run db:seed
```

### Starting Development Server
Starts the local development server at `http://localhost:3000` listening on all interfaces (`0.0.0.0:3000` for local and Tailscale access):
```bash
npm run dev
```

### Running Test Suite
Runs all unit tests (pitch mathematics, tension physics, acceptance criteria):
```bash
npm run test
```

### Building for Production
Compiles the optimized Next.js production build:
```bash
npm run build
npm run start
```

---

## 4. Data Storage & Backup Procedures

### Storage Hierarchy
Data is stored beneath the project root in `storage/`:
```text
storage/
  database/     # notebook.db (SQLite database in WAL mode - private/ignored)
  media/        # Audio memos and file attachments (private/ignored)
  backups/      # Timestamped database snapshots and manifests (private/ignored)
```

To store runtime data on an external drive or custom NAS mount point, set the environment variable:
```bash
export MUSIC_NOTEBOOK_DATA_DIR="/Volumes/SecureStorage/BxBMusicData"
```

### Creating an On-Demand Backup
Copies the SQLite database file and generates a media file manifest with timestamp:
```bash
npm run backup
```
Backup artifacts are saved into `storage/backups/notebook-backup-[TIMESTAMP].db`.

### Restoring a Database Backup
Restores the most recent backup in `storage/backups/` (automatically creates a safety copy of the current database before overwriting):
```bash
npm run restore
```
Or specify a specific backup snapshot path:
```bash
tsx scripts/restore.ts storage/backups/notebook-backup-2026-10-10T02-30-34-689Z.db
```

---

## 5. Design Assets & Git LFS Policy

- **Committed Assets:** Vector SVGs and high-resolution PNG reference renders in `assets/SVG/` and `assets/2x/` are versioned directly in Git as standard visual reference assets.
- **Excluded Assets:** Master Adobe Illustrator source files (`assets/printed-assets/*.ai`), Photoshop documents (`*.psd`), and raw audio/video files are excluded from Git to keep repository size lean.
- **Git LFS Recommendation:** If master Illustrator source files (`.ai`) or high-resolution multi-track audio session recordings must be version-controlled in the future, Git LFS (`git-lfs`) should be enabled for tracking `*.ai` and `*.wav`. Currently, keeping them in local project storage without Git LFS keeps the public repository light and fast to clone.

---

## 6. Architecture Documentation & Roadmap

Detailed architectural and design specifications are maintained in `docs/`:
- [`docs/PRODUCT-SPEC.md`](file:///Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature/docs/PRODUCT-SPEC.md) — Comprehensive functional requirements.
- [`docs/DATA-MODEL.md`](file:///Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature/docs/DATA-MODEL.md) — Schema, relations, and snapshot immutability rules.
- [`docs/DECISIONS.md`](file:///Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature/docs/DECISIONS.md) — Architectural decision records (ADRs).
- [`docs/ROADMAP.md`](file:///Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature/docs/ROADMAP.md) — Development phases and deferred capabilities.

### Current Status & Deferred Capabilities
- **Status:** Phase 1 MVP Complete (Schema, SQLite client, Quick Capture, Instruments with live editing, String Lab physics, Printable sheets, Backup/Restore scripts).
- **Deferred to Phase 2/3:**
  - Full bidirectional sync engine for multi-device sync beyond local LAN / Tailscale direct connection.
  - Interactive Spider Capo per-string fingerboard animation UI.
  - Direct MIDI recording and polyphonic pitch transcription.
  - Native iOS / iPadOS wrapper app packaging.

---

## 7. Docker & NAS Deployment

A production-ready `Dockerfile` and `docker-compose.yml` are provided. To launch on a NAS or Linux server:
```bash
docker compose up -d
```
Access the application on port `3000` via your local network or securely over Tailscale.
