import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import transactionRoutes from './routes/transactions.js';
import contactRoutes from './routes/contacts.js';
import balanceRoutes from './routes/balance.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/balance', balanceRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KashApp backend running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
