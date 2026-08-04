const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db');
const { sendPasswordResetEmail } = require('../services/emailService');

function getPasswordHash() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'dashboard_password_hash'").get();
  return row?.value || null;
}

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.JWT_SECRET) {
    console.error('[auth] JWT_SECRET not set in environment');
    return res.status(500).json({ error: 'Server auth is not configured' });
  }
  const hash = getPasswordHash();
  if (!hash) {
    console.error('[auth] No dashboard password set — DASHBOARD_PASSWORD was never provided to bootstrap one');
    return res.status(500).json({ error: 'Server auth is not configured' });
  }
  if (!password || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = jwt.sign({ role: 'dashboard' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Single shared-password app, no user accounts — resets always go to the one
// configured ADMIN_EMAIL, never to an address supplied by the request.
router.post('/forgot-password', async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'Server auth is not configured' });
    const resetToken = jwt.sign({ purpose: 'password-reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(resetUrl);
    res.json({ ok: true, message: 'Reset link sent to the configured admin email' });
  } catch (e) {
    console.error('[auth] forgot-password failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Reset link is invalid or expired — request a new one' });
  }
  if (payload.purpose !== 'password-reset') {
    return res.status(401).json({ error: 'Invalid reset token' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("INSERT INTO settings (key, value) VALUES ('dashboard_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(hash);
  res.json({ ok: true });
});

module.exports = router;
