// HubFace in-app email invites (inappsend-20261018-v1, Dan approved). Hosted site only.
//   GET  /api/invite/email/status -> {configured, signedIn, from, replyTo, max}
//   POST /api/invite/email {to:[emails], subject, body, link, room} -> 200 {ok, results:[{email, ok, error?}], sent, failed}
//        401 not signed in | 403 cross-site | 409 {configured:false} sending not connected | 429 rate limited | 400 bad input
// Sends ONE email per picked person (nobody sees the other addresses). Only a signed-in HubFace member can send; From shows the
// member's name ("<name> via HubFace"), Reply-To is the member's own email. Max 20 people per send; per member 5 sends / 10 min and
// 40 people / hour. Sending needs SMTP settings in the service environment (same names HingeHub uses):
//   SMTP_USER, SMTP_PASS (e.g. a Gmail address + Google app password), optional SMTP_HOST (default smtp.gmail.com),
//   SMTP_PORT (default 465), SMTP_SECURE, SMTP_FROM (address shown as From; default SMTP_USER).
// Without them every send returns 409 "Email sending isn't connected yet." Passwords are never logged or returned.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const INVITE_MAIL_BUILD = 'inappsend-20261018-v1';
const DB_PATH = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const COOKIE = 'hf_session';
const MAX_TO = 20, MAX_BODY = 64 * 1024, SENDS_PER_10M = 5, PEOPLE_PER_HOUR = 40;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const LINK_RE = /^https:\/\/(?:hubface\.org|rooms\.hubface\.org)(?:\/[^\s<>"]*)?$/i;

const db = new Database(DB_PATH, { fileMustExist: true });   // read-only use (SELECTs only)
db.pragma('busy_timeout = 5000');
const Q = {
  session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  user: db.prepare('SELECT id, email, username, real_name FROM users WHERE id = ?'),
};
const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function cookies(q) { const o = {}; for (const part of String(q.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); } return o; }
function member(q) {
  const tok = cookies(q)[COOKIE]; if (!tok || !/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return null;
  const s = Q.session.get(sha(tok)); if (!s || s.expires_at < new Date().toISOString()) return null;
  return Q.user.get(s.user_id) || null;
}
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const readBody = (q) => new Promise((res, rej) => { let n = 0, over = false; const ch = []; q.on('data', (c) => { n += c.length; if (n > MAX_BODY) over = true; else ch.push(c); }); q.on('end', () => (over ? rej(new Error('too large')) : res(Buffer.concat(ch)))); q.on('error', rej); });
const clean1 = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);
const nameOf = (u) => clean1(u.real_name || u.username || String(u.email).split('@')[0], 60).replace(/["<>\\]/g, '');

function smtp() {
  const user = String(process.env.SMTP_USER || '').trim(), pass = String(process.env.SMTP_PASS || '');
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465) || 465;
  const from = String(process.env.SMTP_FROM || user).replace(/^.*<([^>]+)>.*$/, '$1').trim();
  return { host: String(process.env.SMTP_HOST || 'smtp.gmail.com').trim(), port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465, user, pass, from };
}
let transport = null, transportKey = '';
async function getTransport(c) {
  const k = [c.host, c.port, c.secure, c.user].join('|');
  if (transport && transportKey === k) return transport;
  const nm = (await import('nodemailer')).default;
  transport = nm.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  transportKey = k; return transport;
}
const hits = new Map();   // uid -> [{at, n}]
function rate(uid, n) {
  const t = Date.now(), a = (hits.get(uid) || []).filter((x) => t - x.at < 3600e3);
  const sends10 = a.filter((x) => t - x.at < 600e3).length, people = a.reduce((s, x) => s + x.n, 0);
  if (sends10 >= SENDS_PER_10M) return 'Too many invites in a short time. Wait a few minutes and try again.';
  if (people + n > PEOPLE_PER_HOUR) return `You can invite up to ${PEOPLE_PER_HOUR} people an hour. Try again later or pick fewer people.`;
  a.push({ at: t, n }); hits.set(uid, a); return null;
}

export async function inviteRoute(q, r, p) {
  if (p === '/api/invite/email/status' && q.method === 'GET') {
    const u = member(q), c = smtp();
    json(r, 200, { configured: !!c, signedIn: !!u, from: u ? `${nameOf(u)} via HubFace` : null, replyTo: u ? u.email : null, max: MAX_TO, build: INVITE_MAIL_BUILD });
    return true;
  }
  if (p !== '/api/invite/email') return false;
  if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
  if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
  if (!/^application\/json\b/i.test(String(q.headers['content-type'] || ''))) { json(r, 415, { error: 'JSON only' }); return true; }
  const u = member(q); if (!u) { json(r, 401, { error: 'Sign in to send invites from HubFace.', signedIn: false }); return true; }
  let b; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { json(r, 400, { error: 'Bad request.' }); return true; }
  const raw = Array.isArray(b.to) ? b.to : [], seen = new Set(), to = [], bad = [];
  for (const x of raw.slice(0, 200)) { const e = String(x || '').trim().toLowerCase(); if (!e) continue; if (!EMAIL_RE.test(e) || e.length > 254) { bad.push(clean1(e, 80)); continue; } if (!seen.has(e)) { seen.add(e); to.push(e); } }
  if (bad.length) { json(r, 400, { error: `Not a valid email address: ${bad.slice(0, 5).join(', ')}` }); return true; }
  if (!to.length) { json(r, 400, { error: 'Pick at least one person.' }); return true; }
  if (to.length > MAX_TO) { json(r, 400, { error: `Up to ${MAX_TO} people per send. Pick fewer and send again.` }); return true; }
  const subject = clean1(b.subject, 200), link = clean1(b.link, 500);
  let body = String(b.body ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 20000).trim();
  if (!subject) { json(r, 400, { error: 'Add a subject.' }); return true; }
  if (!body) { json(r, 400, { error: 'The message is empty.' }); return true; }
  if (link && !LINK_RE.test(link)) { json(r, 400, { error: 'The room link must be a hubface.org link.' }); return true; }
  if (link && !body.includes(link)) body += `\n\nJoin here: ${link}`;
  const c = smtp();
  if (!c) { json(r, 409, { configured: false, error: 'Email sending isn\u2019t connected yet, so nothing was sent.' }); return true; }
  const lim = rate(u.id, to.length); if (lim) { json(r, 429, { error: lim }); return true; }
  let tr; try { tr = await getTransport(c); } catch (e) { console.warn('[invite] transport', String(e?.message || e).slice(0, 120)); json(r, 503, { error: 'Email sending isn\u2019t available on the server right now.' }); return true; }
  const from = { name: `${nameOf(u)} via HubFace`, address: c.from }, results = [];
  for (const e of to) {
    try { await tr.sendMail({ from, to: e, replyTo: { name: nameOf(u), address: u.email }, subject, text: body.replace(/\n/g, '\r\n') }); results.push({ email: e, ok: true }); }
    catch (err) { const m = String(err?.response || err?.message || err).replace(/\s+/g, ' ').slice(0, 160); results.push({ email: e, ok: false, error: m }); }
  }
  const sent = results.filter((x) => x.ok).length;
  console.log(`[invite] user ${u.id} sent ${sent}/${results.length}`);
  json(r, sent ? 200 : 502, { ok: sent > 0, sent, failed: results.length - sent, results, from: `${from.name} <${c.from}>`, replyTo: u.email });
  return true;
}
