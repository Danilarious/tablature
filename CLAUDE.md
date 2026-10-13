# CLAUDE.md — Agent guidance for BxB Music Notebook

Local-first, single-user, lifelong music notebook. Next.js 14 (App Router) + React 18 +
Drizzle ORM + better-sqlite3 + Tailwind. **Treat every change as brownfield data preservation.**

## Non-negotiable data rules
- Never delete, overwrite, reseed, or silently reorder existing user records.
- `npm run db:seed` only seeds an *empty* database; never call it against a populated one.
- UUIDs and human IDs (`T-###`, `P-###`, `M-###`, `C-###`) are permanent.
- Schema changes go through Drizzle migrations in `drizzle/` (see "Migrations"; being added
  in hardening milestone 3). Never add new `CREATE TABLE IF NOT EXISTS` or ad-hoc
  `ALTER TABLE` in runtime code.
- Data migrations may only transform a record when it *exactly* matches a known legacy value.
  Anything ambiguous is preserved and recorded in `review_flags`.
- Back up with the SQLite online backup API (`sqlite3 db ".backup 'dest'"`) before running
  migrations against a real database. (The current `npm run backup` is NOT WAL-safe until M3.)
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

## Commands
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- Tests/builds/previews must not touch the real DB: set `MUSIC_NOTEBOOK_DATA_DIR` to a temp
  dir for every agent-run command. Never run `next dev` and `next build` concurrently (they
  share `.next/`).
- Pending (M3): `npm run db:migrate`, `db:status`, `db:generate`, WAL-safe `backup`/`restore`.

## Network
- Pending (M3): `npm run dev` / `npm start` will bind `127.0.0.1`, with LAN exposure
  (`dev:lan`/`start:lan`) as an explicit opt-in with **no application authentication**.
  Until then `npm run dev` binds `0.0.0.0`.
