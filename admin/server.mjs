// Server panel admin Katering PENS. Hanya pakai modul bawaan Node (versi 20 ke atas), tanpa npm install.
//
// Dua mode penyimpanan:
// - Lokal (GITHUB_TOKEN tidak diisi): baca/tulis langsung public/data.json dan public/img/ di laptop.
// - GitHub (GITHUB_TOKEN + GITHUB_REPO diisi, dipakai di Render): setiap simpan menjadi commit ke repo,
//   lalu Render men-deploy ulang situs publik. Disk Render gratis terhapus tiap restart, jadi data tidak disimpan di server.
//
// Variabel lingkungan:
//   ADMIN_USERS     daftar akun "nama:katasandi,nama2:katasandi2" (wajib di mode GitHub; lokal default admin:admin)
//   SESSION_SECRET  kunci acak untuk menandatangani cookie login (kalau kosong, login hilang tiap restart)
//   GITHUB_TOKEN    fine-grained token dengan izin Contents: Read and write, khusus repo situs ini
//   GITHUB_REPO     contoh: budi/katering-pens
//   GITHUB_BRANCH   default: main
//   SITE_URL        alamat situs publik, untuk tautan "Lihat situs" (opsional)
//   PORT            diisi otomatis oleh Render; lokal default 3000
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { validate } from '../check-data.mjs';

const ROOT = new URL('../', import.meta.url);
const env = process.env;
const GH = env.GITHUB_TOKEN ? { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main' } : null;
if (GH && !/^[\w.-]+\/[\w.-]+$/.test(GH.repo || '')) { console.error('GITHUB_REPO harus diisi, contoh: budi/katering-pens'); process.exit(1); }
if (GH && !env.ADMIN_USERS) { console.error('ADMIN_USERS wajib diisi, contoh: budi:katasandi1,sari:katasandi2'); process.exit(1); }

const USERS = new Map((env.ADMIN_USERS || 'admin:admin').split(',').map(s => {
  const i = s.indexOf(':'); return [s.slice(0, i).trim().toLowerCase(), s.slice(i + 1)];
}).filter(([u, p]) => u && p));
if (!env.ADMIN_USERS) console.warn('ADMIN_USERS kosong: memakai akun lokal admin / admin. Jangan dipakai di internet.');
const SECRET = env.SESSION_SECRET || randomBytes(32).toString('hex');
const DAY = 864e5, SESSION_DAYS = 7;

// ---------- Penyimpanan ----------
const sha1 = buf => createHash('sha1').update(buf).digest('hex');
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${GH.repo}/contents/${path}${opts.method ? '' : `?ref=${GH.branch}`}`, {
    ...opts,
    headers: { Authorization: `Bearer ${GH.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'katering-pens-admin', Accept: opts.accept || 'application/vnd.github+json', ...(opts.body && { 'Content-Type': 'application/json' }) },
  });
  if (r.status === 409 || r.status === 422) throw Object.assign(new Error('conflict'), { status: 409 });
  if (r.status === 404) throw Object.assign(new Error('not found'), { status: 404 });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
const store = GH ? {
  async readData() { const j = await (await gh('public/data.json')).json(); return { text: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha }; },
  async writeData(text, sha, who) {
    const j = await (await gh('public/data.json', { method: 'PUT', body: JSON.stringify({ message: `Ubah data lewat panel admin (${who})`, content: Buffer.from(text).toString('base64'), sha, branch: GH.branch }) })).json();
    return j.content.sha;
  },
  async writeImage(name, buf, who) {
    await gh(`public/img/${name}`, { method: 'PUT', body: JSON.stringify({ message: `Unggah foto ${name} (${who})`, content: buf.toString('base64'), branch: GH.branch }) });
  },
  async readImage(name) { return Buffer.from(await (await gh(`public/img/${name}`, { accept: 'application/vnd.github.raw' })).arrayBuffer()); },
} : {
  async readData() { const text = await readFile(new URL('public/data.json', ROOT), 'utf8'); return { text, sha: sha1(text) }; },
  async writeData(text, sha) {
    // ponytail: cek-lalu-tulis tanpa kunci; cukup untuk satu orang yang mencoba di laptop.
    if (sha1(await readFile(new URL('public/data.json', ROOT), 'utf8')) !== sha) throw Object.assign(new Error('conflict'), { status: 409 });
    await writeFile(new URL('public/data.json', ROOT), text); return sha1(text);
  },
  async writeImage(name, buf) { await writeFile(new URL(`public/img/${name}`, ROOT), buf); },
  async readImage(name) { return readFile(new URL(`public/img/${name}`, ROOT)); },
};

