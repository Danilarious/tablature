/**
 * Complete, WAL-safe disaster-recovery backup (database + all media + verified manifest).
 *
 *   npm run backup                         # create and verify a backup in <dataDir>/backups/
 *   npm run backup -- --label=before-trip  # add a label to the folder name
 *   npm run backup -- --keep=10            # OPT-IN retention: afterwards remove all but the 10
 *                                          # newest complete backups (add --dry-run to preview)
 *   npm run backup -- --verify=<dir>       # verify an existing backup folder only
 *
 * Nothing is deleted unless --keep is given. This is different from the JSON export
 * (/api/export), which is a portable, human-readable data export without media files.
 */
import path from 'path';
import { getStorageDirs } from '../app/lib/paths';
import { createBackup, pruneBackups, verifyBackup } from '../app/lib/backup/backup';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}

async function main() {
  const { dbPath, mediaDir, backupsDir, baseDir } = getStorageDirs();
  const rel = (p: string) => path.relative(baseDir, p) || p;

  const verifyDir = arg('verify');
  if (verifyDir) {
    const result = await verifyBackup(path.resolve(verifyDir));
    console.log(result.ok ? '✓ Backup verified.' : `✗ Backup invalid:\n  - ${result.errors.join('\n  - ')}`);
    process.exit(result.ok ? 0 : 1);
  }

  console.log('Creating backup (SQLite online backup API + media copy)...');
  const { dir, manifest } = await createBackup({ dbPath, mediaDir, backupsDir, label: arg('label') || null });
  console.log(`✓ Backup verified and saved: ${rel(dir)}`);
  console.log(`  schema: ${manifest.schema.latestMigration ?? 'unversioned'}; app ${manifest.app.version}`);
  console.log(`  database: ${manifest.database.bytes} bytes, integrity ${manifest.database.integrityCheck}`);
  console.log(`  media: ${manifest.media.fileCount} files, ${manifest.media.totalBytes} bytes`);
  for (const w of manifest.warnings) console.warn(`  ! ${w}`);

  const keep = arg('keep');
  if (keep !== undefined) {
    const dryRun = arg('dry-run') !== undefined;
    const removed = pruneBackups(backupsDir, Number(keep), dryRun);
    console.log(`${dryRun ? 'Would remove' : 'Removed'} ${removed.length} older backup(s)${removed.length ? `: ${removed.map(rel).join(', ')}` : ''}.`);
  }
}

main().catch((err) => {
  console.error(`✗ Backup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
