// server.js
// Arham — Insurance Lead Form backend (PostgreSQL storage)
// Stores form submissions AND the uploaded PDF directly in Postgres,
// and exposes a password-protected /admin page to view/download them.

const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const { DATABASE_URL, ADMIN_USER, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL environment variable. On Render, set this in " +
      "your service's Environment tab (paste your Neon connection string). " +
      "See README.md."
  );
}

// ---------- Postgres ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && !DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name TEXT NOT NULL,
      empid TEXT NOT NULL,
      company TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT NOT NULL,
      product TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_mime TEXT NOT NULL,
      file_data BYTEA NOT NULL
    );
  `);
}

// Initialize Database (Errors are caught so it doesn't crash serverless functions)
initDb().catch((err) => {
  console.error("Failed to initialize database:", err);
});

// ---------- File upload ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed for the policy upload."));
    }
  },
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ---------- Submit endpoint ----------
app.post("/api/submit", upload.single("policyPdf"), async (req, res) => {
  try {
    const { name, empid, company, mobile, email, product } = req.body;

    if (!name || !empid || !company || !mobile || !email || !product) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Please attach the policy PDF." });
    }

    await pool.query(
      `INSERT INTO submissions
        (name, empid, company, mobile, email, product, file_name, file_mime, file_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        name,
        empid,
        company,
        mobile,
        email,
        product,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }
  next();
});

// ---------- Admin Auth ----------
function requireAdmin(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    return res
      .status(503)
      .send("Admin access is not configured. Set ADMIN_USER and ADMIN_PASSWORD.");
  }
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
    if (user === ADMIN_USER && pass === ADMIN_PASSWORD) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Arham Admin"');
  return res.status(401).send("Authentication required.");
}

// ---------- Admin: list submissions ----------
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, name, empid, company, mobile, email, product, file_name
       FROM submissions ORDER BY created_at DESC`
    );

    const tableRows = rows
      .map(
        (r) => `
      <tr>
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.empid)}</td>
        <td>${escapeHtml(r.company)}</td>
        <td>${escapeHtml(r.mobile)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td>${escapeHtml(r.product)}</td>
        <td><a href="/admin/file/${r.id}" target="_blank">${escapeHtml(r.file_name)}</a></td>
      </tr>`
      )
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Arham — Submissions</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;margin:0;padding:32px;background:#EDF1EF;color:#1A2B2A;}
        .head-row{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;}
        h1{font-size:20px;margin-bottom:4px;}
        p.count{color:#5B6C6A;font-size:13px;margin-top:0;}
        .export-btn{
          display:inline-flex;align-items:center;gap:8px;
          background:#0F2438;color:#fff;text-decoration:none;
          font-size:13.5px;font-weight:600;
          padding:10px 18px;border-radius:8px;
          transition:background 0.2s ease;
        }
        .export-btn:hover{background:#173049;}
        table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);}
        th,td{padding:10px 12px;text-align:left;font-size:13.5px;border-bottom:1px solid #E5E9E6;}
        th{background:#0F2438;color:#fff;font-weight:600;position:sticky;top:0;}
        tr:hover td{background:#FBF6EC;}
        a{color:#1B4D4A;font-weight:600;}
      </style></head>
      <body>
        <div class="head-row">
          <div>
            <h1>Arham — Submissions</h1>
            <p class="count">${rows.length} submission${rows.length === 1 ? "" : "s"}</p>
          </div>
          <a class="export-btn" href="/admin/export.csv" download>⬇ Export to Excel (CSV)</a>
        </div>
        <table>
          <thead><tr>
            <th>Date</th><th>Name</th><th>Emp id</th><th>Company</th>
            <th>Mobile</th><th>Email</th><th>Product</th><th>Policy PDF</th>
          </tr></thead>
          <tbody>${tableRows || `<tr><td colspan="8">No submissions yet.</td></tr>`}</tbody>
        </table>
      </body></html>
    `);
  } catch (err) {
    console.error("Admin list error:", err);
    res.status(500).send("Could not load submissions.");
  }
});

// ---------- Admin: download a PDF ----------
app.get("/admin/file/:id", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT file_name, file_mime, file_data FROM submissions WHERE id = $1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).send("File not found.");
    const file = rows[0];
    res.set("Content-Type", file.file_mime);
    res.set("Content-Disposition", `inline; filename="${file.file_name}"`);
    res.send(file.file_data);
  } catch (err) {
    console.error("Admin file error:", err);
    res.status(500).send("Could not load file.");
  }
});

// ---------- Admin: export CSV ----------
app.get("/admin/export.csv", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, name, empid, company, mobile, email, product, file_name
       FROM submissions ORDER BY created_at DESC`
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const headers = [
      "Date", "Name", "Emp ID", "Company", "Mobile", "Email", "Product", "Policy PDF Filename", "Policy PDF Link"
    ];
    
    const csvRows = rows.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.name,
      r.empid, 
      r.company,
      r.mobile,
      r.email,
      r.product,
      r.file_name,
      `${baseUrl}/admin/file/${r.id}`
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="arham-submissions-${Date.now()}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).send("Could not export submissions.");
  }
});

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Ensure the server only calls .listen() if NOT deployed on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Arham form server running on port ${PORT}`);
  });
}

// Required by Vercel to route requests dynamically
module.exports = app;