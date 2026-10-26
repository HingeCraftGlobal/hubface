// HingeCraft Agent Passport service (STAGED). One process owns the passport DB (sql.js/SQLite file, mode 600).
// Listeners:
//   PUBLIC  127.0.0.1:3476 (nginx proxies ONLY /passport/* and /api/passport/*): invite form, register, card page, sponsor reveal.
//   PRIVATE 127.0.0.1:3479 (never proxied): /internal/door-check (relay), /admin/* (allowlisted HingeCraft admins only).
// The CVV is never stored or logged in plaintext; card pages render card fields only.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { renderCard } from './render-card.mjs';
import { newCvv, newSecret, hashSecret, verifySecret, seal, unseal, findByToken } from './cvv.mjs';
import { sendMail, sendSms, mailEnabled, cvvEmail } from './mailer.mjs';

const DB_FILE = process.env.PASSPORT_DB || '/opt/hubface/passport/passports.db';
const PHOTOS = process.env.PASSPORT_PHOTOS || path.join(path.dirname(DB_FILE), 'photos');
const PUBLIC_BASE = process.env.PASSPORT_PUBLIC_BASE || 'https://rooms.hubface.org';
export const ADMIN_ALLOWLIST = ['dan@hingecraft-global.ai', 'sarah@hingecraft-global.ai']; // exact match only, case-insensitive
const MAX_FAILS = 5, REVEAL_TTL_MS = 24 * 3600e3;
export const PERMS = [ // Talk / Act / Money — 8 boxes, 3 granted at signup
  { group: 'Talk', key: 'join_rooms', label: 'Join invited rooms', allowed: true },
  { group: 'Talk', key: 'propose', label: 'Propose terms', allowed: true },
  { group: 'Talk', key: 'counter', label: 'Counter offers', allowed: true },
  { group: 'Act', key: 'share_docs', label: 'Share documents', allowed: false },
  { group: 'Act', key: 'sign', label: 'Sign deals', allowed: false },
  { group: 'Act', key: 'no_approval', label: 'Act without owner approval', allowed: false },
  { group: 'Money', key: 'move_money', label: 'Move money', allowed: false },
  { group: 'Money', key: 'payments', label: 'Make payments', allowed: false },
];

