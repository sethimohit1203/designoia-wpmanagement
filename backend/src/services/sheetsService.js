const { google } = require('googleapis');
const db = require('../db');

const COLUMNS = [
  'product_name', 'brand', 'price', 'mrp', 'discount', 'image_url',
  'description', 'product_url', 'schedule_date', 'status',
];

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url; // allow raw ID too
}

function getAuth() {
  // Service-account based auth (simplest for a self-hosted automation tool).
  // Place a service-account JSON at backend/google-credentials.json and share the Sheet with its client_email.
  const keyFile = require('path').join(__dirname, '..', '..', 'google-credentials.json');
  const fs = require('fs');
  if (!fs.existsSync(keyFile)) {
    throw new Error('google-credentials.json not found. Add a Google service account key to backend/ and share your Sheet with its client_email.');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
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

module.exports = { extractSheetId, syncSheet, writeStatus };
