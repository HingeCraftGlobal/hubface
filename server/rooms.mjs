// HubFace dashboard room IDs (roomid-20261018a, Dan approved). Hosted site only.
//   POST /api/rooms                {name, meta?}          -> 201 {ok, id, name, created_at, key, link}   (key = owner secret, shown once)
//   GET  /api/rooms/<ID>                                   -> 200 {ok, id, name, created_at, owner} | 404 {error:'Room not found'} | 429
//   POST /api/rooms/<ID>/name      {name, key}            -> 200 {ok, id, name}  (owner key or the creating account's session)
// IDs: HF-XXXXX-XXXXX, 10 chars from a 31-char unambiguous alphabet (no 0/O/1/I/L), crypto.randomBytes with rejection sampling
// (~49.5 bits; never sequential), uniqueness enforced by the PRIMARY KEY with retry.
// Store: /var/lib/hubface/rooms.db (own file; accounts.db is opened READ-ONLY only to resolve the hf_session cookie to a user).
// Rate limits per client IP (cf-connecting-ip / x-forwarded-for): lookups 120 / 10 min, and 20 not-found lookups / 10 min -> 429
// for all lookups from that IP until the window clears; creates 30 / 10 min; renames 120 / 10 min.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const ROOMS_BUILD = 'roomid-20261018a';
const DB_PATH = process.env.HUBFACE_ROOMS_DB || '/var/lib/hubface/rooms.db';
const ACC_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // 31 chars
const ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const WIN = 10 * 60e3, LIM = { look: 120, miss: 20, create: 30, rename: 120 };

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id INTEGER,
  owner_name TEXT,
  owner_key_hash TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`);
let acc = null; try { acc = new Database(ACC_PATH, { readonly: true, fileMustExist: true }); acc.pragma('busy_timeout = 3000'); } catch { acc = null; }
const Q = {
  ins: db.prepare('INSERT INTO rooms (id, name, owner_user_id, owner_name, owner_key_hash, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  get: db.prepare('SELECT id, name, owner_user_id, owner_name, owner_key_hash, created_at FROM rooms WHERE id = ?'),
  ren: db.prepare('UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?'),
};
const QA = acc ? { session: acc.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'), user: acc.prepare('SELECT username FROM users WHERE id = ?') } : null;

const json = (r, code, o, h) => { r.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h || {})); r.end(JSON.stringify(o)); };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
function sessionUser(q) {
  try { const tok = cookies(q).hf_session; if (!QA || !tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
    const s = QA.session.get(sha(tok)); if (!s || s.expires_at < new Date().toISOString()) return null;
    const u = QA.user.get(s.user_id); return { id: s.user_id, name: u && u.username ? String(u.username).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 24) : null };
  } catch { return null; }
}
function ip(q) {
  const cf = String(q.headers['cf-connecting-ip'] || '').trim(); if (cf) return cf.slice(0, 64);
  const xf = String(q.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (xf) return xf.slice(0, 64);
  return String(q.socket.remoteAddress || '?');
}
const hits = new Map();   // `${kind}|${ip}` -> [timestamps]
function count(kind, who, add) {
  const k = kind + '|' + who, now = Date.now(); let a = (hits.get(k) || []).filter((t) => now - t < WIN);
  if (add) a.push(now); if (a.length) hits.set(k, a); else hits.delete(k); return a.length;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) { const b = a.filter((t) => now - t < WIN); if (b.length) hits.set(k, b); else hits.delete(k); } }, 60e3).unref();
function limited(r, kind, who) { if (count(kind, who, false) >= LIM[kind]) { json(r, 429, { error: 'Too many requests. Please wait a few minutes and try again.' }, { 'Retry-After': '600' }); return true; } return false; }

function newId() {
  const out = [];
  while (out.length < 10) { for (const b of crypto.randomBytes(16)) { if (b < 248 && out.length < 10) out.push(ALPHA[b % 31]); } }   // 248 = 31*8: no modulo bias
  return 'HF-' + out.slice(0, 5).join('') + '-' + out.slice(5).join('');
}
const cleanName = (v) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const readBody = (q, max = 8192) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > max) { rej(Object.assign(new Error('too large'), { code: 413 })); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
async function body(q, r) {
  if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return null; }
  if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON required.' }); return null; }
  try { const b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
  catch (e) { json(r, e?.code === 413 ? 413 : 400, { error: e?.code === 413 ? 'Too large.' : 'Invalid JSON.' }); return null; }
}
const link = (id) => ORIGIN + '/interface/#room=' + id;

/** Handles /api/rooms and /api/rooms/*; returns false for any other path. */
export async function roomsRoute(q, r, p) {
  if (p !== '/api/rooms' && !p.startsWith('/api/rooms/')) return false;
  const who = ip(q);
  try {
    if (p === '/api/rooms') {
      if (q.method !== 'POST') { json(r, 405, { error: 'method not allowed' }); return true; }
      if (limited(r, 'create', who)) return true;
      const b = await body(q, r); if (!b) return true;
      const name = cleanName(b.name) || 'Untitled room';
      let meta = null; if (b.meta && typeof b.meta === 'object') { const m = {}; for (const k of ['desc', 'mode', 'type', 'path']) if (b.meta[k] != null) m[k] = cleanName(b.meta[k]).slice(0, 200); meta = JSON.stringify(m); }
      const u = sessionUser(q), key = crypto.randomBytes(24).toString('base64url'), t = new Date().toISOString();
      let id = null;
      for (let i = 0; i < 8 && !id; i++) { const c = newId(); try { Q.ins.run(c, name, u ? u.id : null, u ? u.name : null, sha(key), meta, t, t); id = c; } catch (e) { if (!/UNIQUE|PRIMARY/i.test(String(e?.message))) throw e; } }
      if (!id) { json(r, 503, { error: 'Could not allocate a room ID. Try again.' }); return true; }
      count('create', who, true);
      json(r, 201, { ok: true, id, name, created_at: t, key, link: link(id) }); return true;
    }
    const m = /^\/api\/rooms\/([^/]+)(\/name)?$/.exec(p); if (!m) { json(r, 404, { error: 'not found' }); return true; }
    const id = decodeURIComponent(m[1]).trim().toUpperCase();
    if (m[2]) {   // rename
      if (q.method !== 'POST') { json(r, 405, { error: 'method not allowed' }); return true; }
      if (limited(r, 'rename', who)) return true; count('rename', who, true);
      const b = await body(q, r); if (!b) return true;
      const row = ID_RE.test(id) ? Q.get.get(id) : null; if (!row) { json(r, 404, { error: 'Room not found' }); return true; }
      const u = sessionUser(q), okKey = typeof b.key === 'string' && b.key.length >= 20 && crypto.timingSafeEqual(Buffer.from(sha(b.key)), Buffer.from(row.owner_key_hash));
      if (!okKey && !(u && row.owner_user_id && u.id === row.owner_user_id)) { json(r, 403, { error: 'Only the room owner can rename it.' }); return true; }
      const name = cleanName(b.name); if (!name) { json(r, 400, { error: 'Name required.' }); return true; }
      Q.ren.run(name, new Date().toISOString(), id); json(r, 200, { ok: true, id, name }); return true;
    }
    if (q.method !== 'GET' && q.method !== 'HEAD') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (limited(r, 'miss', who) || limited(r, 'look', who)) return true;
    count('look', who, true);
    const row = ID_RE.test(id) ? Q.get.get(id) : null;
    if (!row) { count('miss', who, true); json(r, 404, { ok: false, error: 'Room not found' }); return true; }
    json(r, 200, { ok: true, id: row.id, name: row.name, created_at: row.created_at, owner: row.owner_name || null, link: link(row.id) }); return true;
  } catch (e) {
    console.warn('[rooms] error', String(e?.message || e).slice(0, 120));
    if (!r.headersSent) json(r, 500, { error: 'Server error. Please try again.' });
  }
  return true;
}
export function roomsHealth() { try { return { ok: true, build: ROOMS_BUILD, rooms: db.prepare('SELECT COUNT(*) n FROM rooms').get().n }; } catch { return { ok: false }; } }
// roomserver-20261018a: helpers for the live room server (roomserver.mjs). Same limiter as GET /api/rooms/<ID>.
export function lookupForJoin(q, rawId) {
  const who = ip(q), id = String(rawId || '').trim().toUpperCase();
  if (count('miss', who, false) >= LIM.miss || count('look', who, false) >= LIM.look) return { status: 429 };
  count('look', who, true);
  const row = ID_RE.test(id) ? Q.get.get(id) : null;
  if (!row) { count('miss', who, true); return { status: 404 }; }
  return { status: 200, room: { id: row.id, name: row.name, owner_user_id: row.owner_user_id, owner_name: row.owner_name }, row };
}
export function roomName(id) { try { const row = Q.get.get(id); return row ? row.name : null; } catch { return null; } }
export function isOwner(q, row, key) {
  try {
    const u = sessionUser(q); if (u && row.owner_user_id && u.id === row.owner_user_id) return true;
    return typeof key === 'string' && key.length >= 20 && crypto.timingSafeEqual(Buffer.from(sha(key)), Buffer.from(row.owner_key_hash));
  } catch { return false; }
}
export { sessionUser, ip as clientIp };
