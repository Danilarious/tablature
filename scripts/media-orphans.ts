/**
 * Media orphan report. Read-only by default; never deletes anything.
 *
 *   npm run media:orphans                  # report only
 *   npm run media:orphans -- --move-to-trash   # move unreferenced files and interrupted
 *                                              # uploads into media/.trash/orphans-<timestamp>/
 *
 * Attachment rows with missing files or missing parents are only reported (never altered),
 * because they may need manual review.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../app/db/schema';
import { getStorageDirs } from '../app/lib/paths';
import { MEDIA_FILENAME_RE, scanMediaOrphans } from '../app/lib/services/attachments';

function main() {
  const moveToTrash = process.argv.includes('--move-to-trash');
  const { dbPath, mediaDir } = getStorageDirs();
  if (!fs.existsSync(dbPath)) {
    console.error('No database found at the configured MUSIC_NOTEBOOK_DATA_DIR.');
    process.exit(1);
  }
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const report = scanMediaOrphans(drizzle(sqlite, { schema }), mediaDir);
    console.log(JSON.stringify(report, null, 2));

    if (!moveToTrash) {
      console.log('\nReport only. Nothing was changed. Use --move-to-trash to move unreferenced files aside.');
      return;
    }
    const candidates = [...report.unreferencedFiles, ...report.incompleteUploads].filter(
      (name) => MEDIA_FILENAME_RE.test(name) || name.startsWith('.incoming-')
    );
    if (candidates.length === 0) {
      console.log('\nNo unreferenced files to move.');
      return;
    }
    const dest = path.join(mediaDir, '.trash', `orphans-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(dest, { recursive: true });
    for (const name of candidates) {
      fs.renameSync(path.join(mediaDir, name), path.join(dest, name));
    }
    console.log(`\nMoved ${candidates.length} file(s) to ${path.relative(process.cwd(), dest) || dest}. Nothing was deleted.`);
  } finally {
    sqlite.close();
  }
}

main();
