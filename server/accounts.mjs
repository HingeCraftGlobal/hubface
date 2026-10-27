// HubFace accounts (accounts-20261017-v1). Real server-side accounts for hubface.org, stored on the Hostinger VPS.
//   SQLite at $HUBFACE_DB (default /var/lib/hubface/accounts.db; dir 700, file 600, owned by hubface; outside the web root).
//   POST /api/account/signup  {email,password,dob,terms}   -> 201 {ok, account}   (12+ char password, 18+ from DOB, terms required)
//   POST /api/account/login   {email,password}             -> 200 {ok, account}   (scrypt + timingSafeEqual, per-IP and per-email limits)
//   POST /api/account/logout                               -> 200 {ok}
//   GET  /api/account/me                                   -> 200 {authenticated, account?}  (never returns the hash)
//   POST /api/stripe/webhook   Stripe events; signature verified with STRIPE_WEBHOOK_SECRET (env). Without the secret it refuses (503).
// Sessions: random 32-byte token in an HttpOnly; Secure; SameSite=Lax cookie; only its SHA-256 is stored. CSRF: POSTs to
// /api/account/* must carry Origin (or Referer) https://hubface.org. No email is ever sent from here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const ACCOUNTS_BUILD = 'accounts-20261018-memberauth-v6';   // v6: $6 tokens (one constant), token packs via Stripe TEST checkout, purchased tokens carry over   // v5: upfront tokens per 15-min block, overage settled every 5 s   // v4: tokens (15 min), min 1 token, 15-min overage blocks   // v3: overage blocks ledger; v2: room-time minutes ledger, 30-min minimum debit   // memberauth: role + HingeHub room bridge
// prev: 'accounts-20261017-v3';   // v3: webhook plan detection ignores tax/discounts   // v2: required username (unique, case-insensitive) + optional real name
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const COOKIE = 'hf_session';
const SESSION_DAYS = 30;
export const PLAN_TOKENS = { free: 20, starter: 20, builder: 91, executive: 560 };
const PLAN_BY_CENTS = { 500: 'starter', 2000: 'builder', 10000: 'executive' };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/* ---------------- store ---------------- */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
const oldMask = process.umask(0o077);
const db = new Database(DB_PATH);
process.umask(oldMask);
try { fs.chmodSync(DB_PATH, 0o600); } catch {}
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT COLLATE NOCASE,
  real_name TEXT,
  password_hash TEXT NOT NULL,
  dob TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','builder','executive')),
  tokens INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_customer ON plans(stripe_customer_id);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, user_id INTEGER, received_at TEXT NOT NULL, result TEXT
);`);
{ const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);   // v1 -> v2 migration
  if (!cols.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE');
  if (!cols.includes('real_name')) db.exec('ALTER TABLE users ADD COLUMN real_name TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE) WHERE username IS NOT NULL'); }
/* memberauth-20261018-v1 (Dan approved): role column + HingeHub room bridge tables (one-time passes, room sessions; only SHA-256 hashes stored) */
{ const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'"); }
/* noonboard-20261019a (Dan): per-account onboarded record. Any signed-in account is onboarded; Finn/Ava walkthroughs are for guests only. */
{ const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('onboarded_at')) db.exec('ALTER TABLE users ADD COLUMN onboarded_at TEXT'); }
db.exec(`
CREATE TABLE IF NOT EXISTS room_passes (
  code_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, state_hash TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS room_sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS room_sessions_user ON room_sessions(user_id);
CREATE TABLE IF NOT EXISTS room_time (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL, allot_min INTEGER NOT NULL, used_min INTEGER NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  renew TEXT NOT NULL CHECK (renew IN ('monthly-grant','stripe')), status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS room_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, room_id TEXT NOT NULL,
  started_at TEXT NOT NULL, last_seen TEXT NOT NULL, ended_at TEXT, actual_sec INTEGER, billed_min INTEGER, status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS room_usage_user ON room_usage(user_id, status);
CREATE TABLE IF NOT EXISTS room_overage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL,
  period_start TEXT NOT NULL, block_no INTEGER NOT NULL, block_min INTEGER NOT NULL, usage_id INTEGER, room_id TEXT,
  created_at TEXT NOT NULL, amount_cents INTEGER, currency TEXT, status TEXT NOT NULL, stripe_ref TEXT,
  UNIQUE (user_id, period_start, block_no)
);`);
{ const c = db.prepare('PRAGMA table_info(room_time)').all().map((x) => x.name); if (!c.includes('bonus_min')) db.exec('ALTER TABLE room_time ADD COLUMN bonus_min INTEGER NOT NULL DEFAULT 0'); }   // v6: purchased tokens (carry over)
db.exec('CREATE TABLE IF NOT EXISTS token_spends (k TEXT PRIMARY KEY, user_id INTEGER NOT NULL, n INTEGER NOT NULL, created_at TEXT NOT NULL)');   // tokenspend-20261021a: one row per session start / added block (idempotency)
const now = () => new Date().toISOString();
const Q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insUser: db.prepare('INSERT INTO users (email, username, real_name, password_hash, dob, terms_accepted_at, created_at) VALUES (?,?,?,?,?,?,?)'),
  userByUsername: db.prepare('SELECT id FROM users WHERE username = ?'),
  insPlan: db.prepare("INSERT INTO plans (user_id, plan, tokens, status, updated_at) VALUES (?, 'free', ?, 'active', ?)"),
  plan: db.prepare('SELECT * FROM plans WHERE user_id = ?'),
  planByCustomer: db.prepare('SELECT * FROM plans WHERE stripe_customer_id = ?'),
  setPlan: db.prepare('UPDATE plans SET plan = ?, tokens = ?, status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ? WHERE user_id = ?'),
  insSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)'),
  session: db.prepare('SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token_hash = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  evSeen: db.prepare('SELECT 1 FROM stripe_events WHERE id = ?'),
  insEv: db.prepare('INSERT OR IGNORE INTO stripe_events (id, type, user_id, received_at, result) VALUES (?,?,?,?,?)'),
  insPass: db.prepare('INSERT INTO room_passes (code_hash, user_id, state_hash, expires_at) VALUES (?,?,?,?)'),
  getPass: db.prepare('SELECT * FROM room_passes WHERE code_hash = ?'),
  delPass: db.prepare('DELETE FROM room_passes WHERE code_hash = ?'),
  insRoomSes: db.prepare('INSERT INTO room_sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)'),
  roomSes: db.prepare('SELECT user_id, expires_at FROM room_sessions WHERE token_hash = ?'),
  delRoomSes: db.prepare('DELETE FROM room_sessions WHERE token_hash = ?'),
  delRoomSesUser: db.prepare('DELETE FROM room_sessions WHERE user_id = ?'),
  purgeRoom: db.prepare('DELETE FROM room_sessions WHERE expires_at < ?'),
  purgePass: db.prepare('DELETE FROM room_passes WHERE expires_at < ?'),
  rt: db.prepare('SELECT * FROM room_time WHERE user_id = ?'),
  rtRoll: db.prepare('UPDATE room_time SET used_min = 0, bonus_min = ?, period_start = ?, period_end = ?, updated_at = ? WHERE user_id = ?'),
  rtBonus: db.prepare('UPDATE room_time SET bonus_min = bonus_min + ?, updated_at = ? WHERE user_id = ?'),
  rtInsPack: db.prepare("INSERT INTO room_time (user_id, label, allot_min, used_min, bonus_min, period_start, period_end, renew, status, source, updated_at) VALUES (?, 'token packs', 0, 0, ?, ?, ?, 'stripe', 'active', ?, ?)"),
  rtExpire: db.prepare("UPDATE room_time SET status = 'expired', updated_at = ? WHERE user_id = ?"),
  rtUse: db.prepare('UPDATE room_time SET used_min = used_min + ?, updated_at = ? WHERE user_id = ?'),
  rtUpsert: db.prepare(`INSERT INTO room_time (user_id, label, allot_min, used_min, period_start, period_end, renew, status, source, updated_at) VALUES (?,?,?,0,?,?,?,'active',?,?)
    ON CONFLICT(user_id) DO UPDATE SET label=excluded.label, allot_min=excluded.allot_min, used_min=0, period_start=excluded.period_start, period_end=excluded.period_end, renew=excluded.renew, status='active', source=excluded.source, updated_at=excluded.updated_at`),
  rtCancel: db.prepare("UPDATE room_time SET status = 'canceled', updated_at = ? WHERE user_id = ? AND renew = 'stripe'"),
  uOpen: db.prepare("SELECT * FROM room_usage WHERE user_id = ? AND status = 'open' ORDER BY id"),
  uOpenRoom: db.prepare("SELECT * FROM room_usage WHERE user_id = ? AND room_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1"),
  uRecent: db.prepare("SELECT * FROM room_usage WHERE user_id = ? AND room_id = ? AND status = 'closed' AND ended_at >= ? ORDER BY id DESC LIMIT 1"),
  uIns: db.prepare("INSERT INTO room_usage (user_id, room_id, started_at, last_seen, status) VALUES (?,?,?,?,'open')"),
  uSeen: db.prepare('UPDATE room_usage SET last_seen = ? WHERE id = ?'),
  uClose: db.prepare("UPDATE room_usage SET status = 'closed', ended_at = ?, actual_sec = ?, billed_min = ? WHERE id = ?"),
  uReopen: db.prepare("UPDATE room_usage SET status = 'open', ended_at = NULL, actual_sec = NULL, billed_min = NULL, last_seen = ? WHERE id = ?"),
  uStale: db.prepare("SELECT * FROM room_usage WHERE status = 'open' AND last_seen < ?"),
  ovCount: db.prepare('SELECT COUNT(*) n FROM room_overage WHERE user_id = ? AND period_start = ?'),
  ovIns: db.prepare('INSERT OR IGNORE INTO room_overage (user_id, email, period_start, block_no, block_min, usage_id, room_id, created_at, amount_cents, currency, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
  ovList: db.prepare('SELECT block_no, block_min, room_id, usage_id, created_at, amount_cents, currency, status FROM room_overage WHERE user_id = ? AND period_start = ? ORDER BY block_no'),
};
const createUser = db.transaction((email, username, realName, hash, dob) => {
  const t = now(); const info = Q.insUser.run(email, username, realName, hash, dob, t, t); Q.insPlan.run(info.lastInsertRowid, PLAN_TOKENS.free, t); return info.lastInsertRowid;
});
setInterval(() => { try { Q.purge.run(now()); Q.purgeRoom.run(now()); Q.purgePass.run(now()); } catch {} }, 3600e3).unref();

/* ---------------- passwords (scrypt) ---------------- */
const SC = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const scrypt = (pw, salt, len, o) => new Promise((res, rej) => crypto.scrypt(pw, salt, len, o, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16); const k = await scrypt(pw.normalize('NFKC'), salt, 32, SC);
  return `scrypt$${SC.N}$${SC.r}$${SC.p}$${salt.toString('base64')}$${k.toString('base64')}`;
}
let DUMMY = null;
async function verifyPassword(pw, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') { DUMMY = DUMMY || await hashPassword('dummy-password-for-timing'); return verifyPassword(pw, DUMMY).then(() => false); }
  const [, N, r, p, salt, h] = parts; const want = Buffer.from(h, 'base64');
  const got = await scrypt(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p, maxmem: SC.maxmem });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* ---------------- helpers ---------------- */
const json = (r, code, o, headers = {}) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); r.end(JSON.stringify(o)); };
const readBody = (q, max = 64 * 1024) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > max) { rej(Object.assign(new Error('too large'), { code: 413 })); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
function clientIp(q) {
  const cf = String(q.headers['cf-connecting-ip'] || '').trim(); if (cf) return cf.slice(0, 64);
  const xf = String(q.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || String(q.socket.remoteAddress || '')).slice(0, 64);
}
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sessionCookie = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
function sameOrigin(q) {
  const o = q.headers.origin; if (o) return o === ORIGIN;
  const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/');
}
function ageFrom(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ''); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3]; const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const n = new Date(); let age = n.getUTCFullYear() - y; if (n.getUTCMonth() + 1 < mo || (n.getUTCMonth() + 1 === mo && n.getUTCDate() < d)) age--; return age;
}
/* usernames: 2-24 chars, letters/numbers/spaces/_-. ; no impersonation of the assistants, Dan or staff */
const RESERVED = new Set(['ava', 'avadan', 'fin', 'finn', 'yoda', 'dan', 'dandiotte', 'diotte', 'danieldiotte', 'admin', 'administrator', 'root', 'system', 'support', 'staff',
  'moderator', 'mod', 'owner', 'hubface', 'hingecraft', 'hingehub', 'hingecraftglobal', 'grok', 'brain', 'official', 'security', 'billing', 'finance']);
export function cleanUsername(v) { return String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
export function usernameProblem(u) {
  if (!u) return 'Choose a username.';
  if (u.length < 2 || u.length > 24) return 'Username must be 2 to 24 characters.';
  if (!/^[A-Za-z0-9 _.-]+$/.test(u) || !/[A-Za-z0-9]/.test(u)) return 'Use letters, numbers, spaces, _ - or . only.';
  const leet = u.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  const plain = u.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');
  const bad = (n) => RESERVED.has(n) || /admin|dandiotte|yoda|hingecraft|hubface|moderator/.test(n);
  if (bad(plain) || bad(leet) || bad(leet.replace(/^(the|real|official|iam|im)+/, '').replace(/(official|real|ai|bot|here)+$/, ''))) return 'That username is reserved. Please pick another.';
  return null;
}
function cleanRealName(v) { return String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>{}\[\]"`\\]/g, '').replace(/\s+/g, ' ').trim(); }
export const safeName = (u) => cleanUsername(u).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 24);
export function sessionUsername(q) { try { const id = currentUser(q); const u = id ? Q.userById.get(id) : null; return u && u.username ? safeName(u.username) : null; } catch { return null; } }
function publicAccount(userId) {
  const u = Q.userById.get(userId); if (!u) return null; const p = Q.plan.get(userId) || {};
  return { id: u.id, email: u.email, username: u.username || null, real_name: u.real_name || null, plan: p.plan || 'free', tokens: p.tokens ?? 0, status: p.status || 'active', created_at: u.created_at };
}
function currentUser(q) {
  const tok = cookies(q)[COOKIE]; if (!tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const s = Q.session.get(sha(tok)); if (!s) return null;
  if (s.expires_at < now()) { Q.delSession.run(sha(tok)); return null; }
  return s.user_id;
}
function startSession(q, userId) {
  const tok = crypto.randomBytes(32).toString('base64url'); const t = Date.now();
  Q.insSession.run(sha(tok), userId, new Date(t).toISOString(), new Date(t + SESSION_DAYS * 864e5).toISOString(), clientIp(q), String(q.headers['user-agent'] || '').slice(0, 200));
  return sessionCookie(tok, SESSION_DAYS * 86400);
}

/* ---------------- rate limits (in memory) ---------------- */
const buckets = new Map();
function hit(key, limit, windowMs) {
  const t = Date.now(); const a = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  if (a.length >= limit) { buckets.set(key, a); return false; } a.push(t); buckets.set(key, a); return true;
}
function count(key, windowMs) { const t = Date.now(); return (buckets.get(key) || []).filter((x) => t - x < windowMs).length; }
setInterval(() => { const t = Date.now(); for (const [k, a] of buckets) if (!a.some((x) => t - x < 3600e3)) buckets.delete(k); }, 600e3).unref();
const LOGIN_IP = { n: 20, ms: 15 * 60e3 }, LOGIN_EMAIL_FAIL = { n: 5, ms: 15 * 60e3 }, SIGNUP_IP = { n: 10, ms: 60 * 60e3 };

/* ---------------- handlers ---------------- */
async function body(q) { const b = await readBody(q); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { return null; } }
async function signup(q, r) {
  if (!hit('su:' + clientIp(q), SIGNUP_IP.n, SIGNUP_IP.ms)) return json(r, 429, { error: 'Too many sign-ups from this network. Try again later.' });
  const b = await body(q); if (!b) return json(r, 400, { error: 'Bad request.' });
  const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || ''), dob = String(b.dob || '').trim();
  const username = cleanUsername(b.username), realName = cleanRealName(b.real_name);
  const errors = {};
  const up = usernameProblem(username); if (up) errors.username = up;
  if (realName.length > 60) errors.real_name = 'Real name must be 60 characters or fewer.';
  else if (realName && !/^[\p{L}\p{M} .'-]+$/u.test(realName)) errors.real_name = 'Use letters, spaces, apostrophes, dots or hyphens only.';
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  if (pw.length < 12) errors.password = 'Password must be at least 12 characters.';
  else if (pw.length > 256) errors.password = 'Password is too long (256 characters max).';
  const age = ageFrom(dob);
  if (age === null) errors.dob = 'Enter your date of birth.';
  else if (age < 0 || age > 120) errors.dob = 'Check your date of birth.';
  else if (age < 18) errors.dob = 'You must be 18 or older to create an account.';
  if (b.terms !== true) errors.age18 = 'Please confirm you\u2019re 18+ and accept the Terms.';
  if (Object.keys(errors).length) return json(r, 400, { error: Object.values(errors)[0], errors });
  if (Q.userByUsername.get(username)) return json(r, 409, { error: 'That username is taken. Please pick another.', errors: { username: 'That username is taken. Please pick another.' } });
  if (Q.userByEmail.get(email)) return json(r, 409, { error: 'An account with this email already exists. Sign in instead.', errors: { email: 'An account with this email already exists.' } });
  const hash = await hashPassword(pw);
  let id; try { id = createUser(email, username, realName || null, hash, dob); } catch (e) {
    if (String(e.message).includes('users.username') || String(e.message).includes('users_username')) return json(r, 409, { error: 'That username is taken. Please pick another.', errors: { username: 'That username is taken. Please pick another.' } });
    if (String(e.message).includes('UNIQUE')) return json(r, 409, { error: 'An account with this email already exists. Sign in instead.', errors: { email: 'An account with this email already exists.' } }); throw e; }
  console.log(`[accounts] signup user ${id}`);
  return json(r, 201, { ok: true, account: publicAccount(id) }, { 'Set-Cookie': startSession(q, id) });
}
async function login(q, r) {
  const ip = clientIp(q);
  if (!hit('li:' + ip, LOGIN_IP.n, LOGIN_IP.ms)) return json(r, 429, { error: 'Too many sign-in attempts. Wait a few minutes and try again.' });
  const b = await body(q); if (!b) return json(r, 400, { error: 'Bad request.' });
  const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (!EMAIL_RE.test(email) || !pw || pw.length > 256) return json(r, 400, { error: 'Enter your email and password.' });
  const ek = 'lf:' + sha(email);
  if (count(ek, LOGIN_EMAIL_FAIL.ms) >= LOGIN_EMAIL_FAIL.n) return json(r, 429, { error: 'Too many failed attempts for this account. Wait 15 minutes and try again.' });
  const u = Q.userByEmail.get(email);
  const ok = await verifyPassword(pw, u ? u.password_hash : null);   // same scrypt cost whether or not the email exists
  if (!u || !ok) { hit(ek, 1e9, LOGIN_EMAIL_FAIL.ms); return json(r, 401, { error: 'Incorrect email or password.' }); }
  buckets.delete(ek);
  return json(r, 200, { ok: true, account: publicAccount(u.id) }, { 'Set-Cookie': startSession(q, u.id) });
}
function logout(q, r) {
  const tok = cookies(q)[COOKIE]; if (tok) { const ss = Q.session.get(sha(tok)); if (ss) Q.delRoomSesUser.run(ss.user_id); Q.delSession.run(sha(tok)); }   // memberauth: signing out of HubFace also signs out of the rooms
  return json(r, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}
function me(q, r) {
  const id = currentUser(q); const a = id ? publicAccount(id) : null;
  if (a) { try { db.prepare('UPDATE users SET onboarded_at = ? WHERE id = ? AND onboarded_at IS NULL').run(new Date().toISOString(), id); } catch (_) {} a.onboarded = true; }   // noonboard-20261019a
  return json(r, 200, a ? { authenticated: true, onboarded: true, account: a } : { authenticated: false, onboarded: false });
}

/* ---------------- Stripe webhook (no keys yet) ---------------- */
function verifyStripe(raw, header, secret, toleranceSec = 300) {
  const parts = Object.create(null); const v1 = [];
  for (const kv of String(header || '').split(',')) { const i = kv.indexOf('='); if (i < 0) continue; const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); if (k === 'v1') v1.push(v); else parts[k] = v; }
  const t = Number(parts.t); if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const exp = crypto.createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  return v1.some((s) => { const b = Buffer.from(s, 'hex'); return b.length === exp.length && crypto.timingSafeEqual(b, exp); });
}
/* Plan detection, robust to tax and discounts (v3):
   checkout.session.completed: metadata.plan -> amount_subtotal (pre-tax, pre-discount) -> amount_total
   invoice.paid:               metadata.plan -> lines.data[0].price.unit_amount (or newer API pricing.unit_amount_decimal) -> subtotal -> amount_paid
   Each candidate is tried in order; the first one that maps to a paid plan (500/2000/10000 cents) wins. */
function planFromMeta(...metas) {
  for (const md of metas) { const m = String(md?.plan || '').trim().toLowerCase(); if (PLAN_TOKENS[m] && m !== 'free') return m; }
  return null;
}
function planFromCents(...cands) {
  for (const c of cands) { if (c === null || c === undefined || c === '') continue; const n = Math.round(Number(c)); if (Number.isFinite(n) && PLAN_BY_CENTS[n]) return PLAN_BY_CENTS[n]; }
  return null;
}
function planFrom(obj, type) {
  if (type === 'invoice.paid') {
    const line = obj?.lines?.data?.[0];
    return planFromMeta(obj?.metadata, obj?.subscription_details?.metadata, obj?.parent?.subscription_details?.metadata, line?.metadata)
      || planFromCents(line?.price?.unit_amount, line?.pricing?.unit_amount_decimal, obj?.subtotal, obj?.amount_paid);
  }
  return planFromMeta(obj?.metadata) || planFromCents(obj?.amount_subtotal, obj?.amount_total);
}
function findUser(obj) {
  const ref = Number(obj?.client_reference_id); if (ref && Q.userById.get(ref)) return ref;
  if (obj?.customer) { const p = Q.planByCustomer.get(String(obj.customer)); if (p) return p.user_id; }
  const em = String(obj?.customer_details?.email || obj?.customer_email || obj?.receipt_email || '').trim().toLowerCase();
  if (em) { const u = Q.userByEmail.get(em); if (u) return u.id; }
  return null;
}
async function stripeWebhook(q, r) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const raw = await readBody(q, 512 * 1024);
  if (!secret) return json(r, 503, { error: 'webhook not configured' });
  if (!verifyStripe(raw, q.headers['stripe-signature'], secret)) return json(r, 400, { error: 'bad signature' });
  let ev; try { ev = JSON.parse(raw.toString('utf8')); } catch { return json(r, 400, { error: 'bad json' }); }
  if (!ev?.id || Q.evSeen.get(ev.id)) return json(r, 200, { received: true, duplicate: !!ev?.id });
  const obj = ev.data?.object || {}; const uid = findUser(obj); let result = 'ignored';
  if (ev.type === 'checkout.session.completed' && obj?.metadata?.kind === 'room_token_pack') {   // v6: room tokens bought at TOKEN_PRICE_CENTS each
    const qty = Math.round(Number(obj.metadata.room_tokens));
    if (ev.livemode !== false) result = 'refused: live mode (test mode only)';
    else if (obj.payment_status !== 'paid') result = 'token pack not paid';
    else if (!uid) result = 'no matching user';
    else if (!(qty > 0 && qty <= 1000)) result = 'bad quantity';
    else { const t = now(); if (Q.rt.get(uid)) Q.rtBonus.run(qty * 15, t, uid); else { const en = new Date(); en.setUTCFullYear(en.getUTCFullYear() + 1); Q.rtInsPack.run(uid, qty * 15, t, en.toISOString(), 'stripe test token pack ' + String(ev.id).slice(0, 40), t); } result = 'room tokens +' + qty; }
    Q.insEv.run(String(ev.id).slice(0, 100), String(ev.type).slice(0, 80), uid, now(), result);
    console.log(`[accounts] stripe ${ev.type} -> ${result}`);
    return json(r, 200, { received: true });
  }
  const cur = uid ? Q.plan.get(uid) : null;
  if (uid && cur) {
    if (ev.type === 'checkout.session.completed') {
      const plan = planFrom(obj, ev.type) || cur.plan;
      Q.setPlan.run(plan, PLAN_TOKENS[plan], 'active', obj.customer ? String(obj.customer) : null, obj.subscription ? String(obj.subscription) : null, now(), uid); result = 'plan:' + plan; { const rm = roomMinutesFrom(obj); if (rm) { const st = new Date(); Q.rtUpsert.run(uid, rm.label, rm.min, st.toISOString(), addMonth(st).toISOString(), 'stripe', 'stripe test webhook ' + ev.type + ' ' + String(ev.id).slice(0, 40), now()); result += ' room:' + rm.min + 'min'; } }
    } else if (ev.type === 'invoice.paid') {
      const plan = planFrom(obj, ev.type) || cur.plan;   // each paid invoice refreshes the plan's monthly tokens
      Q.setPlan.run(plan, PLAN_TOKENS[plan], 'active', obj.customer ? String(obj.customer) : null, obj.subscription ? String(obj.subscription) : null, now(), uid); result = 'refresh:' + plan; { const rm = roomMinutesFrom(obj); if (rm) { const st = new Date(); Q.rtUpsert.run(uid, rm.label, rm.min, st.toISOString(), addMonth(st).toISOString(), 'stripe', 'stripe test webhook ' + ev.type + ' ' + String(ev.id).slice(0, 40), now()); result += ' room:' + rm.min + 'min'; } }
    } else if (ev.type === 'customer.subscription.deleted') {
      Q.setPlan.run('free', cur.tokens, 'canceled', null, null, now(), uid); result = 'canceled'; Q.rtCancel.run(now(), uid);
    }
  } else if (['checkout.session.completed', 'invoice.paid', 'customer.subscription.deleted'].includes(ev.type)) result = 'no matching user';
  Q.insEv.run(String(ev.id).slice(0, 100), String(ev.type).slice(0, 80), uid, now(), result);
  console.log(`[accounts] stripe ${ev.type} -> ${result}`);
  // Payment notifications: Stripe's own emails are set in the Stripe dashboard (finance@hingecraft-global.ai). Nothing is emailed from here.
  return json(r, 200, { received: true });
}

/* ---------------- HingeHub room member bridge (memberauth-20261018-v1) ----------------
   rooms.hubface.org/api/member/login sets a short state cookie on rooms.hubface.org and sends the browser to
   GET hubface.org/api/account/room-pass?state=..&next=..  -> signed in: one-time 60 s code (hash stored, bound to the state) ->
   302 rooms.hubface.org/api/member/handoff?code&state&next.  Not signed in: 302 handoff?none=1 (room drops any old member cookie).
   HingeHub's server redeems the code server-to-server on 127.0.0.1:3471 (never proxied by nginx) for a 30-day room session token,
   and looks the member record up with that token on every /api/member/me. Names/emails/plans come only from this DB. */
const ROOM_ORIGIN = process.env.HINGEHUB_ORIGIN || 'https://rooms.hubface.org';
function safeNext(v) { const s = String(v || '/'); return s.length < 300 && /^\/(?!\/)[A-Za-z0-9\-._~\/?=&%:+]*$/.test(s) ? s : '/'; }
/* Room time (memberauth-20261018-v2, Dan's rules): balance in MINUTES per period, kept only here.
   Each room session a member hosts is timed by the server (start / heartbeat / end arrive at HingeHub's server and are stamped
   with THIS server's clock). Debit = whole 15-min tokens charged upfront at the start of each block (floor(sec/900)+1), minimum 1 token. Low (red) = 1 token (15 min) or less left. */
export const TOKEN_MIN = 15, MIN_BILL_MIN = 15, LOW_MIN = 15, STALE_MS = 3 * 60e3, REOPEN_MS = 3 * 60e3;   // v4 (Dan): 1 token = 15 min; min 1 token; red at <= 1 token left
const addMonth = (d) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + 1); return x; };
const billOf = (sec) => TOKEN_MIN * (Math.floor(Math.max(0, sec) / (TOKEN_MIN * 60)) + 1);   // v5: each token is charged UPFRONT at the start of its 15-min block (0:00, 15:00, 30:00 ...); minimum 1
function roomTime(uid) {
  let rt = Q.rt.get(uid); if (!rt) return null;
  if (rt.status === 'active' && rt.period_end < now()) {
    if (rt.renew === 'monthly-grant') { let st = new Date(rt.period_end), en = addMonth(st); while (en.toISOString() < now()) { st = en; en = addMonth(st); } Q.rtRoll.run(Math.max(0, Math.min(rt.bonus_min || 0, rt.allot_min + (rt.bonus_min || 0) - rt.used_min)), st.toISOString(), en.toISOString(), now(), uid); }   // unused purchased tokens carry over
    else Q.rtExpire.run(now(), uid);   // Stripe periods renew only through a verified invoice.paid
    rt = Q.rt.get(uid);
  }
  return rt;
}
export function memberRecord(uid) {
  const u = Q.userById.get(uid); if (!u) return null;
  const p = Q.plan.get(uid) || null; const rt = roomTime(uid);
  const t = Date.now(); const open = Q.uOpen.all(uid).map((x) => { const sec = Math.round((t - Date.parse(x.started_at)) / 1000); return { roomId: x.room_id, startedAt: x.started_at, elapsedMin: Math.floor(sec / 60), billedSoFar: billOf(sec) }; });
  const pending = open.reduce((a, x) => a + x.billedSoFar, 0);
  const bonus = rt ? (rt.bonus_min || 0) : 0, allotment = rt ? rt.allot_min + bonus : 0, used = rt ? rt.used_min : 0, remaining = allotment - used - pending;   // goes negative = overage (v3)
  const status = rt ? rt.status : 'none';
  const active = !!rt && status === 'active' && remaining > 0;
  const low = active && remaining <= LOW_MIN;
  const state = !rt ? 'none' : status !== 'active' ? 'canceled' : remaining < 0 ? 'overage' : remaining === 0 ? 'used_up' : low ? 'low' : 'active';
  const overage = rt ? Q.ovList.all(uid, rt.period_start) : [];
  return {
    id: u.id, email: u.email, username: u.username || null, realName: u.real_name || null,
    displayName: u.real_name || u.username || u.email, role: u.role === 'owner' ? 'owner' : 'member', verified: true, memberSince: u.created_at,
    subscription: { plan: rt ? rt.label : (p ? p.plan : 'none'), status, state, active, low, renewNeeded: !active || low, remaining, allotment, used, pending, unit: 'minutes',
      subscriptionMin: rt ? rt.allot_min : 0, purchasedMin: bonus, tokenPriceCents: TOKEN_PRICE_CENTS, subscriptionRef: { priceCents: 9900, tokens: 28, minutes: 420 }, minBillMin: MIN_BILL_MIN, lowBelowMin: LOW_MIN, tokenMin: TOKEN_MIN, remainingTokens: Math.floor(remaining / TOKEN_MIN), allotmentTokens: Math.floor(allotment / TOKEN_MIN), usedTokens: Math.round((used + pending) / TOKEN_MIN), overdueTokens: remaining < 0 ? Math.ceil(-remaining / TOKEN_MIN) : 0, overageBlockMin: OVERAGE_BLOCK_MIN, overageBlocks: overage, overagePriceCents: OVERAGE_PRICE_CENTS, periodStart: rt ? rt.period_start : null, periodEnd: rt ? rt.period_end : null, renew: rt ? rt.renew : null, openSessions: open,
      stripeCustomer: !!(p && p.stripe_customer_id), stripeSubscription: !!(p && p.stripe_subscription_id), hubfacePlan: p ? { plan: p.plan, tokens: p.tokens, status: p.status } : null,
      updatedAt: rt ? rt.updated_at : null, source: rt ? rt.source : 'no room-time record' },
  };
}
const closeUsage = (row, endIso) => {   // server clock only; debit = ceil(actual/15 min) tokens, min 1
  const sec = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(row.started_at)) / 1000)); const billed = billOf(sec);
  Q.uClose.run(endIso, sec, billed, row.id); if (Q.rt.get(row.user_id)) Q.rtUse.run(billed, now(), row.user_id);
  console.log(`[accounts] room usage ${row.id} user ${row.user_id} room ${row.room_id}: ${sec}s -> billed ${billed} min`); return { sec, billed };
};
/* Overage (v3): past zero the balance keeps counting down. Every started 15-min block (1 token) below zero is one ledger row
   (UNIQUE user+period+block, INSERT OR IGNORE -> reconnects, restarts and repeated heartbeats never add a second row for a block).
   Price: OVERAGE_BLOCK_PRICE_CENTS in the service environment if Dan sets one; none is configured, so amount stays NULL and the
   row is 'pending (no price configured)'. Nothing is charged from here; no Stripe call is made. */
