const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { uploadsDir } = require('../utils/paths');
const upload = multer({ dest: uploadsDir });
const fs = require('fs');
const https = require('https');
const http = require('http');

// Proper CSV row parser — handles quoted fields containing commas/newlines
function parseCsvRow(line) {
  const cols = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

// Find column index by trying multiple common header names
function findCol(header, ...names) {
  for (const n of names) {
    const idx = header.findIndex((h) => h.replace(/[^a-z0-9]/g, '').includes(n.replace(/[^a-z0-9]/g, '')));
    if (idx !== -1) return idx;
  }
  return -1;
}

function importRows(lines) {
  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const nameIdx  = findCol(header, 'name', 'fullname', 'contactname');
  const phoneIdx = findCol(header, 'phone', 'mobile', 'number', 'phonenumber', 'mobilenumber', 'whatsapp');
  const groupIdx = findCol(header, 'group', 'groupname', 'category', 'list');
  const tagsIdx  = findCol(header, 'tags', 'tag', 'label');

  if (phoneIdx === -1) throw new Error('Could not find a phone/mobile column in the CSV/sheet. Make sure a column is named "Phone", "Mobile", or "Number".');

  const insert = db.prepare('INSERT OR IGNORE INTO contacts (name, phone, group_name, tags) VALUES (?,?,?,?)');
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvRow(line);
    const phone = cols[phoneIdx]?.replace(/[^\d+]/g, '');
    if (!phone || phone.length < 7) continue;
    insert.run(
      nameIdx  !== -1 ? cols[nameIdx]  || 'Unknown' : 'Unknown',
      phone,
      groupIdx !== -1 ? cols[groupIdx] || 'All' : 'All',
      tagsIdx  !== -1 ? cols[tagsIdx]  || '' : ''
    );
    count++;
  }
  return count;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

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
  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
    const lines = content.split('\n').filter((l) => l.trim());
    const count = importRows(lines);
    res.json({ imported: count });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(400).json({ error: e.message });
  }
});

// Import contacts from a Google Sheets URL (must be publicly shared)
router.post('/import-sheet', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // Extract sheet ID and convert to CSV export URL
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Google Sheets URL' });
    const sheetId = match[1];

    // Support ?gid= for specific tab
    const gidMatch = url.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const csv = await fetchUrl(csvUrl);

    if (!csv || csv.includes('Sign in') || csv.includes('<html')) {
      return res.status(400).json({ error: 'Sheet is not publicly accessible. Set sharing to "Anyone with the link can view".' });
    }

    const lines = csv.split('\n').filter((l) => l.trim());
    const count = importRows(lines);
    res.json({ imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
