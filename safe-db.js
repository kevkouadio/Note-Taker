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

// Remove truly empty backup files (zero bytes, only whitespace, or JSON empty
// array/object) at startup. This keeps the backups folder tidy and avoids
// resurrecting deleted notes from empty snapshots.
async function cleanupEmptyBackups() {
  try {
    const files = await fs.readdir(backupsDir).catch(() => []);
    await Promise.all(
      files.map(async (f) => {
        const full = path.join(backupsDir, f);
        try {
          const stat = await fs.stat(full).catch(() => null);
          if (!stat) return;

          // If file is empty, remove it
          if (stat.size === 0) {
            await fs.unlink(full).catch(() => {});
            return;
          }

          const raw = await fs.readFile(full, 'utf8').catch(() => null);
          if (raw === null) return;
          const trimmed = raw.trim();

          // If file is only whitespace, remove it
          if (trimmed === '') {
            await fs.unlink(full).catch(() => {});
            return;
          }

          // If file is valid JSON and represents an empty array/object, remove it
          try {
            const parsed = JSON.parse(trimmed);
            if ((Array.isArray(parsed) && parsed.length === 0) || (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
              await fs.unlink(full).catch(() => {});
            }
          } catch (e) {
            // not JSON - leave it alone
          }
        } catch (e) {
          // ignore per-file errors; cleanup is best-effort
        }
      })
    );
  } catch (e) {
    // ignore directory-level errors; startup should continue regardless
  }
}

// Remove backups that contain a specific note id. This is used to ensure that
// when a note is deleted it does not remain in historical backups.
async function removeBackupsContainingNote(id) {
  // Best-effort: for each backup snapshot, remove the note entry if present.
  // If the snapshot becomes empty after removal, delete the backup file.
  try {
    const files = await fs.readdir(backupsDir).catch(() => []);
    await Promise.all(
      files.map(async (f) => {
        const full = path.join(backupsDir, f);
        try {
          const raw = await fs.readFile(full, 'utf8').catch(() => null);
          if (!raw) return;
          let arr;
          try {
            arr = JSON.parse(raw || '[]');
          } catch (e) {
            // skip invalid JSON
            return;
          }
          if (!Array.isArray(arr)) return;

          const filtered = arr.filter(n => !(n && n.id === id));
          if (filtered.length === arr.length) return; // no change

          if (filtered.length === 0) {
            // no notes left in this backup, remove the file
            await fs.unlink(full).catch(() => {});
          } else {
            // rewrite backup file atomically without the deleted note
            await atomicWrite(full, JSON.stringify(filtered, null, 2));
          }
        } catch (e) {
          // ignore parse/unlink/write errors for individual files
        }
      })
    );
  } catch (e) {
    // ignore errors; cleanup is best-effort
  }
}

async function ensureDb() {
  await ensureDirs();

  // Remove empty backups on startup to avoid resurrecting empty snapshots
  // or keeping useless files in the backups directory.
  await cleanupEmptyBackups().catch(() => {});

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
  removeBackupsContainingNote,
};
