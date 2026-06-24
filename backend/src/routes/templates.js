const express = require('express');
const router = express.Router();
const db = require('../db');
const ai = require('../services/aiService');

function detectVariables(content) {
  const matches = content.match(/\{[a-zA-Z_]+\}/g) || [];
  return [...new Set(matches)];
}

router.get('/', (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare('SELECT * FROM templates WHERE category = ? ORDER BY id DESC').all(category)
    : db.prepare('SELECT * FROM templates ORDER BY id DESC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, category = 'Marketing', content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  const variables = JSON.stringify(detectVariables(content));
  const info = db.prepare('INSERT INTO templates (name, category, content, variables) VALUES (?,?,?,?)')
    .run(name, category, content, variables);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/ai-generate', async (req, res) => {
  try {
    const { use_case, category = 'Marketing' } = req.body;
    const content = await ai.generateTemplate(use_case, category);
    res.json({ content, variables: detectVariables(content) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, category, content } = req.body;
  const variables = JSON.stringify(detectVariables(content));
  db.prepare('UPDATE templates SET name=?, category=?, content=?, variables=? WHERE id=?')
    .run(name, category, content, variables, req.params.id);
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
