# PostgreSQL Users Demo

This is a deploy-ready demo application.

## Pages

- First page: collects user name, address, and phone number.
- Second page: shows all users saved in PostgreSQL.

## Tech Stack

- Node.js
- Express
- PostgreSQL
- HTML, CSS, JavaScript

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Add your PostgreSQL connection string:

```bash
DATABASE_URL=postgresql://username:password@host:5432/database_name
```

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Render Deployment

Create a new Render Web Service and use:

```text
Build Command: npm install
Start Command: npm start
```

Add this environment variable in Render:

```text
DATABASE_URL=<your Render PostgreSQL internal/external database URL>
NODE_ENV=production
```

The app automatically creates the `users` table when it starts.
