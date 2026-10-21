// HubFace per-account dashboard layouts (layouts-20261017-v1, Dan approved). Hosted site only.
//   GET /api/account/layout  -> 200 {authenticated:false} | {authenticated:true, store:{cur,custom,over}|null, updated_at}
//   PUT /api/account/layout  {store:{cur, custom:[{name,s}], over:{name:s}}} -> 200 {ok, updated_at, layouts}
// Same SQLite file as accounts.mjs (/var/lib/hubface/accounts.db), own table, own connection; accounts.mjs is not modified.
// Session = the hf_session cookie (only its SHA-256 is in the sessions table). PUT: same-origin (Origin/Referer https://hubface.org),
// JSON only, body cap 200 KB, structure validated (names, counts, depth). The whole store is replaced in one transaction.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const LAYOUTS_BUILD = 'layouts-20261018-v2-prefs';   // widgetorder-20261018a: + prefs (widget list order), saved only with an explicit Save
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const COOKIE = 'hf_session';
const MAX_BODY = 200 * 1024, MAX_LAYOUTS = 48, MAX_DEPTH = 8, META = '__meta__', SCENES = '__scenes__', PREFS = '__prefs__', MAX_PREFS = 16 * 1024;   // scenes-v2: day-part / custom scene definitions (times, windows, names)

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS layouts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);`);
const Q = {
  session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  rows: db.prepare('SELECT name, json, updated_at FROM layouts WHERE user_id = ?'),
  prefs: db.prepare('SELECT json FROM layouts WHERE user_id = ? AND name = ?'),
  del: db.prepare('DELETE FROM layouts WHERE user_id = ?'),
  ins: db.prepare('INSERT INTO layouts (user_id, name, json, updated_at) VALUES (?, ?, ?, ?)'),
};
const replaceAll = db.transaction((uid, rows, t) => {
  if (!rows.some(([n]) => n === PREFS)) { const old = Q.prefs.get(uid, PREFS); if (old) rows = rows.concat([[PREFS, old.json]]); }   // older client without prefs: keep the saved widget order
  Q.del.run(uid); for (const [n, j] of rows) Q.ins.run(uid, n, j, t);
});

const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
function currentUser(q) {
  const tok = cookies(q)[COOKIE]; if (!tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const s = Q.session.get(sha(tok)); if (!s || s.expires_at < new Date().toISOString()) return null;
  return s.user_id;
}
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const readBody = (q) => new Promise((res, rej) => { let n = 0, over = false; const ch = []; q.on('data', (c) => { n += c.length; if (n > MAX_BODY) { over = true; ch.length = 0; } else if (!over) ch.push(c); }); q.on('end', () => (over ? rej(Object.assign(new Error('too large'), { code: 413 })) : res(Buffer.concat(ch)))); q.on('error', rej); });   // drains an oversize body so the client gets a clean 413

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function depth(v, d = 0) { if (d > MAX_DEPTH) return d; if (v && typeof v === 'object') { let m = d; for (const k of Object.keys(v)) { m = Math.max(m, depth(v[k], d + 1)); if (m > MAX_DEPTH) break; } return m; } return d; }
function goodName(n) { return typeof n === 'string' && n.length >= 1 && n.length <= 40 && n === n.trim() && !/[\u0000-\u001f\u007f<>]/.test(n) && n !== META && n !== SCENES && n !== PREFS; }
function validate(store, scenes, prefs) {
  if (!isObj(store)) return 'store must be an object';
  const cur = store.cur ?? null; if (cur !== null && !goodName(cur)) return 'bad current layout name';
  const custom = store.custom ?? []; if (!Array.isArray(custom)) return 'custom must be a list';
  const over = store.over ?? {}; if (!isObj(over)) return 'over must be an object';
  const seen = new Set(), rows = [];
  for (const c of custom) {
    if (!isObj(c) || !goodName(c.name) || !isObj(c.s)) return 'bad custom layout';
    const k = c.name.toLowerCase(); if (seen.has('c:' + k)) return 'duplicate layout name'; seen.add('c:' + k);
    if (depth(c.s) > MAX_DEPTH) return 'layout too deeply nested';
    rows.push(['c:' + c.name, JSON.stringify(c.s)]);
  }
  for (const [n, s] of Object.entries(over)) {
    if (!goodName(n) || !isObj(s)) return 'bad layout update';
    if (depth(s) > MAX_DEPTH) return 'layout too deeply nested';
    rows.push(['o:' + n, JSON.stringify(s)]);
  }
  if (rows.length > MAX_LAYOUTS) return `too many layouts (max ${MAX_LAYOUTS})`;
  if (scenes !== undefined && scenes !== null) { if (!isObj(scenes)) return 'scenes must be an object'; if (depth(scenes) > MAX_DEPTH) return 'scenes too deeply nested'; rows.push([SCENES, JSON.stringify(scenes)]); }
  if (prefs !== undefined && prefs !== null) {   // widgetorder-20261018a: {worder:{room:[ids], dash:[names]}}
    if (!isObj(prefs)) return 'prefs must be an object'; if (depth(prefs) > 4) return 'prefs too deeply nested';
    const pj = JSON.stringify(prefs); if (pj.length > MAX_PREFS) return 'prefs too large'; rows.push([PREFS, pj]);
  }
  rows.push([META, JSON.stringify({ cur, order: custom.map((c) => c.name) })]);
  return rows;
}
function load(uid) {
  const rows = Q.rows.all(uid); if (!rows.length) return { store: null, prefs: null, updated_at: null };
  const store = { cur: null, custom: [], over: {} }; let meta = { cur: null, order: [] }, t = '', scenes = null, prefs = null;
  for (const r of rows) {
    if (r.updated_at > t) t = r.updated_at;
    let v; try { v = JSON.parse(r.json); } catch { continue; }
    if (r.name === META) meta = v || meta;
    else if (r.name === SCENES) scenes = v;
    else if (r.name === PREFS) prefs = v;
    else if (r.name.startsWith('c:')) store.custom.push({ name: r.name.slice(2), s: v });
    else if (r.name.startsWith('o:')) store.over[r.name.slice(2)] = v;
  }
  const ord = Array.isArray(meta.order) ? meta.order : [];
  store.custom.sort((a, b) => (ord.indexOf(a.name) + 1 || 1e9) - (ord.indexOf(b.name) + 1 || 1e9));
  store.cur = typeof meta.cur === 'string' ? meta.cur : null;
  return { store, scenes, prefs, updated_at: t };
}

/** Handles /api/account/layout; returns false for any other path. */
export async function layoutRoute(q, r, p) {
  if (p !== '/api/account/layout') return false;
  try {
    if (q.method === 'GET' || q.method === 'HEAD') {
      const uid = currentUser(q); if (!uid) { json(r, 200, { authenticated: false }); return true; }
      const o = load(uid); json(r, 200, { authenticated: true, store: o.store, scenes: o.scenes || null, prefs: o.prefs || null, updated_at: o.updated_at }); return true;
    }
    if (q.method !== 'PUT') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
    if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON required.' }); return true; }
    if (Number(q.headers['content-length'] || 0) > MAX_BODY) { json(r, 413, { error: 'Layout too large (200 KB max).' }); q.resume(); return true; }
    const uid = currentUser(q); if (!uid) { json(r, 401, { error: 'Sign in to save layouts to your account.' }); return true; }
    let b; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch (e) { if (e?.code === 413) throw e; json(r, 400, { error: 'Invalid JSON.' }); return true; }
    const rows = validate(b && b.store, b && b.scenes, b && b.prefs); if (typeof rows === 'string') { json(r, 400, { error: rows }); return true; }
    const t = new Date().toISOString(); replaceAll(uid, rows, t);
    json(r, 200, { ok: true, updated_at: t, layouts: rows.length - 1 - (rows.some(([n]) => n === PREFS) ? 1 : 0) });
  } catch (e) {
    if (e?.code !== 413) console.warn('[layouts] error', String(e?.message || e).slice(0, 120));
    if (!r.headersSent) json(r, e?.code === 413 ? 413 : 500, { error: e?.code === 413 ? 'Layout too large (200 KB max).' : 'Server error. Please try again.' });
  }
  return true;
}
