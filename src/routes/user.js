import { Router } from 'express';
import { createHash } from 'crypto';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

// PUT /api/user/profile
router.put('/profile', authMiddleware, async (req, res) => {
  const { firstName, lastName, email } = req.body;
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ message: 'firstName, lastName, and email are required' });
  }

  await pool.query(
    `UPDATE users SET first_name = $1, last_name = $2, email = $3 WHERE id = $4`,
    [firstName, lastName, email, req.user.userId],
  );

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      cashtag: user.cashtag,
      dateOfBirth: user.date_of_birth,
      balance: user.balance,
      isVerified: !!user.is_verified,
    },
  });
});

// PUT /api/user/cashtag
router.put('/cashtag', authMiddleware, async (req, res) => {
  const { cashtag } = req.body;
  if (!cashtag) return res.status(400).json({ message: 'Cashtag is required' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET cashtag = $1 WHERE id = $2`,
      [cashtag, req.user.userId],
    );
    if (rowCount === 0) return res.status(404).json({ message: 'User not found' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cashtag already taken' });
    }
    throw err;
  }

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      cashtag: user.cashtag,
      dateOfBirth: user.date_of_birth,
      balance: user.balance,
      isVerified: !!user.is_verified,
    },
  });
});

// PUT /api/user/pin
router.put('/pin', authMiddleware, async (req, res) => {
  const { oldPin, newPin } = req.body;
  if (!oldPin || !newPin) return res.status(400).json({ message: 'oldPin and newPin are required' });

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = rows[0];
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (hashPin(oldPin) !== user.pin_hash) {
    return res.status(403).json({ message: 'Current PIN is incorrect' });
  }

  await pool.query(`UPDATE users SET pin_hash = $1 WHERE id = $2`, [hashPin(newPin), req.user.userId]);
  res.json({ message: 'PIN updated successfully' });
});

// POST /api/user/verify-pin
router.post('/verify-pin', authMiddleware, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ message: 'PIN is required' });

  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.userId]);
  const user = rows[0];
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (hashPin(pin) !== user.pin_hash) {
    return res.status(403).json({ message: 'Incorrect PIN' });
  }

  res.json({ message: 'PIN verified' });
});

// GET /api/user/lookup?q=cashtag_or_email
router.get('/lookup', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim().replace(/^\$/, '');
  if (!q) return res.status(400).json({ message: 'Query is required' });

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, cashtag FROM users WHERE email = $1 OR cashtag = $1`,
    [q],
  );
  const user = rows[0];

  if (!user) return res.json({ found: false });

  res.json({
    found: true,
    user: {
      id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      cashtag: user.cashtag,
    },
  });
});

export default router;
