/**
 * Database schema commands.
 *
 *   npm run db:status     # read-only: state, applied/pending migrations, compatibility, review flags
 *   npm run db:migrate    # full backup (database + media) first, then apply pending migrations
 *
 * (The app also applies pending migrations at startup; db:migrate lets you do it deliberately
 * with a complete backup.) To create a new migration after editing app/db/schema.ts:
 *   npm run db:generate -- --name=<change>
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getStorageDirs } from '../app/lib/paths';
import { applyMigrations, getMigrationStatus, migrationCompatibilityError, resolveMigrationsFolder } from '../app/db/migrate';
import { createBackup } from '../app/lib/backup/backup';

function printStatus(sqlite: Database.Database) {
  const status = getMigrationStatus(sqlite, resolveMigrationsFolder());
  console.log(`State: ${status.state}`);
  console.log(`Applied (${status.applied.length}):`);
  for (const a of status.applied) console.log(`  ✓ ${a.tag ?? `unknown (${a.createdAt})`}${a.hashMatches ? '' : '  ! file changed since applied'}`);
  console.log(`Pending (${status.pending.length}):`);
  for (const p of status.pending) console.log(`  • ${p.tag}`);
  if (status.newerThanApp) console.log('! Database was written by a newer app version.');
  const incompatible = migrationCompatibilityError(status);
  if (incompatible) console.log(`! Incompatible: ${incompatible}`);
  const hasFlags = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_flags'`).get();
  if (hasFlags) {
    const flags = sqlite.prepare(`SELECT entity_type, entity_id, flag_type, status, message FROM review_flags ORDER BY created_at`).all() as {
      entity_type: string;
      entity_id: string;
      flag_type: string;
      status: string;
      message: string;
    }[];
    console.log(`Review flags (${flags.length}):`);
    for (const f of flags) console.log(`  [${f.status}] ${f.entity_type} ${f.entity_id} — ${f.flag_type}: ${f.message}`);
  }
  return status;
}

async function main() {
  const cmd = process.argv[2];
  const { dbPath, mediaDir, backupsDir, baseDir } = getStorageDirs();
  if (!fs.existsSync(dbPath)) {
    console.log('No database yet; it will be created (fully migrated) when the app first starts.');
    return;
  }

  if (cmd === 'status') {
    const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      printStatus(sqlite);
    } finally {
      sqlite.close();
    }
    return;
  }

  if (cmd === 'migrate') {
    const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
    const before = getMigrationStatus(probe, resolveMigrationsFolder());
    probe.close();

    // Check compatibility before reporting "up to date" or proceeding with a backup.
    // An incompatible database cannot be safely migrated by this app version.
    const incompatible = migrationCompatibilityError(before);
    if (incompatible) {
      console.error(`✗ Database is incompatible: ${incompatible}`);
      console.error('  Run `npm run db:status` for details. No changes were made.');
      process.exit(1);
    }

    if (before.pending.length === 0 && before.state !== 'legacy-unversioned') {
      console.log('Schema is already up to date. Nothing to do.');
      return;
    }
    console.log('Creating a complete backup before migrating...');
    const backup = await createBackup({ dbPath, mediaDir, backupsDir, label: 'pre-migrate' });
    console.log(`✓ Backup: ${path.relative(baseDir, backup.dir)}`);
    const sqlite = new Database(dbPath);
    try {
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('foreign_keys = ON');
      sqlite.pragma('busy_timeout = 5000');
      const result = applyMigrations(sqlite, resolveMigrationsFolder(), { backupDir: null, log: (m) => console.log(`  ${m}`) });
      console.log(`✓ Applied ${result.applied.length} migration(s)${result.adoptedLegacy ? ' (existing database adopted at baseline)' : ''}.`);
      printStatus(sqlite);
    } finally {
      sqlite.close();
    }
    return;
  }

  if (cmd === 'pending') {
    // Used by scripts/launch-app.sh.
    // Exit 0  = compatible and up to date (or empty — app will auto-init)
    // Exit 10 = compatible but has pending migrations
    // Exit 11 = incompatible (unrecognized row, tampered hash, newer-than-app)
    // Other non-zero = unexpected error (handled by the shell's `status -ne 0` branch)
    const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const status = getMigrationStatus(sqlite, resolveMigrationsFolder());
      const incompatible = migrationCompatibilityError(status);
      if (incompatible) {
        console.error(`Database is incompatible: ${incompatible}`);
        console.error('Run `npm run db:status` for details. Restore from a backup or update the app.');
        process.exitCode = 11;
        return;
      }
      const pending = status.pending.length > 0 || status.state === 'legacy-unversioned';
      if (pending) console.log(`Pending migrations: ${status.pending.map((p) => p.tag).join(', ') || 'baseline adoption'}`);
      process.exitCode = pending ? 10 : 0;
    } finally {
      sqlite.close();
    }
    return;
  }

  console.error('Usage: tsx scripts/db.ts <status|migrate|pending>');
  process.exit(1);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
