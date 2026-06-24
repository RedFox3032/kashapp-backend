import { Router } from 'express';
import { createHash } from 'crypto';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

// GET /api/user/me — handled in auth.js as GET /api/auth/me
// This file handles mutations

// PUT /api/user/profile
router.put('/profile', authMiddleware, (req, res) => {
  const { firstName, lastName, email } = req.body;
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ message: 'firstName, lastName, and email are required' });
  }

  db.prepare(`
    UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?
  `).run(firstName, lastName, email, req.user.userId);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
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
router.put('/cashtag', authMiddleware, (req, res) => {
  const { cashtag } = req.body;
  if (!cashtag) return res.status(400).json({ message: 'Cashtag is required' });

  try {
    db.prepare(`UPDATE users SET cashtag = ? WHERE id = ?`).run(cashtag, req.user.userId);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ message: 'Cashtag already taken' });
    }
    throw err;
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
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
router.put('/pin', authMiddleware, (req, res) => {
  const { oldPin, newPin } = req.body;
  if (!oldPin || !newPin) return res.status(400).json({ message: 'oldPin and newPin are required' });

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (hashPin(oldPin) !== user.pin_hash) {
    return res.status(403).json({ message: 'Current PIN is incorrect' });
  }

  db.prepare(`UPDATE users SET pin_hash = ? WHERE id = ?`).run(hashPin(newPin), req.user.userId);
  res.json({ message: 'PIN updated successfully' });
});

// POST /api/user/verify-pin
router.post('/verify-pin', authMiddleware, (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ message: 'PIN is required' });

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (hashPin(pin) !== user.pin_hash) {
    return res.status(403).json({ message: 'Incorrect PIN' });
  }

  res.json({ message: 'PIN verified' });
});

// GET /api/user/lookup?q=cashtag_or_email
router.get('/lookup', authMiddleware, (req, res) => {
  const q = (req.query.q || '').trim().replace(/^\$/, '');
  if (!q) return res.status(400).json({ message: 'Query is required' });

  const user = db.prepare(`
    SELECT id, first_name, last_name, email, cashtag FROM users WHERE email = ? OR cashtag = ?
  `).get(q, q);

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
