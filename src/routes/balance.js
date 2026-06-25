import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/balance
router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(`SELECT balance FROM users WHERE id = $1`, [req.user.userId]);
  const user = rows[0];
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ balance: user.balance });
});

// POST /api/balance/add-cash
router.post('/add-cash', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount is required' });

  const { rows } = await pool.query(
    `UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance`,
    [amount, req.user.userId],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ balance: user.balance, message: 'Cash added successfully' });
});

export default router;
