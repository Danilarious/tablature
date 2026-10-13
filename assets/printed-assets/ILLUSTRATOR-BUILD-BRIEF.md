# Danilarious Music Notation System

## Illustrator production brief

### Objective

Build a coherent family of editable US Letter portrait templates for a personal guitar composition, tuning, and motif archive. The wireframes define information architecture, hierarchy, spacing, and component behavior. The existing Illustrator assets remain the visual source of truth.

The first production set is:

1. 6-String Composition Record
2. 7-String Composition Record
3. Tuning Record
4. Motif Record

The Component Legend is a production reference, not a finished printable worksheet.

### Source-of-truth hierarchy

1. Existing canonical vector assets: custom display type, diamond position diagrams, TAB systems, fretboards, tuning fields, rules, and related graphic elements.
2. Wireframe package: placement, function, relative scale, and page hierarchy.
3. This brief: naming, editability, consistency, and production constraints.

Do not redraw a canonical asset merely because a generic placeholder appears in the wireframe.

### Document setup

- Page size: US Letter, 8.5 x 11 inches, portrait.
- Live margin: 0.5 inches on every edge.
- Initial color mode: grayscale or CMYK black-only print master.
- Optional digital styling: separate layer or separate saved version using a restrained muted palette.
- Keep all objects vector and editable.
- Do not rasterize, image trace, flatten, or outline live text during layout development.
- Use a consistent spacing increment and align all modules to a shared page grid.

### Recommended artboards

```text
00 - COMPONENT LIBRARY
01 - WIREFRAME - 6 STRING COMPOSITION
02 - FINAL - 6 STRING COMPOSITION
03 - WIREFRAME - 7 STRING COMPOSITION
04 - FINAL - 7 STRING COMPOSITION
05 - WIREFRAME - TUNING RECORD
06 - FINAL - TUNING RECORD
07 - WIREFRAME - MOTIF RECORD
08 - FINAL - MOTIF RECORD
```

### Recommended layers

```text
GUIDES
WIREFRAME
TYPOGRAPHY - DISPLAY
TYPOGRAPHY - UTILITY
STRUCTURE + RULES
TAB - 6 STRING
TAB - 7 STRING
PRIMARY POSITIONS - 6 STRING
PRIMARY POSITIONS - 7 STRING
FRETBOARDS
FORM LABELS
ANNOTATIONS
OPTIONAL DIGITAL COLOR
```

Lock `GUIDES` and `WIREFRAME` while constructing each final artboard. Keep the wireframe visible at reduced opacity when useful, then hide it before export.

## Component behavior

### A. Display heading

Use the existing custom display lettering as the principal identity. Keep it visually expressive while utility labels remain quiet and legible.

### B. Metadata fields

Use compact fields for IDs, working title, date, guitar/instrument, source, and references. A blank rule is usually preferable to a heavy box.

### C6 / C7. TAB systems

- Six-string and seven-string systems must remain separate components.
- TAB is always entered relative to the documented tuning and capo.
- Preserve sufficient vertical spacing for handwritten fret numbers, articulations, rhythm hints, and connecting marks.
- Do not label string pitches directly on the staff. The setup block is authoritative.

### D6 / D7. Primary positions

- Use the existing rotated/diamond diagrams.
- Preserve the small fret-position field.
- Leave a short optional label beneath each diagram.
- These may represent chords, drones, fragments, clusters, harmonics, or moveable shapes, so use `PRIMARY POSITIONS`, not `CHORD LIBRARY`.

### E6 / E7. Fretboard taxonomy

Use the correct number of strings. Keep the visual light enough that handwritten marks remain dominant.

### F. Setup block

Capture tuning, full or partial capo, tonal center/home, drone/home position, tempo, and feel. Partial capo notation should use a compact string-selection row rather than a large table.

### G. References

Use these identifiers:

- `T-###`: Tuning
- `C-###`: Composition
- `M-###`: Motif
- `P-###`: Position or voicing, only if later proven useful

IDs may be assigned after an idea becomes worth preserving.

### H. Freeform zones

Keep Piece Map and Notes areas visually open. Boxes should indicate real conceptual containers, not decorate every field.

## Page-specific intent

### 6-String Composition Record

A durable master overview. It captures setup, eight Primary Positions, a freeform Piece Map, two abbreviated core section or motif transcriptions, links to the Tuning and Motif records, continuation-page references, and general notes. It is not expected to contain every note of a finished composition.

### 7-String Composition Record

The same information architecture as the six-string record, but with genuinely seven-string tuning, partial-capo, position, TAB, and fretboard components. Do not scale or relabel six-string components as a shortcut.

### Tuning Record

One record per meaningful tuning. It should document not only pitch assignments, but also the musical territory discovered inside the tuning: Primary Positions, tonal character, capo configuration, fretboard taxonomy, associated motifs, associated compositions, and practical notes.

