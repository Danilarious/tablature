/**
 * Restore a complete backup created by `npm run backup`.
 *
 *   npm run restore -- <path-to-bxb-backup-folder>
 *   npm run restore -- --latest
 *
 * Stop the app first: restore refuses while any process has the database open. The current
 * data is always saved first as a "pre-restore" backup, the backup is validated in a staging
 * folder, and the replaced files are kept in <dataDir>/.restore-<timestamp>/ (never deleted).
 */
import path from 'path';
import { getStorageDirs } from '../app/lib/paths';
import { listBackups } from '../app/lib/backup/backup';
import { restoreBackup } from '../app/lib/backup/restore';

async function main() {
  const { baseDir, dbPath, mediaDir, backupsDir } = getStorageDirs();
  const rel = (p: string) => path.relative(baseDir, p) || p;
  const target = process.argv[2];

  let backupDir: string | undefined;
  if (target === '--latest') {
    backupDir = listBackups(backupsDir).find((d) => !d.endsWith('-pre-restore'));
  } else if (target) {
    backupDir = path.resolve(target);
  }
  if (!backupDir) {
    console.error('Usage: npm run restore -- <backup-folder> | --latest');
    console.error(`Available backups:\n  ${listBackups(backupsDir).map(rel).join('\n  ') || '(none)'}`);
    process.exit(1);
  }

  console.log(`Restoring from ${rel(backupDir)} ...`);
  const result = await restoreBackup({ backupDir, baseDir, dbPath, mediaDir, backupsDir, log: (m) => console.log(`  ${m}`) });
  console.log('✓ Restore finished.');
  if (result.safetyBackupDir) console.log(`  Previous state backed up to ${rel(result.safetyBackupDir)}`);
  console.log(`  Replaced files kept in ${rel(result.replacedDir)}`);
}

main().catch((err) => {
  console.error(`✗ Restore aborted: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
