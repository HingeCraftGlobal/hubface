// HubFace per-account Home Status plan (homeplan-20261024a, Dan approved 2026-10-24 13:57 ET).
//   GET /api/account/home-plan          -> {authenticated:false} | {authenticated:true, plan|null, updated_at, history:n}
//   PUT /api/account/home-plan {plan}   -> {ok, updated_at}  (previous version archived to home_plan_history, last 100 kept)
//   GET /api/account/home-plan/history  -> {items:[{id, saved_at, bytes, rooms, devices}]}
//   GET /api/account/home-plan/history/<id> -> {plan, saved_at}
// Guard: a plan with no devices and no cameras never replaces a stored plan that has some (409) unless {force:true}.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
export const HOMEPLAN_BUILD = 'homeplan-20261024a';
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const COOKIE = 'hf_session', MAX_BODY = 1024 * 1024, KEEP = 100;
const db = new Database(DB_PATH);
db.pragma('busy_timeout = 5000'); db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS home_plans (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS home_plan_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, saved_at TEXT NOT NULL, reason TEXT);
CREATE INDEX IF NOT EXISTS home_plan_history_user ON home_plan_history(user_id, id);`);
const Q = {
  session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  get: db.prepare('SELECT json, updated_at FROM home_plans WHERE user_id = ?'),
  put: db.prepare('INSERT INTO home_plans (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at'),
  hist: db.prepare('INSERT INTO home_plan_history (user_id, json, saved_at, reason) VALUES (?, ?, ?, ?)'),
  trim: db.prepare('DELETE FROM home_plan_history WHERE user_id = ? AND id NOT IN (SELECT id FROM home_plan_history WHERE user_id = ? ORDER BY id DESC LIMIT ' + KEEP + ')'),
  list: db.prepare('SELECT id, json, saved_at, reason FROM home_plan_history WHERE user_id = ? ORDER BY id DESC'),
  one: db.prepare('SELECT json, saved_at FROM home_plan_history WHERE user_id = ? AND id = ?'),
  count: db.prepare('SELECT count(*) n FROM home_plan_history WHERE user_id = ?'),
};
const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
function currentUser(q) { const tok = cookies(q)[COOKIE]; if (!tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null; const s = Q.session.get(sha(tok)); if (!s || s.expires_at < new Date().toISOString()) return null; return s.user_id; }
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const readBody = (q) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > MAX_BODY) { const e = new Error('too large'); e.code = 413; rej(e); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
export function planStats(p) { let rooms = 0, cams = 0; const fl = (p && Array.isArray(p.floors)) ? p.floors : []; for (const f of fl) { rooms += Array.isArray(f.rooms) ? f.rooms.length : 0; cams += Array.isArray(f.cams) ? f.cams.length : 0; } return { floors: fl.length, rooms, cams, devices: Array.isArray(p?.devices) ? p.devices.length : 0 }; }
const hits = new Map();
function limited(uid) { const now = Date.now(); const a = (hits.get(uid) || []).filter((t) => now - t < 60000); a.push(now); hits.set(uid, a); return a.length > 60; }
export async function homePlanRoute(q, r, p) {
  if (p !== '/api/account/home-plan' && !p.startsWith('/api/account/home-plan/')) return false;
  try {
    const uid = currentUser(q);
    if (q.method === 'GET' || q.method === 'HEAD') {
      if (!uid) { json(r, p === '/api/account/home-plan' ? 200 : 401, { authenticated: false }); return true; }
      if (p === '/api/account/home-plan') { const row = Q.get.get(uid); let plan = null; try { plan = row ? JSON.parse(row.json) : null; } catch {} json(r, 200, { authenticated: true, plan, updated_at: row?.updated_at || null, history: Q.count.get(uid).n }); return true; }
      if (p === '/api/account/home-plan/history') { json(r, 200, { items: Q.list.all(uid).map((h) => { let s = {}; try { s = planStats(JSON.parse(h.json)); } catch {} return Object.assign({ id: h.id, saved_at: h.saved_at, reason: h.reason, bytes: h.json.length }, s); }) }); return true; }
      const m = /^\/api\/account\/home-plan\/history\/(\d+)$/.exec(p); if (m) { const h = Q.one.get(uid, +m[1]); if (!h) { json(r, 404, { error: 'not found' }); return true; } json(r, 200, { plan: JSON.parse(h.json), saved_at: h.saved_at }); return true; }
      json(r, 404, { error: 'not found' }); return true;
    }
    if (q.method !== 'PUT' || p !== '/api/account/home-plan') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
    if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON required.' }); return true; }
    if (!uid) { json(r, 401, { error: 'Sign in to keep your home plan on your account.' }); return true; }
    if (limited(uid)) { json(r, 429, { error: 'Too many saves.' }); q.resume(); return true; }
    let b; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch (e) { if (e?.code === 413) throw e; json(r, 400, { error: 'Invalid JSON.' }); return true; }
    const plan = b && b.plan; if (!plan || typeof plan !== 'object' || !Array.isArray(plan.floors)) { json(r, 400, { error: 'plan.floors required' }); return true; }
    const txt = JSON.stringify(plan), old = Q.get.get(uid), t = new Date().toISOString();
    if (old && old.json === txt) { json(r, 200, { ok: true, unchanged: true, updated_at: old.updated_at }); return true; }
    if (old && !b.force) { let os = {}; try { os = planStats(JSON.parse(old.json)); } catch {} const ns = planStats(plan);
      if ((os.devices + os.cams) > 0 && (ns.devices + ns.cams) === 0) { Q.hist.run(uid, txt, t, 'rejected-empty'); Q.trim.run(uid, uid); json(r, 409, { error: 'Refused: this would replace your saved home plan with an empty one. Send force:true to override.', kept: os }); return true; } }
    db.transaction(() => { if (old) Q.hist.run(uid, old.json, old.updated_at, 'previous'); Q.put.run(uid, txt, t); Q.trim.run(uid, uid); })();
    json(r, 200, { ok: true, updated_at: t });
  } catch (e) {
    if (e?.code !== 413) console.warn('[homeplan] error', String(e?.message || e).slice(0, 120));
    if (!r.headersSent) json(r, e?.code === 413 ? 413 : 500, { error: e?.code === 413 ? 'Too large (1 MB max).' : 'Server error.' });
  }
  return true;
}
