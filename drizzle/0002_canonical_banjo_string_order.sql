-- 0002 canonical banjo string order (data-only, deterministic).
--
-- The initial seed stored the 5-string banjo treble-first:
--   tuning-t007 pitches            ["D4","B3","G3","D3","g4"]
--   inst-banjo-5 speaking lengths  [26.25,26.25,26.25,26.25,19.75]
-- The canonical invariant (app/lib/music/string-order.ts) is index 0 = bass-side string,
-- which for a 5-string banjo is the short reentrant 5th string:
--   ["G4","D3","G3","B3","D4"] and [19.75,26.25,26.25,26.25,26.25].
--
-- Rules:
--  * A record is rewritten ONLY when its id AND stored JSON exactly match the legacy seed value
--    (and no motif/position/setup/string set depends on its string indexes).
--  * Every rewrite is logged in review_flags (status 'info').
--  * Anything else that might use the old order is left untouched and flagged (status 'open').
--  * updated_at is intentionally not changed: the musical content is identical.

CREATE TEMP TABLE `_m0002_guard` AS SELECT (
  EXISTS (SELECT 1 FROM `motifs` WHERE `tuning_id` = 'tuning-t007' OR `instrument_id` = 'inst-banjo-5')
  OR EXISTS (SELECT 1 FROM `positions` WHERE `tuning_id` = 'tuning-t007')
  OR EXISTS (SELECT 1 FROM `setups` WHERE `tuning_id` = 'tuning-t007' OR `instrument_id` = 'inst-banjo-5')
  OR EXISTS (SELECT 1 FROM `string_sets` WHERE `instrument_id` = 'inst-banjo-5')
) AS `has_dependents`;
--> statement-breakpoint

-- Log the tuning rewrite (before updating, so the WHERE still sees the legacy value).
INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-tuning-tuning-t007', 'tuning', `id`, 'legacy_seed_migrated',
  'Seeded banjo tuning T-007 was stored treble-first; rewritten to canonical bass-side-first order [5th (short, reentrant G4), 4th, 3rd, 2nd, 1st]. Exact legacy seed match; pitches unchanged.',
  json_object('from', `pitches`, 'to', '["G4","D3","G3","B3","D4"]', 'migration', '0002'),
  'info', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `tunings`
WHERE `id` = 'tuning-t007' AND `string_count` = 5 AND `pitches` = '["D4","B3","G3","D3","g4"]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 0;
--> statement-breakpoint

UPDATE `tunings` SET `pitches` = '["G4","D3","G3","B3","D4"]'
WHERE `id` = 'tuning-t007' AND `string_count` = 5 AND `pitches` = '["D4","B3","G3","D3","g4"]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 0;
--> statement-breakpoint

INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-instrument-inst-banjo-5', 'instrument', `id`, 'legacy_seed_migrated',
  'Seeded banjo per-string speaking lengths were stored treble-first; rewritten so index 0 is the short 5th string (19.75 in). Exact legacy seed match; lengths unchanged.',
  json_object('from', `per_string_speaking_lengths`, 'to', '[19.75,26.25,26.25,26.25,26.25]', 'migration', '0002'),
  'info', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `instruments`
WHERE `id` = 'inst-banjo-5' AND `string_count` = 5 AND `per_string_speaking_lengths` = '[26.25,26.25,26.25,26.25,19.75]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 0;
--> statement-breakpoint

UPDATE `instruments` SET `per_string_speaking_lengths` = '[19.75,26.25,26.25,26.25,26.25]'
WHERE `id` = 'inst-banjo-5' AND `string_count` = 5 AND `per_string_speaking_lengths` = '[26.25,26.25,26.25,26.25,19.75]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 0;
--> statement-breakpoint

-- Legacy seed values that could NOT be rewritten because other records depend on their order.
INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-review-tuning-' || `id`, 'tuning', `id`, 'string_order_needs_review',
  'Legacy treble-first banjo tuning left unchanged because motifs, positions, setups or string sets reference it. Review those records together before reordering.',
  json_object('pitches', `pitches`, 'migration', '0002'),
  'open', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `tunings`
WHERE `id` = 'tuning-t007' AND `pitches` = '["D4","B3","G3","D3","g4"]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 1;
--> statement-breakpoint

INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-review-instrument-' || `id`, 'instrument', `id`, 'string_order_needs_review',
  'Legacy treble-first banjo speaking lengths left unchanged because other records reference this instrument. Review before reordering.',
  json_object('perStringSpeakingLengths', `per_string_speaking_lengths`, 'migration', '0002'),
  'open', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `instruments`
WHERE `id` = 'inst-banjo-5' AND `per_string_speaking_lengths` = '[26.25,26.25,26.25,26.25,19.75]'
  AND (SELECT `has_dependents` FROM `_m0002_guard`) = 1;
--> statement-breakpoint

-- Any other 5-string tuning may have been entered under the old (reversed) labels: flag only.
INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-review-tuning-' || `id`, 'tuning', `id`, 'string_order_needs_review',
  '5-string tuning created before the canonical bass-side-first convention. Verify the order is [5th, 4th, 3rd, 2nd, 1st]; it was not changed automatically.',
  json_object('pitches', `pitches`, 'migration', '0002'),
  'open', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `tunings`
WHERE `string_count` = 5 AND NOT (`id` = 'tuning-t007' AND `pitches` = '["G4","D3","G3","B3","D4"]');
--> statement-breakpoint

-- Any other per-string speaking lengths may use the old order: flag only.
INSERT OR IGNORE INTO `review_flags` (`id`, `entity_type`, `entity_id`, `flag_type`, `message`, `details`, `status`, `created_at`)
SELECT 'rf-0002-review-instrument-' || `id`, 'instrument', `id`, 'string_order_needs_review',
  'Per-string speaking lengths recorded before the canonical convention. Verify index 0 is the bass-side string; values were not changed automatically.',
  json_object('perStringSpeakingLengths', `per_string_speaking_lengths`, 'migration', '0002'),
  'open', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `instruments`
WHERE `per_string_speaking_lengths` IS NOT NULL
  AND NOT (`id` = 'inst-banjo-5' AND `per_string_speaking_lengths` = '[19.75,26.25,26.25,26.25,26.25]');
--> statement-breakpoint

DROP TABLE `_m0002_guard`;