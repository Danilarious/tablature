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

Empty measures start with denominator-note generated rests. Shortening inserts the freed
rest immediately after the event. Lengthening consumes only contiguous generated rests
after it within that measure. Explicit notes, explicit rests and grace events stop that
search. A rejected edit keeps all events and explains safe choices. Event deletion replaces
it with a generated rest; deleting explicit material asks for confirmation. A grace deletion
removes only that zero-time event. The last deleted measure becomes a fresh empty measure.

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
