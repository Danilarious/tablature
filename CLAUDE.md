# CLAUDE.md — Agent guidance for BxB Music Notebook

Local-first, single-user, lifelong music notebook. Next.js 14 (App Router) + React 18 +
Drizzle ORM + better-sqlite3 + Tailwind. **Treat every change as brownfield data preservation.**

## Non-negotiable data rules
- Never delete, overwrite, reseed, or silently reorder existing user records.
- `npm run db:seed` only seeds an *empty* database; never call it against a populated one.
- UUIDs and human IDs (`T-###`, `P-###`, `M-###`, `C-###`) are permanent.
- Schema changes go through Drizzle migrations in `drizzle/`. Never add new
  `CREATE TABLE IF NOT EXISTS` or ad-hoc `ALTER TABLE` in runtime code.
- Data migrations may only transform a record when it *exactly* matches a known legacy value.
  Anything ambiguous is preserved and recorded in `review_flags`.
- Back up with `npm run backup` (WAL-safe, SHA-256 verified) before running migrations against
  a real database. `npm run db:migrate` creates a complete backup automatically.
- Never commit `storage/**` contents, `imports/**`, `exports/**`, `*.db*`, audio, `.env*`,
  absolute local paths, or Tailscale/LAN addresses.
- Do not fabricate string unit weights or manufacturer data. Unknown stays `null`/"unknown".

## Canonical string-order invariant (see `app/lib/music/string-order.ts`)
- Every per-string array (tuning pitches, speaking lengths, string-set assignments, capo
  frets, position frets/fingers, TAB `stringIndex`) uses **index 0 = physical bass-side
  string**, proceeding toward the treble side.
- Physical string number = `stringCount - index` (high E on a guitar is string 1 = last index).
- Standard TAB displays the array reversed (treble-side string on top).
- Reentrant pitch never changes physical order. 5-string banjo canonical order is
  `[G4 (5th, short), D3, G3, B3, D4]` with speaking lengths `[short, full, full, full, full]`.
- TAB fret numbers on a capoed string are **relative to the capo** (0 = capoed open string);
  sounding = open + capo + tabFret. The fretboard shows physical neck frets and converts with
  `tabFretFromNeckFret` / `neckFretFromTabFret`.

## Physics
- Tension uses the **open (uncapoed) pitch at full physical scale length**. A capo changes
  sounding pitch, not tension. Effective vibrating length = `L / 2^(capoFret/12)`.

## Write paths
- Multi-record writes go through services in `app/lib/services/` inside one
  `db.transaction(...)` (e.g. `createQuickCapture`: capo → setup → motif, all-or-nothing).
- Attachments: `saveAttachment` validates parent type/existence, extension/MIME and size,
  streams to `media/.incoming-*`, renames, inserts, and unlinks the file if the insert fails.
  Never attach to a temporary parent ID; pending browser media is uploaded only after the
  real record exists (`app/lib/media/pending-media.ts`). Deleting moves files to `media/.trash/`.
- `npm run media:orphans` is a read-only report (`--move-to-trash` moves aside, never deletes).
- Quick Capture drafts live in `localStorage` (`bxb.quickCapture.draft.v1`); cleared only on
  successful save or explicit discard.

## Commands
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- Tests/builds/previews must not touch the real DB: set `MUSIC_NOTEBOOK_DATA_DIR` to a temp
  dir for every agent-run command. Never run `next dev` and `next build` concurrently (they
  share `.next/`).
- `npm run db:status` — read-only migration status and review flags.
- `npm run db:migrate` — creates a complete backup then applies pending migrations.
- `npm run db:generate -- --name=<change>` — generate a migration after editing schema.ts.
- `npm run backup` / `npm run restore` — WAL-safe disaster-recovery backup and restore.
- A fresh/empty database is initialized from migrations automatically on first start.
  An existing database with pending migrations is **not** migrated automatically; the server
  returns 503 and instructs the user to run `npm run db:migrate` or `scripts/launch-app.sh`.

## Network
- `npm run dev` / `npm start` bind `127.0.0.1` (localhost only).
- LAN exposure (`dev:lan`/`start:lan`) is an explicit opt-in with **no application authentication**.
