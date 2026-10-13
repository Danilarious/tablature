import fs from 'fs';
import path from 'path';
import { getStorageDirs } from '../app/lib/paths';

export function runRestore(backupFilePath?: string) {
  const { backupsDir, dbPath } = getStorageDirs();

  let targetBackup = backupFilePath;

  if (!targetBackup) {
    // Pick the most recent backup in storage/backups/
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('notebook-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error('No database backups found in', backupsDir);
      process.exit(1);
    }

    targetBackup = path.join(backupsDir, files[0]);
  }

  if (!fs.existsSync(targetBackup)) {
    console.error('Target backup file does not exist:', targetBackup);
    process.exit(1);
  }

  // Make a pre-restore safety copy of current db if it exists
  if (fs.existsSync(dbPath)) {
    const safetyCopy = `${dbPath}.pre-restore-${Date.now()}.bak`;
    fs.copyFileSync(dbPath, safetyCopy);
    console.log(`Pre-restore safety copy saved to: ${safetyCopy}`);
  }

  // Restore the database
  fs.copyFileSync(targetBackup, dbPath);
  console.log(`✓ Database successfully restored from: ${targetBackup}`);
}

const arg = process.argv[2];
if (require.main === module || process.argv[1]?.endsWith('restore.ts')) {
  runRestore(arg);
}
