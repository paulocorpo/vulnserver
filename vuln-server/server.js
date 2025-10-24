// server-vulnerable-pg.js
// Serveur Express volontairement vulnérable (Postgres) — USAGE ÉDUCATIF UNIQUEMENT
// WARNING: credentials hardcoded ON PURPOSE for the lab. NEVER do this in production.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');
const url = require('url');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// === Insecure: permissive CORS (dangerous) ===
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // tout le monde peut appeler l'API
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  next();
});

// === POSTGRES (credentials hardcoded on purpose) ===
const PG_CONFIG = {
  host: 'db',                // ou 'localhost' si tu lances local sans compose
  port: 5432,
  user: 'pguser',            // hardcoded user
  password: 'pgpassword',    // hardcoded password
  database: 'vuln',          // hardcoded database
  max: 10,
};

const pool = new Pool(PG_CONFIG);

// Helper: basic retry to wait for postgres ready (simple)
async function waitForPostgres(retries = 20, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('[pg] Postgres prêt.');
      return;
    } catch (err) {
      console.log(`[pg] Postgres non prêt (essai ${i + 1}/${retries}) : ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Impossible de se connecter à Postgres.');
}

// Create schema (destructive-ish: CREATE TABLE IF NOT EXISTS + seed)
async function initDb() {
  await waitForPostgres();
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      password TEXT,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;
  const createMessages = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      author TEXT,
      content TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;
  const seedAdmin = `
    INSERT INTO users (name, password, role)
    VALUES ('admin', 'admin123', 'admin')
    ON CONFLICT DO NOTHING;
  `;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(createUsers);
    await client.query(createMessages);
    // naive seed (may insert duplicates in older PG versions without unique constraint)
    await client.query(seedAdmin);
    await client.query('COMMIT');
    console.log('[pg] Schéma initialisé et admin seed appliqué.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[pg] Erreur init DB:', e.message);
  } finally {
    client.release();
  }
}

// === Uploads (no validation) ===
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// === Basic endpoints ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/hello', (req, res) => {
  res.send('Hello World!');
});

// === Insecure file download (path traversal possible) ===
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename || '';
  const filePath = path.normalize(path.join(uploadDir, filename));
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('Fichier non trouvé');
    }
  });
});

// === SQLi vulnerable endpoint (GET) - concatenation dangereuse ===
app.get('/user', async (req, res) => {
  const userName = req.query.name || '';
  const query = `SELECT * FROM users WHERE name = $1`; // vulnérable SQLi
  try {
    const { rows } = await pool.query(query);
    if (rows.length > 0) return res.send(`Utilisateur trouvé : ${JSON.stringify(rows)}`);
    res.send('Utilisateur non trouvé');
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).send('Erreur DB');
  }
});

// === SQLi vulnerable endpoint (POST insert) ===
app.post('/data', async (req, res) => {
  const { name, age } = req.body;
  const query = `INSERT INTO users (name, password, role) VALUES ('${name}', 'pass123', 'user')`; // vulnérable
  try {
    await pool.query(query);
    res.send(`Bonjour ${name}, vous avez ${age} ans.`);
  } catch (err) {
    console.error('DB error insert:', err.message);
    res.status(500).send('Erreur DB');
  }
});

// === Stored XSS example (messages) ===
app.post('/message', async (req, res) => {
  const author = req.body.author || 'anonymous';
  const content = req.body.content || '';
  const query = `INSERT INTO messages (author, content) VALUES ('${author}', '${content}')`; // vulnérable XSS
  try {
    await pool.query(query);
    res.send('Message publié (vulnérable).');
  } catch (err) {
    console.error('DB error message:', err.message);
    res.status(500).send('Erreur DB');
  }
});

app.get('/messages', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM messages ORDER BY id DESC LIMIT 20');
    // returns raw content (could contain <script> tags)
    res.send(`<html><body><h1>Messages</h1>${rows.map(r => `<div><strong>${r.author}</strong>: ${r.content}</div>`).join('')}</body></html>`);
  } catch (err) {
    console.error('DB error messages:', err.message);
    res.status(500).send('Erreur DB');
  }
});

// === Insecure file upload (no checks) ===
app.post('/upload', upload.single('file'), (req, res) => {
  res.send(`Fichier reçu: ${req.file.filename}`);
});

// === Command injection / remote exec (dangerous) ===
app.get('/exec', (req, res) => {
  const cmd = req.query.cmd || 'echo no-cmd';
  exec(cmd, { timeout: 2000 }, (error, stdout, stderr) => {
    if (error) return res.status(500).send(`Erreur exec: ${error.message}`);
    res.send(`OUTPUT:\n${stdout}\nERR:\n${stderr}`);
  });
});

// === Insecure eval / insecure deserialization ===
app.post('/deserialize', (req, res) => {
  const payload = req.body.code || '';
  try {
    const result = eval(payload); // intentionally insecure
    res.send(`Résultat eval: ${String(result)}`);
  } catch (e) {
    res.status(400).send(`Erreur eval: ${e.message}`);
  }
});

// === SSRF naive fetch to user-provided URL ===
app.get('/fetch', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url parameter');
  try {
    const parsed = url.parse(target);
    const opts = { hostname: parsed.hostname, path: parsed.path, port: parsed.port || 443, method: 'GET' };
    const reqs = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => res.send(`Fetched ${target}: ${data.slice(0, 1000)}`));
    });
    reqs.on('error', (err) => res.status(500).send(`Fetch error: ${err.message}`));
    reqs.end();
  } catch (e) {
    res.status(500).send(`Bad url: ${e.message}`);
  }
});

// === Insecure auth: plaintext passwords, weak JWT (hardcoded secret) ===
const JWT_SECRET = 'hardcoded-secret-please-change'; // intentionally weak

app.post('/login', async (req, res) => {
  const { name, password } = req.body;
  const query = `SELECT * FROM users WHERE name = '${name}' AND password = '${password}'`; // vulnérable
  try {
    const { rows } = await pool.query(query);
    const row = rows[0];
    if (!row) return res.status(401).send('Invalid credentials');
    const token = jwt.sign({ id: row.id, name: row.name, role: row.role }, JWT_SECRET); // no expiry
    res.cookie('session', token, { httpOnly: false, secure: false }); // insecure cookie
    res.send(`Bienvenue ${row.name}`);
  } catch (err) {
    console.error('DB login error:', err.message);
    res.status(500).send('Erreur DB');
  }
});

// === Admin endpoint with weak check ===
app.get('/admin', (req, res) => {
  const token = req.cookies.session;
  try {
    const payload = jwt.verify(token || '', JWT_SECRET);
    if (payload && payload.role === 'admin') {
      res.send('Bienvenue admin (accès lointain).');
    } else {
      res.status(403).send('Accès refusé');
    }
  } catch (e) {
    res.status(401).send('Token invalide');
  }
});

// === Endpoint that exposes internal environment (secrets leak) ===
app.get('/env', (req, res) => {
  res.json(process.env); // intentional leak
});

// === Danger: reading arbitrary file path (path traversal) ===
app.get('/readfile', (req, res) => {
  const name = req.query.name || 'README.md';
  const filePath = path.normalize(path.join(__dirname, name)); // no restriction -> traversal
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(404).send('Fichier introuvable');
    res.send(`<pre>${data}</pre>`);
  });
});

// === Unsafe template rendering (XSS demo) ===
app.get('/template', (req, res) => {
  const user = req.query.user || '<b>guest</b>';
  const html = `<!doctype html><html><body><h1>Bonjour ${user}</h1></body></html>`;
  res.send(html);
});

// === Unsafe use of child_process to run system commands with user input (again) ===
app.post('/ping', (req, res) => {
  const host = req.body.host || '127.0.0.1';
  exec(`ping -c 1 ${host}`, (err, stdout, stderr) => {
    if (err) return res.status(500).send('Erreur ping');
    res.send(`<pre>${stdout}</pre>`);
  });
});

// === Simple info endpoint ===
app.get('/info', (req, res) => {
  res.json({
    app: 'vuln Server (Postgres) - vulnerable lab',
    version: '0.2-vuln-pg',
    warnings: 'This app intentionally insecure - run in isolated environment only',
    pg: PG_CONFIG,
  });
});

// Start server after DB init
(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Serveur vulnérable en écoute sur le port ${PORT}`);
      console.log('!!! Rappel : usage pédagogique uniquement, isolation requise !!!');
    });
  } catch (e) {
    console.error('Impossible d\'initialiser la DB :', e.message);
    process.exit(1);
  }
})();