// ---------- Sesi login (cookie bertanda tangan, tanpa database) ----------
const sign = v => createHmac('sha256', SECRET).update(v).digest('base64url');
const makeToken = user => { const v = `${Buffer.from(user).toString('base64url')}.${Date.now() + SESSION_DAYS * DAY}`; return `${v}.${sign(v)}`; };
function readToken(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [u, exp, sig] = m[1].split('.'); if (!sig) return null;
  const good = Buffer.from(sign(`${u}.${exp}`)), got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got) || +exp < Date.now()) return null;
  const user = Buffer.from(u, 'base64url').toString();
  return USERS.has(user) ? user : null;
}
const same = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const isHttps = req => req.headers['x-forwarded-proto'] === 'https';
const cookie = (req, val, maxAge) => `sid=${val}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

// ponytail: pembatas percobaan login di memori; hilang saat restart, cukup untuk menahan tebak-tebakan kata sandi.
const fails = new Map();
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function tooMany(ip) { const f = fails.get(ip); return f && f.n >= 8 && Date.now() - f.t < 15 * 60e3; }
function failed(ip) { const f = fails.get(ip); fails.set(ip, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); }

// ---------- HTTP ----------
const send = (res, code, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};
async function body(req, limit) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}
const IMG_TYPES = [['jpg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff], ['png', b => b.readUInt32BE(0) === 0x89504e47], ['webp', b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP']];
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';

async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname, ip = ipOf(req);

  if (req.method === 'GET' && p === '/') {
    return send(res, 200, await readFile(new URL('admin/admin.html', ROOT)), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
  }
  if (req.method === 'GET' && p === '/healthz') return send(res, 200, 'ok');

  // Semua API yang mengubah data hanya menerima JSON dari halaman ini sendiri (ditambah cookie SameSite=Strict).
  if (req.method !== 'GET' && !String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'Format permintaan tidak didukung.' });

  if (req.method === 'POST' && p === '/api/login') {
    if (tooMany(ip)) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    const { user = '', pass = '' } = await body(req, 4096);
    const u = String(user).trim().toLowerCase(), real = USERS.get(u);
    if (!real || !same(String(pass), real)) { failed(ip); return send(res, 401, { error: 'Username atau kata sandi salah.' }); }
    fails.delete(ip);
    return send(res, 200, { user: u }, { 'Set-Cookie': cookie(req, makeToken(u), SESSION_DAYS * 86400) });
  }
  if (req.method === 'POST' && p === '/api/logout') return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });

  const user = readToken(req);
  if (!user) return send(res, 401, { error: 'Sesi berakhir. Silakan masuk lagi.' });

  if (req.method === 'GET' && p === '/api/me') return send(res, 200, { user, mode: GH ? 'github' : 'lokal', site: env.SITE_URL || '' });

  if (req.method === 'GET' && p === '/api/data') {
    const { text, sha } = await store.readData();
    return send(res, 200, { data: JSON.parse(text), sha });
  }

  if (req.method === 'PUT' && p === '/api/data') {
    const { data, sha } = await body(req, 1e6);
    const errors = validate(data);
    if (errors.length) return send(res, 400, { error: 'Ada isian yang belum benar.', errors });
    try { return send(res, 200, { sha: await store.writeData(JSON.stringify(data, null, 2) + '\n', sha, user) }); }
    catch (e) { if (e.status === 409) return send(res, 409, { error: 'Data baru saja diubah orang lain. Muat ulang halaman, lalu ulangi perubahanmu.' }); throw e; }
  }

  if (req.method === 'POST' && p === '/api/upload') {
    const { name = '', base64 = '' } = await body(req, 3.5e6);
    const buf = Buffer.from(String(base64), 'base64');
    if (buf.length > 2 * 1024 * 1024) return send(res, 413, { error: 'Ukuran foto maksimal 2 MB.' });
    const type = buf.length > 12 && IMG_TYPES.find(([, ok]) => ok(buf));
    if (!type) return send(res, 400, { error: 'Foto harus berformat JPG, PNG, atau WEBP.' });
    const file = `${slug(name.replace(/\.[^.]+$/, ''))}-${randomBytes(3).toString('hex')}.${type[0]}`;
    await store.writeImage(file, buf, user);
    return send(res, 200, { path: `img/${file}` });
  }

  // Pratinjau foto di panel (di mode GitHub, foto baru belum ada di situs publik sampai deploy selesai).
  const img = /^\/img\/([a-z0-9-]+\.(jpg|jpeg|png|webp))$/.exec(p);
  if (req.method === 'GET' && img) {
    try { return send(res, 200, await store.readImage(img[1]), { 'Content-Type': MIME[img[2]], 'Cache-Control': 'private, max-age=3600' }); }
    catch (e) { if (e.status === 404 || e.code === 'ENOENT') return send(res, 404, 'Tidak ditemukan'); throw e; }
  }
  return send(res, 404, { error: 'Tidak ditemukan.' });
}

http.createServer((req, res) => handle(req, res).catch(e => {
  if (!e.status) console.error(e);
  if (!res.headersSent) send(res, e.status || 500, { error: e.status === 413 ? 'Data terlalu besar.' : e.status === 400 ? 'Permintaan tidak valid.' : 'Terjadi kesalahan di server. Coba lagi.' });
})).listen(+env.PORT || 3000, () => console.log(`Panel admin jalan di http://localhost:${+env.PORT || 3000} (mode ${GH ? 'GitHub: ' + GH.repo : 'lokal'})`));
