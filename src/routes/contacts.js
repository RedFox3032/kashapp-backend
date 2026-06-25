import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/contacts
router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM contacts WHERE user_id = $1 ORDER BY name ASC`,
    [req.user.userId],
  );
  res.json({ contacts: rows });
});

// POST /api/contacts
router.post('/', authMiddleware, async (req, res) => {
  const { tag, email } = req.body;
  if (!tag && !email) return res.status(400).json({ message: 'tag or email is required' });

  let lookup;
  if (email) {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, cashtag FROM users WHERE email = $1`,
      [email],
    );
    lookup = rows[0];
  } else {
    const q = tag.replace(/^\$/, '');
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, cashtag FROM users WHERE cashtag = $1`,
      [q],
    );
    lookup = rows[0];
  }

  if (!lookup) return res.status(404).json({ message: 'User not found' });

  if (lookup.id === req.user.userId) {
    return res.status(400).json({ message: 'Cannot add yourself as a contact' });
  }

  const id = uuid();
  const fullName = `${lookup.first_name} ${lookup.last_name}`.trim();
  const initials = (lookup.first_name?.[0] || '') + (lookup.last_name?.[0] || '');

  try {
    await pool.query(
      `INSERT INTO contacts (id, user_id, name, tag, nickname, initials)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.user.userId, fullName, lookup.cashtag, null, initials],
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Contact already exists' });
    }
    throw err;
  }

  res.status(201).json({ contact: { id, name: fullName, tag: lookup.cashtag, initials } });
});

// PUT /api/contacts/:id/nickname
router.put('/:id/nickname', authMiddleware, async (req, res) => {
  const { nickname } = req.body;
  const { rowCount } = await pool.query(
    `UPDATE contacts SET nickname = $1 WHERE id = $2 AND user_id = $3`,
    [nickname || null, req.params.id, req.user.userId],
  );

  if (rowCount === 0) return res.status(404).json({ message: 'Contact not found' });

  const { rows } = await pool.query(`SELECT * FROM contacts WHERE id = $1`, [req.params.id]);
  res.json({ contact: rows[0] });
});

// DELETE /api/contacts/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM contacts WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.userId],
  );

  if (rowCount === 0) return res.status(404).json({ message: 'Contact not found' });

  res.json({ message: 'Contact removed' });
});

export default router;
