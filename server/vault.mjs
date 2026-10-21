// HubFace personal vault (vault-20261018-v2, Dan approved). Owner-only storage for photos, videos, audio, documents and links.
//   Files:    $HUBFACE_VAULT (default /var/lib/hubface/vault)/<user_id>/<kind>/<random>.<ext>  (dirs 700, files 600, owner = service user)
//             in-progress uploads: <root>/<user_id>/.uploads/<upload_id>.part. Never served by nginx or any static path.
//   Metadata: tables vault_items, vault_uploads, vault_tokens in the accounts SQLite ($HUBFACE_DB).
//   Auth:     hf_session cookie (normal use; writes need Origin/Referer https://hubface.org), or
//             Authorization: Bearer hfvi_... import token (upload-only, 24 h, stored hashed) from the export bookmarklet.
//   Session-only:  GET /api/vault, GET /api/vault/file/:id, GET /api/vault/thumb/:id, DELETE /api/vault/:id, POST /api/vault/import-token
//   Session or import token (CORS for http://127.0.0.1:3456 + http://localhost:3456, no cookies cross-origin):
//     POST /api/vault/upload/init        JSON {filename, mime, bytes, title?, tags?, thumb?, source?, source_id?, added_at?}
//                                        -> {duplicate,item_id} | {upload_id, received, chunk_size}   (resumable by source+source_id)
//     PUT  /api/vault/upload/:id?offset=N  raw bytes (<= 16 MB per request; replays are idempotent; wrong offset -> 409 {received})
//     POST /api/vault/upload/:id/complete  JSON {sha256} -> sha256 verified server-side, item created (repeat-safe)
//     POST /api/vault/link               JSON {url, title?, tags?, source?, source_id?, added_at?}
//   Pet documents (petdocs-20261018-v1, session only): metadata recorded with a vault item for a Pet Vault pet (the file itself stays a normal vault item)
//     GET    /api/vault/petdocs?pet_id=X     -> {docs:[...]}  (joined with the vault item: filename, mime, bytes, kind)
//     POST   /api/vault/petdocs              JSON {pet_id, pet_name?, item_id, title, doc_type, event_name?, doc_date?, source:'upload'|'vault'}
//     DELETE /api/vault/petdocs/:id          unlink one record (the vault file is kept; delete files in /vault/)
//     DELETE /api/vault/petdocs?pet_id=X     unlink every record of a deleted pet
//   Static (new files only): /vault/ (vault.html), /vault/vault.js, /vault-export.js from ./vault-public
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export const VAULT_BUILD = 'vault-20261019-dragout-a';   // dragout-20261019a: short-lived HMAC signed download URLs for OS drag-out
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ROOT = process.env.HUBFACE_VAULT || '/var/lib/hubface/vault';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const PUB = process.env.HUBFACE_VAULT_PUBLIC || path.join(path.dirname(fileURLToPath(import.meta.url)), 'vault-public');
const COOKIE = 'hf_session';
/* dragout-20261019a: short-lived signed download links (Explorer DownloadURL has no session cookie). */
const DL_SECRET_PATH = process.env.HUBFACE_VAULT_DL_HMAC_FILE || '/etc/hubface/vault-dl.hmac';
const DL_TTL_SEC = 600;   // 10 minutes
let DL_SECRET = null;
function dlSecret() {
  if (DL_SECRET) return DL_SECRET;
  try {
    const raw = fs.readFileSync(DL_SECRET_PATH, 'utf8').trim();
    if (raw.length < 32) throw new Error('short');
    DL_SECRET = Buffer.from(raw);
  } catch (e) {
    console.warn('[vault] dragout: signed downloads unavailable (' + DL_SECRET_PATH + ')');
    DL_SECRET = Buffer.alloc(0);
  }
  return DL_SECRET;
}
function dlSig(uid, id, exp) {
  const s = dlSecret(); if (!s.length) return '';
  return crypto.createHmac('sha256', s).update(String(uid) + ':' + String(id) + ':' + String(exp)).digest('base64url');
}
function dlMake(uid, id) {
  const s = dlSecret(); if (!s.length) return null;
  const exp = Math.floor(Date.now() / 1000) + DL_TTL_SEC;
  const sig = dlSig(uid, id, exp);
  return { exp, sig, path: `/api/vault/file/${id}?u=${uid}&e=${exp}&s=${sig}&download=1` };
}
function dlCheck(q, id) {
  const u = new URL(q.url || '', 'http://x');
  const uid = u.searchParams.get('u');
  const exp = u.searchParams.get('e');
  const sig = u.searchParams.get('s');
  if (!uid || !exp || !sig) return null;
  if (!/^\d{1,12}$/.test(uid) || !/^\d{9,12}$/.test(exp) || !/^[A-Za-z0-9_-]{20,64}$/.test(sig)) return null;
  if (+exp < Math.floor(Date.now() / 1000)) return null;
  const want = dlSig(uid, id, exp);
  if (!want) return null;
  const a = Buffer.from(want), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { uid: +uid };
}