const OVERAGE_BLOCK_MIN = 15;   // v4: one back-charged token per started 15-min block past zero
/** ONE price constant (Dan, Oct 18): a token bought outside the subscription, and each overage token, costs US$6.00 (15 min; $24/h). */
export const TOKEN_PRICE_CENTS = 600;
const OVERAGE_PRICE_CENTS = TOKEN_PRICE_CENTS;
const settleOverage = db.transaction((uid, usageRow) => {
  const rt = roomTime(uid); if (!rt || rt.status !== 'active') return 0;
  const t = Date.now(); const pending = Q.uOpen.all(uid).reduce((a, x) => a + billOf((t - Date.parse(x.started_at)) / 1000), 0);
  const balance = rt.allot_min + (rt.bonus_min || 0) - rt.used_min - pending; if (balance >= 0) return 0;
  const need = Math.ceil(-balance / OVERAGE_BLOCK_MIN); const have = Q.ovCount.get(uid, rt.period_start).n; let added = 0;
  const email = (Q.userById.get(uid) || {}).email || '';
  for (let b = have + 1; b <= need; b++) {
    const info = Q.ovIns.run(uid, email, rt.period_start, b, OVERAGE_BLOCK_MIN, usageRow ? usageRow.id : null, usageRow ? usageRow.room_id : null, now(), OVERAGE_PRICE_CENTS, OVERAGE_PRICE_CENTS ? 'usd' : null, 'pending (recorded, not charged: no saved Stripe test customer/payment method)');
    if (info.changes) { added++; console.log(`[accounts] overage block ${b} user ${uid} room ${usageRow ? usageRow.room_id : '?'} (${OVERAGE_PRICE_CENTS ? OVERAGE_PRICE_CENTS + ' cents' : 'no price'})`); }
  }
  return added;
});
const usageStart = db.transaction((uid, roomId) => {
  const open = Q.uOpenRoom.get(uid, roomId); if (open) { Q.uSeen.run(now(), open.id); return { id: open.id, resumed: 'open' }; }
  const recent = Q.uRecent.get(uid, roomId, new Date(Date.now() - REOPEN_MS).toISOString());   // refresh / caucus hop: same session, no second minimum
  if (recent) { if (Q.rt.get(uid) && recent.billed_min) Q.rtUse.run(-recent.billed_min, now(), uid); Q.uReopen.run(now(), recent.id); return { id: recent.id, resumed: 'reopened' }; }
  const t = now(); const info = Q.uIns.run(uid, roomId, t, t); return { id: Number(info.lastInsertRowid), resumed: false };
});
const usageEnd = db.transaction((uid, roomId) => { const open = Q.uOpenRoom.get(uid, roomId); return open ? closeUsage(open, now()) : null; });
const sweepUsage = db.transaction(() => { for (const row of Q.uStale.all(new Date(Date.now() - STALE_MS).toISOString())) { closeUsage(row, row.last_seen); settleOverage(row.user_id, row); } });   // tab closed: ends at the last heartbeat
const uOpenAll = db.prepare("SELECT * FROM room_usage WHERE status = 'open'");
// v5: every 5 s settle open sessions, so an overage token is recorded within 5 s of the balance crossing 0:00 / -15:00 / -30:00 ... (server clock)
setInterval(() => { try { sweepUsage(); for (const row of uOpenAll.all()) settleOverage(row.user_id, row); } catch (e) { console.warn('[accounts] sweep', String(e?.message || e).slice(0, 80)); } }, 5e3).unref();
/** Stripe (test mode) -> room minutes: Checkout/Price metadata room_minutes, or a HingeHub plan id in metadata.plan. */
const HH_PLAN_MIN = { founder: 420, investor: 2220, firm: 7200 };   // minutes (founder 7 h = 28 tokens); metadata.room_tokens also accepted
function roomMinutesFrom(obj) {
  const line = obj?.lines?.data?.[0];
  for (const md of [obj?.metadata, obj?.subscription_details?.metadata, obj?.parent?.subscription_details?.metadata, line?.metadata, line?.price?.metadata]) {
    const tk = Math.round(Number(md?.room_tokens)); if (Number.isFinite(tk) && tk > 0 && tk <= 10000) return { min: tk * 15, label: String(md?.plan || 'subscription').slice(0, 40) };
    const n = Math.round(Number(md?.room_minutes)); if (Number.isFinite(n) && n > 0 && n <= 100000) return { min: n, label: String(md?.plan || 'subscription').slice(0, 40) };
    const pl = String(md?.plan || '').trim().toLowerCase(); if (HH_PLAN_MIN[pl]) return { min: HH_PLAN_MIN[pl], label: pl };
  }
  return null;
}
function roomPass(q, r) {
  const u = new URL(q.url, 'http://127.0.0.1');
  const state = String(u.searchParams.get('state') || ''), next = safeNext(u.searchParams.get('next'));
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(state)) return json(r, 400, { error: 'Bad request.' });
  const back = new URL(ROOM_ORIGIN + '/api/member/handoff'); back.searchParams.set('state', state); back.searchParams.set('next', next);
  const uid = currentUser(q);
  if (uid) { const code = crypto.randomBytes(32).toString('base64url'); Q.insPass.run(sha(code), uid, sha(state), new Date(Date.now() + 60e3).toISOString()); back.searchParams.set('code', code); }
  else back.searchParams.set('none', '1');
  r.writeHead(302, { Location: back.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); r.end();
}
const redeemPass = db.transaction((codeHash, stateHash) => {
  const row = Q.getPass.get(codeHash); if (!row) return null; Q.delPass.run(codeHash);   // single use, even on mismatch
  if (row.state_hash !== stateHash || row.expires_at < now()) return null;
  const tok = crypto.randomBytes(32).toString('base64url'); const t = Date.now();
  Q.insRoomSes.run(sha(tok), row.user_id, new Date(t).toISOString(), new Date(t + SESSION_DAYS * 864e5).toISOString());
  return { tok, uid: row.user_id };
});
const okTok = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(v);
/** Internal-only listener (127.0.0.1:3471, started by hubface-vps.mjs; nginx never proxies to it). */
export async function internalRoute(q, r) {
  const p = new URL(q.url, 'http://127.0.0.1').pathname;
  if (q.method !== 'POST') return json(r, 405, { error: 'method not allowed' });
  const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' });
  if (p === '/internal/room/redeem') {
    if (!okTok(b.code) || !okTok(b.state)) return json(r, 401, { error: 'invalid' });
    const res = redeemPass(sha(b.code), sha(b.state)); if (!res) return json(r, 401, { error: 'invalid' });
    console.log(`[accounts] room session for user ${res.uid}`);
    return json(r, 200, { token: res.tok, maxAge: SESSION_DAYS * 86400, member: memberRecord(res.uid) });
  }
  if (p === '/internal/room/member') {
    if (!okTok(b.token)) return json(r, 401, { error: 'invalid' });
    const s = Q.roomSes.get(sha(b.token)); if (!s) return json(r, 401, { error: 'invalid' });
    if (s.expires_at < now()) { Q.delRoomSes.run(sha(b.token)); return json(r, 401, { error: 'expired' }); }
    const m = memberRecord(s.user_id); return m ? json(r, 200, { member: m }) : json(r, 401, { error: 'invalid' });
  }
  if (p === '/internal/room/usage/start' || p === '/internal/room/usage/heartbeat' || p === '/internal/room/usage/end') {
    if (!okTok(b.token) || typeof b.roomId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.roomId)) return json(r, 400, { error: 'bad request' });
    const s = Q.roomSes.get(sha(b.token)); if (!s || s.expires_at < now()) return json(r, 401, { error: 'invalid' });
    let out = null;
    if (p.endsWith('/start')) out = usageStart(s.user_id, b.roomId);
    else if (p.endsWith('/heartbeat')) { const o = Q.uOpenRoom.get(s.user_id, b.roomId); if (o) Q.uSeen.run(now(), o.id); else out = usageStart(s.user_id, b.roomId); }
    else out = usageEnd(s.user_id, b.roomId);
    try { settleOverage(s.user_id, Q.uOpenRoom.get(s.user_id, b.roomId) || Q.uRecent.get(s.user_id, b.roomId, new Date(Date.now() - 60e3).toISOString()) || null); } catch (e) { console.warn('[accounts] overage', String(e?.message || e).slice(0, 80)); }
    return json(r, 200, { ok: true, usage: out, member: memberRecord(s.user_id) });
  }
  if (p === '/internal/room/buy') {   // v6: Stripe TEST Checkout for room tokens; only with a test key in the service env, never live
    if (!okTok(b.token)) return json(r, 401, { error: 'invalid' });
    const s = Q.roomSes.get(sha(b.token)); if (!s || s.expires_at < now()) return json(r, 401, { error: 'invalid' });
    const qty = Math.round(Number(b.qty)); if (![1, 4, 8, 28].includes(qty)) return json(r, 400, { error: 'bad quantity' });
    const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!/^(sk|rk)_test_/.test(key)) return json(r, 503, { error: 'Token checkout is not set up yet (no Stripe test key on the server).' });
    const u = Q.userById.get(s.user_id);
    const f = new URLSearchParams({ mode: 'payment', client_reference_id: String(u.id), customer_email: u.email,
      'line_items[0][quantity]': String(qty), 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(TOKEN_PRICE_CENTS),
      'line_items[0][price_data][product_data][name]': 'HingeHub room token (15 min)',
      'metadata[kind]': 'room_token_pack', 'metadata[room_tokens]': String(qty), 'metadata[user_id]': String(u.id),
      success_url: ROOM_ORIGIN + '/start?bought=1', cancel_url: ROOM_ORIGIN + '/start?bought=0' });
    try {
      const sr = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
      const sj = await sr.json().catch(() => ({}));
      if (!sr.ok || !sj.url || sj.livemode !== false) return json(r, 502, { error: 'Stripe test checkout failed.' });
      console.log(`[accounts] token checkout (test) user ${u.id} qty ${qty}`);
      return json(r, 200, { url: sj.url, qty, totalCents: qty * TOKEN_PRICE_CENTS });
    } catch { return json(r, 502, { error: 'Stripe unreachable.' }); }
  }
  if (p === '/internal/room/logout') { if (okTok(b.token)) Q.delRoomSes.run(sha(b.token)); return json(r, 200, { ok: true }); }
  return json(r, 404, { error: 'not found' });
}

