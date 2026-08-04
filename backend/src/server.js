require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { uploadsDir } = require('./utils/paths');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();
// FRONTEND_URL restricts CORS to the deployed dashboard in production; falls back to
// allow-all in dev when it isn't set, matching prior behavior.
app.use(cors(process.env.FRONTEND_URL ? { origin: process.env.FRONTEND_URL } : undefined));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ⚠️ AUTH IS TEMPORARILY DISABLED — every /api/* route below is open with no
// login required, while the login/domain/TLS deployment gets sorted out.
// requireAuth (JWT check, see middleware/auth.js) still exists and works —
// to re-enable it, put it back in each app.use(...) line below, e.g.:
//   app.use('/api/numbers', requireAuth, require('./routes/numbers'));
// The login endpoints in routes/auth.js (including forgot/reset password)
// are untouched and still work once requireAuth is restored.
app.use('/api/auth', require('./routes/auth'));

app.use('/api/numbers', require('./routes/numbers'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/bulk', require('./routes/bulkSend'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/broadcast-queue', require('./routes/broadcastQueue'));
app.use('/api/member-queue', require('./routes/memberQueue'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'designoia-wpmanagement-backend' }));

const scheduler = require('./services/scheduler');
scheduler.start();

const wa = require('./services/waManager');

// Auto-reconnect any number that was connected before the server restarted
setTimeout(async () => {
  const rows = db.prepare("SELECT id FROM numbers WHERE status IN ('connected', 'qr')").all();
  for (const row of rows) {
    try {
      console.log(`[startup] reconnecting number ${row.id}`);
      await wa.connect(row.id);
    } catch (e) {
      console.error(`[startup] failed to reconnect number ${row.id}:`, e.message);
      // Without this, the DB keeps reporting 'connected' with no live socket behind it,
      // so the UI shows a healthy number that silently can't send anything.
      db.prepare("UPDATE numbers SET status = 'disconnected' WHERE id = ?").run(row.id);
    }
  }
}, 3000);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Designoia-WPManagement backend running on http://localhost:${PORT}`);
});
// Large sheet imports can take 60–90 s — raise timeout so the connection
// doesn't drop mid-import.
server.timeout = 180000;

// `docker stop` sends SIGTERM. Without this, Node exits immediately and leaves
// orphaned Chromium processes holding each session's SingletonLock, breaking
// the next connect attempt after every redeploy.
async function gracefulShutdown(signal) {
  console.log(`${signal} received, closing WhatsApp sessions before exit...`);
  await wa.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000); // hard exit if close hangs
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
