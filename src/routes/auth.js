import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { createHash, randomInt } from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'kashapp-dev-secret-do-not-use-in-prod';

function hashPin(pin) {
  return createHash('sha256').update(pin).digest('hex');
}

function generateOtp() {
  return String(randomInt(100000, 999999));
}

function getExpiry() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 5);
  return date.toISOString();
}

function isExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}

// POST /api/auth/send-otp
router.post('/send-otp', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const code = generateOtp();
  const expiresAt = getExpiry();

  db.prepare(`DELETE FROM otps WHERE email = ?`).run(email);
  db.prepare(`INSERT INTO otps (email, code, expires_at) VALUES (?, ?, ?)`).run(email, code, expiresAt);

  console.log(`[DEV] OTP for ${email}: ${code}`);

  res.json({ message: 'OTP sent', otp: code });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

  const row = db.prepare(`SELECT * FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1`).get(email);

  if (!row) return res.status(400).json({ message: 'No OTP found for this email' });
  if (isExpired(row.expires_at)) return res.status(400).json({ message: 'OTP has expired' });
  if (row.code !== otp) return res.status(400).json({ message: 'Invalid OTP' });

  db.prepare(`DELETE FROM otps WHERE email = ?`).run(email);

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);

  if (!user) {
    const partialToken = generateToken({ email, isNewUser: true });
    return res.json({ token: partialToken, isNewUser: true });
  }

  const token = generateToken({ userId: user.id, email: user.email });
  res.json({
    token,
    isNewUser: false,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      cashtag: user.cashtag,
      balance: user.balance,
      isVerified: !!user.is_verified,
    },
  });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { token, firstName, lastName, dob, cashtag, pin } = req.body;

  if (!token || !firstName || !lastName || !dob || !cashtag || !pin) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  if (!payload.isNewUser) {
    return res.status(400).json({ message: 'User already registered' });
  }

  const id = uuid();
  const pinHash = hashPin(pin);

  try {
    db.prepare(`
      INSERT INTO users (id, email, first_name, last_name, cashtag, date_of_birth, pin_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, payload.email, firstName, lastName, cashtag, dob, pinHash);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ message: 'Cashtag already taken' });
    }
    throw err;
  }

  const authToken = generateToken({ userId: id, email: payload.email });
  res.status(201).json({
    token: authToken,
    user: {
      id,
      email: payload.email,
      firstName,
      lastName,
      cashtag,
      balance: 0,
      isVerified: false,
    },
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

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

export default router;