let db, SQL;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS passports (passport_no TEXT PRIMARY KEY, bot_name TEXT, title TEXT, title_set_by TEXT, role TEXT, owner TEXT,
  owner_email TEXT, owner_phone TEXT, sponsor TEXT, origin TEXT, rooms TEXT, perms TEXT, issued TEXT, expires TEXT, status TEXT, photo TEXT,
  cvv_salt TEXT, cvv_hash TEXT, cvv_rev INTEGER DEFAULT 0, cvv_status TEXT, owner_key_salt TEXT, owner_key_hash TEXT,
  fails INTEGER DEFAULT 0, locked_at TEXT, rooms_completed INTEGER DEFAULT 0, verified_rooms INTEGER DEFAULT 0, disputes INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS invites (invite_id TEXT PRIMARY KEY, passport_no TEXT, owner TEXT, sponsor TEXT, email TEXT, phone TEXT, rooms TEXT,
  expires TEXT, first_invite INTEGER, created TEXT, used TEXT);
CREATE TABLE IF NOT EXISTS reveals (id TEXT PRIMARY KEY, passport_no TEXT, purpose TEXT, iv TEXT, ct TEXT, tag TEXT, rev INTEGER,
  expires TEXT, used TEXT, code_salt TEXT, code_hash TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT, passport_no TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS counter (k TEXT PRIMARY KEY, n INTEGER);`;
export async function openDb(file = DB_FILE) {
  SQL = SQL || await (await import('sql.js')).default();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run(SCHEMA); persist(file); return db;
}
function persist(file = DB_FILE) { // atomic write, root-only
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, Buffer.from(db.export()), { mode: 0o600 }); fs.renameSync(tmp, file); fs.chmodSync(file, 0o600);
}
const all = (q, p = []) => { const s = db.prepare(q); s.bind(p); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r; };
const one = (q, p) => all(q, p)[0];
const run = (q, p = []) => db.run(q, p);
const audit = (actor, action, no, detail = '') => run('INSERT INTO audit (ts,actor,action,passport_no,detail) VALUES (?,?,?,?,?)', [new Date().toISOString(), actor, action, no || '', detail]);
const now = () => new Date().toISOString();
const plus12 = d => { const e = new Date(d); e.setMonth(e.getMonth() + 12); return e.toISOString().slice(0, 10); };

// Passport ID: [A-Z][4-digit sequential]-[4 random digits][A-Z]
export const ID_RE = /^[A-Z]\d{4}-\d{4}[A-Z]$/;
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function nextPassportId() {
  const n = (one("SELECT n FROM counter WHERE k='seq'")?.n || 0) + 1, block = Math.floor((n - 1) / 9999);
  if (block >= 26) throw new Error('id_space_exhausted');
  const seq = LET[block] + String(((n - 1) % 9999) + 1).padStart(4, '0'); let id;
  do id = `${seq}-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}${LET[crypto.randomInt(0, 26)]}`;
  while (one('SELECT 1 x FROM passports WHERE passport_no=? UNION SELECT 1 FROM invites WHERE passport_no=?', [id, id]));
  run("INSERT OR REPLACE INTO counter VALUES ('seq', ?)", [n]); return id;
}

// ---- CVV issue / reset (emails owner; sponsor gets one-time link inside that email for the owner to pass on) ----
async function issueCvv(p, actor, reset = false) {
  if (!mailEnabled()) { run("UPDATE passports SET cvv_status='awaiting_mail_enable' WHERE passport_no=?", [p.passport_no]); audit(actor, 'cvv_deferred_mail_disabled', p.passport_no); return { cvv: 'pending_mail_enable' }; }
  const cvv = newCvv(), h = hashSecret(cvv), rev = (p.cvv_rev || 0) + 1;
  const ownerKey = reset ? null : newSecret(12), ok = ownerKey ? hashSecret(ownerKey) : null;
  const token = newSecret(32), s = seal(token, cvv);
  await sendMail({ to: p.owner_email, ...cvvEmail({ owner: p.owner, botName: p.bot_name, passportNo: p.passport_no, cvv, ownerKey, sponsor: p.sponsor,
    sponsorLink: `${PUBLIC_BASE}/passport/reveal/${token}`, reset }) });
  run("UPDATE reveals SET used=? WHERE passport_no=? AND used IS NULL", [now() + ' (revoked)', p.passport_no]); // old links die with old CVV
  run('INSERT INTO reveals (id,passport_no,purpose,iv,ct,tag,rev,expires,used) VALUES (?,?,?,?,?,?,?,?,NULL)', [s.id, p.passport_no, 'sponsor', s.iv, s.ct, s.tag, rev, new Date(Date.now() + REVEAL_TTL_MS).toISOString()]);
  run(`UPDATE passports SET cvv_salt=?, cvv_hash=?, cvv_rev=?, cvv_status='issued', fails=0, locked_at=NULL, status=CASE WHEN status='locked' THEN 'registered' ELSE status END
       ${ok ? ', owner_key_salt=?, owner_key_hash=?' : ''} WHERE passport_no=?`, ok ? [h.salt, h.hash, rev, ok.salt, ok.hash, p.passport_no] : [h.salt, h.hash, rev, p.passport_no]);
  audit(actor, reset ? 'cvv_reset' : 'cvv_issued', p.passport_no, `rev ${rev}; emailed owner; sponsor link created`);
  return { cvv: 'emailed' };
}

// ---- door check (relay calls this on the PRIVATE listener) ----
export function doorCheck({ passportNo, botName, cvv }) {
  if (!ID_RE.test(String(passportNo || ''))) return { ok: false, why: 'passport_id_invalid' };
  const p = one('SELECT * FROM passports WHERE passport_no=?', [passportNo]);
  if (!p) return { ok: false, why: 'passport_not_registered' };
  if (p.status === 'locked' || p.locked_at) return { ok: false, why: 'passport_locked' };
  if (p.status !== 'registered') return { ok: false, why: 'passport_' + (p.status || 'invalid') };
  if (String(p.bot_name).toLowerCase() !== String(botName || '').toLowerCase()) return { ok: false, why: 'passport_name_mismatch' };
  if (!(Date.parse(p.expires) > Date.now())) return { ok: false, why: 'passport_expired' };
  if (p.expires > plus12(p.issued)) return { ok: false, why: 'passport_validity_exceeds_12_months' };
  if (p.cvv_status !== 'issued') return { ok: false, why: 'cvv_not_issued' };
  if (!verifySecret(String(cvv || ''), { salt: p.cvv_salt, hash: p.cvv_hash })) {
    const fails = (p.fails || 0) + 1;
    if (fails >= MAX_FAILS) { run("UPDATE passports SET fails=?, status='locked', locked_at=? WHERE passport_no=?", [fails, now(), passportNo]); audit('relay', 'locked_after_failed_cvv', passportNo, `${fails} fails`); persist(); return { ok: false, why: 'passport_locked' }; }
    run('UPDATE passports SET fails=? WHERE passport_no=?', [fails, passportNo]); audit('relay', 'cvv_mismatch', passportNo, `fail ${fails}`); persist();
    return { ok: false, why: 'cvv_mismatch' };
  }
  if (p.fails) { run('UPDATE passports SET fails=0 WHERE passport_no=?', [passportNo]); persist(); }
  return { ok: true, passportNo };
}

// ---- admin auth: identity comes from HubFace session verification (hook), then exact allowlist ----
let verifyIdentity = async req => { // go-live: call HubFace local session check; staged default refuses everyone
  const url = process.env.HUBFACE_SESSION_VERIFY_URL; if (!url) return null;
  const r = await fetch(url, { headers: { cookie: req.headers.cookie || '' } }); if (!r.ok) return null;
  const j = await r.json(); const e = j && (j.email || (j.account && j.account.email) || (j.user && j.user.email)); return e ? String(e) : null;
};
export const setIdentityVerifier = f => { verifyIdentity = f; };
export const isAllowedAdmin = email => !!email && ADMIN_ALLOWLIST.includes(String(email).trim().toLowerCase());

const send = (res, c, b, t = 'application/json') => { res.writeHead(c, { 'content-type': t, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(t === 'application/json' ? JSON.stringify(b) : b); };
const body = async req => { let s = ''; for await (const c of req) { s += c; if (s.length > 3e6) throw new Error('too_large'); } return s ? JSON.parse(s) : {}; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cardFields = p => ({ passportNo: p.passport_no, botName: p.bot_name, title: p.title, role: p.role, owner: p.owner, sponsor: p.sponsor, origin: p.origin,
  issued: p.issued, expires: p.expires, rooms_completed: p.rooms_completed, verified_rooms: p.verified_rooms, disputes: p.disputes, perms: JSON.parse(p.perms || '[]') });
const qrText = p => `HINGECRAFT AGENT PASSPORT\nNo: ${p.passport_no}\nBot: ${p.bot_name}\nOwner: ${p.owner}\nSponsor: ${p.sponsor}\nIssuer: HingeCraft Global PBC\nOttawa, Canada\nValid: ${p.issued} to ${p.expires}`;
const INVITE = fs.readFileSync(new URL('./invite.html', import.meta.url), 'utf8');

// ---------------- PUBLIC ----------------
export async function publicHandler(req, res) {
  const u = new URL(req.url, 'http://x'); let m;
  try {
    if ((m = u.pathname.match(/^\/passport\/invite\/([a-f0-9]{32})$/)) && req.method === 'GET') {
      const i = one('SELECT * FROM invites WHERE invite_id=?', [m[1]]); if (!i || i.used) return send(res, 404, 'Invite not found or already used', 'text/plain');
      return send(res, 200, INVITE.replace('__INVITE__', JSON.stringify({ inviteId: i.invite_id, owner: i.owner, sponsor: i.sponsor, passportNo: i.passport_no, rooms: JSON.parse(i.rooms), expires: plus12(now()) }).replace(/</g, '\\u003c')), 'text/html');
    }
    if (u.pathname === '/api/passport/register' && req.method === 'POST') {
      const d = await body(req), i = one('SELECT * FROM invites WHERE invite_id=?', [String(d.inviteId || '')]);
      if (!i || i.used) return send(res, 404, { error: 'invite_invalid' });
      const s = (v, n) => String(v || '').trim().slice(0, n), issued = now().slice(0, 10);
      const p = { passport_no: i.passport_no, bot_name: s(d.botName, 40), title: s(d.title, 60), title_set_by: i.owner, role: s(d.role, 60), owner: i.owner,
        owner_email: i.email, owner_phone: s(d.phone, 30) || i.phone || '', sponsor: s(d.sponsor, 60) || i.sponsor, origin: s(d.origin, 80), rooms: i.rooms,
        perms: JSON.stringify(PERMS), issued, expires: plus12(issued), status: 'registered', photo: null };
      if (!p.bot_name || !p.role || !p.origin || !p.title) return send(res, 400, { error: 'missing_fields' });
      const pm = String(d.photo || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
      if (pm) { fs.mkdirSync(PHOTOS, { recursive: true, mode: 0o700 }); const f = `${p.passport_no}.${pm[1] === 'jpeg' ? 'jpg' : pm[1]}`; fs.writeFileSync(path.join(PHOTOS, f), Buffer.from(pm[2], 'base64'), { mode: 0o600 }); p.photo = f; }
      const cols = Object.keys(p); run(`INSERT INTO passports (${cols}) VALUES (${cols.map(() => '?')})`, Object.values(p));
      run('UPDATE invites SET used=? WHERE invite_id=?', [now(), i.invite_id]); audit('owner:' + i.owner, 'registered', p.passport_no);
      const c = await issueCvv(one('SELECT * FROM passports WHERE passport_no=?', [p.passport_no]), 'system'); persist();
      return send(res, 200, { ok: true, passportNo: p.passport_no, card: `/passport/card/${p.passport_no}`, cvv: c.cvv });
    }
    if ((m = u.pathname.match(/^\/passport\/card\/([A-Z]\d{4}-\d{4}[A-Z])(\/photo)?$/)) && req.method === 'GET') {
      const p = one("SELECT * FROM passports WHERE passport_no=? AND status IN ('registered','locked')", [m[1]]); if (!p) return send(res, 404, 'Not registered', 'text/plain');
      if (m[2]) { if (!p.photo) return send(res, 404, 'No photo', 'text/plain'); res.writeHead(200, { 'cache-control': 'no-store' }); return fs.createReadStream(path.join(PHOTOS, p.photo)).pipe(res); }
      const QR = (await import('qrcode')).default, qrSrc = await QR.toDataURL(qrText(p));
      return send(res, 200, renderCard(cardFields(p), { qrSrc, photoSrc: p.photo ? `/passport/card/${p.passport_no}/photo` : null }), 'text/html');
    }
    if ((m = u.pathname.match(/^\/passport\/reveal\/([a-f0-9]{64})$/)) && req.method === 'GET') // GET never consumes (link previews); button POSTs
      return send(res, 200, REVEAL_PAGE, 'text/html');
    if (u.pathname === '/api/passport/reveal' && req.method === 'POST') {
      const d = await body(req), r = findByToken(all('SELECT * FROM reveals WHERE used IS NULL'), String(d.token || ''));
      if (!r || Date.parse(r.expires) < Date.now()) return send(res, 410, { error: 'link_expired_or_used' });
      if (r.code_hash && !verifySecret(String(d.code || ''), { salt: r.code_salt, hash: r.code_hash })) return send(res, 403, { error: 'second_factor_required' });
      const p = one('SELECT * FROM passports WHERE passport_no=?', [r.passport_no]);
      if (r.purpose === 'sponsor' && p.cvv_rev !== r.rev) return send(res, 410, { error: 'link_expired_or_used' });
      const cvv = unseal(String(d.token), r); run('UPDATE reveals SET used=? WHERE id=?', [now(), r.id]);
      if (r.purpose === 'recovery') { const h = hashSecret(cvv); run("UPDATE passports SET cvv_salt=?, cvv_hash=?, cvv_rev=cvv_rev+1, cvv_status='issued', fails=0 WHERE passport_no=?", [h.salt, h.hash, p.passport_no]); }
      audit(r.purpose, 'cvv_revealed', p.passport_no, r.purpose); persist();
      return send(res, 200, { ok: true, passportNo: p.passport_no, botName: p.bot_name, cvv });
    }
    if (u.pathname === '/api/passport/reset-cvv' && req.method === 'POST') { // owner key (from the first CVV email)
      const d = await body(req), p = one('SELECT * FROM passports WHERE passport_no=?', [String(d.passportNo || '')]);
      if (!p || !verifySecret(String(d.ownerKey || ''), { salt: p.owner_key_salt, hash: p.owner_key_hash })) return send(res, 403, { error: 'forbidden' });
      const c = await issueCvv(p, 'owner:' + p.owner, true); persist(); return send(res, 200, { ok: true, cvv: c.cvv });
    }
    if (u.pathname === '/api/passport/recover' && req.method === 'POST') { // email link + SMS/app code; OFF until Dan approves
      if (process.env.PASSPORT_RECOVERY_ENABLED !== '1') return send(res, 503, { error: 'recovery_disabled' });
      const d = await body(req), p = one('SELECT * FROM passports WHERE passport_no=?', [String(d.passportNo || '')]);
      if (p && p.owner_email && p.owner_phone) {
        const cvv = newCvv(), token = newSecret(32), code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), s = seal(token, cvv), ch = hashSecret(code);
        run('INSERT INTO reveals (id,passport_no,purpose,iv,ct,tag,rev,expires,used,code_salt,code_hash) VALUES (?,?,?,?,?,?,?,?,NULL,?,?)', [s.id, p.passport_no, 'recovery', s.iv, s.ct, s.tag, p.cvv_rev, new Date(Date.now() + 3600e3).toISOString(), ch.salt, ch.hash]);
        await sendMail({ to: p.owner_email, subject: `Passport ${p.passport_no} CVV recovery`, text: `Open within 1 hour: ${PUBLIC_BASE}/passport/reveal/${token}\nYou will also need the code sent to your phone. The old CVV keeps working until you finish.` });
        await sendSms({ to: p.owner_phone, text: `HingeCraft passport recovery code: ${code}` });
        audit('anon', 'recovery_requested', p.passport_no); persist();
      }
      return send(res, 200, { ok: true }); // same answer either way (no enumeration)
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) { return send(res, 500, { error: 'server_error' }); } // never echo inputs
}

// ---------------- PRIVATE (127.0.0.1:3479, not proxied) ----------------
export async function privateHandler(req, res) {
  const u = new URL(req.url, 'http://x');
  try {
    if (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) return send(res, 403, { error: 'local_only' });
    if (u.pathname === '/internal/door-check' && req.method === 'POST') return send(res, 200, doorCheck(await body(req)));
    if (u.pathname.startsWith('/admin/')) {
      const who = await verifyIdentity(req);
      if (!isAllowedAdmin(who)) { audit(who || 'anonymous', 'admin_refused', '', u.pathname); persist(); return send(res, 403, { error: 'not_allowlisted' }); }
      const actor = 'admin:' + who.toLowerCase();
      if (u.pathname === '/admin/passports' && req.method === 'GET') return send(res, 200, all('SELECT passport_no,bot_name,title,role,owner,owner_email,sponsor,origin,issued,expires,status,cvv_status,cvv_rev,fails,locked_at,perms FROM passports ORDER BY passport_no'));
      if (u.pathname === '/admin/audit' && req.method === 'GET') return send(res, 200, all('SELECT * FROM audit ORDER BY id DESC LIMIT 500'));
      if (u.pathname === '/admin/invites' && req.method === 'POST') {
        const d = await body(req), no = nextPassportId(), id = newSecret(16), r = String(d.rooms || '').split(',').map(x => x.trim()).filter(Boolean);
        const first = one('SELECT 1 x FROM passports WHERE owner=?', [d.owner]) ? 0 : 1;
        run('INSERT INTO invites VALUES (?,?,?,?,?,?,?,?,?,?,NULL)', [id, no, d.owner, d.sponsor || d.owner, d.email, d.phone || '', JSON.stringify(r), '', first, now()]);
        audit(actor, 'invite_created', no, first ? 'first invite for owner' : ''); persist();
        return send(res, 200, { passportNo: no, inviteUrl: `${PUBLIC_BASE}/passport/invite/${id}`, firstInvite: !!first, email: 'draft — send via Dan-approved draft card' });
      }
      let m;
      if ((m = u.pathname.match(/^\/admin\/passports\/([A-Z]\d{4}-\d{4}[A-Z])\/(revoke|unlock|reset-cvv|issue-cvv)$/)) && req.method === 'POST') {
        const p = one('SELECT * FROM passports WHERE passport_no=?', [m[1]]); if (!p) return send(res, 404, { error: 'not_found' });
        if (m[2] === 'revoke') run("UPDATE passports SET status='revoked' WHERE passport_no=?", [p.passport_no]);
        if (m[2] === 'unlock') run("UPDATE passports SET status='registered', fails=0, locked_at=NULL WHERE passport_no=? AND status='locked'", [p.passport_no]);
        let out = {}; if (m[2] === 'reset-cvv' || m[2] === 'issue-cvv') out = await issueCvv(p, actor, m[2] === 'reset-cvv');
        audit(actor, m[2], p.passport_no); persist(); return send(res, 200, { ok: true, ...out });
      }
      return send(res, 404, { error: 'not_found' });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) { return send(res, 500, { error: 'server_error' }); }
}

const REVEAL_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Passport CVV — one-time link</title>
<style>body{margin:0;background:#050b1c;color:#fff;font:15px Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:40px}
.b{width:460px;border:1.5px solid #2fa8ff;border-radius:14px;background:linear-gradient(180deg,#0a1734,#071127);padding:22px}h1{font-size:18px;letter-spacing:.12em;margin:0 0 10px}
button{background:#fff;color:#0b1f3a;border:0;border-radius:8px;padding:10px 16px;font-weight:800;cursor:pointer}.c{font:700 46px "Courier New",monospace;letter-spacing:.3em;margin:14px 0}
input{background:#0d1e44;color:#fff;border:1px solid #4a7fd0;border-radius:6px;padding:7px;font:inherit}.w{border:1px solid #f87171;border-radius:8px;padding:8px;font-weight:600}</style></head>
<body><div class="b"><h1>AGENT PASSPORT · CVV</h1><p>This one-time link shows a passport CVV once. It expires 24 hours after it was created.</p>
<div id="code2" hidden><p>Enter the code sent to your phone:</p><input id="code" inputmode="numeric" maxlength="6"></div>
<p><button id="go">Reveal CVV</button></p><div id="out"></div></div>
<script>const t=location.pathname.split('/').pop();go.onclick=async()=>{const r=await fetch('/api/passport/reveal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:t,code:code.value})});const j=await r.json();
if(j.error==='second_factor_required'){code2.hidden=false;return}if(!j.ok){out.innerHTML='<div class="w">This link has expired or was already used.</div>';return}
go.remove();out.innerHTML='<div>Passport '+j.passportNo+' · '+j.botName+'</div><div class="c">'+j.cvv+'</div><div class="w">Save this now. It won\\'t be shown again. Never put it on the card, in chat or in code.</div>'};</script></body></html>`;
export { REVEAL_PAGE };
// go-live seed: insert reviewed passports with fixed IDs (no CVV generated while mail is off), bump counter. Run BEFORE the service starts.
export function seedPassports(rows) {
  let maxN = one("SELECT n FROM counter WHERE k='seq'")?.n || 0;
  for (const r of rows) {
    if (!ID_RE.test(r.passport_no)) throw new Error('bad id');
    if (one('SELECT 1 AS x FROM passports WHERE passport_no=?', [r.passport_no])) continue;
    const p = { title_set_by: r.owner, perms: JSON.stringify(PERMS), status: 'registered', cvv_status: 'awaiting_mail_enable', photo: null, ...r };
    const cols = Object.keys(p); run(`INSERT INTO passports (${cols}) VALUES (${cols.map(() => '?')})`, Object.values(p));
    audit('admin:dan@hingecraft-global.ai', 'seeded_golive', p.passport_no);
    maxN = Math.max(maxN, +r.passport_no.slice(1, 5));
  }
  run("INSERT OR REPLACE INTO counter VALUES ('seq', ?)", [maxN]); persist();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await openDb();
  http.createServer(publicHandler).listen(+process.env.PASSPORT_PORT || 3476, '127.0.0.1');
  http.createServer(privateHandler).listen(+process.env.PASSPORT_PRIVATE_PORT || 3479, '127.0.0.1');
  console.log('passport service up'); // no secrets logged
}
