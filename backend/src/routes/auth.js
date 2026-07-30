const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.DASHBOARD_PASSWORD || !process.env.JWT_SECRET) {
    console.error('[auth] DASHBOARD_PASSWORD or JWT_SECRET not set in environment');
    return res.status(500).json({ error: 'Server auth is not configured' });
  }
  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = jwt.sign({ role: 'dashboard' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