The current wireframe is an architectural master. During final production, duplicate it into six-string and seven-string printable variants if the canonical fretboard and position assets require different fixed geometry.

### Motif Record

One motif per record. Capture enough setup context that the transcription will remain understandable years later. Include position context, the primary transcription, two optional variations, function/use, related motifs, related compositions, and notes.

The current wireframe intentionally uses TAB placeholders. Create separate six-string and seven-string final Motif Record variants rather than placing ambiguous 6/7 TAB on a printable page.

## Illustrator AI agent prompt

Use this only after the fresh master file contains the canonical vector component library and the wireframe SVGs or PDF have been placed on locked reference layers.

```text
You are working inside a fresh Adobe Illustrator master document for the Danilarious Music Notation System. The document contains: (1) a component-library artboard with canonical editable vector assets created by the designer, (2) placed wireframe artboards that define layout and information architecture, and (3) blank final artboards corresponding to those wireframes.

Build the final printable templates on the blank FINAL artboards using the existing canonical vector assets. Treat the wireframes as spatial and functional specifications, not as finished artwork. Treat the existing component-library assets as the source of truth for visual style, line geometry, string counts, typography, chord/position diagrams, TAB systems, fretboards, and custom display headings.

Required final artboards:
1. FINAL - 6 STRING COMPOSITION
2. FINAL - 7 STRING COMPOSITION
3. FINAL - TUNING RECORD
4. FINAL - MOTIF RECORD

Page and print requirements:
- US Letter portrait, 8.5 x 11 inches.
- Maintain a minimum 0.5-inch live margin.
- Build a clean black-and-white print master first.
- Use crisp vector paths and live editable text.
- Do not rasterize, flatten, image trace, or convert text to outlines.
- Do not invent decorative imagery, textures, gradients, shadows, or ornamental borders.
- Retain generous negative space and the sparse technical/editorial character of the source assets.

Asset-use rules:
- Replace every generic wireframe placeholder with the closest canonical component from the component library.
- Preserve the custom display typography and distinctive rotated diamond position diagrams.
- Preserve the small fret-position field attached to each position diagram.
- Use exactly six strings in every six-string tuning, partial-capo, position, TAB, and fretboard component.
- Use exactly seven strings in every seven-string tuning, partial-capo, position, TAB, and fretboard component.
- Do not stretch six-string graphics to imitate seven-string graphics.
- Utility labels should use one restrained, highly legible type family and a consistent hierarchy.
- Use boxes only where the wireframe defines a meaningful conceptual container. Prefer fine rules and open space for ordinary fields.

Content and naming rules:
- Use PRIMARY POSITIONS, not CHORD LIBRARY.
- Use TONAL CENTER / HOME rather than forcing every idea into a conventional key.
- Keep references available for T-###, C-###, and M-### identifiers.
- Treat the Composition pages as master overview records, not complete long-form transcription pages.
- Treat the Tuning Record as a catalog of discoveries within a tuning, not merely a list of pitches.
- Treat one Motif Record as one portable musical idea with its own context, transcription, variations, and references.

Layer and editability rules:
- Put display typography, utility typography, structural rules, TAB, position diagrams, fretboards, labels, and annotations on separate clearly named layers.
- Keep the placed wireframe on its own locked layer and do not modify it.
- Group each reusable final component logically.
- Create or preserve Illustrator symbols for repeated position diagrams, TAB systems, fretboards, and field modules when practical.
- Align all modules to a shared grid and use consistent spacing increments.

First, construct the four requested final artboards without creatively reinterpreting the architecture. Then perform a consistency pass checking margins, line weights, baseline alignment, spacing, heading scale, string counts, and field naming. Do not delete or overwrite the source component library or wireframe artboards. If an exact required component does not exist, create a clearly labeled editable placeholder on the correct final layer rather than inventing a new stylistic direction.
```

## Review checklist before print testing

- Confirm all artboards are US Letter portrait.
- Confirm every essential mark remains inside the 0.5-inch live margin.
- Count every tuning row, TAB line, partial-capo selector, position diagram, and fretboard string.
- Confirm 6-string and 7-string components were not mixed.
- Confirm all IDs and cross-reference fields use consistent syntax.
- Confirm handwriting space is sufficient at 100% print scale.
- Print one copy on an ordinary home printer using Actual Size, not Fit to Page.
- Write on every field with the pen or pencil normally used.
- Revise based on real use before expanding to continuation sheets or a full book.

## Recommended next production phase

After these four records survive real handwritten use, build:

1. 6-String TAB / Phrase Continuation
2. 7-String TAB / Phrase Continuation
3. 6-String Motif Record final variant
4. 7-String Motif Record final variant
5. 6-String Tuning Record final variant
6. 7-String Tuning Record final variant
7. Position Library pages, only if cross-tuning position IDs prove useful

