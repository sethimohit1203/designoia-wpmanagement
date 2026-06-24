const express = require('express');
const router = express.Router();
const db = require('../db');
const { extractSheetId, syncSheet, writeStatus, getAuthUrl, handleOAuthCallback, isConnected } = require('../services/sheetsService');

router.get('/oauth/status', (req, res) => {
  res.json({ connected: isConnected() });
});

router.get('/oauth/start', (req, res) => {
  try {
    res.redirect(getAuthUrl());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<h3>Google authorization failed: ${error}</h3>`);
  try {
    await handleOAuthCallback(code);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/sheets?connected=1`);
  } catch (e) {
    res.status(500).send(`<h3>OAuth error: ${e.message}</h3>`);
  }
});

router.get('/configs', (req, res) => {
  res.json(db.prepare('SELECT * FROM sheets_config ORDER BY id DESC').all());
});

router.post('/configs', async (req, res) => {
  const { name = 'My Sheet', sheet_url, tab_name = 'Sheet1', number_id } = req.body;
  if (!sheet_url) return res.status(400).json({ error: 'sheet_url required' });
  const sheet_id = extractSheetId(sheet_url);
  const info = db.prepare('INSERT INTO sheets_config (name, sheet_url, sheet_id, tab_name, number_id) VALUES (?,?,?,?,?)')
    .run(name, sheet_url, sheet_id, tab_name, number_id || null);
  const config = db.prepare('SELECT * FROM sheets_config WHERE id = ?').get(info.lastInsertRowid);
  try {
    await syncSheet(config);
  } catch (e) {
    return res.json({ config, syncError: e.message });
  }
  res.json({ config });
});

router.post('/configs/:id/sync', async (req, res) => {
  const config = db.prepare('SELECT * FROM sheets_config WHERE id = ?').get(req.params.id);
  if (!config) return res.status(404).json({ error: 'not found' });
  try {
    const count = await syncSheet(config);
    res.json({ ok: true, rows: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/configs/:id', (req, res) => {
  db.prepare('DELETE FROM sheets_config WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE sheet_config_id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/products', (req, res) => {
  const { sheet_config_id, status, min_price, max_price, min_discount } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (sheet_config_id) { query += ' AND sheet_config_id = ?'; params.push(sheet_config_id); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (min_price) { query += ' AND price >= ?'; params.push(min_price); }
  if (max_price) { query += ' AND price <= ?'; params.push(max_price); }
  if (min_discount) { query += ' AND discount >= ?'; params.push(min_discount); }
  query += ' ORDER BY id DESC';
  res.json(db.prepare(query).all(...params));
});

module.exports = router;
