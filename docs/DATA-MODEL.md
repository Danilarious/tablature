# BxB Music Notebook — Data Model & Schema Specification

## 1. Principles

1. **Local-First SQLite**: Backed by SQLite 3 with Drizzle ORM.
2. **Snapshot Stability**: A `Setup` captures a historical snapshot of an Instrument's state (tuning, capo, string gauges) so that editing a string set or instrument in the future never mutates the physical context of past compositions and motifs.
3. **Explicit Pitch Notation**: Open strings, capo positions, and calculated pitches are stored with scientific pitch notation (Note + Octave, e.g. `E2`, `A2`, `D3`, `G3`, `B3`, `E4`).
4. **Relational Integrity**: Foreign keys with cascading deletions where appropriate, but soft-deletion/archiving flags for user records.

---

## 2. Entity Relationship Overview

```
Instrument (1) ────< (N) StringSet (1) ────< (N) Assembled Strings
    │
    ├───────────────< (N) Setup (Historical Snapshot)
    │                       │
Tuning (T-###) ─────────────┤
    │                       ├────────────< (N) Motif (M-###)
CapoConfig ─────────────────┤                   │
                            │                   ├──< (N) TabEvent[]
                            │                   └──< (N) Position (P-###)
                            │
                            └────────────< (N) Composition (C-###)
                                                │
                                                ├──< (N) CompositionSections
                                                ├──< (N) Motifs (join)
                                                └──< (N) Setups (join)
```

---

## 3. Schema Definitions

### 3.1 `instruments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique identifier |
| `name` | TEXT | NOT NULL | Friendly label (e.g. "Santa Cruz 00") |
| `maker` | TEXT | | Luthier / Manufacturer |
| `model` | TEXT | | Model name or number |
| `family` | TEXT | NOT NULL | `steel_string_acoustic`, `classical`, `electric_archtop`, `banjo`, `resonator`, `baritone_acoustic`, `other` |
| `string_count` | INTEGER | NOT NULL | Typically 5, 6, or 7 |
| `default_scale_length` | REAL | | Default scale length in inches |
| `scale_length_unit` | TEXT | DEFAULT 'in' | 'in' or 'mm' |
| `per_string_scale_lengths` | TEXT (JSON) | | Optional per-string speaking length override |
| `notes` | TEXT | | History, setup preferences, provenance |
| `is_archived` | INTEGER | DEFAULT 0 | 0 = active, 1 = archived |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |
| `updated_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.2 `string_products`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique product ID |
| `manufacturer` | TEXT | NOT NULL | e.g. "D'Addario", "La Bella", "John Pearse" |
| `product_family` | TEXT | | e.g. "EJ16 Phosphor Bronze", "High Tension Classical" |
| `nominal_gauge` | REAL | NOT NULL | e.g. 0.012 |
| `gauge_unit` | TEXT | DEFAULT 'in' | 'in' or 'mm' |
| `material` | TEXT | | `phosphor_bronze`, `80_20_bronze`, `nickel`, `nylon`, `carbon`, etc. |
| `core_construction` | TEXT | | `round_core`, `hex_core`, `solid_nylon`, etc. |
| `winding_construction` | TEXT | | `roundwound`, `flatwound`, `halfwound`, `plain` |
| `unit_weight` | REAL | | Weight in lbs/inch (for tension calculation) |
| `notes` | TEXT | | Source notes, catalog code |

### 3.3 `string_sets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique identifier |
| `instrument_id` | TEXT | FK(`instruments.id`) | Target instrument |
| `name` | TEXT | NOT NULL | Descriptive name (e.g. "Medium Lights with Heavy Bass") |
| `installed_date` | TEXT | | ISO-8601 date string |
| `string_assignments` | TEXT (JSON) | NOT NULL | Array of per-string `string_product_id` and custom overrides |
| `notes` | TEXT | | Tone notes, life span |
| `is_active` | INTEGER | DEFAULT 1 | Whether actively on guitar |

