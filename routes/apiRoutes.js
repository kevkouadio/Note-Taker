// routes/apiRoutes.js
const path = require('path');
const safeDb = require('../safe-db');

module.exports = function(app) {
  // GET all notes
  app.get('/api/notes', async (req, res) => {
    try {
      const notes = await safeDb.loadNotes();
      res.json(notes);
    } catch (err) {
      console.error('/api/notes GET error', err);
      res.status(500).json({ error: 'Failed to load notes' });
    }
  });

  // POST a new note
  app.post('/api/notes', async (req, res) => {
    try {
      const note = req.body;
      if (!note || !note.title || !note.text) {
        return res.status(400).json({ error: 'Invalid note' });
      }

      const notes = await safeDb.loadNotes();
      // simple id generator - change to uuid if you prefer
      note.id = Date.now().toString() + Math.random().toString(36).slice(2,8);
      notes.push(note);
      await safeDb.saveNotes(notes);
      res.json(note);
    } catch (err) {
      console.error('/api/notes POST error', err);
      res.status(500).json({ error: 'Failed to save note' });
    }
  });

  // DELETE a note by id
  app.delete('/api/notes/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const notes = await safeDb.loadNotes();
      const filtered = notes.filter(n => n.id !== id);
      if (filtered.length === notes.length) {
        return res.status(404).json({ error: 'Note not found' });
      }
      await safeDb.saveNotes(filtered);
      // Remove any backups that still contain the deleted note so deleted notes don't persist in backups
      try {
        if (typeof safeDb.removeBackupsContainingNote === 'function') {
          await safeDb.removeBackupsContainingNote(id);
        }
      } catch (e) {
        // non-fatal: log and continue
        console.error('/api/notes DELETE backup cleanup error', e);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('/api/notes DELETE error', err);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });
};
