/* STAGED, INACTIVE (Oct 29 2026). HubFace Admin widget backend: multi-admin email+password gate, owner-only
   admin management, server-side search/sort/pagination, append-only audit. Activate (needs Dan's go + restart):
   in accounts.mjs router add
     if (ep === 'admin/login'    && q.method === 'POST') return adminLogin(q, r, body, { json });
     if (ep === 'admin/logout'   && q.method === 'POST') return adminLogout(q, r, { json });
     if (ep === 'admin/accounts' && q.method === 'GET')  return adminAccounts(q, r, { json });
   Never logs or returns passwords, hashes, session/API tokens, join codes or keys. */
import fs from 'node:fs'; import crypto from 'node:crypto'; import Database from 'better-sqlite3';
const CRED_PATH = '/etc/hubface/admin-widget-cred.json';   // root:hubface 640, not web-served
const AUDIT = '/var/lib/hubface/admin-audit.jsonl';         // append-only (chattr +a)
const TOKEN_MIN = 15;                                       // accounts.mjs TOKEN_MIN: 1 token = 15 room minutes
const TTL = 30 * 60e3, sessions = new Map(), fails = new Map();
const db = new Database('/var/lib/hubface/accounts.db', { readonly: true, fileMustExist: true });

export function loadAdmins() {                              // new {admins:[...]} or legacy single record
  const c = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  if (Array.isArray(c.admins)) return c.admins;
  return [{ ...c, email: c.email || c.email_normalized, role: 'owner' }];
}
const ipOf = (q) => String(q.headers['cf-connecting-ip'] || q.headers['x-forwarded-for'] || q.socket.remoteAddress || '').split(',')[0].trim();
const audit = (o) => { try { fs.appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); } catch {} };
function limited(ip) { const t = Date.now(), f = (fails.get(ip) || []).filter((x) => t - x < 10 * 60e3); fails.set(ip, f); return f.length >= 5; }
const check = (a, pw) => { const want = Buffer.from(a.hash_b64, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(a.salt_b64, 'base64'), want.length, { N: a.N, r: a.r, p: a.p, maxmem: 256 * 1024 * 1024 });
  return crypto.timingSafeEqual(got, want); };

export function adminLogin(q, r, b, { json }) {
  const ip = ipOf(q); if (limited(ip)) { audit({ ev: 'login_locked', ip }); return json(r, 429, { error: 'Too many tries. Wait 10 minutes.' }); }
  const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  const admins = loadAdmins(); const a = admins.find((x) => String(x.email).toLowerCase() === email) || admins[0];
  const ok = check(a, pw) && String(a.email).toLowerCase() === email;   // always runs scrypt (no user-enumeration timing)
  if (!ok) { fails.get(ip).push(Date.now()); audit({ ev: 'login_fail', ip }); return json(r, 401, { error: 'Wrong email or password.' }); }
  fails.delete(ip); const tok = crypto.randomBytes(32).toString('base64url');
  sessions.set(tok, { exp: Date.now() + TTL, email: a.email, role: a.role === 'owner' ? 'owner' : 'admin' });
  audit({ ev: 'login_ok', admin: a.email, ip });
  r.setHeader('Set-Cookie', `hf_admin=${tok}; HttpOnly; Secure; SameSite=Strict; Path=/api/account/admin; Max-Age=1800`);
  return json(r, 200, { ok: true, role: a.role, expiresInMin: 30 });
}
function adminOf(q) { const m = /(?:^|;\s*)hf_admin=([^;]+)/.exec(q.headers.cookie || ''); const s = m && sessions.get(m[1]);
  if (!s || s.exp < Date.now()) { if (m) sessions.delete(m[1]); return null; } return s; }
export function adminLogout(q, r, { json }) { const m = /(?:^|;\s*)hf_admin=([^;]+)/.exec(q.headers.cookie || ''); if (m) sessions.delete(m[1]);
  r.setHeader('Set-Cookie', 'hf_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api/account/admin; Max-Age=0'); return json(r, 200, { ok: true }); }

/* Spoken forms: "dan at hingecraft dash global dot ai" -> "dan@hingecraft-global.ai" */
export function normQuery(s) {
  let t = String(s || '').toLowerCase().trim();
  if (/\b(at|dot|dash|underscore)\b/.test(t)) t = t.replace(/\s*\bat\b\s*/g, '@').replace(/\s*\bdot\b\s*/g, '.').replace(/\s*\bdash\b\s*/g, '-').replace(/\s*\bunderscore\b\s*/g, '_').replace(/\s+/g, '');
  return t.slice(0, 100);
}
const BASE = `SELECT u.id, u.username, u.real_name, u.email, u.role, u.created_at, u.onboarded_at,
  COALESCE(p.plan,'free') plan, p.tokens, COALESCE(p.status,'') status,
  rt.label rt_label, rt.allot_min, rt.used_min, rt.bonus_min, rt.status rt_status,
  (b.user_id IS NOT NULL) is_bot,
  (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at > @now) sessions,
  (SELECT MAX(created_at) FROM sessions s WHERE s.user_id=u.id) last_login,
  (SELECT MAX(last_seen) FROM room_usage r WHERE r.user_id=u.id) last_seen,
  (SELECT COUNT(DISTINCT room_id) FROM room_usage r WHERE r.user_id=u.id) rooms_used,
  (SELECT room_id FROM room_usage r WHERE r.user_id=u.id AND r.ended_at IS NULL ORDER BY id DESC LIMIT 1) live_room,
  (SELECT state||'/'||phase FROM bot_meter m WHERE m.user_id=u.id ORDER BY id DESC LIMIT 1) meter
  FROM users u LEFT JOIN plans p ON p.user_id=u.id LEFT JOIN room_time rt ON rt.user_id=u.id LEFT JOIN bot_accounts b ON b.user_id=u.id`;
