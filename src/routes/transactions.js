import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/transactions
router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.userId],
  );
  res.json({ transactions: rows });
});

// POST /api/transactions/send
router.post('/send', authMiddleware, async (req, res) => {
  const { to, tag, amount, note } = req.body;
  if (!to && !tag) return res.status(400).json({ message: 'Recipient (to or tag) is required' });
  if (amount === undefined || amount === null) return res.status(400).json({ message: 'Amount is required' });

  // Recipient by id or cashtag
  let recipient;
  if (to) {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [to]);
    recipient = rows[0];
  } else {
    const q = tag.replace(/^\$/, '');
    const { rows } = await pool.query(`SELECT * FROM users WHERE cashtag = $1`, [q]);
    recipient = rows[0];
  }

  if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

  const senderRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const sender = senderRes.rows[0];
  if (!sender) return res.status(404).json({ message: 'Sender not found' });

  if (sender.balance < amount) return res.status(402).json({ message: 'Insufficient balance' });

  const now = new Date().toISOString();
  const sendId = uuid();
  const receiveId = uuid();
  const subtitle = note || `To ${recipient.first_name}`;

  await pool.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [amount, sender.id]);
  await pool.query(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [amount, recipient.id]);

  await pool.query(
    `INSERT INTO transactions (id, user_id, counterparty_name, subtitle, amount, is_received, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sendId, sender.id, `${recipient.first_name} ${recipient.last_name}`.trim(), subtitle, amount, false, now],
  );

  await pool.query(
    `INSERT INTO transactions (id, user_id, counterparty_name, subtitle, amount, is_received, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [receiveId, recipient.id, `${sender.first_name} ${sender.last_name}`.trim(), subtitle, amount, true, now],
  );

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [sender.id]);
  const updatedSender = rows[0];

  res.json({
    message: 'Payment sent',
    transactionId: sendId,
    balance: updatedSender.balance,
  });
});

// POST /api/transactions/request
router.post('/request', authMiddleware, async (req, res) => {
  const { tag, amount, note } = req.body;
  if (!tag) return res.status(400).json({ message: 'Recipient tag is required' });
  if (!amount) return res.status(400).json({ message: 'Amount is required' });

  const q = tag.replace(/^\$/, '');
  const { rows } = await pool.query(`SELECT * FROM users WHERE cashtag = $1`, [q]);
  const recipient = rows[0];

  if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

  const senderRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const sender = senderRes.rows[0];
  if (!sender) return res.status(404).json({ message: 'User not found' });

  res.json({ message: 'Payment request sent' });
});

export default router;
