const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');

router.get('/', (req, res) => {
  res.json(wa.list());
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const row = wa.addNumber(name);
  res.json(row);
});

router.post('/:id/connect', async (req, res) => {
  try {
    await wa.connect(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/qr', (req, res) => {
  const entry = wa.clients.get(Number(req.params.id));
  res.json({ qr: entry?.qr || null, status: entry?.status || 'disconnected' });
});

router.post('/:id/disconnect', (req, res) => {
  wa.disconnect(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/:id/reset-session', (req, res) => {
  try {
    wa.resetSession(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/activate', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE numbers SET is_active = 0').run();
  db.prepare('UPDATE numbers SET is_active = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.put('/:id/limits', (req, res) => {
  const id = Number(req.params.id);
  const { daily_limit, cooldown_minutes } = req.body;
  db.prepare('UPDATE numbers SET daily_limit = ?, cooldown_minutes = ? WHERE id = ?')
    .run(daily_limit, cooldown_minutes, id);
  res.json({ ok: true });
});

router.put('/:id/warmup', (req, res) => {
  const id = Number(req.params.id);
  const { warmup_enabled } = req.body;
  db.prepare('UPDATE numbers SET warmup_enabled = ? WHERE id = ?').run(warmup_enabled ? 1 : 0, id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  wa.removeNumber(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
