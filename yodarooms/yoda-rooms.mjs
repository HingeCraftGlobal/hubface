// yodarooms-20261026a (Dan, voice c85ecff9, Oct 26 2026 ~10:31 PM ET): server-side bot rooms + bot seats + invites.
// Sidecar on 127.0.0.1:3481, nginx ^~ /api/yoda-rooms/. Never touches the meter/timer/pricing.
//   POST   /api/yoda-rooms/create            {name, desc?, bots?:[ids], invite?:[emails], send?:bool}   (Bearer token)
//   GET    /api/yoda-rooms/seats/<ID>                                                                 (public read)
//   POST   /api/yoda-rooms/seats/<ID>        {bots:[ids]} | {add:[ids]} | {remove:[ids]}  (Bearer, or room owner's hf_session, same-origin)
//   POST   /api/yoda-rooms/invite/<ID>       {to:[emails], send?:bool}  -> link + subject + body; send:true mails via SMTP (Bearer)
//   DELETE /api/yoda-rooms/room/<ID>         deletes a room this sidecar created + its seats (Bearer)
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/hubface/server/package.json');
const Database = require('better-sqlite3');
const BUILD = 'yodarooms-20261026a+sendbot-20261027a', PORT = 3481, ORIGIN = 'https://hubface.org';
const YODA_UID = Number(process.env.YODA_UID || 45);
const BOTS = ['yoda', 'ava', 'avadan', 'finn', 'moderator', 'companion-f', 'companion-m'];
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TOKEN = (() => { try { return fs.readFileSync(path.join(process.env.CREDENTIALS_DIRECTORY || '/nonexistent', 'token'), 'utf8').trim(); } catch { return ''; } })();
if (TOKEN.length < 32) { console.error('[yodarooms] no token; refusing to start'); process.exit(1); }
const rooms = new Database('/var/lib/hubface/rooms.db', { fileMustExist: true }); rooms.pragma('busy_timeout = 5000');
const acc = new Database('/var/lib/hubface/accounts.db', { fileMustExist: true, readonly: true }); acc.pragma('busy_timeout = 5000');
const sd = new Database('/var/lib/hubface/yoda-seats.db'); sd.pragma('journal_mode = WAL'); sd.pragma('busy_timeout = 5000');
sd.exec(`CREATE TABLE IF NOT EXISTS seats (room_id TEXT NOT NULL, bot TEXT NOT NULL, seated_at TEXT NOT NULL, by TEXT, PRIMARY KEY (room_id, bot));
CREATE TABLE IF NOT EXISTS created (room_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS log (at TEXT NOT NULL, room_id TEXT, action TEXT, detail TEXT);`);
const Q = {
  ins: rooms.prepare('INSERT INTO rooms (id, name, owner_user_id, owner_name, owner_key_hash, meta, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'),
  get: rooms.prepare('SELECT id, name, owner_user_id, owner_name, created_at FROM rooms WHERE id = ?'),
  del: rooms.prepare('DELETE FROM rooms WHERE id = ?'),
  sess: acc.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  user: acc.prepare('SELECT username, real_name FROM users WHERE id = ?'),
  seats: sd.prepare('SELECT bot, seated_at FROM seats WHERE room_id = ? ORDER BY seated_at, bot'),
  seat: sd.prepare('INSERT OR IGNORE INTO seats (room_id, bot, seated_at, by) VALUES (?,?,?,?)'),
  unseat: sd.prepare('DELETE FROM seats WHERE room_id = ? AND bot = ?'),
  clear: sd.prepare('DELETE FROM seats WHERE room_id = ?'),
  mark: sd.prepare('INSERT OR IGNORE INTO created (room_id, created_at) VALUES (?,?)'),
  isMine: sd.prepare('SELECT 1 FROM created WHERE room_id = ?'),
  unmark: sd.prepare('DELETE FROM created WHERE room_id = ?'),
  log: sd.prepare('INSERT INTO log VALUES (?,?,?,?)'),
};
const now = () => new Date().toISOString(), sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const link = (id) => `${ORIGIN}/interface/#room=${id}`;
const clean = (v, n = 80) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const EMAIL_RE = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
function json(r, c, o) { r.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); }
function bearer(q) { const h = String(q.headers.authorization || ''); const t = h.startsWith('Bearer ') ? h.slice(7).trim() : ''; return t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN)); }
function sessUid(q) { try { const m = /(?:^|;\s*)hf_session=([A-Za-z0-9_-]{30,80})/.exec(String(q.headers.cookie || '')); if (!m) return null; const s = Q.sess.get(sha(m[1])); return s && s.expires_at >= now() ? s.user_id : null; } catch { return null; } }
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; return String(q.headers.referer || '').startsWith(ORIGIN + '/'); }
function body(q) { return new Promise((res) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > 16384) { q.destroy(); res(null); } else ch.push(c); }); q.on('end', () => { try { res(ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}); } catch { res(null); } }); }); }
function newId() { const out = []; while (out.length < 10) for (const b of crypto.randomBytes(16)) if (b < 248 && out.length < 10) out.push(ALPHA[b % 31]); return 'HF-' + out.slice(0, 5).join('') + '-' + out.slice(5).join(''); }
const seatList = (id) => Q.seats.all(id).map((s) => s.bot);
const botsIn = (a) => (Array.isArray(a) ? a : []).map((x) => String(x).toLowerCase()).filter((x, i, s) => BOTS.includes(x) && s.indexOf(x) === i);
function setSeats(id, b, by) {
  const t = now();
  sd.transaction(() => {
    if (Array.isArray(b.bots)) { Q.clear.run(id); for (const x of botsIn(b.bots)) Q.seat.run(id, x, t, by); }
    for (const x of botsIn(b.add)) Q.seat.run(id, x, t, by);
    for (const x of botsIn(b.remove)) Q.unseat.run(id, x);
    Q.log.run(t, id, 'seats', JSON.stringify({ by, bots: seatList(id) }));
  })();
  return seatList(id);
}
function inviteText(row, bots) {
  const who = bots.length ? bots.map((b) => b[0].toUpperCase() + b.slice(1)).join(' and ') + ' are already seated.' : '';
  const subject = `Join me in "${row.name}" on HubFace`;
  const text = `Hi,\n\nYou're invited to the HubFace room "${row.name}". ${who}\nJoin here: ${link(row.id)}\nCan't make it? Open this link and tap "Send my bot" - your bot takes your seat, listens, and saves you a recap: ${link(row.id)}&sendbot=1\n\nThe session timer is off until someone in the room starts it.\n\n- Yoda (HubFace)`;
  return { subject, text };
}
let tx = null;
async function mail(to, subject, text) {
  const user = String(process.env.SMTP_USER || '').trim(), pass = String(process.env.SMTP_PASS || '');
  if (!user || !pass) return { configured: false };
  if (!tx) { const nm = require('nodemailer'); const port = Number(process.env.SMTP_PORT || 465) || 465;
    tx = nm.createTransport({ host: String(process.env.SMTP_HOST || 'smtp.gmail.com'), port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465, auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 30000 }); }
  const from = String(process.env.SMTP_FROM || user);
  const results = [];
  for (const e of to) { try { await tx.sendMail({ from: `Yoda via HubFace <${from.replace(/^.*<([^>]+)>.*$/, '$1')}>`, to: e, subject, text }); results.push({ email: e, ok: true }); } catch (err) { results.push({ email: e, ok: false, error: String(err && err.code || 'send failed') }); } }
  return { configured: true, results };
}
async function invite(row, b) {
  const to = (Array.isArray(b.invite) ? b.invite : Array.isArray(b.to) ? b.to : []).map((x) => String(x).trim()).filter((x) => EMAIL_RE.test(x)).slice(0, 20);
  const { subject, text } = inviteText(row, seatList(row.id));
  const out = { link: link(row.id), to, subject, body: text, sent: false };
  if (b.send === true && to.length) { const m = await mail(to, subject, text); out.sent = !!(m.configured && m.results.every((x) => x.ok)); out.mail = m; Q.log.run(now(), row.id, 'invite', JSON.stringify({ to: to.length, sent: out.sent })); }
  return out;
}
http.createServer(async (q, r) => {
  try {
    const u = new URL(q.url, 'http://x'), p = u.pathname.replace(/\/+$/, '');
    if (p === '/api/yoda-rooms/health') return json(r, 200, { ok: true, build: BUILD });
    if (p === '/api/yoda-rooms/create') {
      if (q.method !== 'POST') return json(r, 405, { error: 'method not allowed' });
      if (!bearer(q)) return json(r, 401, { error: 'token required' });
      const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' });
      const name = clean(b.name) || 'Yoda Bot Room', t = now(), key = crypto.randomBytes(24).toString('base64url');
      const meta = JSON.stringify({ desc: clean(b.desc || 'Bot room', 200), mode: 'yoda-rooms' });
      const ou = Q.user.get(YODA_UID); const oname = ou ? ou.username : null;
      let id = null; for (let i = 0; i < 8 && !id; i++) { const c = newId(); try { Q.ins.run(c, name, YODA_UID, oname, sha(key), meta, t, t); id = c; } catch (e) { if (!/UNIQUE|PRIMARY/i.test(String(e.message))) throw e; } }
      Q.mark.run(id, t); Q.log.run(t, id, 'create', name);
      const bots = setSeats(id, { bots: b.bots || [] }, 'token');
      const inv = await invite(Q.get.get(id), b);
      return json(r, 201, { ok: true, id, name, link: link(id), key, bots, timer: 'not started', invite: inv });
    }
    let m = /^\/api\/yoda-rooms\/(seats|invite|room)\/(HF-[A-Z0-9]{5}-[A-Z0-9]{5})$/.exec(p);
    if (!m) return json(r, 404, { error: 'not found' });
    const [, kind, id] = m, row = Q.get.get(id);
    if (!row) return json(r, 404, { error: 'Room not found' });
    if (kind === 'seats' && q.method === 'GET') return json(r, 200, { ok: true, id, bots: seatList(id), seats: Q.seats.all(id) });
    if (kind === 'seats' && q.method === 'POST') {
      let by = null; if (bearer(q)) by = 'token'; else { const uid = sessUid(q); if (uid && sameOrigin(q) && row.owner_user_id && uid === row.owner_user_id) by = 'owner:' + uid; }
      if (!by) return json(r, 403, { error: 'Only the room owner can change server seats.' });
      const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' });
      return json(r, 200, { ok: true, id, bots: setSeats(id, b, by) });
    }
    if (kind === 'invite' && q.method === 'POST') { if (!bearer(q)) return json(r, 401, { error: 'token required' }); const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' }); return json(r, 200, { ok: true, id, ...(await invite(row, b)) }); }
    if (kind === 'room' && q.method === 'DELETE') {
      if (!bearer(q)) return json(r, 401, { error: 'token required' });
      if (!Q.isMine.get(id)) return json(r, 403, { error: 'Only rooms created by this service can be deleted here.' });
      Q.del.run(id); Q.clear.run(id); Q.unmark.run(id); Q.log.run(now(), id, 'delete', '');
      return json(r, 200, { ok: true, id, deleted: true });
    }
    return json(r, 405, { error: 'method not allowed' });
  } catch (e) { console.error('[yodarooms]', e && e.message); json(r, 500, { error: 'server error' }); }
}).listen(PORT, '127.0.0.1', () => console.log(`[yodarooms] ${BUILD} on 127.0.0.1:${PORT}`));