const WHERE = `WHERE (@q = '' OR lower(u.username) LIKE @like OR lower(u.email) LIKE @like OR lower(u.real_name) LIKE @like
  OR CAST(u.id AS TEXT) = @q OR lower(COALESCE(p.plan,'free')) LIKE @like OR lower(COALESCE(p.status,'')) LIKE @like
  OR replace(lower(u.username),' ','') LIKE @likens)`;
const RANK = `CASE WHEN @q='' THEN 9 WHEN lower(u.username)=@q OR replace(lower(u.username),' ','')=@qns THEN 0
  WHEN lower(u.username) LIKE @pre OR replace(lower(u.username),' ','') LIKE @prens THEN 1 WHEN lower(u.username) LIKE @like THEN 2
  WHEN lower(u.email)=@q OR lower(u.email) LIKE @pre THEN 3 WHEN lower(u.email) LIKE @like THEN 4
  WHEN lower(u.real_name) LIKE @pre THEN 5 WHEN lower(u.real_name) LIKE @like THEN 6 ELSE 7 END`;
const NAME = `lower(COALESCE(NULLIF(u.username,''), NULLIF(u.real_name,''), u.email))`;   // login name first
const SORTS = { name: NAME, email: 'lower(u.email)', id: 'u.id', created: 'u.created_at', plan: "COALESCE(p.plan,'free')", tokens: 'COALESCE(p.tokens,0)', last_login: 'last_login', last_seen: 'last_seen' };
const SEAT = new Set(['yoda', 'ava', 'finn']);               // current hardcoded seating list (to be replaced by registry)
const shape = (x) => {
  const rtLeft = x.allot_min == null ? null : x.allot_min + (x.bonus_min || 0) - x.used_min;
  return { ...x, is_bot: !!x.is_bot, kind: x.is_bot ? 'bot' : 'person', on_seating_list: SEAT.has(String(x.username || '').toLowerCase()),
    room_min_from_tokens: x.tokens == null ? null : x.tokens * TOKEN_MIN,      // tokens x 15 (TOKEN_MIN)
    room_min_from_room_time: rtLeft,                                           // room_time allot+bonus-used (memberRecord, excl. open-room pending)
    room_min_sources_disagree: x.tokens != null && rtLeft != null && x.tokens * TOKEN_MIN !== rtLeft };
};
export function adminAccounts(q, r, { json }) {
  const a = adminOf(q); if (!a) return json(r, 401, { error: 'Admin sign-in required.' });
  const u = new URL(q.url, 'http://x'); const qs = normQuery(u.searchParams.get('q')); const qns = qs.replace(/\s+/g, '');
  const size = Math.min(200, Math.max(1, +u.searchParams.get('size') || 50)), page = Math.max(1, +u.searchParams.get('page') || 1);
  const sk = SORTS[u.searchParams.get('sort')] ? u.searchParams.get('sort') : 'name', dir = u.searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  const low = u.searchParams.get('low') === '1';             // filter: <= 1 token left
  const P = { q: qs, qns, like: `%${qs}%`, likens: `%${qns}%`, pre: `${qs}%`, prens: `${qns}%`, now: new Date().toISOString() };
  const lowW = low ? ' AND COALESCE(p.tokens,0) <= 1' : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM users u LEFT JOIN plans p ON p.user_id=u.id ${WHERE}${lowW}`).get(P).n;
  const rows = db.prepare(`${BASE} ${WHERE}${lowW} ORDER BY ${RANK}, ${SORTS[sk]} ${dir}, u.id LIMIT ${size} OFFSET ${(page - 1) * size}`).all(P).map(shape);
  const counts = db.prepare(`SELECT COUNT(*) total, SUM(b.user_id IS NOT NULL) bots, SUM(COALESCE(p.plan,'free')<>'free') paid,
    SUM(COALESCE(p.status,'active')='active') active FROM users u LEFT JOIN plans p ON p.user_id=u.id LEFT JOIN bot_accounts b ON b.user_id=u.id`).get();
  audit({ ev: 'lookup', admin: a.email, q: qs, page, ids: rows.map((x) => x.id) });
  return json(r, 200, { ok: true, role: a.role, at: P.now, total, page, size, counts, accounts: rows });
}
