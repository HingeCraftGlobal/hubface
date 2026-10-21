// userdata-20261019a (Dan approved via Yoda, Oct 19): per-account private data for the HubFace dashboard. Hosted site only.
//   GET /api/account/email-feed   -> 200 the signed-in account's feed (/var/lib/hubface/email-feed/<userId>.json) | 401 | 404 {error:'no feed'}
//   GET /api/account/priorities   -> 200 {ok, exists, items:{cat:[text]}, meta:{"cat|text":{due,star}}, dismissed:[...] , updated} | 401
//   PUT /api/account/priorities   {items, meta, dismissed}  -> 200 {ok, updated} | 400 | 401 | 413 | 429
// Identity = the hf_session cookie resolved by rooms.mjs sessionUser() (accounts.db user id, read-only). No session -> 401, nothing shared.
// The email feed file is written by an outside refresh step (Gmail connector, read-only metadata + snippets); no mail credentials here.
// Rate limits per user id + IP: 120 GETs / min, 40 PUTs / min.
import fs from 'node:fs';
import path from 'node:path';

export const USERDATA_BUILD = 'userdata-20261019a';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface';
const FEED_DIR = path.join(ROOT, 'email-feed'), PRIO_DIR = path.join(ROOT, 'priorities');
const CATS = ['investors', 'product', 'partners', 'team', 'personal'];
const hits = new Map();
function limited(k, max) {
  const now = Date.now(), a = (hits.get(k) || []).filter((t) => now - t < 60e3);
  if (a.length >= max) { hits.set(k, a); return true; }
  a.push(now); hits.set(k, a);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.length || now - v[v.length - 1] > 60e3) hits.delete(kk);
  return false;
}
const T = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function clean(b) {
  const items = {}, meta = {}, src = b && typeof b === 'object' ? b : {};
  for (const c of CATS) {
    const a = Array.isArray(src.items?.[c]) ? src.items[c] : [], seen = new Set(), out = [];
    for (const x of a) { const t = T(x, 120); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); } if (out.length >= 100) break; }
    items[c] = out;
  }
  let n = 0;
  for (const [k, v] of Object.entries(src.meta && typeof src.meta === 'object' ? src.meta : {})) {
    if (n >= 500) break; const kk = T(k, 140), c = kk.split('|')[0]; if (!CATS.includes(c) || !v || typeof v !== 'object') continue;
    const m = {}; if (/^\d\d:\d\d$/.test(String(v.due || ''))) m.due = String(v.due); if (v.star === true) m.star = true;
    if (Object.keys(m).length) { meta[kk] = m; n++; }
  }
  const dismissed = (Array.isArray(src.dismissed) ? src.dismissed : []).map((x) => T(x, 80)).filter(Boolean).slice(-400);
  return { items, meta, dismissed };
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function writeAtomic(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); const tmp = f + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify(o), { mode: 0o600 }); fs.renameSync(tmp, f); }

export function isUserDataPath(p) { return p === '/api/account/email-feed' || p === '/api/account/priorities'; }
// who(q) -> {id} | null ; helpers {readBody, json}
export async function userDataRoute(q, r, p, { who, readBody, json, ip = () => '' }) {
  if (!isUserDataPath(p)) return false;
  const u = who(q), uid = u && Number.isInteger(Number(u.id)) ? Number(u.id) : null;
  if (!uid) { json(r, 401, { error: 'sign in required' }); return true; }
  const rk = uid + '|' + ip(q);
  if (p === '/api/account/email-feed') {
    if (q.method !== 'GET' && q.method !== 'HEAD') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (limited('g|' + rk, 120)) { json(r, 429, { error: 'too many requests' }); return true; }
    const f = readJson(path.join(FEED_DIR, uid + '.json'));
    if (!f) { json(r, 404, { error: 'no feed', note: 'No email feed is connected to this account' }); return true; }
    json(r, 200, f); return true;
  }
  const file = path.join(PRIO_DIR, uid + '.json');
  if (q.method === 'GET' || q.method === 'HEAD') {
    if (limited('g|' + rk, 120)) { json(r, 429, { error: 'too many requests' }); return true; }
    const d = readJson(file);
    json(r, 200, d ? { ok: true, exists: true, ...clean(d), updated: T(d.updated, 40) } : { ok: true, exists: false, ...clean({}), updated: '' }); return true;
  }
  if (q.method === 'PUT') {
    if (limited('p|' + rk, 40)) { json(r, 429, { error: 'too many requests' }); return true; }
    let raw; try { raw = await readBody(q); } catch { json(r, 413, { error: 'too large' }); return true; }
    if (raw.length > 65536) { json(r, 413, { error: 'too large' }); return true; }
    let b; try { b = JSON.parse(raw.toString('utf8') || '{}'); } catch { json(r, 400, { error: 'bad json' }); return true; }
    const d = { ...clean(b), updated: new Date().toISOString() };
    try { writeAtomic(file, d); } catch (e) { console.warn('[userdata] write failed', String(e?.code || e).slice(0, 40)); json(r, 500, { error: 'save failed' }); return true; }
    json(r, 200, { ok: true, updated: d.updated }); return true;
  }
  json(r, 405, { error: 'method not allowed' }); return true;
}
