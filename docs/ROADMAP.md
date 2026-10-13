# BxB Music Notebook — Development Roadmap

## Phase 1: Local-First Core Foundation (Current MVP)
- [x] Initial design & asset inventory preservation (`/assets` untouched)
- [x] Comprehensive documentation (`PRODUCT-SPEC.md`, `DATA-MODEL.md`, `DECISIONS.md`, `ROADMAP.md`)
- [x] SQLite database schema with Drizzle ORM and automatic migrations
- [x] Pre-seeding of the 10 known instruments with accurate missing-data flags
- [x] Instrument, Tuning (`T-###`), String Set, and Setup management
- [x] Fast Quick Capture mobile & desktop workflow
- [x] Synchronized TAB & fretboard editor supporting 5, 6, and 7 strings with partial/spider capo integration
- [x] Primary Positions editor with rotated diamond presentation and `P-###` tags
- [x] Composition archive (`C-###`) with piece maps and multi-instrument setup relationships
- [x] Unified Library search and relationship filters
- [x] String Lab tension and gauge calculator with physical formulas and candidate ranking
- [x] Local audio memo recording and file attachment storage in `storage/media/`
- [x] Browser print styles matching US Letter templates and full JSON export/import

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
- [ ] Production Dockerfile and `docker-compose.yml` for Synology/TrueNAS/Unraid
- [ ] Tailscale integration instructions and systemd service scripts
- [ ] Automatic rolling local backup to secondary storage volumes
