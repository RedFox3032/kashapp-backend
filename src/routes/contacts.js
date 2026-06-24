import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/contacts
router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC`).all(req.user.userId);

  res.json({
    contacts: rows.map(c => ({
      id: c.id,
      name: c.nickname || c.name,
      rawName: c.name,
      tag: c.tag,
      nickname: c.nickname || null,
      color: c.color,
      initials: c.initials,
    })),
  });
});

// POST /api/contacts — add friend (by cashtag or email)
router.post('/', authMiddleware, (req, res) => {
  const { name, tag, color, initials } = req.body;
  if (!name || !tag) return res.status(400).json({ message: 'Name and tag are required' });

  const id = uuid();
  db.prepare(`
    INSERT INTO contacts (id, user_id, name, tag, color, initials)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.userId, name, tag.replace(/^\$/, ''), color ?? 4278190080, initials ?? null);

  res.status(201).json({ contact: { id, name, tag, nickname: null, color, initials } });
});

// PUT /api/contacts/:id/nickname
router.put('/:id/nickname', authMiddleware, (req, res) => {
  const { nickname } = req.body;
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.userId);
  if (!contact) return res.status(404).json({ message: 'Contact not found' });

  const display = nickname ? nickname.trim() : null;
  db.prepare(`UPDATE contacts SET nickname = ? WHERE id = ?`).run(display || null, req.params.id);

  res.json({
    contact: {
      id: contact.id,
      name: display || contact.name,
      rawName: contact.name,
      tag: contact.tag,
      nickname: display,
      color: contact.color,
      initials: contact.initials,
    },
  });
});

// DELETE /api/contacts/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const result = db.prepare(`DELETE FROM contacts WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.userId);
  if (result.changes === 0) return res.status(404).json({ message: 'Contact not found' });
  res.json({ message: 'Contact deleted' });
});

export default router;
