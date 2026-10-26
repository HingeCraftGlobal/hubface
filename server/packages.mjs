// packages-20261025a (Dan approved by voice Oct 25 2026): Packages widget feed, OWNER ONLY.
//   GET /api/account/packages-feed  (owner hf_session, user id in HF_YODA_OWNER_IDS, default 14) -> feed JSON | 401 | 403 | 404
//   GET /api/agent/packages         (Bearer token = /opt/hubface/data/yoda-agent.token) -> same feed, for Yoda/Finn "what's arriving today"
// Feed file /var/lib/hubface/packages-feed/<uid>.json is written by an outside refresh (Gmail connector, read-only). No mail creds here.
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface';
const OWNER_IDS = String(process.env.HF_YODA_OWNER_IDS || '14').split(',').map((s) => s.trim()).filter(Boolean);
const TOKF = '/opt/hubface/data/yoda-agent.token';
const hits = new Map();
function limited(k) { const n = Date.now(), a = (hits.get(k) || []).filter((t) => n - t < 60e3); a.push(n); hits.set(k, a); return a.length > 60; }
const read = (uid) => { try { return JSON.parse(fs.readFileSync(`${ROOT}/packages-feed/${uid}.json`, 'utf8')); } catch { return null; } };
export function isPackagesPath(p) { return p === '/api/account/packages-feed' || p === '/api/agent/packages'; }
export async function packagesRoute(q, r, p, { who, json }) {
  if (!isPackagesPath(p)) return false;
  if (q.method !== 'GET') { json(r, 405, { error: 'method not allowed' }); return true; }
  let uid = null;
  if (p === '/api/agent/packages') {
    let tok = ''; try { tok = fs.readFileSync(TOKF, 'utf8').trim(); } catch {}
    const got = String(q.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const ok = tok && got.length === tok.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(tok));
    if (!ok) { json(r, 401, { error: 'unauthorized' }); return true; }
    uid = OWNER_IDS[0];
  } else {
    const me = who(q); if (!me) { json(r, 401, { error: 'sign in required' }); return true; }
    if (!OWNER_IDS.includes(String(me.id))) { json(r, 403, { error: 'owner only' }); return true; }
    uid = String(me.id);
  }
  if (limited(uid)) { json(r, 429, { error: 'too many requests' }); return true; }
  const f = read(uid); if (!f) { json(r, 404, { error: 'no feed' }); return true; }
  json(r, 200, f); return true;
}
