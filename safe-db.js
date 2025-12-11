// safe-db.js
// Safe JSON-backed DB helper with atomic writes, backups and file locking.
// Requires: npm install proper-lockfile

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const dbDir = path.join(__dirname, 'db'); // adjust if your db folder is different
const dbPath = path.join(dbDir, 'db.json');
const backupsDir = path.join(dbDir, 'backups');

async function ensureDirs() {
  await fs.mkdir(dbDir, { recursive: true });
  await fs.mkdir(backupsDir, { recursive: true });
}

async function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, file);
}

async function makeBackupIfExists() {
  try {
    await fs.access(dbPath);
  } catch (e) {
    return; // nothing to back up
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `db-${ts}.json`);
  await fs.copyFile(dbPath, backupPath).catch(() => {});
}

async function latestBackup() {
  try {
    const files = await fs.readdir(backupsDir);
    const backups = await Promise.all(
      files.map(async f => {
        const stat = await fs.stat(path.join(backupsDir, f));
        return { name: f, mtime: stat.mtime };
      })
    );
    backups.sort((a,b) => b.mtime - a.mtime);
    return backups.length ? path.join(backupsDir, backups[0].name) : null;
  } catch (e) {
    return null;
  }
}

async function restoreFromBackup() {
  const b = await latestBackup();
  if (!b) throw new Error('No backup available');
  await fs.copyFile(b, dbPath);
}

async function ensureDb() {
  await ensureDirs();

  // Create file if doesn't exist (but DO NOT overwrite if it does)
  if (!fsSync.existsSync(dbPath)) {
    await atomicWrite(dbPath, '[]');
    return;
  }

  // Validate JSON; if corrupted try to restore, otherwise leave as-is
  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    JSON.parse(raw || '[]');
  } catch (err) {
    console.error('[safe-db] db.json is invalid JSON. Attempting restore from backup...', err);
    const b = await latestBackup();
    if (b) {
      await restoreFromBackup();
      console.info('[safe-db] Restored db.json from latest backup:', b);
    } else {
      // no backup - rename corrupt file and reinitialize
      const corruptPath = path.join(backupsDir, `corrupt-${Date.now()}.json`);
      await fs.copyFile(dbPath, corruptPath).catch(() => {});
      console.error('[safe-db] No backup found. Moving corrupt file to', corruptPath, 'and initializing an empty db.json');
      await atomicWrite(dbPath, '[]');
    }
  }
}

// Utility to ensure file exists and perform operations under a lock
async function withLock(fn) {
  await ensureDirs();
  // ensure file exists so lock can be acquired reliably
  if (!fsSync.existsSync(dbPath)) {
    await atomicWrite(dbPath, '[]');
  }

  // Acquire lock (with retries)
  let release;
  try {
    release = await lockfile.lock(dbPath, { retries: { retries: 5, factor: 1.5, minTimeout: 50 }, realpath: false });
  } catch (err) {
    throw new Error('Unable to acquire DB lock: ' + err.message);
  }

  try {
    return await fn();
  } finally {
    try { await release(); } catch (e) { /* ignore release errors */ }
  }
}

async function loadNotes() {
  return withLock(async () => {
    const raw = await fs.readFile(dbPath, 'utf8').catch(() => '[]');
    return JSON.parse(raw || '[]');
  });
}

async function saveNotes(notes) {
  return withLock(async () => {
    await makeBackupIfExists();
    await atomicWrite(dbPath, JSON.stringify(notes, null, 2));
  });
}

module.exports = {
  ensureDb,
  loadNotes,
  saveNotes,
  dbPath,
};
