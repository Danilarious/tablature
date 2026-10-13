# BxB Music Notebook — Architectural Decision Records (ADR)

## ADR-001: Local-First Embedded SQLite with Drizzle ORM
- **Context**: The notebook is a personal, lifelong musical journal. It must operate offline on a Mac today, and potentially on a Linux/NAS server tomorrow. It must never depend on third-party cloud DBs, SaaS auth, or network latency.
- **Decision**: Use embedded SQLite via `better-sqlite3` and `drizzle-orm`.
- **Consequences**: Fast synchronous operations, zero cloud costs, single-file backup (`notebook.db`), and absolute data ownership. Network shares are not supported for concurrent multi-client access; headless NAS operation will run the app server and SQLite together behind Tailscale.

## ADR-002: Snapshot Immutability for Physical Setups
- **Context**: An instrumentalist frequently changes string brands, alters capos, or tweaks tunings. If past compositions or motifs dynamically linked only to live instrument/string records, changing string gauge or default tuning in 2027 would silently corrupt or alter historical compositions recorded in 2024.
- **Decision**: Every `Setup` acts as an immutable physical snapshot containing the complete resolved instrument details, string products, speaking lengths, tuning pitches, capo offsets, and sounding frequencies. Motifs and compositions link to Setups.
- **Consequences**: Historical integrity is guaranteed. Past notation and tension records remain permanently valid.

## ADR-003: "PRIMARY POSITIONS" vs "CHORD LIBRARY"
- **Context**: Traditional software enforces standard triad and chord names. In open, alternate, and reentrant tunings, fingerings often represent modal drones, micro-tonal clusters, movable finger forms, or intervals rather than named pop chords.
- **Decision**: Use the domain term `PRIMARY POSITIONS` across all UI and data models, with optional informal names and `P-###` tags.
- **Consequences**: Reflects the user's compositional reality without forcing standard harmonic theory onto experimental tunings.

## ADR-004: Tension Physics & Refusal to Fabricate Precision
- **Context**: String tension depends directly on unit weight ($UW$), speaking length ($L$), and vibrating frequency ($F$):
  $$T = \frac{UW \times (2 \times L \times F)^2}{386.4}$$
  Many calculators guess unit weight solely from nominal diameter, resulting in wild inaccuracies across plain steel, nickel wound, phosphor bronze, nylon, and carbon.
- **Decision**: The String Lab requires known unit weight for precise tension. When unit weight is unrecorded in the catalog, the system honestly reports tension as undetermined and prompts for product specification or empirical measurement rather than hallucinating exact values.

## ADR-005: Browser Print Engine for Canonical Hardcopy
- **Context**: We need printable US Letter portrait pages matching the editorial design system. Server-side PDF generators (Puppeteer, Weasyprint) introduce heavy binary dependencies, font-rendering differences, and slow rendering pipelines.
- **Decision**: Use tailored `@media print` CSS with explicit US Letter page geometry (`size: 8.5in 11in; margin: 0.5in;`).
- **Consequences**: Instant rendering, perfect system font rendering, zero heavy server dependencies, and native browser PDF export support.

## ADR-006: Local Media Storage Strategy
- **Context**: Audio memos, scratchpad recordings, and sheet music attachments need durable persistence.
- **Decision**: Media files are written directly into `storage/media/` organized by UUID. Only relative paths and MIME metadata are stored in the SQLite database.
- **Consequences**: Prevents SQLite database bloat and ensures individual audio files can be inspected, backed up, or played with standard external media tools.