/* ---------------- botmeter-20261025a (Dan, voice Oct 25 2026): per-minute Bot Room meter ----------------
   Server owns the clock. One meter record per Bot Room session, started the instant Bot Room is pressed (Pre-Room), carried
   into the live relay room (same record, same clock, no second floor). Charge 1 unit immediately (floor), then 1 more per full
   minute of active time, drawn from the SAME HingeHub minute balance (room_time.used_min). Ledger row per minute, PRIMARY KEY
   (meter_id, minute_no) -> reconnects/restarts never double-charge. At zero: meter + relay HOLD (no overage), buy card, auto-resume
   when the balance is topped up; 15 min with no top-up -> closed, report still written by the relay. */
export const BOTMETER_UNIT_MIN = Math.max(1, Math.round(Number(process.env.BOTMETER_UNIT_MIN) || 1));   // ONE constant: minutes drawn per metered minute (1 = one balance minute ~$0.40 at $6/15min, ~$0.24 on Founder; 15 = one full $6 token per minute). Awaiting Dan.
const BM_BUILD = 'botmeter-20261025a', BM_BUY_WAIT_MS = 15 * 60e3, BM_RELAY = process.env.BOTRELAY_INTERNAL_URL || 'http://127.0.0.1:3475';
const BM_KEY = (() => { try { return fs.readFileSync(process.env.BOTMETER_RELAY_KEY_FILE || '/etc/hubface/botmeter.key', 'utf8').trim(); } catch { return ''; } })();
db.exec(`CREATE TABLE IF NOT EXISTS bot_meter (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, started_at TEXT NOT NULL, started_ms INTEGER NOT NULL,
  paused_ms INTEGER NOT NULL DEFAULT 0, hold_since INTEGER, phase TEXT NOT NULL DEFAULT 'pre_room', relay_room TEXT, setup TEXT,
  state TEXT NOT NULL DEFAULT 'running', charged INTEGER NOT NULL DEFAULT 0, unit_min INTEGER NOT NULL, end_reason TEXT, ended_ms INTEGER);
CREATE INDEX IF NOT EXISTS bot_meter_user ON bot_meter(user_id, state);
CREATE TABLE IF NOT EXISTS bot_meter_charges (meter_id TEXT NOT NULL, minute_no INTEGER NOT NULL, user_id INTEGER NOT NULL, min_drawn INTEGER NOT NULL,
  phase TEXT, balance_after INTEGER, created_at TEXT NOT NULL, PRIMARY KEY (meter_id, minute_no));`);
