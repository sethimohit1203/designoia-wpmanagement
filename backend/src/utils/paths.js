const path = require('path');

// In production (Railway etc.), DATA_DIR should point at a mounted persistent
// volume. Without it, everything below lives in the container's ephemeral
// filesystem and gets wiped on every redeploy — DB, WhatsApp sessions, uploads.
const base = process.env.DATA_DIR || path.join(__dirname, '..', '..');

const dbDir = process.env.DATA_DIR ? path.join(base, 'db') : path.join(base, 'data');
const sessionsDir = path.join(base, 'sessions');
const uploadsDir = path.join(base, 'uploads');

module.exports = { dbDir, sessionsDir, uploadsDir };
