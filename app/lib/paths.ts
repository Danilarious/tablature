import path from 'path';
import fs from 'fs';

export function getStorageDirs() {
  const baseDir = process.env.MUSIC_NOTEBOOK_DATA_DIR 
    ? path.resolve(process.env.MUSIC_NOTEBOOK_DATA_DIR)
    : path.resolve(process.cwd(), 'storage');

  const databaseDir = path.join(baseDir, 'database');
  const mediaDir = path.join(baseDir, 'media');
  const backupsDir = path.join(baseDir, 'backups');

  // Ensure directories exist
  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
  }
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const dbPath = path.join(databaseDir, 'notebook.db');

  return {
    baseDir,
    databaseDir,
    mediaDir,
    backupsDir,
    dbPath,
  };
}