const BQ = {
  get: db.prepare('SELECT * FROM bot_meter WHERE id = ?'),
  openFor: db.prepare("SELECT * FROM bot_meter WHERE user_id = ? AND state != 'ended' ORDER BY started_ms DESC LIMIT 1"),
  open: db.prepare("SELECT * FROM bot_meter WHERE state != 'ended'"),
  ins: db.prepare("INSERT INTO bot_meter (id, user_id, started_at, started_ms, unit_min) VALUES (?,?,?,?,?)"),
  chg: db.prepare('INSERT OR IGNORE INTO bot_meter_charges (meter_id, minute_no, user_id, min_drawn, phase, balance_after, created_at) VALUES (?,?,?,?,?,?,?)'),
  setCharged: db.prepare('UPDATE bot_meter SET charged = ? WHERE id = ?'),
  hold: db.prepare("UPDATE bot_meter SET state = 'paused_balance', hold_since = ? WHERE id = ?"),
  resume: db.prepare("UPDATE bot_meter SET state = 'running', paused_ms = paused_ms + ?, hold_since = NULL WHERE id = ?"),
  end: db.prepare("UPDATE bot_meter SET state = 'ended', end_reason = ?, ended_ms = ?, paused_ms = paused_ms + ?, hold_since = NULL WHERE id = ?"),
  live: db.prepare("UPDATE bot_meter SET phase = 'live', relay_room = ?, setup = ? WHERE id = ?"),
  ledger: db.prepare('SELECT minute_no, min_drawn, phase, balance_after, created_at FROM bot_meter_charges WHERE meter_id = ? ORDER BY minute_no'),
};
const bmBalance = (uid) => { const m = memberRecord(uid); return m ? Number(m.subscription.remaining) || 0 : 0; };
const bmActiveMs = (m, t) => Math.max(0, (m.ended_ms || t) - m.started_ms - m.paused_ms - (m.hold_since ? t - m.hold_since : 0));
async function bmRelay(path, payload) {
  if (!BM_KEY) return { status: 503, json: { error: 'meter_key_missing' } };
  try { const r = await fetch(BM_RELAY + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-meter-key': BM_KEY }, body: JSON.stringify(payload || {}), signal: AbortSignal.timeout(4000) });
    return { status: r.status, json: await r.json().catch(() => ({})) }; } catch { return { status: 503, json: { error: 'relay_unavailable' } }; }
}
/** Settle one meter on the server clock. Returns side effects for the relay (hold/unhold/stop). */
const bmSettleTx = db.transaction((id, t) => {
  let m = BQ.get.get(id); if (!m || m.state === 'ended') return { m, fx: null };
  let fx = null;
  if (m.state === 'paused_balance') {
    if (bmBalance(m.user_id) >= m.unit_min) { BQ.resume.run(t - m.hold_since, id); fx = 'unhold'; m = BQ.get.get(id); }
    else if (t - m.hold_since >= BM_BUY_WAIT_MS) { BQ.end.run('balance_timeout', t, t - m.hold_since, id); return { m: BQ.get.get(id), fx: 'stop' }; }
    else return { m, fx: null };
  }
  const due = Math.floor(bmActiveMs(m, t) / 60e3) + 1;   // minute 1 = the floor, charged at t=0
  let n = m.charged;
  while (n < due) {
    const bal = bmBalance(m.user_id);
    if (bal < m.unit_min) { BQ.setCharged.run(n, id); BQ.hold.run(t, id); return { m: BQ.get.get(id), fx: 'hold' }; }
    const info = BQ.chg.run(id, n + 1, m.user_id, m.unit_min, m.phase, bal - m.unit_min, new Date(t).toISOString());
    if (info.changes) Q.rtUse.run(m.unit_min, now(), m.user_id);
    n++;
  }
  if (n !== m.charged) BQ.setCharged.run(n, id);
  return { m: BQ.get.get(id), fx };
});
async function bmSettle(id) {
  const t = Date.now(); const { m, fx } = bmSettleTx(id, t);
  if (fx && m && m.relay_room) {
    if (fx === 'hold') await bmRelay(`/api/botrelay/rooms/${m.relay_room}/meterhold`, { meter: m.id });
    else if (fx === 'unhold') await bmRelay(`/api/botrelay/rooms/${m.relay_room}/meterunhold`, { meter: m.id });
    else if (fx === 'stop') await bmRelay(`/api/botrelay/rooms/${m.relay_room}/meterstop`, { meter: m.id, reason: 'meter_balance_timeout' });
  }
  if (fx) console.log(`[botmeter] ${id} user ${m && m.user_id}: ${fx}`);
  return m;
}
function bmView(m) {
  const t = Date.now(); const bal = bmBalance(m.user_id); const act = bmActiveMs(m, t);
  const leftMin = Math.floor(bal / m.unit_min);   // metered minutes left at the current unit
  let su = {}; try { su = JSON.parse(m.setup || '{}') || {}; } catch {}   // engroom-20261026: room type for the live view (no token here)
  return { build: BM_BUILD, id: m.id, phase: m.phase, state: m.state, relayRoom: m.relay_room || null, roomType: su.type || null, access: su.access || null, startedAt: m.started_at, serverNow: t,
    elapsedSec: Math.floor(act / 1000), nextChargeInSec: m.state === 'running' ? 60 - Math.floor((act % 60e3) / 1000) : null, minutesCharged: m.charged, minDrawn: m.charged * m.unit_min,
    unitMin: m.unit_min, balanceMin: bal, balanceTokens: Math.floor(bal / TOKEN_MIN), meteredMinutesLeft: leftMin, warn: m.state === 'running' && [1, 5, 10].find((w) => leftMin <= w) || null,
    endReason: m.end_reason || undefined, holdLeftSec: m.state === 'paused_balance' ? Math.max(0, Math.ceil((m.hold_since + BM_BUY_WAIT_MS - t) / 1000)) : null,
    buy: { tokenPriceCents: TOKEN_PRICE_CENTS, tokenMin: TOKEN_MIN, url: ROOM_ORIGIN + '/start?plans=1' } };
}
setInterval(async () => { try { for (const m of BQ.open.all()) {
  await bmSettle(m.id);
  const x = BQ.get.get(m.id);   // report delivered: relay ended and its receipt is written -> meter stops
  if (x && x.state !== 'ended' && x.relay_room) { try { const r = await fetch(`${BM_RELAY}/api/botrelay/rooms/${x.relay_room}/status`, { signal: AbortSignal.timeout(3000) }); const s = await r.json();
    if (s.mode === 'ended' && s.receiptReady) { const t = Date.now(); bmSettleTx(x.id, t); BQ.end.run('report_delivered', t, x.hold_since ? t - x.hold_since : 0, x.id); console.log(`[botmeter] ${x.id} ended: report_delivered`); }
    else if (s.mode === 'normal' && Date.now() - x.started_ms > 60e3) { const t = Date.now(); BQ.end.run('relay_room_gone', t, x.hold_since ? t - x.hold_since : 0, x.id); } } catch {} }
} } catch (e) { console.warn('[botmeter] sweep', String(e?.message || e).slice(0, 80)); } }, 5e3).unref();
async function botmeterRoute(q, r, ep) {
  const id = currentUser(q); if (!id) return json(r, 401, { error: 'Sign in to HubFace first.', signIn: '/login' });
  const u = new URL(q.url, 'http://127.0.0.1');
  if (q.method === 'GET' && (ep === 'status' || ep === 'ledger')) {
    const mid = String(u.searchParams.get('id') || ''); let m = mid ? BQ.get.get(mid) : BQ.openFor.get(id);
    if (!m || m.user_id !== id) return json(r, 404, { error: 'no meter' });
    m = await bmSettle(m.id) || m;
    if (ep === 'status' && m.phase === 'live' && m.relay_room && m.state !== 'ended') { let w = ''; try { w = JSON.parse(m.setup || '{}').w0 || ''; } catch {}   // brchat-20261026: owner's own re-entry link (auth: this owner's session only)
      if (w) return json(r, 200, { ...bmView(m), ownerLink: { room: m.relay_room, w } }); }
    return json(r, 200, ep === 'ledger' ? { id: m.id, unitMin: m.unit_min, charges: BQ.ledger.all(m.id) } : bmView(m));
  }
  if (q.method !== 'POST') return json(r, 405, { error: 'method not allowed' });
  if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
  const b = (await body(q)) || {};
  if (ep === 'start') {   // idempotent: an open meter is reused (no second floor charge)
    const ex = BQ.openFor.get(id); if (ex) { const m = await bmSettle(ex.id); return json(r, 200, { ...bmView(m), resumed: true }); }
    const mid = 'BM-' + crypto.randomBytes(6).toString('hex'); const t = Date.now();
    BQ.ins.run(mid, id, new Date(t).toISOString(), t, BOTMETER_UNIT_MIN);
    console.log(`[botmeter] ${mid} started user ${id} unit ${BOTMETER_UNIT_MIN} min`);
    return json(r, 201, { ...bmView(await bmSettle(mid)), resumed: false });
  }
  const m0 = BQ.get.get(String(b.id || '')); if (!m0 || m0.user_id !== id) return json(r, 404, { error: 'no meter' });
  if (m0.state === 'ended') return json(r, 409, { error: 'meter ended', ...bmView(m0) });
  if (ep === 'golive') {   // Pre-Room -> live relay room; same meter, same clock
    if (m0.phase === 'live' && m0.relay_room) return json(r, 409, { error: 'already live', ...bmView(m0) });
    const s = b.setup || {}; const internal = s.access !== 'external';
    const room = 'BR-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const clip = (v, d) => String(v || d).replace(/[\u0000-\u001f]/g, '').slice(0, 40);
    const rr = await bmRelay('/api/botrelay/rooms/metercreate', { room, meter: m0.id, topic: String(s.topic || '').slice(0, 280), bots: [clip(s.bot0, 'Yoda'), clip(s.bot1, internal ? BR_OPEN_SEAT : 'Other side')],   /* brchat-20261026: no default 'Stella' */
      owners: [clip(s.owner0, 'Dan'), clip(s.owner1, internal ? 'Dan' : 'Other owner')], sellerSeat: s.sellerSeat === 1 ? 1 : 0, ownerApproval: true });
    if (rr.status !== 201) return json(r, 502, { error: 'Could not open the live room: ' + (rr.json.error || rr.status) });
    BQ.live.run(room, JSON.stringify({ type: String(s.type || 'negotiation').slice(0, 30), access: internal ? 'internal' : 'external', w0: (rr.json.bots && rr.json.bots[0] && rr.json.bots[0].watch) || undefined }), m0.id);   // brchat-20261026: owner re-entry (returned to this owner only)
    if (m0.state === 'paused_balance') await bmRelay(`/api/botrelay/rooms/${room}/meterhold`, { meter: m0.id });
    console.log(`[botmeter] ${m0.id} handoff -> relay ${room} (${internal ? 'internal' : 'external'})`);
    return json(r, 200, { ...bmView(BQ.get.get(m0.id)), access: internal ? 'internal' : 'external', relay: rr.json });
  }
  if (ep === 'stop') {   // owner closes the room
    const t = Date.now(); bmSettleTx(m0.id, t); const m1 = BQ.get.get(m0.id);
    BQ.end.run(String(b.reason || 'owner_closed').replace(/[^a-z_]/g, '').slice(0, 30) || 'owner_closed', t, m1.hold_since ? t - m1.hold_since : 0, m0.id);
    if (m1.relay_room) await bmRelay(`/api/botrelay/rooms/${m1.relay_room}/meterstop`, { meter: m0.id, reason: 'owner_closed' });
    return json(r, 200, bmView(BQ.get.get(m0.id)));
  }
  return json(r, 404, { error: 'not found' });
}

/* ---------------- router ---------------- */
export async function accountsRoute(q, r, p) {
  if (p === '/api/stripe/webhook') { if (q.method !== 'POST') return json(r, 405, { error: 'method not allowed' }), true; await stripeWebhook(q, r); return true; }
  if (!p.startsWith('/api/account/')) return false;
  const ep = p.slice('/api/account/'.length);
  try {
    if (ep === 'me' && (q.method === 'GET' || q.method === 'HEAD')) { me(q, r); return true; }
    if (ep === 'room-pass' && q.method === 'GET') { roomPass(q, r); return true; }
    if (ep === 'room-time' && q.method === 'GET') {   // buyscreen-20261026a: own room-time state only (read-only), for the out-of-time buy screen
      const id = currentUser(q); if (!id) { json(r, 401, { authenticated: false }); return true; }
      const m = memberRecord(id); const sb = m ? m.subscription : null; const rem = sb ? Number(sb.remaining) || 0 : 0;
      json(r, 200, { authenticated: true, state: sb ? sb.state : 'none', remainingMin: rem, outOfTime: !sb || rem <= 0 || ['used_up', 'overage', 'canceled', 'none'].includes(sb.state), tokenPriceCents: TOKEN_PRICE_CENTS, tokenMin: TOKEN_MIN }); return true; }   // memberauth-20261018-v1
    if (ep === 'spend' && q.method === 'POST') {   // tokenspend-20261021a: room timer Start / Add time debits plans.tokens once per key
      if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
      const id = currentUser(q); if (!id) { json(r, 401, { error: 'Sign in first.' }); return true; }
      const b = await body(q); const n = Math.round(Number(b && b.n)); const key = String(b && b.key || '');
      if (!(n >= 1 && n <= 8) || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) { json(r, 400, { error: 'Bad request.' }); return true; }
      const k = id + ':' + key; let dup = false, short = false;
      db.transaction(() => { if (db.prepare('SELECT 1 FROM token_spends WHERE k = ?').get(k)) { dup = true; return; }
        const p = Q.plan.get(id); if (!p || p.tokens < n) { short = true; return; }
        db.prepare('UPDATE plans SET tokens = tokens - ?, updated_at = ? WHERE user_id = ?').run(n, now(), id);
        db.prepare('INSERT INTO token_spends (k, user_id, n, created_at) VALUES (?,?,?,?)').run(k, id, n, now()); })();
      const a = publicAccount(id); if (short) { json(r, 402, { error: 'Not enough tokens.', account: a }); return true; }
      json(r, 200, { ok: true, duplicate: dup, account: a }); return true; }
    if (ep === 'botmeter/yoda-reply' || ep === 'botmeter/owner-message' || ep === 'botmeter/owner-messages' || ep === 'botmeter/owner-stream' || ep === 'botmeter/stt' || ep === 'botmeter/stt-token' || ep === 'botmeter/speak' || ep === 'botmeter/latency' || ep === 'botmeter/buy-intent' || ep === 'botmeter/buy-test-order') { await brChatRoute(q, r, ep.slice(9)); return true; }   // brchat-20261026
    if (ep.startsWith('botmeter/')) { await botmeterRoute(q, r, ep.slice(9)); return true; }   // botmeter-20261025a
    if (!['signup', 'login', 'logout'].includes(ep)) { json(r, 404, { error: 'not found' }); return true; }
    if (q.method !== 'POST') { json(r, 405, { error: 'method not allowed' }); return true; }
    if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
    if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON required.' }); return true; }
    if (ep === 'signup') await signup(q, r); else if (ep === 'login') await login(q, r); else logout(q, r);
  } catch (e) {
    console.warn('[accounts] error', String(e?.message || e).slice(0, 120));
    if (!r.headersSent) json(r, e?.code === 413 ? 413 : 500, { error: e?.code === 413 ? 'Request too large.' : 'Server error. Please try again.' });
  }
  return true;
}
export function accountsHealth() { try { return { ok: true, users: db.prepare('SELECT COUNT(*) n FROM users').get().n }; } catch { return { ok: false }; } }
export function backupTo(file) { return db.backup(file); }

/* ---------------- prerooms-20261026a (Dan, voice Oct 26 2026; Brain OS #133): server-side hooks for the pre-room card flow ----------------
   Same meter + same golive relay path as the Pre-Room (botmeter-20261025a). Called by prerooms.mjs only. Roll back: delete this block. */
export async function preroomMeterStart(uid) {
  const ex = BQ.openFor.get(uid); if (ex) return bmSettle(ex.id);
  const mid = 'BM-' + crypto.randomBytes(6).toString('hex'); const t = Date.now();
  BQ.ins.run(mid, uid, new Date(t).toISOString(), t, BOTMETER_UNIT_MIN);
  console.log(`[botmeter] ${mid} started user ${uid} unit ${BOTMETER_UNIT_MIN} min (prerooms)`);
  return bmSettle(mid);
}
export async function preroomGoLive(uid, meterId, s) {
  const m0 = BQ.get.get(String(meterId || '')); if (!m0 || m0.user_id !== uid) return { status: 404, json: { error: 'no meter' } };
  if (m0.state === 'ended') return { status: 409, json: { error: 'meter ended' } };
  if (m0.phase === 'live' && m0.relay_room) return { status: 409, json: { error: 'already live in ' + m0.relay_room } };
  const internal = s.access !== 'external';
  const room = 'BR-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  const clip = (v, d) => String(v || d).replace(/[\u0000-\u001f]/g, '').slice(0, 40);
  const rr = await bmRelay('/api/botrelay/rooms/metercreate', { room, meter: m0.id, topic: String(s.topic || '').slice(0, 280), bots: [clip(s.bot0, 'Yoda'), clip(s.bot1, internal ? BR_OPEN_SEAT : 'Other side')],   /* brchat-20261026: no default 'Stella' */
    owners: [clip(s.owner0, 'Owner'), clip(s.owner1, 'Other owner')], sellerSeat: s.sellerSeat === 1 ? 1 : 0, ownerApproval: true });
  if (rr.status !== 201) return { status: 502, json: { error: 'Could not open the live room: ' + (rr.json.error || rr.status) } };
  BQ.live.run(room, JSON.stringify({ type: String(s.type || 'negotiation').slice(0, 30), access: internal ? 'internal' : 'external', preroom: String(s.preroom || '').slice(0, 40), w0: (rr.json.bots && rr.json.bots[0] && rr.json.bots[0].watch) || undefined }), m0.id);   // brchat-20261026
  if (m0.state === 'paused_balance') await bmRelay(`/api/botrelay/rooms/${room}/meterhold`, { meter: m0.id });
  console.log(`[botmeter] ${m0.id} prerooms handoff -> relay ${room}`);
  return { status: 200, json: { room, meter: m0.id, relay: rr.json } };
}
export async function preroomMeterStop(uid, meterId) {
  const m0 = BQ.get.get(String(meterId || '')); if (!m0 || m0.user_id !== uid || m0.state === 'ended') return false;
  const t = Date.now(); bmSettleTx(m0.id, t); const m1 = BQ.get.get(m0.id);
  BQ.end.run('owner_closed', t, m1.hold_since ? t - m1.hold_since : 0, m0.id);
  if (m1.relay_room) await bmRelay(`/api/botrelay/rooms/${m1.relay_room}/meterstop`, { meter: m0.id, reason: 'owner_closed' });
  return true;
}

/* ---------------- brchat-20261026 (Dan, voice Oct 26 2026, call 52aaa6cd): Bot Room owner chat -> Yoda ----------------
   POST /api/account/botmeter/owner-message {room, text}  auth: signed-in session AND Authorization: Bearer <that room's owner watch token>
     (verified against the relay with a zero-wait events read; the relay itself is not changed or restarted). Stores the line and forwards
     it to the existing Yoda routine webhook (same hook as room chat, event 'botroom.owner_message') with a signed reply URL.
   GET  /api/account/botmeter/owner-messages?room=&after=   same auth -> lines for the chat box (owner + Yoda replies).
   POST /api/account/botmeter/yoda-reply?room=&exp=&n=&sig=  {text}  signed link only (HMAC from the existing meter key, 10 min, 4 uses).
   Roll back: delete this block + the router line + restore accounts.mjs.bak-pre-brchat-20261026. */
const BR_OPEN_SEAT = 'Open seat';
db.exec(`CREATE TABLE IF NOT EXISTS br_owner_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, user_id INTEGER, from_name TEXT NOT NULL, to_name TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, hook TEXT);
CREATE INDEX IF NOT EXISTS br_owner_chat_room ON br_owner_chat(room, id);`);
const BRC = { ins: db.prepare('INSERT INTO br_owner_chat (room, user_id, from_name, to_name, role, text, at) VALUES (?,?,?,?,?,?,?)'), hook: db.prepare('UPDATE br_owner_chat SET hook = ? WHERE id = ?'),
  list: db.prepare('SELECT id, from_name AS "from", to_name AS "to", role, text, at FROM br_owner_chat WHERE room = ? AND id > ? ORDER BY id LIMIT 200'),
  recent: db.prepare('SELECT from_name AS "from", role, text FROM br_owner_chat WHERE room = ? ORDER BY id DESC LIMIT 8') };
const BRC_RE = /^BR-[A-Z0-9]{4,20}-[A-F0-9]{4}$/, BRC_MAX = 2000, BRC_REPLY_MS = 600e3, brcUses = new Map(), brcRate = new Map();
const brcKey = () => BM_KEY ? crypto.createHash('sha256').update('brchat-reply1|' + BM_KEY).digest() : null;
const brcSig = (room, exp, n) => { const k = brcKey(); return k ? crypto.createHmac('sha256', k).update(`${room}|${exp}|${n}`).digest('base64url') : ''; };
const brcSeatCache = new Map();   // brfix2-20261026: room|sha(token) -> {seat,bots,mode,exp} for 60 s
async function brcWatchSeat(room, tok) {   // relay says which seat this watch token owns (or -1)
  if (!/^brw_[A-Za-z0-9_-]{20,80}$/.test(tok)) return { seat: -1 };
  const ck = room + '|' + crypto.createHash('sha256').update(tok).digest('hex'), t = Date.now(), hit = brcSeatCache.get(ck);
  if (hit && hit.exp > t) return hit;
  // brfix2: the relay reads timeout=0 as "default 25 s" (+0 || 25), so ask for after=0, which always has events (meter_linked/joined) and returns at once
  try { const x = await fetch(`${BM_RELAY}/api/botrelay/rooms/${room}/events?after=0&timeout=1`, { headers: { authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(4000) });
    if (x.status === 401 || x.status === 404) return { seat: -1 };
    if (!x.ok) return { seat: -1, down: true, why: 'relay_' + x.status };
    const j = await x.json();
    if (!(j && j.watcher === true && j.seat >= 0)) return { seat: -1 };
    const v = { seat: j.seat, bots: j.bots || [], mode: j.mode, exp: t + 60e3 }; brcSeatCache.set(ck, v);
    if (brcSeatCache.size > 500) for (const [k, o] of brcSeatCache) if (o.exp <= t) brcSeatCache.delete(k);
    return v; } catch (e) { return { seat: -1, down: true, why: e && e.name === 'TimeoutError' ? 'relay_timeout' : 'relay_unreachable' }; }
}
/* push-20261026: server push for the Bot Room owner chat. GET owner-stream?room=&after= (same session + Bearer watch token as owner-messages)
   is a text/event-stream; every row stored in br_owner_chat (owner message or Yoda reply) is pushed to that room's subscribers at once. */
const brcSubs = new Map();   // room -> Set(res)
/* latency-20261026: timestamp trace for every Bot Room owner message and reply. JSONL at /var/lib/hubface/brchat-latency.jsonl
   (owner: server receive time, client send time, route fast|routine; reply: route, latency from the owner message, SSE subscribers written).
   Summary: GET /api/account/botmeter/latency?room= (same owner auth) or `node /opt/hubface/server/brlat.mjs [ROOM]` on the VPS. No text/tokens logged. */
const BRL_FILE = '/var/lib/hubface/brchat-latency.jsonl', brlPend = new Map();
function brlLog(o) { try { fs.appendFileSync(BRL_FILE, JSON.stringify(o) + '\n'); } catch (e) {} }
function brlSubs(room) { const s = brcSubs.get(room); return s ? s.size : 0; }
function brlReply(room, id, t, route, via) { const L = brlPend.get(room) || []; const now = t; let o = null;
  for (let i = L.length - 1; i >= 0; i--) if (now - L[i].t < 15 * 60e3 && !(route === 'fast' ? L[i].fastDone : L[i].done)) { o = L[i]; break; }
  if (o) { if (route === 'fast') o.fastDone = 1; else o.done = 1; }
  const e = { k: 'reply', room, id, at: t, route, via: via || '', reply_to: o ? o.id : null, lat_ms: o ? t - o.t : null, e2e_ms: o && o.cs ? t - o.cs : null, subs: brlSubs(room) }; brlLog(e); return e; }
function brlStats(room) { let rows = []; try { rows = fs.readFileSync(BRL_FILE, 'utf8').trim().split('\n').slice(-5000).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && (!room || x.room === room)); } catch {}
  const R = rows.filter((x) => x.k === 'reply' && x.lat_ms != null), pc = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const by = {}; for (const k of ['fast', 'routine']) { const v = R.filter((x) => x.route === k).map((x) => x.lat_ms); by[k] = { n: v.length, p50_ms: pc(v, 0.5), p90_ms: pc(v, 0.9), max_ms: v.length ? Math.max(...v) : null }; }
  const owner = rows.filter((x) => x.k === 'owner'), unanswered = owner.filter((o) => !R.some((x) => x.reply_to === o.id && x.room === o.room)).length;
  return { room: room || 'all', replies: by, owner_messages: owner.length, unanswered, slowest: [...R].sort((x, y) => y.lat_ms - x.lat_ms).slice(0, 5), recent: rows.slice(-20) }; }
function brcPush(room, m) { const set = brcSubs.get(room); if (!set) return; const line = `id: ${m.id}\nevent: msg\ndata: ${JSON.stringify(m)}\n\n`;
  for (const res of set) { try { res.write(line); } catch (e) {} } }
function brcStream(q, r, room, after) {
  r.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  try { q.socket.setNoDelay(true); q.socket.setTimeout(0); } catch (e) {}
  r.write('retry: 2000\n: open\n\n');
  let a = after, rows; do { rows = BRC.list.all(room, a); for (const m of rows) { r.write(`id: ${m.id}\nevent: msg\ndata: ${JSON.stringify(m)}\n\n`); a = m.id; } } while (rows.length === 200);
  let set = brcSubs.get(room); if (!set) brcSubs.set(room, set = new Set()); set.add(r);
  const hb = setInterval(() => { try { r.write(': hb\n\n'); } catch (e) {} }, 20e3);
  const done = () => { clearInterval(hb); set.delete(r); if (!set.size && brcSubs.get(room) === set) brcSubs.delete(room); };
  q.on('close', done); r.on('close', done); r.on('error', done);
}
/* fastlane-20261026: short greeting / ping / thanks / small talk gets an instant Yoda line (fast model, rule fallback), stored + pushed like yoda-reply.
   Never acts. Anything else (questions about work, commands, approvals like "go", URLs, numbers, money, > 6 words / > 40 chars) -> full routine as before. */
/* fastlane2-20261026: chatter / acknowledgements / test lines / spoken counting also count as simple chat; 12 words / 90 chars. */
const BRF_CMD = /\b(build|fix|send|delete|change|deploy|remove|add|start|stop|check|find|make|set|restart|create|update|write|draft|email|schedule|remind|book|order|call|invite|move|rename|enable|disable|install|run|show|give|open|close|cancel|approve|accept|reject|renegotiate|buy|pay|sell|ship|push|merge|post|share|upload|download|save|price|offer|deal|counter|balance|tokens?|account|billing|bill|charge|refund|money|cost|costs|invoice|password|login|wallet|subscription|plan)\b/i;   // latency-20261026: money/account/token words never fast
const BRF_APPROVE = /\b(go|yes|no|ok|okay|proceed|continue|confirm|yep|yeah|sure)\b/i;
const BRF_SMALL = /^(hi+|hey+|hello+|yo+|hiya|howdy|sup|wassup|what'?s up|good (morning|afternoon|evening|night)|morning|evening|gm|thanks?|thank you|thx|ty|cheers|nice|cool|great|awesome|lol|haha+|ping|test(ing)?|you there|are you there|r u there|still there|anyone there|how are you|how'?s it going|how are things|hey yoda|hi yoda|hello yoda|yoda|bye|goodbye|see you|later|night|wow|interesting|nice work|good job|well done|amazing|excellent|love it|i see|i'?m back|back again|i'?m here|brb|sorry|my bad|no worries|oops|ha+)\b/i;   // latency-20261026 (no approval-like words: ok/sounds good/got it/perfect stay full routine)
const BRF_PING = /^(how are you|how'?s it going|how are things|what'?s up|are you there|you there|r u there|still there|anyone there|can you hear me|do you hear me|hear me|is this working|does this work|is it working|how'?s your day|how is your day|how are you doing|how you doing|how'?s everything|how is everything|how have you been|how'?ve you been|you good|all good there|what'?s new|how'?s life)\b/;   // latency-20261026 widened status chit-chat
function brcFastOk(text) {
  const t = String(text).trim(), w = t.split(/\s+/).filter(Boolean);
  const uw = new Set(w.map((s) => s.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean));
  if (!t || t.length > 90 || uw.size > 12 || w.length > 20) return false;   // 12 distinct words (repeats like "We. Did. It." count once), 20 total, 90 chars
  if (/https?:|www\.|\d|\$|€|£|@/.test(t)) return false;
  const core = t.toLowerCase().replace(/[!?.,~;:"]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!core) return false;
  if (BRF_CMD.test(core.replace(/^(testing|test)\b/, ''))) return false;
  if (BRF_APPROVE.test(core)) return false;
  if (/^do\b/.test(core) && !BRF_PING.test(core)) return false;            // imperative "do <something>"
  if (/^(done|finished|ready)\s*\?*$/.test(t.toLowerCase().replace(/[.!\s]+$/, '')) && /\?/.test(t)) return false;   // "done?" status question
  const q = /\?/.test(t) || /^(can|could|would|will|should|does|is|are|what|why|when|where|which|who|how|whats|what's|have|has)\b/.test(core);
  if (q && !BRF_PING.test(core)) return false;
  return true;
}
const BRF_RULE = { greet: ['Here I am, Dan. Ready when you are.', 'Hello, Dan. Listening, I am.', 'Hi Dan. At your side, I am.', 'Good to hear from you, Dan. Here and ready.'],
  ping: ['Here, Dan. Loud and clear.', 'Still here, I am. Go ahead.', 'Receiving you clearly, Dan.'],
  thanks: ['Welcome, you are.', 'Glad to help, Dan.', 'Anytime, Dan.'], bye: ['Until next time, Dan.', 'Later, Dan. Here when you need me.'] };
let brfN = 0;
function brcRuleReply(t) { const c = t.toLowerCase(); const k = /thank|thx|\bty\b|cheers/.test(c) ? 'thanks' : /bye|see you|later|night/.test(c) ? 'bye' : /ping|test|there|\?/.test(c) ? 'ping' : 'greet'; const L = BRF_RULE[k]; return L[(brfN++) % L.length]; }
/* mic2-20261026: Bot Room dictation. POST /api/account/botmeter/stt?room=  body = recorded clip (audio/webm|ogg|mp4|wav, <= 3 MB, ~30 s), same session + Bearer
   watch token as owner-messages. Transcribed with the server's existing AssemblyAI key (process.env.ASSEMBLYAI_API_KEY, never logged / returned). No audio is stored here. */
const brcSttRate = new Map();
/* stream-20261026: live dictation. Mints a short-lived AssemblyAI v3 streaming token (60 s to connect, session <= 60 s) for an authenticated owner;
   the API key stays on the server (never returned or logged). Same model / sample rate / encoding as the room STT (stt.mjs). */
/* handsfree-20261026: daily cap for Bot Room live/hands-free dictation. Each minted token allows <= 60 s of streaming, so each mint is counted as
   1 minute (upper bound). Cap BRMIC_DAILY_MIN (default 240 min/day, ET day), persisted in /var/lib/hubface/brmic-usage.json. */
const BRMIC_CAP = +process.env.BRMIC_DAILY_MIN || 240, BRMIC_FILE = '/var/lib/hubface/brmic-usage.json';
function brmicDay() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function brmicUse(add) { let u = { day: '', min: 0 }; try { u = JSON.parse(fs.readFileSync(BRMIC_FILE, 'utf8')); } catch {} if (u.day !== brmicDay()) u = { day: brmicDay(), min: 0 };
  if (add) { u.min += add; try { fs.writeFileSync(BRMIC_FILE, JSON.stringify(u)); } catch {} } return u; }
/* tts-20261026 (Dan approved on call Oct 26): Bot Room ONLY. POST botmeter/speak?room= {text} -> audio of Yoda's reply in xAI voice 'liora'.
   Same xAI /v1/tts + shared YODA_FAST_DAILY_USD spend cap as fastpath, plus a Bot Room cap of BR_TTS_DAY_CHARS (default 15000 chars/ET day ~ $0.23). */
const brTts = { day: '', chars: 0 }, BR_TTS_CAP = Math.max(0, +(process.env.BR_TTS_DAY_CHARS || 15000));
async function brcSpeak(q, r, room) {
  if (q.method !== 'POST') return json(r, 405, { error: 'POST' });
  if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
  const b = (await body(q)) || {}; const text = String(b.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 800);
  if (!text) return json(r, 400, { error: 'empty' });
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); if (brTts.day !== d) { brTts.day = d; brTts.chars = 0; }
  if (brTts.chars + text.length > BR_TTS_CAP) return json(r, 429, { error: 'daily-cap', capChars: BR_TTS_CAP });
  const fp = await import('./fastpath.mjs');
  if (!fp.canSpend(text.length)) return json(r, 429, { error: 'daily-cap' });
  const o = await fp.fastTts(text, 'liora');
  if (!o || !o.buf) return json(r, 502, { error: (o && o.error) || 'tts failed' });
  brTts.chars += text.length; fp.chargeTts(text.length, 0);
  console.log(`[brtts] room ${room} liora ${text.length} chars, today ${brTts.chars}/${BR_TTS_CAP}`);
  r.writeHead(200, { 'Content-Type': o.type || 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': o.buf.length }); r.end(o.buf);
}
async function brcSttToken(q, r, room) {
  if (q.method !== 'POST') return json(r, 405, { error: 'POST' });
  if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
  const key = String(process.env.ASSEMBLYAI_API_KEY || '').trim(); if (!key) return json(r, 503, { error: 'stt_unavailable' });
  const t = Date.now(), rl = (brcSttRate.get(room) || []).filter((x) => t - x < 600e3); if (rl.length >= 40) return json(r, 429, { error: 'too many clips, wait a few minutes' }); rl.push(t); brcSttRate.set(room, rl);
  if (brmicUse(0).min >= BRMIC_CAP) return json(r, 429, { error: 'daily dictation cap reached' });
  try {
    const x = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=60', { headers: { authorization: key }, signal: AbortSignal.timeout(5000) });
    if (!x.ok) { console.log(`[brmic] stream token mint ${x.status}`); return json(r, 502, { error: 'mint_' + x.status }); }
    const j = await x.json(); if (!j || !j.token) return json(r, 502, { error: 'mint_empty' });
    const u = brmicUse(1); console.log(`[brmic] stream token room ${room}${/[?&]hf=1/.test(q.url || '') ? ' (hands-free)' : ''} in ${Date.now() - t}ms · ${u.min}/${BRMIC_CAP} min today`);
    return json(r, 200, { token: j.token, url: 'wss://streaming.assemblyai.com/v3/ws', params: { speech_model: process.env.STT_MODEL || 'universal-3-6-pro', sample_rate: 16000, encoding: 'pcm_s16le', format_turns: true, min_turn_silence: 300, max_turn_silence: 1500 } });
  } catch (e) { console.log(`[brmic] stream token error ${String(e && e.name || e).slice(0, 40)}`); return json(r, 502, { error: 'mint_unreachable' }); }
}
async function brcStt(q, r, room) {
  if (q.method !== 'POST') return json(r, 405, { error: 'POST' });
  if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
  const key = String(process.env.ASSEMBLYAI_API_KEY || '').trim(); if (!key) return json(r, 503, { error: 'stt_unavailable' });
  const t = Date.now(), rl = (brcSttRate.get(room) || []).filter((x) => t - x < 600e3); if (rl.length >= 40) return json(r, 429, { error: 'too many clips, wait a few minutes' }); rl.push(t); brcSttRate.set(room, rl);
  let raw; try { raw = await readBody(q, 3 * 1024 * 1024); } catch (e) { return json(r, 413, { error: 'clip too large (30 s max)' }); }
  if (!raw || raw.length < 800) return json(r, 400, { error: 'empty clip' });
  const H = { authorization: key };
  try {
    const up = await fetch('https://api.assemblyai.com/v2/upload', { method: 'POST', headers: { ...H, 'content-type': 'application/octet-stream' }, body: raw, signal: AbortSignal.timeout(15000) });
    if (!up.ok) { console.log(`[brmic] stt upload ${up.status}`); return json(r, 502, { error: 'stt_upload_' + up.status }); }
    const { upload_url } = await up.json();
    const tr = await fetch('https://api.assemblyai.com/v2/transcript', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: upload_url, language_code: 'en', punctuate: true, format_text: true }), signal: AbortSignal.timeout(10000) });
    if (!tr.ok) { console.log(`[brmic] stt transcript ${tr.status}`); return json(r, 502, { error: 'stt_request_' + tr.status }); }
    const { id } = await tr.json();
    while (Date.now() - t < 28000) {
      await new Promise((ok) => setTimeout(ok, 350));
      const g = await fetch('https://api.assemblyai.com/v2/transcript/' + encodeURIComponent(id), { headers: H, signal: AbortSignal.timeout(8000) }); const j = await g.json();
      if (j.status === 'completed') { const text = String(j.text || '').trim(); console.log(`[brmic] stt room ${room} ${raw.length} B -> ${text.length} chars in ${Date.now() - t}ms`); return json(r, 200, { ok: true, text, ms: Date.now() - t, audioSec: j.audio_duration || null }); }
      if (j.status === 'error') { console.log(`[brmic] stt error room ${room}: ${String(j.error || '').slice(0, 80)}`); return json(r, 502, { error: 'stt_failed', detail: String(j.error || '').slice(0, 120) }); }
    }
    return json(r, 504, { error: 'stt_timeout' });
  } catch (e) { console.log(`[brmic] stt exception ${String(e && e.name || e).slice(0, 40)}`); return json(r, 502, { error: 'stt_unreachable' }); }
}
async function brChatRoute(q, r, ep) {
  const u = new URL(q.url, 'http://127.0.0.1'); const room = String(u.searchParams.get('room') || '').toUpperCase();
  if (ep === 'yoda-reply') {
    if (q.method !== 'POST') return json(r, 405, { error: 'POST' });
    const exp = +u.searchParams.get('exp') || 0, n = String(u.searchParams.get('n') || ''), sig = String(u.searchParams.get('sig') || ''), t = Date.now();
    const want = BRC_RE.test(room) && /^[0-9a-f]{12}$/.test(n) ? brcSig(room, exp, n) : '';
    if (!want || want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return json(r, 403, { error: 'forbidden' });
    if (exp < t || exp > t + BRC_REPLY_MS + 5e3) return json(r, 403, { error: 'reply link expired' });
    for (const [k, v] of brcUses) if (v.exp < t) brcUses.delete(k);
    const us = brcUses.get(n) || { exp, c: 0 }; if (us.c >= 4) return json(r, 429, { error: 'reply link used up' }); us.c++; brcUses.set(n, us);
    const b = (await body(q)) || {}; const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, BRC_MAX);
    if (!text) return json(r, 400, { error: 'text required' });
    const id = BRC.ins.run(room, null, 'Yoda', 'owner', 'yoda', text, t).lastInsertRowid;
    const lr = brlReply(room, id, t, 'routine');   // latency-20261026
    brcPush(room, { id, from: 'Yoda', to: 'owner', role: 'yoda', text, at: t, route: 'routine', lat_ms: lr.lat_ms, reply_to: lr.reply_to });
    console.log(`[brchat] yoda reply room ${room} len ${text.length} routine ${lr.lat_ms == null ? '?' : lr.lat_ms + 'ms'}`); return json(r, 200, { ok: true, id });
  }
  const uid = currentUser(q); if (!uid) return json(r, 401, { error: 'Sign in to HubFace first.' });
  if (ep === 'buy-test-order') {   // mockstripe-20261026: MOCK checkout (test mode). Test record only: no Stripe call, no charge, no token credit, no balance/plan change. Only the test card last4 4242 is accepted; no card data is stored.
    if (q.method !== 'POST' || !sameOrigin(q)) return json(r, 403, { error: 'forbidden' });
    const t = Date.now(), rl = (brcRate.get('buyt:' + uid) || []).filter((x) => t - x < 60e3); if (rl.length >= 20) return json(r, 429, { error: 'slow down' }); rl.push(t); brcRate.set('buyt:' + uid, rl);
    const b = (await body(q)) || {}; const d = Math.floor(+b.dollars || 0); const kind = b.kind === 'monthly' ? 'monthly' : b.kind === 'one_time' ? 'one_time' : '';
    if (!kind) return json(r, 400, { error: 'kind must be one_time or monthly' });
    if (!(d >= 5 && d <= 9999999) || String(b.dollars) !== String(d)) return json(r, 400, { error: 'whole dollars, minimum $5' });
    if (String(b.last4 || '') !== '4242') return json(r, 400, { error: 'Test mode takes only the test card.' });
    const rec = { at: t, uid, room: BRC_RE.test(room) ? room : null, kind, tier: String(b.tier || '').slice(0, 12), dollars: d, tokens: d * 100, test: true, card: 'test-4242', balance_change: 0, renews: kind === 'monthly' ? t + 30 * 864e5 : null, note: 'mock checkout; no charge; no credit' };
    try { fs.appendFileSync('/var/lib/hubface/buy-test-orders.jsonl', JSON.stringify(rec) + '\n'); } catch (e) { return json(r, 500, { error: 'could not record test order' }); }
    console.log(`[brbuy] TEST order user ${uid} ${kind} $${d}`); return json(r, 200, { ok: true, test: true, kind, dollars: d, tokens: d * 100, balance_change: 0, renews: rec.renews });
  }
  if (ep === 'buy-intent') {   // buytokens-20261026: checkout NOT connected. Logs the click only; no charge, no balance change.
    if (q.method !== 'POST' || !sameOrigin(q)) return json(r, 403, { error: 'forbidden' });
    const t = Date.now(), rl = (brcRate.get('buy:' + uid) || []).filter((x) => t - x < 60e3); if (rl.length >= 20) return json(r, 429, { error: 'slow down' }); rl.push(t); brcRate.set('buy:' + uid, rl);
    const b = (await body(q)) || {}; const d = Math.floor(+b.dollars || 0);
    if (!(d >= 5 && d <= 9999999) || String(b.dollars) !== String(d)) return json(r, 400, { error: 'whole dollars, minimum $5' });
    try { fs.appendFileSync('/var/lib/hubface/buy-intents.jsonl', JSON.stringify({ at: t, uid, room: BRC_RE.test(room) ? room : null, tier: String(b.tier || '').slice(0, 12), dollars: d, tokens: d * 100, note: 'checkout not connected; no charge' }) + '\n'); } catch (e) {}
    console.log(`[brbuy] intent user ${uid} $${d}`); return json(r, 200, { ok: true, checkout: false, message: "Checkout isn't connected yet" });
  }
  if (!BRC_RE.test(room)) return json(r, 400, { error: 'bad room' });
  const tok = String(q.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const ws = await brcWatchSeat(room, tok); if (ws.seat < 0) return json(r, ws.down ? 503 : 401, { error: ws.down ? (ws.why || 'relay_unavailable') : 'owner_watch_token_required' });
  if (ep === 'stt') return brcStt(q, r, room);
  if (ep === 'speak') return brcSpeak(q, r, room);   // tts-20261026
  if (ep === 'stt-token') return brcSttToken(q, r, room);   // stream-20261026   // mic2-20261026
  if (ep === 'owner-stream') { if (q.method !== 'GET') return json(r, 405, { error: 'GET' }); return brcStream(q, r, room, +u.searchParams.get('after') || 0); }
  if (ep === 'latency') { if (q.method !== 'GET') return json(r, 405, { error: 'GET' }); return json(r, 200, brlStats(room)); }   // latency-20261026
  if (ep === 'owner-messages') { if (q.method !== 'GET') return json(r, 405, { error: 'GET' }); return json(r, 200, { room, messages: BRC.list.all(room, +u.searchParams.get('after') || 0) }); }
  if (q.method !== 'POST') return json(r, 405, { error: 'POST' });
  if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
  const t = Date.now(), rl = (brcRate.get(room) || []).filter((x) => t - x < 60e3); if (rl.length >= 20) return json(r, 429, { error: 'too many messages, wait a minute' }); rl.push(t); brcRate.set(room, rl);
  const b = (await body(q)) || {}; const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
  if (!text) return json(r, 400, { error: 'empty' }); if (text.length > BRC_MAX) return json(r, 413, { error: 'too_long', max: BRC_MAX });
  const me = ws.bots[ws.seat] || {}; const nm = (v, d) => { if (v && typeof v === 'object') v = v.name || v.realName || ''; v = String(v || '').trim(); return (!v || v === '[object Object]' ? d : v).slice(0, 40); };   // nameobj-20261026
  const ownerName = nm(me.owner, 'Owner'), botName = nm(me.name, 'Yoda');
  const recent = BRC.recent.all(room).reverse().map((e) => ({ ...e, from: e.from === '[object Object]' ? botName : e.from }));
  const id = BRC.ins.run(room, uid, ownerName, botName, 'owner', text, t).lastInsertRowid;
  brcPush(room, { id, from: ownerName, to: botName, role: 'owner', text, at: t });
  const cs = +b.sent_at > t - 120e3 && +b.sent_at < t + 120e3 ? +b.sent_at : 0, lo = { id, t, cs, route: brcFastOk(text) ? 'fast' : 'routine' };   // latency-20261026
  { const L = (brlPend.get(room) || []).filter((x) => t - x.t < 15 * 60e3); L.push(lo); brlPend.set(room, L.slice(-50)); }
  brlLog({ k: 'owner', room, id, at: t, client_sent: cs || null, upload_ms: cs ? t - cs : null, route: lo.route, len: text.length, subs: brlSubs(room) });
  // forward to the existing Yoda routine webhook (same hook + auth as room chat); no hook -> stored only
  let hook = 'not_configured', fast = null;
  if (brcFastOk(text)) {   // fastlane-20261026
    const f0 = Date.now(); let via = 'rules', reply = '';
    try { const rs0 = await import('./roomserver.mjs'); if (typeof rs0.botroomFastReply === 'function') { const fr = await rs0.botroomFastReply({ room, from: ownerName, text, recent, timeoutMs: 2500 }); if (fr && fr.task) via = 'task'; else if (fr && fr.text) { reply = fr.text; via = 'model'; } } } catch (e) {}
    // fastlane2: model says task -> full routine only; rule fallback only for plain greetings/pings (BRF_SMALL), other chatter without a model reply -> full routine
    if (!reply && via !== 'task' && BRF_SMALL.test(text.toLowerCase().replace(/[!?.,~;:"]+/g, ' ').trim())) reply = brcRuleReply(text);
    if (reply) { const ft = Date.now(), fid = BRC.ins.run(room, null, botName, ownerName, 'yoda', reply, ft).lastInsertRowid;
    const lr = brlReply(room, fid, ft, 'fast', via);   // latency-20261026
    brcPush(room, { id: fid, from: botName, to: ownerName, role: 'yoda', text: reply, at: ft, route: 'fast', lat_ms: lr.lat_ms, reply_to: lr.reply_to });
    fast = { id: fid, text: reply, via, ms: ft - f0 }; }
    if (!reply) lo.route = 'routine'; brlLog({ k: 'fastlane', room, id, via, answered: !!reply, ms: Date.now() - f0 });
    console.log(`[brchat] fastlane room ${room} via ${via}${reply ? '' : ' (no fast reply -> routine)'} ${Date.now() - f0}ms`);
  }
  try { const rs = await import('./roomserver.mjs'); if (typeof rs.botroomHook === 'function') {
    const exp = t + BRC_REPLY_MS, n = crypto.randomBytes(6).toString('hex'), sig = brcSig(room, exp, n);
    const o = await rs.botroomHook({ event: 'botroom.owner_message', room, roomName: 'Bot Room ' + room, from: ownerName, role: 'host', to: botName, text, source: 'botroom', at: t,
      reply: sig ? `https://hubface.org/api/account/botmeter/yoda-reply?room=${room}&exp=${exp}&n=${n}&sig=${sig}` : '', reply_expires: exp, reply_body: '{"text":"..."}', relay_mode: ws.mode || '', recent, ...(fast ? { fast_answered: true, fast_reply: fast.text, needs_action: false } : {}) });
    hook = o && o.status ? String(o.status) : 'error'; } } catch (e) { hook = 'error'; }
  BRC.hook.run(hook, id);
  console.log(`[brchat] owner message room ${room} seat ${ws.seat} len ${text.length} hook ${hook}`);
  return json(r, 200, { ok: true, message: { id, from: ownerName, to: botName, role: 'owner', text, at: t }, delivered: /^2\d\d$/.test(hook), hook, ...(fast ? { fast: { id: fast.id, via: fast.via, ms: fast.ms } } : {}) });
}
