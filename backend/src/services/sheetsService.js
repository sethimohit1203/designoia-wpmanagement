const { google } = require('googleapis');
const db = require('../db');

const COLUMNS = [
  'product_name', 'brand', 'price', 'mrp', 'discount', 'image_url',
  'description', 'product_url', 'schedule_date', 'status',
];

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url; // allow raw ID too
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI not all set ` +
      `(got: clientId=${clientId ? 'set' : 'MISSING'}, clientSecret=${clientSecret ? 'set' : 'MISSING'}, redirectUri=${redirectUri || 'MISSING'})`
    );
  }
  return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token to be issued every time
    scope: SCOPES,
  });
}

async function handleOAuthCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token returned by Google. Revoke prior access at https://myaccount.google.com/permissions and try connecting again.');
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('google_refresh_token', tokens.refresh_token);
  return true;
}

function isConnected() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'google_refresh_token'").get();
  return !!row?.value;
}

function getAuth() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'google_refresh_token'").get();
  if (!row?.value) {
    throw new Error('Google account not connected. Go to Sheets Sync and click "Connect Google Account" first.');
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: row.value });
  return client;
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// Normalizes a header cell ("Price (₹)", "Discount %", "Image URL") down to
// a bare lowercase token so we can match sheets with different wording/symbols.
function normalizeHeader(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Maps normalized header tokens to our internal field names. First matching
// header wins, so more specific keys (e.g. "imageurl") should be checked
// before broader ones (e.g. "image") when building the column map below.
const FIELD_MATCHERS = [
  { field: 'product_name', tokens: ['productname', 'product', 'name', 'title'] },
  { field: 'brand', tokens: ['brand'] },
  { field: 'price', tokens: ['price', 'priceinr', 'sellingprice'] },
  { field: 'mrp', tokens: ['mrp', 'mrpinr', 'originalprice'] },
  { field: 'discount', tokens: ['discount', 'discountpercent', 'discountoff', 'off'] },
  { field: 'image_url', tokens: ['imageurl', 'image1url', 'imagelink', 'photourl'] },
  { field: 'description', tokens: ['description', 'details'] },
  { field: 'product_url', tokens: ['producturl', 'buynow', 'url', 'link'] },
  { field: 'schedule_date', tokens: ['scheduledate', 'date'] },
  { field: 'status', tokens: ['status'] },
];

function buildColumnMap(headerRow) {
  const map = {};
  const usedCols = new Set();
  // Two-pass: exact match first, then substring.
  // This prevents "Meesho Price (₹)" from stealing the 'price' field away from
  // a more specific "Selling Price" column — exact 'sellingprice' wins in pass 1.
  for (const pass of ['exact', 'includes']) {
    for (const { field, tokens } of FIELD_MATCHERS) {
      if (map[field] !== undefined) continue; // already claimed in pass 1
      for (let col = 0; col < headerRow.length; col++) {
        if (usedCols.has(col)) continue;
        const normalized = normalizeHeader(headerRow[col]);
        const hit = pass === 'exact'
          ? tokens.some((t) => normalized === t)
          : tokens.some((t) => normalized.includes(t));
        if (hit) {
          map[field] = col;
          usedCols.add(col);
          break;
        }
      }
    }
  }
  return map;
}

function colLetter(index) {
  let n = index + 1;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

async function syncSheet(config) {
  const sheets = await getSheetsClient();
  const tab = config.tab_name || 'Sheet1';
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: config.sheet_id, range: `${tab}!1:1` });
  const headerRow = headerRes.data.values?.[0] || [];
  const columnMap = buildColumnMap(headerRow);

  if (columnMap.product_name === undefined) {
    throw new Error(`Could not find a "Product Name" column in row 1 of "${tab}". Found headers: ${headerRow.join(', ') || '(empty)'}`);
  }

  const lastCol = colLetter(headerRow.length - 1 || 0);
  const range = `${tab}!A2:${lastCol}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.sheet_id, range });
  const rows = res.data.values || [];

  db.prepare('UPDATE sheets_config SET column_map = ? WHERE id = ?').run(JSON.stringify(columnMap), config.id);

  rows.forEach((row, idx) => {
    const rowIndex = idx + 2; // 1-based, header is row 1
    const get = (field) => (columnMap[field] !== undefined ? row[columnMap[field]] : undefined);
    const existing = db.prepare('SELECT id FROM products WHERE sheet_config_id = ? AND row_index = ?').get(config.id, rowIndex);
    const data = {
      sheet_config_id: config.id,
      row_index: rowIndex,
      product_name: get('product_name') || '',
      brand: get('brand') || '',
      price: parseFloat(get('price')) || 0,
      mrp: parseFloat(get('mrp')) || 0,
      discount: parseFloat(String(get('discount') || '').replace('%', '')) || 0,
      image_url: get('image_url') || '',
      description: get('description') || '',
      product_url: get('product_url') || '',
      schedule_date: get('schedule_date') || '',
      status: get('status') || 'Pending',
    };
    if (!data.product_name) return; // skip blank trailing rows
    if (existing) {
      db.prepare(`UPDATE products SET product_name=?, brand=?, price=?, mrp=?, discount=?, image_url=?, description=?, product_url=?, schedule_date=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(data.product_name, data.brand, data.price, data.mrp, data.discount, data.image_url, data.description, data.product_url, data.schedule_date, data.status, existing.id);
    } else {
      db.prepare(`INSERT INTO products (sheet_config_id, row_index, product_name, brand, price, mrp, discount, image_url, description, product_url, schedule_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.sheet_config_id, data.row_index, data.product_name, data.brand, data.price, data.mrp, data.discount, data.image_url, data.description, data.product_url, data.schedule_date, data.status);
    }
  });

  db.prepare('UPDATE sheets_config SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(config.id);
  return rows.length;
}

async function writeStatus(config, rowIndex, status) {
  const columnMap = JSON.parse(config.column_map || '{}');
  if (columnMap.status === undefined) return; // sheet has no Status column — nothing to write back
  const sheets = await getSheetsClient();
  const tab = config.tab_name || 'Sheet1';
  const range = `${tab}!${colLetter(columnMap.status)}${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheet_id,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[`${status} ${new Date().toISOString()}`]] },
  });
}

module.exports = { extractSheetId, syncSheet, writeStatus, getAuthUrl, handleOAuthCallback, isConnected };
