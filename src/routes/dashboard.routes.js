const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

router.get('/summary', requireAuth, (req, res) => {
  const userId = req.userId;

  const expenses = db
    .prepare(
      `SELECT * FROM expenses WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now') ORDER BY created_at DESC`
    )
    .all(userId);

  const tasks = db
    .prepare(`SELECT * FROM tasks WHERE user_id = ? AND status = 'pendente' ORDER BY due_date ASC`)
    .all(userId);

  const events = db
    .prepare(`SELECT * FROM events WHERE user_id = ? ORDER BY start_time ASC LIMIT 10`)
    .all(userId);

  const documents = db
    .prepare(`SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .all(userId);

  const totalGasto = expenses.reduce((sum, e) => sum + e.amount, 0);

  res.json({ totalGasto, expenses, tasks, events, documents });
});

router.get('/messages', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.userId);
  res.json({ messages: rows });
});

module.exports = router;
