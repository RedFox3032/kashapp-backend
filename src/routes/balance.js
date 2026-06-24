import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const WEEKLY_SEND_LIMIT = 1500;
const WEEKLY_RECEIVE_LIMIT = 10000;
const MAX_CASH_BALANCE = 10000;

// GET /api/balance
router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({
    balance: user.balance,
    weeklySendLimit: WEEKLY_SEND_LIMIT,
    weeklyReceiveLimit: WEEKLY_RECEIVE_LIMIT,
    maxCashBalance: MAX_CASH_BALANCE,
  });
});

// POST /api/balance/add-cash
router.post('/add-cash', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount is required' });

  const user = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.balance + amount > MAX_CASH_BALANCE) {
    return res.status(400).json({ message: `Maximum cash balance is \$${MAX_CASH_BALANCE}` });
  }

  db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`).run(amount, req.user.userId);

  const updated = db.prepare(`SELECT balance FROM users WHERE id = ?`).get(req.user.userId);
  res.json({ newBalance: updated.balance });
});

export default router;
