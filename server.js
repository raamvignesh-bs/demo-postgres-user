const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('./config/cloudinary');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


// ==================================================
// POSTGRESQL
// ==================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
});


// ==================================================
// MULTER
// ==================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  },

  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Only JPG, PNG and WEBP images are allowed.'
        )
      );
    }
  }
});


// ==================================================
// DATABASE INITIALIZATION
// ==================================================

async function initializeDatabase() {

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  // Users table
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
      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      image_url TEXT NOT NULL,
      public_id TEXT NOT NULL,

      created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Database tables initialized.');
}


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ==================================================
// USER APIs
// ==================================================


// CREATE USER
app.post('/api/users', async (req, res) => {

  try {

    const {
      name,
      address,
      phone
    } = req.body;


    if (!name || !address || !phone) {

      return res.status(400).json({
        error:
          'Name, address, and phone number are required.'
      });

    }


    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        address,
        phone
      )
      VALUES ($1, $2, $3)

      RETURNING
        id,
        name,
        address,
        phone,
        created_at
      `,
      [
        name.trim(),
        address.trim(),
        phone.trim()
      ]
    );


    return res.status(201).json({
      user: result.rows[0]
    });


  } catch (error) {

    console.error(
      'Create user failed:',
      error
    );

    return res.status(500).json({
      error: 'Unable to save user.'
    });

  }

});


// GET ALL USERS
app.get('/api/users', async (_req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        id,
        name,
        address,
        phone,
        created_at
      FROM users
      ORDER BY id DESC
    `);


    return res.json({
      users: result.rows
    });


  } catch (error) {

    console.error(
      'Fetch users failed:',
      error
    );

    return res.status(500).json({
      error: 'Unable to fetch users.'
    });

  }

});


// ==================================================
// IMAGE APIs
// ==================================================


// UPLOAD IMAGE
app.post(
  '/api/images',
  upload.single('image'),
  async (req, res) => {

    try {

      // -------------------------------
      // Check image
      // -------------------------------

      if (!req.file) {

        return res.status(400).json({
          error: 'Image is required.'
        });

      }


      // -------------------------------
      // Check user_id
      // -------------------------------

      const userId = parseInt(
        req.body.user_id,
        10
      );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {

        return res.status(400).json({
          error:
            'A valid user_id is required.'
        });

      }


      // -------------------------------
      // Debug received file
      // -------------------------------

      console.log('Received file:', {
        originalname:
          req.file.originalname,

        mimetype:
          req.file.mimetype,

        size:
          req.file.size,

        bufferSize:
          req.file.buffer
            ? req.file.buffer.length
            : 0
      });


      // -------------------------------
      // Make sure buffer exists
      // -------------------------------

      if (
        !req.file.buffer ||
        req.file.buffer.length === 0
      ) {

        return res.status(400).json({
          error:
            'Uploaded image file is empty.'
        });

      }


      // -------------------------------
      // Check user exists
      // -------------------------------

      const userResult =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [userId]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res.status(404).json({
          error: 'User not found.'
        });

      }


      // -------------------------------
      // Convert image to Data URI
      // -------------------------------

      const base64Image =
        req.file.buffer.toString(
          'base64'
        );


      const dataURI =
        `data:${req.file.mimetype};base64,${base64Image}`;


      console.log(
        'Uploading image to Cloudinary...'
      );


      // -------------------------------
      // Upload to Cloudinary
      // -------------------------------

      const cloudinaryResult =
        await cloudinary.uploader.upload(
          dataURI,
          {
            folder:
              'demo-postgres-user',

            resource_type:
              'image'
          }
        );


      console.log(
        'Cloudinary upload successful:',
        cloudinaryResult.public_id
      );


      // -------------------------------
      // Save URL in PostgreSQL
      // -------------------------------

      const databaseResult =
        await pool.query(
          `
          INSERT INTO images (
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
            created_at
          `,
          [
            userId,
            cloudinaryResult.secure_url,
            cloudinaryResult.public_id
          ]
        );


      // -------------------------------
      // Return result
      // -------------------------------

      return res
        .status(201)
        .json({

          message:
            'Image uploaded successfully.',

          image:
            databaseResult.rows[0]

        });


    } catch (error) {

      console.error(
        'Image upload failed:',
        error
      );


      return res
        .status(500)
        .json({

          error:
            'Unable to upload image.',

          details:
            error.message ||
            'Unknown error'

        });

    }

  }
);


// ==================================================
// GET IMAGES FOR USER
// ==================================================

app.get(
  '/api/users/:userId/images',
  async (req, res) => {

    try {

      const userId =
        parseInt(
          req.params.userId,
          10
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {

        return res
          .status(400)
          .json({
            error:
              'Invalid user ID.'
          });

      }


      const result =
        await pool.query(
          `
          SELECT
            id,
            user_id,
            image_url,
            public_id,
            created_at

          FROM images

          WHERE user_id = $1

          ORDER BY id DESC
          `,
          [userId]
        );


      return res.json({
        images: result.rows
      });


    } catch (error) {

      console.error(
        'Fetch images failed:',
        error
      );


      return res
        .status(500)
        .json({
          error:
            'Unable to fetch images.'
        });

    }

  }
);

// ==================================================
// CLOUDINARY CONNECTION TEST
// ==================================================

app.get('/api/cloudinary-test', async (_req, res) => {
  try {

    const config = cloudinary.config();

    console.log('Cloudinary config check:', {
      cloud_name: config.cloud_name,
      api_key_exists: !!config.api_key,
      api_secret_exists: !!config.api_secret
    });

    const result = await cloudinary.api.ping();

    console.log('Cloudinary connection successful.');

    return res.status(200).json({
      message: 'Cloudinary connection successful.',
      cloud_name: config.cloud_name,
      status: result.status
    });

  } catch (error) {

    console.error(
      'Cloudinary connection failed:',
      error
    );

    return res.status(500).json({
      error: 'Cloudinary connection failed.',
      details: error.message
    });
  }
});


// ==================================================
// HEALTH CHECK
// ==================================================

app.get(
  '/health',
  (_req, res) => {

    res.json({
      status: 'ok'
    });

  }
);


// ==================================================
// MULTER ERROR HANDLER
// ==================================================

app.use(
  (error, _req, res, next) => {

    if (
      error instanceof
      multer.MulterError
    ) {

      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {

        return res
          .status(400)
          .json({
            error:
              'Image must be smaller than 10 MB.'
          });

      }


      return res
        .status(400)
        .json({
          error: error.message
        });

    }


    if (
      error &&
      error.message ===
        'Only JPG, PNG and WEBP images are allowed.'
    ) {

      return res
        .status(400)
        .json({
          error: error.message
        });

    }


    next(error);

  }
);


// ==================================================
// START SERVER
// ==================================================

initializeDatabase()

  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `Server running on port ${PORT}`
        );

      }
    );

  })

  .catch((error) => {

    console.error(
      'Database initialization failed:',
      error
    );

    process.exit(1);

  });
