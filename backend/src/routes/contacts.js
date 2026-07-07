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

// Find all column indices matching any of the given name patterns
function findCols(header, ...names) {
  const idxs = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i].replace(/[^a-z0-9]/g, '');
    if (names.some((n) => h === n.replace(/[^a-z0-9]/g, '') || h.startsWith(n.replace(/[^a-z0-9]/g, '')))) {
      idxs.push(i);
    }
  }
  return idxs;
}

function findCol(header, ...names) {
  return findCols(header, ...names)[0] ?? -1;
}

// Pick the first non-zero, non-empty value from multiple columns
function pickPhone(cols, idxs) {
  for (const i of idxs) {
    const raw = cols[i]?.replace(/[^\d+]/g, '') || '';
    if (raw && raw !== '0' && raw.length >= 7) return raw;
  }
  return null;
}

function importRows(lines) {
  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim());

  // Name: try combined fname+mname+lname, or full 'name' column
  const nameIdx   = findCol(header, 'name', 'fullname', 'contactname');
  const fnameIdx  = findCol(header, 'fname', 'firstname', 'first');
  const mnameIdx  = findCol(header, 'mname', 'middlename', 'middle');
  const lnameIdx  = findCol(header, 'lname', 'lastname', 'surname', 'last');

  // Phone: try all variants, pick first non-zero
  const phoneIdxs = findCols(header, 'mobile1', 'mobile2', 'smobile', 'phone1', 'phone2',
    'mobile', 'phone', 'number', 'phonenumber', 'mobilenumber', 'whatsapp', 'contact');

  if (!phoneIdxs.length) {
    throw new Error(
      'Could not find a phone/mobile column. Columns found: ' + header.join(', ') +
      '. Add a column named "Phone", "Mobile", "Mobile1", etc.'
    );
  }

  const groupIdx = findCol(header, 'group', 'groupname', 'category', 'list');
  const tagsIdx  = findCol(header, 'tags', 'tag', 'label');
  const cityIdx  = findCol(header, 'city', 'district', 'state');

  const insert = db.prepare('INSERT OR IGNORE INTO contacts (name, phone, group_name, tags) VALUES (?,?,?,?)');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvRow(line);

    const phone = pickPhone(cols, phoneIdxs);
    if (!phone) continue;

    let name = '';
    if (fnameIdx !== -1 || mnameIdx !== -1 || lnameIdx !== -1) {
      name = [cols[nameIdx], cols[fnameIdx], cols[mnameIdx], cols[lnameIdx]]
        .filter(Boolean).map((s) => s.trim()).filter(Boolean).join(' ');
    }
    if (!name && nameIdx !== -1) name = cols[nameIdx]?.trim();
    if (!name) name = 'Unknown';

    const group = groupIdx !== -1 ? cols[groupIdx]?.trim() || 'All' : 'All';
    const tags  = tagsIdx  !== -1 ? cols[tagsIdx]?.trim()  || ''    : '';
    rows.push([name, phone, group, tags]);
  }

  // Wrap in a transaction — turns 64k individual inserts into one fast batch
  const insertMany = db.transaction((batch) => { for (const r of batch) insert.run(...r); });
  insertMany(rows);
  return rows.length;
}

function fetchUrl(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClikixPress/1.0)',
        'Accept': 'text/csv,text/plain,*/*',
      },
    };
    lib.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

router.get('/', (req, res) => {
  const { search, group, status, page = 1, limit = 100 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (group && group !== 'All') { where += ' AND group_name = ?'; params.push(group); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as n FROM contacts ${where}`).get(...params).n;
  const rows  = db.prepare(`SELECT * FROM contacts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), offset);

  res.json({ rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
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
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Google Sheets URL — copy it from the browser address bar' });
    const sheetId = match[1];

    // Support #gid= or ?gid= for a specific tab
    const gidMatch = url.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // Try the gviz/tq CSV export first — works better for public sheets without OAuth
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const csv = await fetchUrl(exportUrl);

    // Detect HTML / login page
    const trimmed = (csv || '').trim();
    if (!trimmed || trimmed.startsWith('<') || trimmed.toLowerCase().includes('sign in')) {
      // Fallback: try the regular export URL
      const fallbackUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      const csv2 = await fetchUrl(fallbackUrl);
      const trimmed2 = (csv2 || '').trim();
      if (!trimmed2 || trimmed2.startsWith('<') || trimmed2.toLowerCase().includes('sign in')) {
        return res.status(400).json({
          error: 'Could not read the sheet. Make sure sharing is set to "Anyone with the link → Viewer" and try again.',
        });
      }
      const lines2 = csv2.split('\n').filter((l) => l.trim());
      return res.json({ imported: importRows(lines2) });
    }

    const lines = csv.split('\n').filter((l) => l.trim());
    res.json({ imported: importRows(lines) });
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
