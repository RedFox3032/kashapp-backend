import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/transactions
router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.userId);

  res.json({
    transactions: rows.map(t => ({
      id: t.id,
      name: t.counterparty_name,
      subtitle: t.subtitle || '',
      amount: t.amount,
      isReceived: !!t.is_received,
      date: t.created_at,
    })),
  });
});

// POST /api/transactions/send
router.post('/send', authMiddleware, (req, res) => {
  const { to, tag, amount, note } = req.body;
  if (!to || amount === undefined || amount === null) return res.status(400).json({ message: 'Recipient and amount are required' });
  if (Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be greater than 0' });

  const sender = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
  if (!sender) return res.status(404).json({ message: 'User not found' });
  if (sender.balance < Number(amount)) return res.status(400).json({ message: 'Insufficient balance' });

  let recipient = null;
  if (tag) {
    const cleanTag = tag.replace(/^\$/, '');
    recipient = db.prepare(`SELECT id FROM users WHERE email = ? OR cashtag = ?`).get(cleanTag, cleanTag);
  }

  const txId = uuid();

  db.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`).run(Number(amount), req.user.userId);
  if (recipient) {
    db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`).run(Number(amount), recipient.id);
  }

  db.prepare(`
    INSERT INTO transactions (id, user_id, counterparty_name, subtitle, amount, is_received)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(txId, req.user.userId, to, note || '', Number(amount));

  if (recipient) {
    db.prepare(`
      INSERT INTO transactions (id, user_id, counterparty_name, subtitle, amount, is_received)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(uuid(), recipient.id, `${sender.first_name} ${sender.last_name}`.trim() || to, note || '', Number(amount));
  }

  const updated = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(req.user.userId);

  res.json({
    transaction: {
      id: txId,
      name: to,
      subtitle: note || '',
      amount: Number(amount),
      isReceived: false,
      date: new Date().toISOString(),
    },
    newBalance: updated.balance,
  });
});

// POST /api/transactions/request
router.post('/request', authMiddleware, (req, res) => {
  const { from, amount, note } = req.body;
  if (!from || amount === undefined || amount === null) return res.status(400).json({ message: 'Requester and amount are required' });
  if (Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be greater than 0' });

  const txId = uuid();
  db.prepare(`
    INSERT INTO transactions (id, user_id, counterparty_name, subtitle, amount, is_received)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(txId, req.user.userId, from, note || '', amount);

  res.json({
    transaction: {
      id: txId,
      name: from,
      subtitle: note || '',
      amount,
      isReceived: false,
      date: new Date().toISOString(),
    },
  });
});

export default router;
