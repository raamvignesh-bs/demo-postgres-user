const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('./config/cloudinary');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Multer configuration
// Image is temporarily kept in memory before uploading to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

// Initialize PostgreSQL tables
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      'DATABASE_URL is not set. Add PostgreSQL connection string before running the app.'
    );
    return;
  }

  // Existing users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(30) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Images table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      public_id TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// --------------------------------------------------
// USER APIs
// --------------------------------------------------

// Create user
app.post('/api/users', async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name || !address || !phone) {
      return res.status(400).json({
        error: 'Name, address, and phone number are required.'
      });
    }

    const result = await pool.query(
      `INSERT INTO users (name, address, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, phone, created_at`,
      [name.trim(), address.trim(), phone.trim()]
    );

    res.status(201).json({
      user: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Unable to save user.'
    });
  }
});


// Get all users
app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, address, phone, created_at
       FROM users
       ORDER BY id DESC`
    );

    res.json({
      users: result.rows
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Unable to fetch users.'
    });
  }
});


// --------------------------------------------------
// IMAGE APIs
// --------------------------------------------------

// Upload image to Cloudinary
app.post('/api/images', upload.single('image'), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        error: 'Image is required.'
      });
    }

    const userId = req.body.user_id;

    if (!userId) {
      return res.status(400).json({
        error: 'user_id is required.'
      });
    }

    // Check user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    // Upload buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'demo-postgres-user'
        },
        (error, result) => {

          if (error) {
            reject(error);
          } else {
            resolve(result);
          }

        }
      );

      uploadStream.end(req.file.buffer);
    });


    // Save Cloudinary information in PostgreSQL
    const result = await pool.query(
      `INSERT INTO images (
        user_id,
        image_url,
        public_id
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        user_id,
        image_url,
        public_id,
        created_at`,
      [
        userId,
        uploadResult.secure_url,
        uploadResult.public_id
      ]
    );


    res.status(201).json({
      message: 'Image uploaded successfully.',
      image: result.rows[0]
    });

  } catch (error) {

    console.error('Image upload failed:', error);

    res.status(500).json({
      error: 'Unable to upload image.'
    });
  }
});


// Get images for a user
app.get('/api/users/:userId/images', async (req, res) => {
  try {

    const { userId } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        user_id,
        image_url,
        public_id,
        created_at
       FROM images
       WHERE user_id = $1
       ORDER BY id DESC`,
      [userId]
    );

    res.json({
      images: result.rows
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Unable to fetch images.'
    });
  }
});


// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok'
  });
});


// --------------------------------------------------
// START SERVER
// --------------------------------------------------

initializeDatabase()
  .then(() => {

    app.listen(PORT, () => {
      console.log(`PostgreSQL users demo running on port ${PORT}`);
    });

  })
  .catch((error) => {

    console.error(
      'Database initialization failed:',
      error
    );

    process.exit(1);
  });