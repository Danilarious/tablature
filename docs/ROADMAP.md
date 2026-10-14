# BxB Music Notebook — Development Roadmap

## Phase 1: Local-First Core Foundation (Current MVP)
- [x] Initial design & asset inventory preservation (`/assets` untouched)
- [x] Comprehensive documentation (`PRODUCT-SPEC.md`, `DATA-MODEL.md`, `DECISIONS.md`, `ROADMAP.md`)
- [x] SQLite database schema with Drizzle ORM and versioned migrations (`drizzle/`, applied at startup after a pre-migration copy; legacy databases adopted without row changes)
- [x] Pre-seeding of the 10 known instruments with accurate missing-data flags
- [ ] Instrument, Tuning (`T-###`), String Set, and Setup management — *partial: create flows exist; edit/archive workflows for every record type are not finished*
- [x] Fast Quick Capture mobile & desktop workflow (single-transaction save, pending audio attached after save, unsaved-draft recovery)
- [ ] Synchronized TAB & fretboard editor supporting 5, 6, and 7 strings with partial/spider capo integration — *partial: canonical string numbering, full and "all but bass string" partial capos; per-string Spider capo editor and remaining TAB controls not built*
- [x] Primary Positions editor with rotated diamond presentation and `P-###` tags
- [ ] Composition archive (`C-###`) with piece maps and multi-instrument setup relationships — *partial: editing linked motifs/setups/positions not finished*
- [x] Unified Library search and relationship filters
- [ ] String Lab tension and gauge calculator — *partial: capo-correct physics, per-string lengths and unknown-unit-weight handling done; active-string-set defaults, material compatibility warnings and saving calculated sets not done*
- [x] Local audio memo recording and file attachment storage in `storage/media/` (validated types/size, private no-store serving, delete to `.trash`)
- [ ] Browser print styles matching US Letter templates and JSON export/import — *print styles and full JSON export done; JSON import and self-contained per-record bundles not implemented*

## Data Integrity & Durability (hardening pass)
- [x] Canonical string order (index 0 = bass-side string) with deterministic migration of the seeded banjo only
- [x] Capo changes sounding pitch, not tension
- [x] Centralized runtime validation (zod) and safe API error responses
- [x] WAL-safe complete backups (database + media + checksummed manifest), verified restore with safety backup and maintenance lock
- [x] Local-only (`127.0.0.1`) by default; LAN access via explicit `dev:lan` / `start:lan`
- [ ] GitHub Actions CI (typecheck, lint, test, build)

## Phase 2: Enhanced Musician Tools & Audio Enhancements
- [ ] In-browser audio playback waveform viewer with loop points for motifs
- [ ] Pitch-matched virtual playback for TAB columns using Web Audio API synthesis
- [ ] Repertoire setlist creator grouping Compositions for performance
- [ ] Extended String Lab algorithms:
  - Tension curve balancing across sets
  - Interval-locked tuning transitions
  - Custom unit-weight calibration wizard
- [ ] Bulk batch export of all compositions to individual styled printable PDFs

## Phase 3: Hardware Integrations & MIDI Input (Deferred by Design)
- [ ] Web MIDI API input support
- [ ] Multi-channel Fishman TriplePlay / hexaphonic guitar pickup capture
- [ ] Pitch-to-string/fret disambiguation algorithms
- [ ] Real-time polyphonic MIDI TAB transcription

## Phase 4: Headless NAS & Multi-Device Sync
- [ ] Production Dockerfile and `docker-compose.yml` for Synology/TrueNAS/Unraid — *a Dockerfile and localhost-mapped compose file exist; not yet tested on specific NAS products*
- [ ] Tailscale integration instructions and systemd service scripts — *README documents opt-in LAN/tailnet access and ACL advice; no service scripts yet*
- [ ] Automatic rolling local backup to secondary storage volumes — *manual `npm run backup` with opt-in `--keep` retention exists; no scheduling*
