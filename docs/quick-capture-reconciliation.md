# Quick Capture reconciliation and acceptance

## Baseline evidence

Before changes, production checkout HEAD, cached origin/main, and remote main all resolved
to c7102ca14e7a2d163aefb8f10320f0d5ba73a42b. GitHub API confirmed PRs #3 and #4 merged.
The working tree's deleted media placeholder was preserved. The running container used
image sha256:e7c1d8d43fe1500909ee6b681e2368280b31813e62b703d893f1aa61c2fbcb6c;
all 54 copied source/migration/script files matched the checkout. Browser DOM confirmed
the corresponding Quick Capture controls; no evidence of a checkout-only deployment.
Container had no source revision label, so exact build provenance was unavailable.

Live read-only SQLite integrity result: ok. Four migrations applied, including
0003_quick_capture_v1_1; no pending migration. Known M-003 and its attachment existed.
M-003 was unassigned, with 34 TAB events, no captured tempo/meter/map values.
One other motif was linked to the existing composition's Intro section. No user data
was inferred, relinked, or rewritten. The reported October 19 backup's database/media
SHA-256 checks and database integrity were independently verified.

Routes home, Quick Capture, Library, Compositions and known motif print all returned
200 and were inspected in Chromium. Correct registered media route returned 206 for
bytes 0–99 of 340328. Private BxB listener and separate root service routing were intact.

## Classification

- Implemented and deployed: destination controls; transactional setup/motif/composition
  joins; independent multi-position map; per-event durations, rests, grace marker,
  techniques and arbitrary barlines; multi-system motif printing; named pending audio.
- Present but not deployed: none found.
- Visible but incomplete: composition cards omitted all linked motifs/sections; Library
  advertised relationships but hid motif composition assignments. Success links went to
  generic lists. Map extent was fixed at 15 in capture. Tap tempo immediately changed BPM
  and used an unfiltered average. Audio requested raw constraints without feature detection
  or an explanation of device processing limits.
- Missing: inbox placement action, inline tuning editor, playback in saved motif views,
  attachment atomicity with capture, browser persistence acceptance tests.
- Model limits: composition sections are JSON objects, while joins refer to section names,
  not stable section foreign keys. The fix reuses this model, creating a section when a
  name is new and offering existing names. Untitled placement uses “Unsectioned”. Existing
  section content is preserved. Concurrent section rename semantics remain future work.
- Unexplained: loud first-note microphone behavior cannot be attributed conclusively
  without testing the user's actual browser/device. No app audio compressor/gate exists
  in the recorder path; original recording bytes are preserved. Hardware test below.

The earlier HTTP/build verification could not establish that a user could find and
place an inbox motif, see it in a section, or play it back in a saved view.

## Implementation

Reuse existing validation, media type/size checks and SQLite transactions. Multipart
capture stages validated files before opening the synchronous transaction. Capture,
setup, section, composition joins and attachment rows commit together; rejected requests
remove staged files. A crash before commit can leave an unregistered file, detectable
by the existing read-only orphan report. No temporary parent record is ever inserted.
Pending browser blobs remain on the page after a rejected save. A stable UUID is saved
with the draft before sending and used as the motif ID. Retrying an ambiguously completed
request returns the committed capture instead of creating another one, and removes any
newly staged retry files. Draft editing is frozen after a lost response until retry
reconciles the saved result, so later edits/recordings cannot be silently treated as saved.
The fret extent is persisted and also expanded for restored TAB notes. Legacy null/blank
sections deduplicate as Unsectioned. In-memory media cannot
survive closing/reloading the tab; existing navigation guards explain that limitation.

Migration 0004_capture_receipts adds an empty receipt table with a motif foreign key,
a SHA-256 request fingerprint (including recording bytes and metadata), and the original
result. Receipt and capture commit together. Changed shared-draft submissions return 409;
the UI retains edits/media and offers an explicit separate capture action. Ambiguous
network and 5xx errors keep edits frozen until reconciliation. Existing notation JSON,
attachment names and user records are untouched.
Placement adds joins without cloning or modifying motif content, and avoids duplicates
for the same motif/composition/section. Capture offers new named tuning creation through
the validated tuning API without replacing another tuning or leaving the draft.

## Notation and AlphaTab assessment

The current model stores an ordered list of events with physical string indexes, relative
capo frets, optional durations, freely placed boundaries, free-text techniques and standalone
grace-marked events. A grace event is interpreted as leading into the next primary event.
Legacy captures may omit durations/meter and have unknown technique text. Reentrant tunings,
per-string capo offsets, incomplete bars and unmeasured ideas must survive unchanged.
A reliable notation adapter therefore needs explicit policies for missing rhythms,
bar completion, technique interpretation and grace association. Treating these as complete
measured scores would invent information. AlphaTab is deferred behind a future adapter;
this change retains the current renderer and persistence. No AlphaTab dependency added.

## Automated acceptance

`npm run verify` uses an isolated MUSIC_NOTEBOOK_DATA_DIR.
`npm run test:runtime` creates its own temporary directory, seeds only that empty directory,
runs next build plus next start, then Chromium interactions. CHROME_PATH can override the
local Chrome binary. Evidence (screenshots, PDF, result JSON and server log) stays in the
reported temporary directory; no private user content is committed.

The probe covers all three destinations, inline tuning validation/selection with draft
retention, map multi-select/toggle and draft reload, notation persistence, failed capture
with pending media retained, two recordings, placement of an inbox motif, section display,
print routes, decoded audio playback and byte ranges. Unit tests inject attachment insert
failure and verify rollback of motif/setup/capo/composition/section joins.

## Manual microphone checklist

1. Use the same microphone, input level, distance and browser as the reported problem.
2. Record a named take with a strong first pluck, then ten even plucks and quiet sustained notes.
3. Compare playback with an OS recorder; repeat with a different browser/device if available.
4. Check browser-reported capture settings and OS/driver input enhancement controls.
5. Listen for level pumping, gating, clipping and lost sustain. Record actual device/browser
   and settings. Raw constraints are requests; they cannot guarantee removal of OS/hardware AGC.
