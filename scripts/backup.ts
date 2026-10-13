import fs from 'fs';
import path from 'path';
import { getStorageDirs } from '../app/lib/paths';

export function runBackup() {
  const { databaseDir, mediaDir, backupsDir, dbPath } = getStorageDirs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`Starting backup at ${new Date().toISOString()}...`);

  // 1. Backup SQLite database file
  if (fs.existsSync(dbPath)) {
    const targetDbBackup = path.join(backupsDir, `notebook-backup-${timestamp}.db`);
    fs.copyFileSync(dbPath, targetDbBackup);
    console.log(`✓ SQLite database backed up to: ${targetDbBackup}`);
  } else {
    console.warn(`! Database file not found at ${dbPath}`);
  }

  // 2. Backup media files manifest
  if (fs.existsSync(mediaDir)) {
    const mediaFiles = fs.readdirSync(mediaDir).filter(f => !f.startsWith('.'));
    const manifest = {
      backupTimestamp: new Date().toISOString(),
      fileCount: mediaFiles.length,
      files: mediaFiles.map(f => {
        const stat = fs.statSync(path.join(mediaDir, f));
        return {
          filename: f,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      }),
    };
    const manifestPath = path.join(backupsDir, `media-manifest-${timestamp}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Media manifest (${mediaFiles.length} files) saved to: ${manifestPath}`);
  }

  console.log('Backup completed successfully.');
}

if (require.main === module || process.argv[1]?.endsWith('backup.ts')) {
  runBackup();
}
