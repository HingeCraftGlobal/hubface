// HubFace per-account saved rooms (savedrooms-20261019a). Hosted site only.
//   GET /api/account/saved-rooms -> 200 {authenticated:false} | {authenticated:true, rooms:[...], updated_at}
//   PUT /api/account/saved-rooms {rooms:[...]} -> 200 {ok, rooms:n, updated_at}   (merged by id with what is stored; newer savedAt wins; nothing is deleted)
// Same SQLite file as accounts.mjs/layouts.mjs, own table saved_rooms, own connection. Session = hf_session cookie (SHA-256 in sessions table).
// PUT: same-origin only, JSON only, 256 KB cap, 20 PUTs/min per account, structure validated.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const SAVEDROOMS_BUILD = 'savedrooms-20261019a';
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const COOKIE = 'hf_session', MAX_BODY = 256 * 1024, MAX_ROOMS = 60, MAX_DEPTH = 6, VAULTS = new Set(['private', 'public', 'premium']);

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS saved_rooms (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`);
const Q = {
  session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  get: db.prepare('SELECT json, updated_at FROM saved_rooms WHERE user_id = ?'),
  put: db.prepare('INSERT INTO saved_rooms (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at'),
};
const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
function currentUser(q) {
  const tok = cookies(q)[COOKIE]; if (!tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const s = Q.session.get(sha(tok)); if (!s || s.expires_at < new Date().toISOString()) return null;
  return s.user_id;
}
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const readBody = (q) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > MAX_BODY) { const e = new Error('too large'); e.code = 413; rej(e); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function depth(v, d = 0) { if (d > MAX_DEPTH) return d; if (v && typeof v === 'object') { let m = d; for (const k of Object.keys(v)) { m = Math.max(m, depth(v[k], d + 1)); if (m > MAX_DEPTH) break; } return m; } return d; }
function goodRoom(o) { return isObj(o) && typeof o.id === 'string' && /^sr[a-z0-9]{1,24}$/.test(o.id) && typeof o.title === 'string' && o.title.trim() && o.title.length <= 120 && VAULTS.has(o.vault) && depth(o) <= MAX_DEPTH; }
function load(uid) { const row = Q.get.get(uid); if (!row) return { rooms: [], updated_at: null }; let a = []; try { a = JSON.parse(row.json); } catch {} return { rooms: Array.isArray(a) ? a : [], updated_at: row.updated_at }; }
function merge(oldA, newA) {
  const m = new Map(); for (const o of oldA) if (goodRoom(o)) m.set(o.id, o);
  for (const o of newA) { const p = m.get(o.id); if (!p || String(o.savedAt || '') >= String(p.savedAt || '')) m.set(o.id, o); }
  return [...m.values()].sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))).slice(0, MAX_ROOMS);
}
const hits = new Map();
function limited(uid) { const now = Date.now(); const a = (hits.get(uid) || []).filter((t) => now - t < 60000); a.push(now); hits.set(uid, a); return a.length > 20; }

/** Handles /api/account/saved-rooms; returns false for any other path. */
export async function savedRoomsRoute(q, r, p) {
  if (p !== '/api/account/saved-rooms') return false;
  try {
    if (q.method === 'GET' || q.method === 'HEAD') {
      const uid = currentUser(q); if (!uid) { json(r, 200, { authenticated: false }); return true; }
      const o = load(uid); json(r, 200, { authenticated: true, rooms: o.rooms, updated_at: o.updated_at }); return true;
    }
    if (q.method !== 'PUT') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
    if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON required.' }); return true; }
    if (Number(q.headers['content-length'] || 0) > MAX_BODY) { json(r, 413, { error: 'Too large (256 KB max).' }); q.resume(); return true; }
    const uid = currentUser(q); if (!uid) { json(r, 401, { error: 'Sign in to keep saved rooms on your account.' }); return true; }
    if (limited(uid)) { json(r, 429, { error: 'Too many saves. Try again in a minute.' }); q.resume(); return true; }
    let b; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch (e) { if (e?.code === 413) throw e; json(r, 400, { error: 'Invalid JSON.' }); return true; }
    const rooms = b && b.rooms; if (!Array.isArray(rooms) || rooms.length > MAX_ROOMS) { json(r, 400, { error: 'rooms must be a list (max ' + MAX_ROOMS + ')' }); return true; }
    if (!rooms.every(goodRoom)) { json(r, 400, { error: 'bad saved room' }); return true; }
    const all = merge(load(uid).rooms, rooms), t = new Date().toISOString();
    Q.put.run(uid, JSON.stringify(all), t); json(r, 200, { ok: true, rooms: all.length, updated_at: t });
  } catch (e) {
    if (e?.code !== 413) console.warn('[savedrooms] error', String(e?.message || e).slice(0, 120));
    if (!r.headersSent) json(r, e?.code === 413 ? 413 : 500, { error: e?.code === 413 ? 'Too large (256 KB max).' : 'Server error. Please try again.' });
  }
  return true;
}
