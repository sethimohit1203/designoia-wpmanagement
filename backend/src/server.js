require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { uploadsDir } = require('./utils/paths');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

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

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'designoia-wpmanagement-backend' }));

const scheduler = require('./services/scheduler');
scheduler.start();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Designoia-WPManagement backend running on http://localhost:${PORT}`);
});
