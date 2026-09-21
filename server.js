const path = require('path');
const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set. Add PostgreSQL connection string before running the app.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(30) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/users', async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name || !address || !phone) {
      return res.status(400).json({ error: 'Name, address, and phone number are required.' });
    }

    const result = await pool.query(
      'INSERT INTO users (name, address, phone) VALUES ($1, $2, $3) RETURNING id, name, address, phone, created_at',
      [name.trim(), address.trim(), phone.trim()]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to save user.' });
  }
});

app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, address, phone, created_at FROM users ORDER BY id DESC'
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to fetch users.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PostgreSQL users demo running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
