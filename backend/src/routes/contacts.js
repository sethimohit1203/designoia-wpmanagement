const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const upload = multer({ dest: require('path').join(__dirname, '..', '..', 'uploads') });
const fs = require('fs');

router.get('/', (req, res) => {
  const { search, group, status } = req.query;
  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (group && group !== 'All') {
    query += ' AND group_name = ?';
    params.push(group);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY id DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/groups', (req, res) => {
  const rows = db.prepare('SELECT group_name, COUNT(*) as count FROM contacts GROUP BY group_name').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, phone, group_name = 'All', tags = '', vehicle = '' } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const info = db.prepare('INSERT INTO contacts (name, phone, group_name, tags, vehicle) VALUES (?,?,?,?,?)')
    .run(name, phone, group_name, tags, vehicle);
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/import-csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const content = fs.readFileSync(req.file.path, 'utf8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const nameIdx = header.indexOf('name');
  const phoneIdx = header.indexOf('phone');
  const groupIdx = header.indexOf('group');
  const tagsIdx = header.indexOf('tags');

  const insert = db.prepare('INSERT INTO contacts (name, phone, group_name, tags) VALUES (?,?,?,?)');
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (!cols[phoneIdx]) continue;
    insert.run(cols[nameIdx] || 'Unknown', cols[phoneIdx], cols[groupIdx] || 'All', cols[tagsIdx] || '');
    count++;
  }
  fs.unlinkSync(req.file.path);
  res.json({ imported: count });
});

router.put('/:id', (req, res) => {
  const { name, phone, group_name, tags, status, vehicle } = req.body;
  db.prepare('UPDATE contacts SET name=?, phone=?, group_name=?, tags=?, status=?, vehicle=? WHERE id=?')
    .run(name, phone, group_name, tags, status, vehicle, req.params.id);
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
  for (const id of ids) stmt.run(id);
  res.json({ ok: true, deleted: ids.length });
});

module.exports = router;