### 3.4 `tunings`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `human_id` | TEXT | UNIQUE, NOT NULL | `T-###` sequence identifier (e.g. `T-001`) |
| `name` | TEXT | NOT NULL | e.g. "DADGAD", "Open C Baritone", "Banjo Double C" |
| `string_count` | INTEGER | NOT NULL | Number of strings (5, 6, 7) |
| `pitches` | TEXT (JSON) | NOT NULL | Ordered array of string pitches: `["D2", "A2", "D3", "G3", "A3", "D4"]` |
| `tonal_center` | TEXT | | Primary home / root / mode |
| `tags` | TEXT (JSON) | | Array of tags |
| `notes` | TEXT | | Practical observations, harmonic discoveries |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |
| `updated_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.5 `capo_configurations`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `name` | TEXT | | Optional preset label (e.g. "Drop D Partial Fret 2") |
| `type` | TEXT | NOT NULL | `full`, `partial`, `spider`, `none` |
| `string_frets` | TEXT (JSON) | NOT NULL | Per-string fret array (e.g. `[null, 2, 2, 2, null, null]`) |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.6 `setups`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `instrument_id` | TEXT | FK(`instruments.id`) | Instrument |
| `tuning_id` | TEXT | FK(`tunings.id`) | Tuning reference |
| `string_set_id` | TEXT | FK(`string_sets.id`) | Optional string set |
| `capo_config_id` | TEXT | FK(`capo_configurations.id`) | Capo configuration |
| `name` | TEXT | | Setup label |
| `effective_pitches`| TEXT (JSON) | NOT NULL | Calculated sounding pitches by string with capo |
| `per_string_tension`| TEXT (JSON) | | Calculated tension array (lbs) |
| `total_tension` | REAL | | Total instrument tension (lbs) |
| `snapshot` | TEXT (JSON) | NOT NULL | Full frozen copy of tuning, capo, and string details |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.7 `positions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `human_id` | TEXT | | Optional `P-###` identifier |
| `name` | TEXT | | Friendly descriptor / chord name |
| `tuning_id` | TEXT | FK(`tunings.id`) | Contextual tuning |
| `setup_id` | TEXT | FK(`setups.id`) | Optional contextual setup |
| `string_count` | INTEGER | NOT NULL | 5, 6, 7 |
| `base_fret` | INTEGER | DEFAULT 1 | Starting fret position |
| `frets` | TEXT (JSON) | NOT NULL | Array of values: `fret_number`, `0` (open), `null` (muted/unplayed) |
| `fingers` | TEXT (JSON) | | Array of finger markings: `1, 2, 3, 4, T` |
| `tags` | TEXT (JSON) | | Harmonic tags (e.g. "Drone", "Cluster", "Inversion") |
| `notes` | TEXT | | Contextual instructions |

### 3.8 `motifs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `human_id` | TEXT | UNIQUE, NOT NULL | `M-###` identifier (e.g. `M-001`) |
| `name` | TEXT | NOT NULL | Working title or description |
| `setup_id` | TEXT | FK(`setups.id`) | Physical setup context |
| `tuning_id` | TEXT | FK(`tunings.id`) | Tuning context |
| `instrument_id` | TEXT | FK(`instruments.id`) | Instrument context |
| `function` | TEXT | | `intro`, `transition`, `ostinato`, `ending`, `texture`, `riff`, `other` |
| `tab_data` | TEXT (JSON) | NOT NULL | Array of TAB events / columns |
| `variations` | TEXT (JSON) | | Secondary TAB variations |
| `tags` | TEXT (JSON) | | Search tags |
| `notes` | TEXT | | Performance notes |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |
| `updated_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.9 `compositions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT (UUID) | PK | Unique UUID |
| `human_id` | TEXT | UNIQUE, NOT NULL | `C-###` identifier (e.g. `C-001`) |
| `title` | TEXT | NOT NULL | Working title |
| `status` | TEXT | DEFAULT 'idea' | `idea`, `in_progress`, `completed`, `archived` |
| `tonal_center` | TEXT | | Tonal center / home |
| `tempo` | INTEGER | | BPM |
| `tempo_notes` | TEXT | | Tempo changes or feel descriptor (e.g. "rubato", "driving 6/8") |
| `piece_map` | TEXT | | Structural map (e.g. "A - B - A - C - Outro") |
| `sections` | TEXT (JSON) | | Structured sections and transcriptions |
| `notes` | TEXT | | Compositional journal |
| `lyrics` | TEXT | | Vocal / lyric sketches |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |
| `updated_at` | INTEGER | NOT NULL | Unix epoch ms |

### 3.10 Join Tables & Attachments
- `composition_motifs`: Links `(composition_id, motif_id, sort_order, section_name)`.
- `composition_setups`: Links `(composition_id, setup_id, instrument_role)`.
- `composition_positions`: Links `(composition_id, position_id, sort_order)`.
- `motif_positions`: Links `(motif_id, position_id)`.
- `attachments`: Links `(id, parent_type, parent_id, display_name, file_path, mime_type, file_size, description, created_at)`.
