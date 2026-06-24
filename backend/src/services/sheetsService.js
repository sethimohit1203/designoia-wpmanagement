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
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set (check backend/.env locally, or your host\'s environment variables in production)');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
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

async function syncSheet(config) {
  const sheets = await getSheetsClient();
  const range = `${config.tab_name || 'Sheet1'}!A2:J`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.sheet_id, range });
  const rows = res.data.values || [];

  const upsert = db.prepare(`
    INSERT INTO products (sheet_config_id, row_index, product_name, brand, price, mrp, discount, image_url, description, product_url, schedule_date, status, updated_at)
    VALUES (@sheet_config_id, @row_index, @product_name, @brand, @price, @mrp, @discount, @image_url, @description, @product_url, @schedule_date, @status, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `);

  rows.forEach((row, idx) => {
    const rowIndex = idx + 2; // 1-based, header is row 1
    const existing = db.prepare('SELECT id FROM products WHERE sheet_config_id = ? AND row_index = ?').get(config.id, rowIndex);
    const data = {
      sheet_config_id: config.id,
      row_index: rowIndex,
      product_name: row[0] || '',
      brand: row[1] || '',
      price: parseFloat(row[2]) || 0,
      mrp: parseFloat(row[3]) || 0,
      discount: parseFloat(row[4]) || 0,
      image_url: row[5] || '',
      description: row[6] || '',
      product_url: row[7] || '',
      schedule_date: row[8] || '',
      status: row[9] || 'Pending',
    };
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
  const sheets = await getSheetsClient();
  const range = `${config.tab_name || 'Sheet1'}!J${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheet_id,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[`${status} ${new Date().toISOString()}`]] },
  });
}

module.exports = { extractSheetId, syncSheet, writeStatus, getAuthUrl, handleOAuthCallback, isConnected };
