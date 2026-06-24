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
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const code = generateOtp();
  const expiresAt = getExpiry();

  db.prepare(`DELETE FROM otps WHERE email = ?`).run(email);
  db.prepare(`INSERT INTO otps (email, code, expires_at) VALUES (?, ?, ?)`).run(email, code, expiresAt);

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (RESEND_API_KEY) {
    try {
      await sendEmail(RESEND_API_KEY, FROM_EMAIL, email, code);
      console.log(`[EMAIL] OTP sent to ${email}`);
    } catch (err) {
      console.error(`[EMAIL] Failed to send to ${email}:`, err.message);
    }
  } else {
    console.log(`[DEV] OTP for ${email}: ${code}`);
  }

  const appDebug = process.env.APP_DEBUG !== 'false';
  res.json({
    message: 'OTP sent',
    ...(appDebug ? { otp: code } : {}),
  });
});

async function sendEmail(apiKey, from, to, otp) {
  const html = buildEmailHtml(otp);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your KashApp Verification Code',
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

function buildEmailHtml(otp) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
          <tr>
            <td align="center" style="background:#111827;padding:40px 40px 36px;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">&#x1F4B8;</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.3px;">KashApp</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:0.5px;text-transform:uppercase;">Verification Code</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 48px 32px;">
              <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Verify your identity</p>
              <p style="margin:0 0 32px;color:#6b7280;font-size:15px;line-height:1.65;">
                Enter this code in the KashApp to complete verification. It expires in <strong style="color:#111827;">10 minutes</strong>.
              </p>
              <div style="text-align:center;margin:0 0 32px;">
                <div style="display:inline-block;background:#F3F4F6;border:2px solid #D1D5DB;border-radius:14px;padding:20px 52px;font-size:40px;font-weight:900;letter-spacing:12px;color:#111827;text-decoration:none;font-family:monospace;">
                  ${otp}
                </div>
              </div>
              <div style="background:#fef3c7;border-radius:10px;padding:14px 18px;border-left:4px solid #f59e0b;">
                <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                  <strong>Didn't request this?</strong> Ignore this email or contact our support team immediately.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 48px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                &copy; ${new Date().getFullYear()} KashApp &middot; This is an automated message, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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
