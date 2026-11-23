require("dotenv").config();
const express = require("express");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
// Render terminates HTTPS at its proxy; trust that proxy so secure admin cookies work.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 14) {
  throw new Error("Set ADMIN_PASSWORD in .env to a unique password of at least 14 characters.");
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("Set SESSION_SECRET in .env to a random string of at least 32 characters.");
}

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    page_url TEXT NOT NULL,
    user_agent TEXT,
    consent TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    qr_filename TEXT
  )
`);

app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));
app.use(session({
  name: "visitor_admin_session",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

const visitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8 });

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Admin giriş tələb olunur." });
}

function validVisitId(id) {
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
}

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/visit", visitLimiter, (req, res) => {
  const { id, pageUrl, consent, latitude, longitude, accuracy } = req.body || {};
  if (!validVisitId(id)) return res.status(400).json({ error: "Yanlış ziyarət ID-si." });
  if (!["granted", "declined", "unavailable"].includes(consent)) {
    return res.status(400).json({ error: "Yanlış razılıq statusu." });
  }

  let safeUrl = "/";
  try {
    const parsed = new URL(String(pageUrl || "/"), "http://local.invalid");
    safeUrl = (parsed.pathname + parsed.search).slice(0, 1500);
  } catch (_) {}

  let lat = null, lon = null, acc = null;
  if (consent === "granted") {
    if (![latitude, longitude, accuracy].every(v => typeof v === "number" && Number.isFinite(v))) {
      return res.status(400).json({ error: "Konum məlumatları natamamdır." });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
      return res.status(400).json({ error: "Konum məlumatları etibarsızdır." });
    }
    lat = latitude; lon = longitude; acc = accuracy;
  }

  const ua = String(req.get("user-agent") || "").slice(0, 500);
  db.prepare(`
    INSERT INTO visits (id, created_at, page_url, user_agent, consent, latitude, longitude, accuracy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      page_url=excluded.page_url, user_agent=excluded.user_agent, consent=excluded.consent,
      latitude=excluded.latitude, longitude=excluded.longitude, accuracy=excluded.accuracy
  `).run(id, new Date().toISOString(), safeUrl, ua, consent, lat, lon, acc);

  res.json({ ok: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID() + ".jpg")
});
const qrUpload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Yalnız JPG, PNG və WEBP şəkilləri qəbul edilir."), allowed.includes(file.mimetype));
  }
});

app.post("/api/visit/:id/qr", visitLimiter, (req, res) => {
  if (!validVisitId(req.params.id)) return res.status(400).json({ error: "Yanlış ziyarət ID-si." });
  const existing = db.prepare("SELECT id FROM visits WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Ziyarət qeydi tapılmadı." });

  qrUpload.single("qr")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Şəkil yüklənmədi." });
    if (!req.file) return res.status(400).json({ error: "Şəkil seçilməyib." });
    const old = db.prepare("SELECT qr_filename FROM visits WHERE id = ?").get(req.params.id);
    if (old && old.qr_filename) {
      const oldPath = path.join(uploadDir, path.basename(old.qr_filename));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.prepare("UPDATE visits SET qr_filename = ? WHERE id = ?").run(req.file.filename, req.params.id);
    res.json({ ok: true });
  });
});

app.post("/admin/login", loginLimiter, (req, res) => {
  const supplied = String((req.body || {}).password || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_PASSWORD);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return res.status(401).json({ error: "Şifrə yanlışdır." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Sessiya yaradıla bilmədi." });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/admin/me", (req, res) => res.json({ authenticated: !!(req.session && req.session.isAdmin) }));

app.get("/admin/visits", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, created_at, page_url, user_agent, consent, latitude, longitude, accuracy, qr_filename
    FROM visits ORDER BY created_at DESC LIMIT 500
  `).all();
  res.json(rows);
});

app.get("/admin/qr/:filename", requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) return res.sendStatus(400);
  const file = path.join(uploadDir, filename);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.sendFile(file);
});

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
