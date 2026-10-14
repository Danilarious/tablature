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
- **Sanitized Examples:** Fictional demonstration schemas with zero personal or private data are provided in [`app/data/examples/`](app/data/examples/).

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
- **Launcher:** [`scripts/launch-app.sh`](scripts/launch-app.sh) starts the local server and opens the browser (interactive terminal only; asks before any schema migration). No macOS `.app` or `.command` bundle is included in the repository; see "Launcher" below to create one yourself.
- **Local-only by default:** `npm run dev` / `npm start` bind to `127.0.0.1`. Access from an iPad or other device is an explicit opt-in (`npm run dev:lan`) — see "Network access".

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
On first start the app creates `storage/database/notebook.db` from the committed migrations. To add the starter records (instruments including the 25" Dobro, tunings `T-001`–`T-008`, string products with unit weights, positions `P-001`–`P-003`, motif `M-001`, composition `C-001`) to an **empty** database:
```bash
npm run db:seed
```
Seeding is skipped automatically when the database already contains instruments; it never overwrites existing records.

### Starting the App
```bash
npm run dev            # development server, http://127.0.0.1:3000 (this computer only)
# or, after a build:
npm run build && npm start   # production server, http://127.0.0.1:3000
```
Or run `scripts/launch-app.sh` from a terminal (add `--lan` for network access).

### Verification
```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify   # all four in sequence
```
Tests use in-memory or temporary databases only. When running builds or experiments, set `MUSIC_NOTEBOOK_DATA_DIR` to a temporary directory so nothing touches your real notebook.

### Launcher
`scripts/launch-app.sh` derives the repository location from its own path (no hard-coded paths). It refuses to run from non-interactive callers (IDE tasks, scripts, agents) unless `--yes` is passed, and if the database needs a migration it stops and asks you to type `migrate` (it then runs `npm run db:migrate`, which makes a complete backup first). To make a double-clickable macOS launcher, create a file such as `~/Desktop/BxB Music Notebook.command` containing:
```bash
#!/usr/bin/env bash
"<path-to-your-clone>/scripts/launch-app.sh"
```
and run `chmod +x` on it. Such personal launchers are intentionally not committed.

### Network access (LAN / Tailscale) — explicit opt-in
```bash
npm run dev:lan      # or: npm run start:lan, or scripts/launch-app.sh --lan
```
This binds `0.0.0.0`, making the notebook reachable by **every device that can reach this computer's port 3000**. The app has **no login or authentication**: anyone who can reach it can read, change, and export your notebook. Binding to `0.0.0.0` is not a security measure.

If you want iPad access, prefer a private tailnet (e.g. Tailscale) with restrictive ACLs that allow only your own devices to reach this machine's port, keep the host firewall enabled, and never port-forward it to the internet. Use the machine's tailnet name/address shown by your Tailscale client; no addresses are stored in this repository.

---

## 4. Data Storage & Backup Procedures

### Storage Hierarchy
Data is stored beneath the project root in `storage/`:
```text
storage/
  database/     # notebook.db (SQLite, WAL mode - private/ignored)
  media/        # Audio memos and file attachments (private/ignored); media/.trash/ holds deleted files
  backups/      # Complete backups and pre-migration copies (private/ignored)
```

To store runtime data on an external drive or custom NAS mount point, set the environment variable:
```bash
export MUSIC_NOTEBOOK_DATA_DIR="/Volumes/SecureStorage/BxBMusicData"
```

### Schema Migrations
The schema is defined once in [`app/db/schema.ts`](app/db/schema.ts); versioned migrations live in [`drizzle/`](drizzle/) and are recorded in the database's `__drizzle_migrations` table.
```bash
npm run db:status     # read-only: applied/pending migrations and review flags
npm run db:migrate    # complete backup (database + media) first, then apply pending migrations
npm run db:generate -- --name=<change>   # after editing schema.ts (developers)
```
A fresh/empty database is initialized from migrations automatically on first start. An existing database with pending migrations is **not** migrated automatically — the server returns 503 and the log instructs you to run `npm run db:migrate` or use `scripts/launch-app.sh`. This prevents IDE auto-preview processes and builds from silently altering your data. `npm run db:migrate` creates a complete backup (database + media) first, then applies all pending migrations in one transaction: if any step fails, nothing changes and the backup is there to recover from. Databases created before migrations existed are *adopted*: their tables are verified against the baseline and recorded as migrated without altering any row.

Migration `0002` corrects only the seeded 5-string banjo (`T-007` and the banjo's per-string speaking lengths) when they still exactly match the original seed values; other records are never reordered. Anything ambiguous is listed by `npm run db:status` under "Review flags".

### Complete Backup (disaster recovery)
```bash
npm run backup                        # create + verify a backup folder in storage/backups/
npm run backup -- --label=before-trip
npm run backup -- --verify=<backup-folder>
npm run backup -- --keep=10 [--dry-run]   # OPT-IN: remove all but the 10 newest complete backups
```
Each `bxb-backup-<timestamp>/` folder contains `database/notebook.db` (taken with the SQLite online backup API, safe while the app is running in WAL mode), a copy of every media file, and `manifest.json` with app/schema versions, file sizes and SHA-256 checksums. The backup is verified (checksums, `integrity_check`, row counts) before it is reported as successful. Nothing is deleted unless you pass `--keep`. Copy backup folders to another disk for real disaster recovery.

### Restoring a Backup
Stop the app (and any dev server) first, then:
```bash
npm run restore -- storage/backups/bxb-backup-<timestamp>
npm run restore -- --latest
```
Restore refuses while another process has the database open, holds `database/maintenance.lock` while it runs, always creates a `pre-restore` backup of the current data, validates the backup in a staging folder (including applying any newer migrations to the staged copy), and only then swaps it in. The replaced database and media are kept in `storage/.restore-<timestamp>/`; delete that folder yourself once satisfied.

### JSON Export vs. Backup
`/api/export` produces a portable, human-readable JSON export of records (attachment metadata only, no media files). It is **not** a disaster-recovery backup; use `npm run backup` for that. JSON import is not implemented yet.

### Media Housekeeping
```bash
npm run media:orphans                    # read-only report
npm run media:orphans -- --move-to-trash # move unreferenced files to media/.trash/ (never deletes)
```

---

## 5. Design Assets & Git LFS Policy

- **Committed Assets:** Vector SVGs and high-resolution PNG reference renders in `assets/SVG/` and `assets/2x/` are versioned directly in Git as standard visual reference assets.
- **Excluded Assets:** Master Adobe Illustrator source files (`assets/printed-assets/*.ai`), Photoshop documents (`*.psd`), and raw audio/video files are excluded from Git to keep repository size lean.
- **Git LFS Recommendation:** If master Illustrator source files (`.ai`) or high-resolution multi-track audio session recordings must be version-controlled in the future, Git LFS (`git-lfs`) should be enabled for tracking `*.ai` and `*.wav`. Currently, keeping them in local project storage without Git LFS keeps the public repository light and fast to clone.

---

## 6. Architecture Documentation & Roadmap

Detailed architectural and design specifications are maintained in `docs/`:
- [`docs/PRODUCT-SPEC.md`](docs/PRODUCT-SPEC.md) — Comprehensive functional requirements.
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — Schema, relations, and snapshot immutability rules.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — Architectural decision records (ADRs).
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Development phases and deferred capabilities.
- [`CLAUDE.md`](CLAUDE.md) — Data-preservation rules and conventions for contributors and coding agents.

### Current Status & Deferred Capabilities
- **Status:** Phase 1 MVP with a data-integrity hardening pass in progress. Done: canonical string order, capo-safe tension, input validation, transactional Quick Capture with draft recovery, safe attachments, versioned migrations, verified backup/restore, local-only defaults. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what is partial.
- **Not yet implemented / partial:** JSON import; self-contained per-record export bundles; edit/archive workflows for every record type; per-string (Spider) capo editor UI; String Lab material-compatibility safeguards and saving calculated sets; CI workflow.
- **Deferred by design:**
  - Multi-device sync beyond direct LAN / tailnet access to one server.
  - Direct MIDI recording and polyphonic pitch transcription.
  - Native iOS / iPadOS wrapper app packaging.

---

## 7. Docker & NAS Deployment

A `Dockerfile` and `docker-compose.yml` are provided. The image never contains your data (see `.dockerignore`); data lives in the mounted volume (`./storage` → `/data`).
```bash
docker compose up -d --build
```
By default the compose file publishes the port on `127.0.0.1:3000` only. To reach it from other devices, change the mapping to `"3000:3000"` **only** on a trusted network, ideally reachable solely through a tailnet with restrictive ACLs; the app has no authentication. Migrations run automatically at container start (with a pre-migration copy in `/data/backups`). Run backups inside the container with `docker compose exec music-notebook npm run backup`, and stop the container before `npm run restore`.

SQLite must live on a local disk of the machine running the app (not an SMB/NFS share opened by several clients). The Docker/NAS setup has not yet been tested on specific NAS products.
