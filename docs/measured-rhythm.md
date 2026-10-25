# Measured rhythm v2

PR A builds on the merged Quick Capture PR #5 baseline. Remote main and the production
checkout matched the expected merge commit. The running image's revision label named
PR #5's final pre-merge commit; its Git tree is identical to the merge commit. Every
source file actually copied by the Dockerfile (database, library, scripts and migrations)
matched the checkout. UI source files are compiled into Next bundles, not copied as source.
The existing deleted media placeholder was left untouched.

Read-only reconciliation: SQLite integrity `ok`, no foreign-key violations, all five
migrations applied, none pending. The two existing informational seed review flags remain.
The previous post-deployment backup verifies. A fresh online SQLite and media backup was
created and verified outside production. Migration rehearsal on a copied database reports
already current; no schema migration is needed. Production data, container, routing and
other services are unchanged during development.

## Representation and compatibility

The persisted TAB array remains the storage format. Legacy events have no rhythm version;
`adaptTabData` returns a version-1 free-rhythm view and retains the original event objects.
No read path guesses durations, infers bars, or saves transformed legacy records.

Measured events add `rhythmVersion: 2`, `measureId`, `meter` and `autoRest`. Contiguous
events sharing an ID form a fixed-capacity measure. Meters belong to measures, so choosing
a new meter for an added measure does not retime existing measures. The adapter provides
a structured measure view; the renderer derives ordinary barlines at its boundaries.
Double/final boundary choices survive edits. API validation preserves these fields and
rejects mixed or noncontiguous measure structures and generated rests containing notes.

A whole note is 192 integer ticks. This represents all currently supported binary,
dotted-quarter and eighth-triplet durations exactly. Capacity is numerator × 192 /
denominator. Grace events have zero ticks. Unsupported residual rest durations reject
the edit rather than round or move explicit events. Existing underfilled and overflowing
measures remain visible with status; they are never silently normalized.

A new Quick Capture defaults to measured 4/4 with four quarter-note generated-rest
slots. IDs are generated in the client load effect only after checking for a saved
draft, so server/client hydration never depends on random IDs. Restored free-rhythm
drafts retain their original events and mode, even if they have a numeric meter.
Free Rhythm is an explicit mode choice; switching entered measured content to it
requires confirmation and retains durations, notes, rests and visible boundaries.

A meter change repopulates a single pristine denominator-slot measure. If there is
explicit material, a changed rhythm, a special boundary, or multiple measures, the
selector is labeled “Meter for next measure.” Existing measures keep their meter
and event timing; adding a new measure can therefore create mixed-meter captures.

Empty measures start with denominator-note generated rests. Shortening inserts the freed
rest immediately after the event. Lengthening consumes only contiguous generated rests
after it within that measure. Explicit notes, explicit rests and grace events stop that
search. A rejected edit keeps all events and explains safe choices.

The Rest control cycles generated rest → explicit rest → editable generated rest;
it never turns an empty measured slot into a non-rest blank. Fret entry replaces a
generated rest with a note/chord, and clearing the last note returns it to a rest.
A technique is retained on an explicit rest and must be removed before that rest can
become generated. Validation rejects measured non-grace events with neither notes
nor a rest, and rejects rests that also contain notes. Status amounts use exact
musical fractions of quarter-note beats rather than floating-point decimals.
Deleting a regular event replaces it with a generated rest; deleting explicit material
asks for confirmation. A grace deletion removes only that zero-time event. The last deleted measure becomes a fresh empty measure.

6/8 displays a dashed midpoint grouping for 3+3. The composer shows duration symbols with
text and visible boundaries. Print uses the same adapter, durations, measure statuses,
rest symbols, grace/technique markers and boundary styles, packing complete measures into
systems where they fit. Very long measures continue across systems in event order.

## Future AlphaTab adapter

AlphaTab is not installed. Explicit capacity, event durations, zero-time grace notes and
stable measure IDs remove the need to invent bar placement for v2 events. A future adapter
can map ticks to rational beats and measure boundaries to bars, with round-trip tests.
Lossless conversion still requires preserving original event IDs, physical string order,
per-string capo offsets, unknown technique text and all legacy free-rhythm material in
extension metadata. Unsupported notation must remain in that metadata or produce a clear
conversion refusal; a rendered AlphaTab score alone cannot guarantee a lossless notebook.

## Browser acceptance at desktop and mobile sizes

The measured workflow runs at 1440×1000 and 390×844. Event columns keep their readable
width and the labeled, keyboard-focusable TAB region scrolls horizontally. A short
in-page instruction explains scrolling and tapping an event to reach its controls.
Desktop horizontal-wheel input and a mobile touch swipe are exercised before reaching
the last event. Measure actions and the active-event toolbar wrap within the viewport;
they remain above the staff rather than inside its horizontal scroller. Acceptance exercises the
last event, visible duration and boundary, measure actions, duration/conflict editing,
rest transitions, reload, exact persisted TAB, legacy free-draft restoration and PDF
generation at both sizes. The broad pre-existing Quick Capture probe explicitly
selects Free Rhythm to continue testing the original legacy workflow.
