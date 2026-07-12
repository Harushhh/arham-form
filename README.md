# Arham — Insurance Lead Form

A single-page form that collects Name, Designation, Company, Mobile Number, Email,
Product (dropdown), and a Policy PDF upload. Submissions — including the PDF itself —
are stored in a PostgreSQL database. A simple password-protected `/admin` page lets
you view submissions and download the PDFs.

This guide uses **Neon** (free Postgres) and **Render** (free hosting) — neither
requires a credit card.

---

## 1. Create your free database (Neon)

1. Go to https://neon.tech and sign up (email/GitHub — no card).
2. Create a new project. Neon gives you a connection string that looks like:
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`
3. Copy that connection string — this is your `DATABASE_URL`. That's the whole setup;
   the app creates its own table automatically on first run.

---

## 2. Run it locally in VS Code (optional, to test first)

You'll need Node.js installed (check with `node -v`).

```bash
npm install
cp .env.example .env
```

Open `.env` in VS Code and fill in:
```
DATABASE_URL=your Neon connection string from step 1
ADMIN_USER=admin
ADMIN_PASSWORD=choose-a-password
```

Then:
```bash
npm start
```

- Form: http://localhost:3000
- Submissions: http://localhost:3000/admin (log in with `ADMIN_USER` / `ADMIN_PASSWORD`)

---

## 3. Deploy for free (Render)

1. Push this project to a GitHub repo.
2. Go to https://render.com and sign up (no card).
3. **New → Web Service**, connect your GitHub repo.
4. Render auto-detects Node.js. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Under **Environment**, add:
   - `DATABASE_URL` — your Neon connection string from step 1
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
6. Click **Create Web Service**. Render builds and deploys — you'll get a free
   `.onrender.com` URL.

**Note:** free Render services sleep after 15 minutes without traffic and take
30–60 seconds to wake up on the next visit. For a lead-capture form that isn't
getting constant traffic, this is a fine tradeoff for $0/month. If that wait ever
becomes a problem, Render's paid tier (~$7/month) removes it — no changes to the
code needed either way.

---

## What each file does

- `public/index.html` — the form itself (single file, no build step).
- `server.js` — Express server. Serves the form, writes submissions (and the PDF,
  stored as binary data) to Postgres on submit, and serves the `/admin` view.
- `package.json` — dependencies (`express`, `multer`, `pg`) and the `start` script
  Render uses.

## Notes

- PDF uploads are capped at 10MB (adjust `limits.fileSize` in `server.js` if needed)
  and are stored directly in the database as binary data — no separate file storage
  needed.
- Only `.pdf` files are accepted — anything else is rejected before it's saved.
- `/admin` uses HTTP Basic Auth (browser will prompt for username/password). It's
  enough for a small internal tool.
- To export all submissions later (e.g. to a spreadsheet), you can query the
  `submissions` table directly with any Postgres client (Neon has a built-in SQL
  editor in its dashboard) — `file_data` is the only binary column, everything
  else is plain text.