const CORS_ORIGINS = new Set((process.env.HUBFACE_VAULT_CORS || 'http://127.0.0.1:3456,http://localhost:3456').split(',').map((s) => s.trim()).filter(Boolean));
export const MAX_FILE = 2 * 1024 ** 3;          // 2 GB per file
export const QUOTA = 20 * 1024 ** 3;            // 20 GB per user
const CHUNK = 8 * 1024 * 1024;                  // suggested chunk (Cloudflare caps a request at 100 MB; nginx allows 64m on /api/vault/)
const CHUNK_MAX = 16 * 1024 * 1024;
const TOKEN_TTL = 24 * 3600e3;
const UPLOAD_TTL = 7 * 24 * 3600e3;
const MIME = {
  'image/jpeg': ['photo', 'jpg'], 'image/png': ['photo', 'png'], 'image/webp': ['photo', 'webp'], 'image/gif': ['photo', 'gif'], 'image/heic': ['photo', 'heic'], 'image/heif': ['photo', 'heif'], 'image/avif': ['photo', 'avif'], 'image/bmp': ['photo', 'bmp'],
  'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'], 'video/quicktime': ['video', 'mov'], 'video/x-m4v': ['video', 'm4v'], 'video/x-matroska': ['video', 'mkv'], 'video/ogg': ['video', 'ogv'], 'video/x-msvideo': ['video', 'avi'],
  'audio/mpeg': ['audio', 'mp3'], 'audio/mp4': ['audio', 'm4a'], 'audio/x-m4a': ['audio', 'm4a'], 'audio/aac': ['audio', 'aac'], 'audio/wav': ['audio', 'wav'], 'audio/x-wav': ['audio', 'wav'], 'audio/wave': ['audio', 'wav'],
  'audio/ogg': ['audio', 'ogg'], 'audio/flac': ['audio', 'flac'], 'audio/x-flac': ['audio', 'flac'], 'audio/opus': ['audio', 'opus'], 'audio/webm': ['audio', 'weba'],
  'application/pdf': ['doc', 'pdf'], 'text/plain': ['doc', 'txt'], 'text/markdown': ['doc', 'md'], 'text/csv': ['doc', 'csv'], 'application/json': ['doc', 'json'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['doc', 'docx'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['doc', 'xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['doc', 'pptx'], 'application/msword': ['doc', 'doc'], 'application/vnd.ms-excel': ['doc', 'xls'], 'application/vnd.ms-powerpoint': ['doc', 'ppt'], 'application/rtf': ['doc', 'rtf'],
};
const KINDS = ['photo', 'video', 'audio', 'doc'];

const oldMask = process.umask(0o077);
fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const db = new Database(DB_PATH);
process.umask(oldMask);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
CREATE TABLE IF NOT EXISTS vault_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video','audio','doc','link')),
  filename TEXT,                    -- original file name (links: NULL)
  stored TEXT,                      -- random name on disk inside <root>/<user_id>/<kind>/
  mime TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  url TEXT,                         -- links only
  title TEXT,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  thumb TEXT,                       -- small data:image thumbnail kept from the source, if any
  source TEXT NOT NULL DEFAULT 'upload',
  source_id TEXT,
  added_at TEXT,                    -- original date added at the source
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vault_items_user ON vault_items(user_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS vault_items_sha ON vault_items(user_id, sha256) WHERE sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vault_items_src ON vault_items(user_id, source, source_id) WHERE source_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS vault_uploads (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, filename TEXT, mime TEXT NOT NULL, bytes INTEGER NOT NULL, title TEXT, tags TEXT NOT NULL DEFAULT '[]', thumb TEXT,
  source TEXT NOT NULL DEFAULT 'upload', source_id TEXT, added_at TEXT, via TEXT, item_id INTEGER,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vault_uploads_user ON vault_uploads(user_id);
CREATE TABLE IF NOT EXISTS pet_docs (           -- petdocs-20261018-v1: Pet Vault document metadata, one row per (pet, vault item) link
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id TEXT NOT NULL,             -- the Pet Vault pet id (browser IndexedDB colvault.pets)
  pet_name TEXT,
  item_id INTEGER NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  event_name TEXT,
  doc_date TEXT,                    -- YYYY-MM-DD or NULL
  source TEXT NOT NULL DEFAULT 'upload',   -- 'upload' (sent from the form) | 'vault' (existing vault item linked)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pet_docs_user_pet ON pet_docs(user_id, pet_id);
CREATE TABLE IF NOT EXISTS vault_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'import',
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
`);
const Q = {
  session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  token: db.prepare("SELECT user_id, expires_at FROM vault_tokens WHERE token_hash = ? AND scope = 'import'"),
  insToken: db.prepare('INSERT INTO vault_tokens (token_hash, user_id, scope, created_at, expires_at) VALUES (?,?,?,?,?)'),
  user: db.prepare('SELECT id, email, username, real_name FROM users WHERE id = ?'),
  list: db.prepare('SELECT id, kind, filename, mime, bytes, sha256, url, title, tags, source, source_id, added_at, created_at, thumb IS NOT NULL AS has_thumb FROM vault_items WHERE user_id = ? ORDER BY id DESC'),
  counts: db.prepare('SELECT kind, COUNT(*) n, COALESCE(SUM(bytes),0) bytes FROM vault_items WHERE user_id = ? GROUP BY kind'),
  used: db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM vault_items WHERE user_id = ?'),
  pending: db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM vault_uploads WHERE user_id = ? AND item_id IS NULL AND expires_at > ? AND id <> ?'),
  item: db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?'),
  bySrc: db.prepare('SELECT id FROM vault_items WHERE user_id = ? AND source = ? AND source_id = ?'),
  bySha: db.prepare('SELECT id FROM vault_items WHERE user_id = ? AND sha256 = ?'),
  byUrl: db.prepare("SELECT id FROM vault_items WHERE user_id = ? AND kind = 'link' AND url = ?"),
  ins: db.prepare(`INSERT INTO vault_items (user_id, kind, filename, stored, mime, bytes, sha256, url, title, tags, thumb, source, source_id, added_at, created_at)
                   VALUES (@user_id, @kind, @filename, @stored, @mime, @bytes, @sha256, @url, @title, @tags, @thumb, @source, @source_id, @added_at, @created_at)`),
  del: db.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?'),
  up: db.prepare('SELECT * FROM vault_uploads WHERE id = ? AND user_id = ?'),
  upBySrc: db.prepare('SELECT * FROM vault_uploads WHERE user_id = ? AND source = ? AND source_id = ? AND item_id IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1'),
  insUp: db.prepare(`INSERT INTO vault_uploads (id, user_id, kind, filename, mime, bytes, title, tags, thumb, source, source_id, added_at, via, created_at, expires_at)
                     VALUES (@id, @user_id, @kind, @filename, @mime, @bytes, @title, @tags, @thumb, @source, @source_id, @added_at, @via, @created_at, @expires_at)`),
  doneUp: db.prepare('UPDATE vault_uploads SET item_id = ? WHERE id = ?'),
  delUp: db.prepare('DELETE FROM vault_uploads WHERE id = ?'),
  stale: db.prepare('SELECT id, user_id FROM vault_uploads WHERE expires_at < ?'),
  staleTok: db.prepare('DELETE FROM vault_tokens WHERE expires_at < ?'),
  pdList: db.prepare(`SELECT d.id, d.pet_id, d.pet_name, d.item_id, d.title, d.doc_type, d.event_name, d.doc_date, d.source, d.created_at,
                             v.kind, v.filename, v.mime, v.bytes, v.thumb IS NOT NULL AS has_thumb
                      FROM pet_docs d JOIN vault_items v ON v.id = d.item_id AND v.user_id = d.user_id WHERE d.user_id = ? AND d.pet_id = ? ORDER BY d.id DESC`),
  pdIns: db.prepare(`INSERT INTO pet_docs (user_id, pet_id, pet_name, item_id, title, doc_type, event_name, doc_date, source, created_at)
                     VALUES (@user_id, @pet_id, @pet_name, @item_id, @title, @doc_type, @event_name, @doc_date, @source, @created_at)`),
  pdDel: db.prepare('DELETE FROM pet_docs WHERE id = ? AND user_id = ?'),
  pdDelPet: db.prepare('DELETE FROM pet_docs WHERE user_id = ? AND pet_id = ?'),
};
const PET_DOC_TYPES = ['Medical Records', 'Vaccination Certificates', 'Breeding Certificates', 'Ownership Transfer Documents', 'Prescriptions & Medications', 'Lab Results / Diagnostics',
  'Surgery & Procedure Reports', 'Allergies & Conditions', 'Insurance Claims & Policies', 'Vet Visit Summaries / SOAP Notes', 'General / Other'];
const petId = (v) => { const s = txt(v, 80); return /^[\w.:-]{1,80}$/.test(s) ? s : ''; };
const pdPub = (x) => ({ id: x.id, pet_id: x.pet_id, pet_name: x.pet_name, item_id: x.item_id, title: x.title, doc_type: x.doc_type, event_name: x.event_name, doc_date: x.doc_date, source: x.source,
  created_at: x.created_at, kind: x.kind, filename: x.filename, mime: x.mime, bytes: x.bytes, file: `/api/vault/file/${x.item_id}`, thumb: x.has_thumb ? `/api/vault/thumb/${x.item_id}` : null });
async function petDocs(q, r, uid, u) {
  if (q.method === 'GET') { const pid = petId(u.searchParams.get('pet_id')); if (!pid) return json(r, 400, { error: 'pet_id required' }); return json(r, 200, { docs: Q.pdList.all(uid, pid).map(pdPub) }); }
  if (q.method === 'DELETE') { drain(q); const pid = petId(u.searchParams.get('pet_id')); if (!pid) return json(r, 400, { error: 'pet_id required' }); return json(r, 200, { ok: true, removed: Q.pdDelPet.run(uid, pid).changes }); }
  if (q.method !== 'POST') { drain(q); return json(r, 405, { error: 'method not allowed' }); }
  if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { drain(q); return json(r, 415, { error: 'JSON required.' }); }
  const b = await readJson(q, 16 * 1024);
  const pid = petId(b.pet_id); if (!pid) return json(r, 400, { error: 'pet_id required' });
  const it = Q.item.get(Number(b.item_id), uid); if (!it || it.kind === 'link') return json(r, 404, { error: 'Vault item not found.' });
  const doc_type = PET_DOC_TYPES.includes(b.doc_type) ? b.doc_type : 'General / Other';
  const d = txt(b.doc_date, 10); const doc_date = /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d)) ? d : null;
  const row = { user_id: uid, pet_id: pid, pet_name: txt(b.pet_name, 60) || null, item_id: it.id, title: txt(b.title, 200) || it.title || it.filename || 'Untitled', doc_type,
    event_name: txt(b.event_name, 200) || null, doc_date, source: b.source === 'vault' ? 'vault' : 'upload', created_at: now() };
  const id = Q.pdIns.run(row).lastInsertRowid;
  json(r, 201, { ok: true, doc: pdPub({ id, ...row, kind: it.kind, filename: it.filename, mime: it.mime, bytes: it.bytes, has_thumb: !!it.thumb }) });
}

const err = (code, msg) => Object.assign(new Error(msg), { code });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();
const txt = (v, n) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const safeName = (v) => txt(v, 255).replace(/[\\/]/g, '_');
const mimeOf = (v) => String(v || '').toLowerCase().split(';')[0].trim();
const isoOrNull = (v) => { if (v == null || v === '') return null; const d = new Date(/^\d{9,14}$/.test(String(v)) ? Number(v) : String(v)); return isNaN(d) ? null : d.toISOString(); };
function tagsOf(v) {
  let a = v; if (typeof v === 'string') { try { a = JSON.parse(v); } catch { a = v.split(','); } }
  if (!Array.isArray(a)) return '[]';
  return JSON.stringify([...new Set(a.map((t) => txt(t, 40)).filter(Boolean))].slice(0, 30));
}
const thumbOf = (v) => (typeof v === 'string' && v.length <= 200000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null);
const srcOf = (v) => txt(v, 60).replace(/[^\w.:-]/g, '') || 'upload';
const pub = (x, uid) => {
  const o = { id: x.id, kind: x.kind, filename: x.filename, mime: x.mime, bytes: x.bytes, sha256: x.sha256, url: x.url, title: x.title, tags: JSON.parse(x.tags || '[]'),
    source: x.source, source_id: x.source_id, added_at: x.added_at, created_at: x.created_at,
    file: x.kind === 'link' ? null : `/api/vault/file/${x.id}`, thumb: (x.has_thumb ?? x.thumb) ? `/api/vault/thumb/${x.id}` : null, dl: null };
  if (o.file && uid != null) { const d = dlMake(uid, x.id); if (d) o.dl = d.path; }
  return o;
};

function cookie(q) { for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); } return ''; }
/* -> {uid, via:'session'|'token'} | {bad:true} (Authorization present but invalid) | null */
function auth(q) {
  const h = q.headers.authorization;
  if (h != null) {
    const m = /^Bearer (hfvi_[A-Za-z0-9_-]{40,64})$/.exec(String(h).trim()); if (!m) return { bad: true };
    const t = Q.token.get(sha(m[1])); if (!t || t.expires_at < now()) return { bad: true };
    return { uid: t.user_id, via: 'token' };
  }
  const tok = cookie(q); if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const s = Q.session.get(sha(tok)); if (!s || s.expires_at < now()) return null;
  return { uid: s.user_id, via: 'session' };
}
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const TOKEN_PATH = (p) => p === '/api/vault/upload/init' || p === '/api/vault/link' || /^\/api\/vault\/upload\/[a-f0-9]{32}(?:\/complete)?$/.test(p);
function json(r, code, o) { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); r.end(JSON.stringify(o)); }
function drain(q) { q.resume(); }
const readJson = (q, max = 256 * 1024) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > max) { rej(err(413, 'too large')); q.destroy(); } else ch.push(c); }); q.on('end', () => { try { res(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch { rej(err(400, 'bad json')); } }); q.on('error', rej); });

function mk(d) { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return d; }
const userDir = (uid, kind) => mk(path.join(ROOT, String(Number(uid)), kind));
const partPath = (uid, id) => path.join(mk(path.join(ROOT, String(Number(uid)), '.uploads')), `${id}.part`);
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
const hashFile = (f) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const locks = new Set();

function cleanup() {
  try {
    const t = now();
    for (const u of Q.stale.all(t)) { fs.rm(path.join(ROOT, String(u.user_id), '.uploads', `${u.id}.part`), { force: true }, () => {}); Q.delUp.run(u.id); }
    Q.staleTok.run(t);
  } catch (e) { console.warn('[vault] cleanup', String(e?.message || e).slice(0, 100)); }
}
cleanup(); setInterval(cleanup, 3600e3).unref();

function counts(uid) { const o = { photo: 0, video: 0, audio: 0, doc: 0, link: 0, bytes: 0 }; for (const c of Q.counts.all(uid)) { o[c.kind] = c.n; o.bytes += c.bytes; } return o; }

async function init(q, r, uid, via) {
  const b = await readJson(q);
  const mime = mimeOf(b.mime); const m = MIME[mime]; if (!m) throw err(415, `That file type (${txt(b.mime, 60) || 'unknown'}) is not allowed.`);
  const bytes = Number(b.bytes); if (!Number.isSafeInteger(bytes) || bytes < 1) throw err(400, 'bytes required');
  if (bytes > MAX_FILE) throw err(413, 'File is larger than 2 GB.');
  const source = srcOf(b.source); const source_id = b.source_id == null || b.source_id === '' ? null : txt(b.source_id, 200);
  if (source_id) {
    const dup = Q.bySrc.get(uid, source, source_id); if (dup) return json(r, 200, { duplicate: true, item_id: dup.id });
    const open = Q.upBySrc.get(uid, source, source_id, now());
    if (open && open.bytes === bytes && open.mime === mime) {
      const f = partPath(uid, open.id); let have = sizeOf(f); if (have < 0) { fs.writeFileSync(f, '', { mode: 0o600 }); have = 0; }
      return json(r, 200, { upload_id: open.id, received: have, bytes, chunk_size: CHUNK, resumed: true });
    }
    if (open) { fs.rm(partPath(uid, open.id), { force: true }, () => {}); Q.delUp.run(open.id); }
  }
  const id = crypto.randomBytes(16).toString('hex');
  if (Q.used.get(uid).n + Q.pending.get(uid, now(), id).n + bytes > QUOTA) throw err(507, 'Your vault is full (20 GB).');
  const t = Date.now();
  Q.insUp.run({ id, user_id: uid, kind: m[0], filename: safeName(b.filename) || `item.${m[1]}`, mime, bytes, title: txt(b.title, 200) || null, tags: tagsOf(b.tags), thumb: thumbOf(b.thumb),
    source, source_id, added_at: isoOrNull(b.added_at), via, created_at: new Date(t).toISOString(), expires_at: new Date(t + UPLOAD_TTL).toISOString() });
  fs.writeFileSync(partPath(uid, id), '', { mode: 0o600 });
  json(r, 201, { upload_id: id, received: 0, bytes, chunk_size: CHUNK });
}

function appendChunk(q, f, len) {
  return new Promise((res, rej) => {
    const out = fs.createWriteStream(f, { flags: 'a', mode: 0o600 }); let n = 0; let done = false;
    const fail = (e) => { if (done) return; done = true; q.unpipe(out); out.destroy(); q.resume(); rej(e); };
    q.on('data', (c) => { n += c.length; if (n > len) fail(err(400, 'Chunk longer than Content-Length.')); });
    q.on('close', () => { if (!q.complete) fail(err(400, 'Upload interrupted.')); });
    q.on('error', fail); out.on('error', fail);
    out.on('finish', () => { if (done) return; done = true; if (n !== len) rej(err(400, 'Chunk incomplete.')); else res(n); });
    q.pipe(out);
  });
}

async function putChunk(q, r, uid, id, u) {
  const up = Q.up.get(id, uid); if (!up) { drain(q); return json(r, 404, { error: 'Upload not found.' }); }
  if (up.item_id) { drain(q); return json(r, 200, { received: up.bytes, complete: true }); }
  const f = partPath(uid, id); const have = sizeOf(f); if (have < 0) { drain(q); return json(r, 404, { error: 'Upload not found.' }); }
  const off = Number(u.searchParams.get('offset')); const len = Number(q.headers['content-length']);
  if (!Number.isSafeInteger(off) || off < 0 || !Number.isSafeInteger(len) || len < 1) { drain(q); return json(r, 411, { error: 'offset and Content-Length required' }); }
  if (len > CHUNK_MAX) { drain(q); return json(r, 413, { error: 'Chunk too large (max 16 MB).' }); }
  if (off + len <= have) { drain(q); return json(r, 200, { received: have, replay: true }); }
  if (off !== have) { drain(q); return json(r, 409, { error: 'Offset mismatch.', received: have }); }
  if (off + len > up.bytes) { drain(q); return json(r, 400, { error: 'Chunk past the end of the file.', received: have }); }
  if (locks.has(id)) { drain(q); return json(r, 409, { error: 'Chunk already in progress.', received: have }); }
  locks.add(id);
  try { await appendChunk(q, f, len); }
  catch (e) { try { fs.truncateSync(f, have); } catch {} if (!r.headersSent) json(r, e.code === 400 ? 400 : 500, { error: e.code === 400 ? e.message : 'Write failed.', received: have }); return; }
  finally { locks.delete(id); }
  json(r, 200, { received: have + len });
}

async function complete(q, r, uid, id) {
  const b = await readJson(q, 4096);
  const up = Q.up.get(id, uid); if (!up) return json(r, 404, { error: 'Upload not found.' });
  if (up.item_id) { const it = Q.item.get(up.item_id, uid); return json(r, 200, { ok: true, already: true, item: it ? pub(it) : null }); }
  const want = String(b.sha256 || '').toLowerCase(); if (!/^[a-f0-9]{64}$/.test(want)) return json(r, 400, { error: 'sha256 required' });
  if (locks.has(id)) return json(r, 409, { error: 'Upload busy.' });
  locks.add(id);
  try {
    const f = partPath(uid, id); const have = sizeOf(f);
    if (have !== up.bytes) return json(r, 409, { error: 'Upload incomplete.', received: Math.max(0, have) });
    const got = await hashFile(f);
    if (got !== want) { fs.truncateSync(f, 0); return json(r, 422, { error: 'Checksum mismatch; upload reset, please retry.', received: 0 }); }
    const dup = Q.bySha.get(uid, got);
    if (dup) { fs.rmSync(f, { force: true }); Q.delUp.run(id); return json(r, 200, { duplicate: true, item_id: dup.id }); }
    const ext = MIME[up.mime][1]; const stored = crypto.randomBytes(12).toString('hex') + '.' + ext;
    const dest = path.join(userDir(uid, up.kind), stored); fs.renameSync(f, dest); fs.chmodSync(dest, 0o600);
    const row = { user_id: uid, kind: up.kind, filename: up.filename, stored, mime: up.mime, bytes: up.bytes, sha256: got, url: null,
      title: up.title || up.filename.replace(/\.[^.]{1,6}$/, ''), tags: up.tags, thumb: up.thumb, source: up.source, source_id: up.source_id, added_at: up.added_at, created_at: now() };
    let itemId;
    try { itemId = db.transaction(() => { const iid = Q.ins.run(row).lastInsertRowid; Q.doneUp.run(iid, id); return iid; })(); }
    catch (e) { fs.rmSync(dest, { force: true }); if (/UNIQUE/.test(String(e.message))) { Q.delUp.run(id); const d2 = (up.source_id && Q.bySrc.get(uid, up.source, up.source_id)) || Q.bySha.get(uid, got); return json(r, 200, { duplicate: true, item_id: d2?.id ?? null }); } throw e; }
    json(r, 201, { ok: true, item: pub({ id: itemId, ...row }) });
  } finally { locks.delete(id); }
}

async function addLink(q, r, uid) {
  if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { drain(q); return json(r, 415, { error: 'JSON required.' }); }
  const b = await readJson(q, 16 * 1024); let url; try { url = new URL(String(b.url || '').trim()); } catch {}
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname || url.href.length > 2048) return json(r, 400, { error: 'A valid http(s) link is required.' });
  const source = srcOf(b.source); const source_id = b.source_id == null || b.source_id === '' ? null : txt(b.source_id, 200);
  const dup = (source_id && Q.bySrc.get(uid, source, source_id)) || Q.byUrl.get(uid, url.href);
  if (dup) return json(r, 200, { duplicate: true, item_id: dup.id });
  const row = { user_id: uid, kind: 'link', filename: null, stored: null, mime: null, bytes: 0, sha256: null, url: url.href, title: txt(b.title, 200) || url.hostname,
    tags: tagsOf(b.tags), thumb: null, source, source_id, added_at: isoOrNull(b.added_at), created_at: now() };
  const id = Q.ins.run(row).lastInsertRowid; json(r, 201, { ok: true, item: pub({ id, ...row }, uid) });
}

function sendFile(q, r, it, uid) {
  const f = path.join(ROOT, String(Number(uid)), it.kind, path.basename(it.stored || ''));
  let st; try { st = fs.statSync(f); } catch { return json(r, 404, { error: 'not found' }); }
  const base = { 'Content-Type': it.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
    'Content-Disposition': `${u8dl(q) ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(it.filename || it.stored)}`, 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(q.headers.range || ''));
  if (m && (m[1] || m[2])) {
    const s = m[1] ? +m[1] : Math.max(0, st.size - +m[2]); const e = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    if (s > e || s >= st.size) { r.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return r.end(); }
    r.writeHead(206, { ...base, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 });
    if (q.method === 'HEAD') return r.end(); return fs.createReadStream(f, { start: s, end: e }).pipe(r);
  }
  r.writeHead(200, { ...base, 'Content-Length': st.size }); if (q.method === 'HEAD') return r.end(); fs.createReadStream(f).pipe(r);
}
const u8dl = (q) => /[?&]download=1\b/.test(q.url || '');

const STATIC = { '/vault/': ['vault.html', 'text/html; charset=utf-8'], '/vault/vault.js': ['vault.js', 'text/javascript; charset=utf-8'], '/vault-export.js': ['vault-export.js', 'text/javascript; charset=utf-8'] };
function serveStatic(q, r, p) {
  if (p === '/vault') { r.writeHead(301, { Location: '/vault/' }); return r.end(); }
  const s = STATIC[p]; if (!s || !(q.method === 'GET' || q.method === 'HEAD')) return json(r, 404, { error: 'not found' });
  let buf; try { buf = fs.readFileSync(path.join(PUB, s[0])); } catch { return json(r, 404, { error: 'not found' }); }
  const h = { 'Content-Type': s[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Length': buf.length };
  if (s[0] === 'vault.html') Object.assign(h, { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  if (s[0] === 'vault-export.js') h['Cross-Origin-Resource-Policy'] = 'cross-origin';
  r.writeHead(200, h); if (q.method === 'HEAD') return r.end(); r.end(buf);
}

/* Returns true when it handled the request. */
export async function vaultRoute(q, r, p, u = new URL(q.url, 'http://x')) {
  if (p === '/vault' || p === '/vault/' || p === '/vault/vault.js' || p === '/vault-export.js') { serveStatic(q, r, p); return true; }
  if (p !== '/api/vault' && !p.startsWith('/api/vault/')) return false;
  try {
    const origin = q.headers.origin; const corsOk = TOKEN_PATH(p) && CORS_ORIGINS.has(origin);
    if (corsOk) { r.setHeader('Access-Control-Allow-Origin', origin); r.setHeader('Vary', 'Origin'); r.setHeader('Access-Control-Expose-Headers', 'Content-Type'); }
    if (q.method === 'OPTIONS') {
      if (!corsOk) { r.writeHead(403, { 'Cache-Control': 'no-store' }); r.end(); return true; }
      r.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store' }); r.end(); return true;
    }
    /* dragout-20261019a: signed file GET may skip session (Explorer DownloadURL has no cookie). */
    const get0 = q.method === 'GET' || q.method === 'HEAD';
    let mDl = /^\/api\/vault\/file\/(\d{1,12})$/.exec(p);
    if (mDl && get0) {
      const signed = dlCheck(q, +mDl[1]);
      if (signed) {
        const it = Q.item.get(+mDl[1], signed.uid);
        if (!it || it.kind === 'link') { json(r, 404, { error: 'not found' }); return true; }
        sendFile(q, r, it, signed.uid); return true;
      }
    }
    const a = auth(q);
    if (!a || a.bad) { drain(q); json(r, 401, { error: a?.bad ? 'Export token invalid or expired. Get a new export button on hubface.org/vault.' : 'Please sign in.' }); return true; }
    const { uid, via } = a; const get = get0;
    if (via === 'token') {
      if (!TOKEN_PATH(p) || get) { drain(q); json(r, 403, { error: 'The export token can only upload.' }); return true; }
      if (origin && !CORS_ORIGINS.has(origin) && origin !== ORIGIN) { drain(q); json(r, 403, { error: 'Origin not allowed.' }); return true; }
    } else if (!get && !sameOrigin(q)) { drain(q); json(r, 403, { error: 'Cross-site request blocked.' }); return true; }

    if (p === '/api/vault' && get) {
      const o = Q.user.get(uid); const c = counts(uid);
      json(r, 200, { build: VAULT_BUILD, owner: { id: o.id, username: o.username, email: o.email }, counts: c,
        quota: { used: Q.used.get(uid).n, limit: QUOTA, max_file: MAX_FILE }, items: Q.list.all(uid).map((x) => pub(x, uid)) }); return true;
    }
    if (p === '/api/vault/import-token' && q.method === 'POST') {
      drain(q); const tok = 'hfvi_' + crypto.randomBytes(32).toString('base64url'); const t = Date.now(); const exp = new Date(t + TOKEN_TTL).toISOString();
      Q.insToken.run(sha(tok), uid, 'import', new Date(t).toISOString(), exp);
      json(r, 201, { token: tok, expires_at: exp, scope: 'import', script: `${ORIGIN}/vault-export.js` }); return true;
    }
    if (p === '/api/vault/dl-sign' && q.method === 'POST') {   // dragout-20261019a
      const b = await readJson(q, 4096); const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id < 1) { json(r, 400, { error: 'id required' }); return true; }
      const it = Q.item.get(id, uid); if (!it || it.kind === 'link') { json(r, 404, { error: 'not found' }); return true; }
      const d = dlMake(uid, id); if (!d) { json(r, 503, { error: 'Signed downloads unavailable.' }); return true; }
      json(r, 200, { ok: true, id, path: d.path, url: ORIGIN + d.path, expires_at: new Date(d.exp * 1000).toISOString(), mime: it.mime, filename: it.filename }); return true;
    }
    if (p === '/api/vault/upload/init' && q.method === 'POST') { await init(q, r, uid, via); return true; }
    if (p === '/api/vault/link' && q.method === 'POST') { await addLink(q, r, uid); return true; }
    if (p === '/api/vault/petdocs') { await petDocs(q, r, uid, u); return true; }   // petdocs-20261018-v1
    let m = /^\/api\/vault\/petdocs\/(\d{1,12})$/.exec(p);
    if (m && q.method === 'DELETE') { drain(q); const n = Q.pdDel.run(+m[1], uid).changes; json(r, n ? 200 : 404, n ? { ok: true, removed: +m[1] } : { error: 'not found' }); return true; }
    m = /^\/api\/vault\/upload\/([a-f0-9]{32})$/.exec(p);
    if (m && q.method === 'PUT') { await putChunk(q, r, uid, m[1], u); return true; }
    m = /^\/api\/vault\/upload\/([a-f0-9]{32})\/complete$/.exec(p);
    if (m && q.method === 'POST') { await complete(q, r, uid, m[1]); return true; }
    m = /^\/api\/vault\/(file|thumb)\/(\d{1,12})$/.exec(p);
    if (m && get) {
      const it = Q.item.get(+m[2], uid); if (!it || it.kind === 'link') { json(r, 404, { error: 'not found' }); return true; }
      if (m[1] === 'file') { sendFile(q, r, it, uid); return true; }
      const t = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(it.thumb || ''); if (!t) { json(r, 404, { error: 'not found' }); return true; }
      const buf = Buffer.from(t[2], 'base64'); r.writeHead(200, { 'Content-Type': t[1], 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); r.end(buf); return true;
    }
    m = /^\/api\/vault\/(\d{1,12})$/.exec(p);
    if (m && q.method === 'DELETE') {
      drain(q); const it = Q.item.get(+m[1], uid); if (!it) { json(r, 404, { error: 'not found' }); return true; }
      Q.del.run(it.id, uid); if (it.stored) fs.rm(path.join(ROOT, String(Number(uid)), it.kind, path.basename(it.stored)), { force: true }, () => {});
      json(r, 200, { ok: true, deleted: it.id }); return true;
    }
    drain(q); json(r, 404, { error: 'not found' }); return true;
  } catch (e) {
    const known = [400, 409, 411, 413, 415, 422, 507].includes(e?.code);
    if (!known) console.warn('[vault] error', String(e?.message || e).slice(0, 160));
    if (!r.headersSent) json(r, known ? e.code : 500, { error: known ? e.message : 'Server error.' }); else r.end(); return true;
  }
}
/* Remove a user's whole vault folder (rows go with ON DELETE CASCADE when the user row is deleted). */
export function removeUserFiles(uid) { const n = Number(uid); if (!Number.isSafeInteger(n) || n < 1) return; fs.rmSync(path.join(ROOT, String(n)), { recursive: true, force: true }); }
export function vaultHealth() { try { return { ok: true, build: VAULT_BUILD, items: db.prepare('SELECT COUNT(*) n FROM vault_items').get().n }; } catch { return { ok: false }; } }
export { KINDS };
