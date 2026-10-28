// sendbot-20261027a (Dan, voice b1498dc6, Oct 27 2026): "Send my bot" stand-in seats for HubFace rooms.
// Sidecar on 127.0.0.1:3499, nginx ^~ /api/sendbot/. Reads room transcripts (read-only); never touches rooms.db, timer, meter, or other services.
//   GET  /api/sendbot/room/<ID>              public: active stand-ins (name, photo, mode, last answers) for room tiles
//   POST /api/sendbot/room/<ID>/on   {mode:'send'|'stay'}   signed-in user (hf_session, same-origin) -> their bot takes their seat
//   POST /api/sendbot/room/<ID>/off                         same user -> takes seat back, recap saved
//   GET  /api/sendbot/recaps                                signed-in user's own recaps (newest first)
//   Bearer (yoda-rooms token) may act for a test name: body {as:{uid,name}}.
// The bot answers ONLY by quoting the user's own lines from this meeting's transcript; otherwise it says it doesn't know and logs the question.
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/opt/hubface/server/package.json');
const Database = require('better-sqlite3');
const BUILD = 'sendbot-20261027b', PORT = 3499, ORIGIN = 'https://hubface.org';
const TX = '/var/lib/hubface/transcripts', PHOTOS = '/var/lib/hubface/hfphotos';
const IDLE_MS = +process.env.SENDBOT_IDLE_MS || 15 * 60e3, GAP_MS = 45 * 60e3;
const TOKEN = (() => { try { return fs.readFileSync(path.join(process.env.CREDENTIALS_DIRECTORY || '/nonexistent', 'token'), 'utf8').trim(); } catch { return ''; } })();
const acc = new Database('/var/lib/hubface/accounts.db', { fileMustExist: true, readonly: true }); acc.pragma('busy_timeout = 5000');
const rooms = new Database('/var/lib/hubface/rooms.db', { fileMustExist: true, readonly: true }); rooms.pragma('busy_timeout = 5000');
const db = new Database('/var/lib/hubface/sendbot.db'); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS standins (id INTEGER PRIMARY KEY, room_id TEXT, uid INTEGER, name TEXT, photo TEXT, mode TEXT, started INTEGER, meeting_start INTEGER, last_line INTEGER, cursor INTEGER DEFAULT 0, ended INTEGER, end_reason TEXT);
CREATE TABLE IF NOT EXISTS answers (standin INTEGER, at INTEGER, asked_by TEXT, question TEXT, answer TEXT, quoted INTEGER);
CREATE TABLE IF NOT EXISTS recaps (id INTEGER PRIMARY KEY, standin INTEGER, uid INTEGER, room_id TEXT, room_name TEXT, created INTEGER, summary TEXT, conclusion TEXT, unanswered TEXT, lines INTEGER, method TEXT);`);
const Q = {
  sess: acc.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
  user: acc.prepare('SELECT username, real_name FROM users WHERE id = ?'),
  room: rooms.prepare('SELECT id, name FROM rooms WHERE id = ?'),
  active: db.prepare('SELECT * FROM standins WHERE ended IS NULL'),
  activeIn: db.prepare('SELECT * FROM standins WHERE ended IS NULL AND room_id = ?'),
  mine: db.prepare('SELECT * FROM standins WHERE ended IS NULL AND room_id = ? AND uid = ? AND name = ?'),
  ins: db.prepare('INSERT INTO standins (room_id, uid, name, photo, mode, started, meeting_start, last_line, cursor) VALUES (?,?,?,?,?,?,?,?,?)'),
  cur: db.prepare('UPDATE standins SET cursor = ?, last_line = ? WHERE id = ?'),
  end: db.prepare('UPDATE standins SET ended = ?, end_reason = ? WHERE id = ?'),
  ans: db.prepare('INSERT INTO answers VALUES (?,?,?,?,?,?)'),
  answers: db.prepare('SELECT at, asked_by, question, answer, quoted FROM answers WHERE standin = ? ORDER BY at'),
  recap: db.prepare('INSERT INTO recaps (standin, uid, room_id, room_name, created, summary, conclusion, unanswered, lines, method) VALUES (?,?,?,?,?,?,?,?,?,?)'),
  recaps: db.prepare('SELECT id, room_id, room_name, created, summary, conclusion, unanswered, lines, method FROM recaps WHERE uid = ? ORDER BY created DESC LIMIT 30'),
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function json(r, c, o) { r.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); }
function bearer(q) { const h = String(q.headers.authorization || ''); const t = h.startsWith('Bearer ') ? h.slice(7).trim() : ''; return TOKEN.length >= 32 && t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN)); }
function sessUid(q) { try { const m = /(?:^|;\s*)hf_session=([A-Za-z0-9_-]{30,80})/.exec(String(q.headers.cookie || '')); if (!m) return null; const s = Q.sess.get(sha(m[1])); return s && s.expires_at >= new Date().toISOString() ? s.user_id : null; } catch { return null; } }
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; return String(q.headers.referer || '').startsWith(ORIGIN + '/'); }
function body(q) { return new Promise((res) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > 8192) { q.destroy(); res(null); } else ch.push(c); }); q.on('end', () => { try { res(ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}); } catch { res(null); } }); }); }
function photoFor(uid) { try { const salt = fs.readFileSync(path.join(PHOTOS, '.salt'), 'utf8'); const base = 'u-' + sha(salt + '|' + uid).slice(0, 32); for (const e of ['jpg', 'png', 'webp']) { const f = path.join(PHOTOS, base + '.' + e); if (fs.existsSync(f)) return `/api/hf-photo/f/${base}.${e}?v=${fs.statSync(f).mtimeMs | 0}`; } } catch {} return null; }
function readTx(id) { try { return fs.readFileSync(path.join(TX, id + '.jsonl'), 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((o) => o && o.text && o.kind !== 'latency' && o.role !== 'system'); } catch { return []; } }
const human = (o) => o.role === 'host' || o.role === 'guest';
// meeting start = first line after the last silence gap > GAP_MS before now
function meetingStart(rows, now) { let start = now; for (let i = rows.length - 1; i >= 0; i--) { const at = +rows[i].at; if (start - at > GAP_MS) break; start = at; } return start; }
const STOP = new Set('a an the and or but if of to in on at for with from by is are was were be been am i you he she it we they me my your our their this that these those what when where who why how which do does did can could would should will shall may might about just so not no yes ok okay hey hi please tell us say said think thing there here than then them his her its as into up out over any some all get got have has had going go bot dan'.split(' '));
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const first = (n) => String(n).trim().split(/\s+/)[0].toLowerCase();
// sendbot-20261027b (Dan, Oct 27 7:11 AM ET): Dan's own bot (account id DAN_UID) shows as "Ava Dan"; other users keep "<name>'s bot".
const DAN_UID = +process.env.SENDBOT_DAN_UID || 14;
const botName = (si) => si.uid === DAN_UID ? 'Ava Dan' : `${si.name}'s bot`;
function aimedAt(text, si) { const t = String(text).toLowerCase(); const named = t.includes(si.name.toLowerCase()) || new RegExp('\\b' + first(si.name).replace(/[^a-z0-9]/g, '') + '\\b').test(t) || /\b(your|the) bot\b|\bbot\b/.test(t) || (si.uid === DAN_UID && /\bava\b/.test(t));
  const q = /\?\s*$/.test(t) || /^(what|when|where|who|why|how|which|did|does|do|is|are|can|could|would|will|should)\b/.test(t.replace(/^[^a-z]*(\w+[,:]\s*)?/, '')) || /\b(what did|did .* say|what was|what's .* (view|take|position))\b/.test(t);
  return named && q; }
function answer(si, rows, line) {
  const own = rows.filter((o) => human(o) && o.speaker === si.name && +o.at >= si.meeting_start && +o.at <= +line.at);
  const qw = new Set(words(line.text)); let best = null, score = 0;
  for (const o of own) { const s = words(o.text).filter((w) => qw.has(w)).length; if (s > score || (s === score && s > 0)) { best = o; score = s; } }
  if (best && score >= 1) return { text: `${botName(si)}: Earlier in this meeting ${si.name} said: "${String(best.text).slice(0, 400)}"`, quoted: 1 };
  return { text: `${botName(si)}: ${si.name} didn't cover that in this meeting, so I can't answer for them. I've noted the question for ${si.name}.`, quoted: 0 };
}
function tick() {
  const now = Date.now();
  for (const si of Q.active.all()) {
    try {
      const rows = readTx(si.room_id); let cursor = si.cursor, last = si.last_line;
      for (const o of rows) { const at = +o.at; if (at <= cursor) continue; cursor = at; if (human(o)) last = Math.max(last, at);
        if (human(o) && o.speaker !== si.name && aimedAt(o.text, si)) { const a = answer(si, rows, o); Q.ans.run(si.id, at, String(o.speaker).slice(0, 60), String(o.text).slice(0, 500), a.text, a.quoted); } }
      if (cursor !== si.cursor || last !== si.last_line) Q.cur.run(cursor, last, si.id);
      if (now - Math.max(last, si.started) > IDLE_MS) finalize({ ...si, cursor, last_line: last }, 'meeting-idle').catch(() => {});
    } catch (e) { console.error('[sendbot] tick', si.id, e && e.message); }
  }
}
async function llmRecap(si, lines) {
  const key = String(process.env.XAI_API_KEY || ''); if (!key || !lines.length) return null;
  const transcript = lines.map((o) => `[${o.speaker}] ${o.text}`).join('\n').slice(-24000);
  const sys = `You write a short meeting recap for ${si.name}, who left the meeting and had a bot listen. Use ONLY facts stated in the transcript. Never invent. If no clear conclusion was reached, say so. Reply as JSON {"summary": "3 short sentences max", "conclusion": "one sentence"}.`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try { const r = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.SENDBOT_MODEL || 'grok-4.20-0309-non-reasoning', temperature: 0, max_tokens: 400, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: transcript }] }) });
    if (!r.ok) return null; const j = await r.json(); const o = JSON.parse(j.choices[0].message.content); return { summary: String(o.summary || '').slice(0, 1200), conclusion: String(o.conclusion || '').slice(0, 400) };
  } catch { return null; } finally { clearTimeout(t); }
}
const finalizing = new Set();
async function finalize(si, reason) {
  if (finalizing.has(si.id)) return null; finalizing.add(si.id);
  try {
    Q.end.run(Date.now(), reason, si.id);
    const rows = readTx(si.room_id).filter((o) => +o.at >= si.started && human(o) && o.speaker !== si.name);
    const ans = Q.answers.all(si.id), unanswered = ans.filter((a) => !a.quoted).map((a) => ({ by: a.asked_by, q: a.question }));
    let r = await llmRecap(si, rows), method = 'model (transcript only)';
    if (!r) { method = 'extract'; r = rows.length ? { summary: `While you were away: ${rows.slice(0, 5).map((o) => `${o.speaker}: "${String(o.text).slice(0, 140)}"`).join(' ')}${rows.length > 5 ? ` (+${rows.length - 5} more lines)` : ''}`, conclusion: `Last word: ${rows[rows.length - 1].speaker}: "${String(rows[rows.length - 1].text).slice(0, 200)}"` } : { summary: 'Nobody spoke after your bot took your seat.', conclusion: 'No conclusion recorded.' }; }
    const room = Q.room.get(si.room_id);
    Q.recap.run(si.id, si.uid, si.room_id, room ? room.name : si.room_id, Date.now(), r.summary, r.conclusion, JSON.stringify(unanswered), rows.length, method);
    console.log(`[sendbot] recap standin ${si.id} room ${si.room_id} lines ${rows.length} unanswered ${unanswered.length} (${reason}, ${method})`);
    return { ...r, unanswered, lines: rows.length, method };
  } finally { finalizing.delete(si.id); }
}
function who(q, b) {
  if (bearer(q) && b && b.as && b.as.name) return { uid: +b.as.uid || 0, name: String(b.as.name).slice(0, 40) };
  const uid = sessUid(q); if (!uid || !sameOrigin(q)) return null; const u = Q.user.get(uid); return u ? { uid, name: u.username } : null;
}
const pubSi = (si) => ({ name: si.name, photo: si.photo, mode: si.mode, since: si.started, bot: botName(si), label: si.uid === DAN_UID ? 'Ava Dan (standing in)' : `${si.name}'s bot (standing in)`, answers: Q.answers.all(si.id).slice(-3).map((a) => ({ at: a.at, by: a.asked_by, q: a.question, a: a.answer })) });
http.createServer(async (q, r) => {
  try {
    const u = new URL(q.url, 'http://x'), p = u.pathname.replace(/\/+$/, '');
    if (p === '/api/sendbot/health') return json(r, 200, { ok: true, build: BUILD, active: Q.active.all().length });
    if (p === '/api/sendbot/recaps' && q.method === 'GET') { const uid = sessUid(q) || (bearer(q) ? +u.searchParams.get('uid') : null); if (uid == null) return json(r, 401, { error: 'sign in' });
      return json(r, 200, { ok: true, recaps: Q.recaps.all(uid).map((x) => ({ ...x, unanswered: JSON.parse(x.unanswered || '[]') })) }); }
    const m = /^\/api\/sendbot\/room\/(HF-[A-Z0-9]{5}-[A-Z0-9]{5})(?:\/(on|off))?$/.exec(p);
    if (!m) return json(r, 404, { error: 'not found' });
    const [, id, act] = m; if (!Q.room.get(id)) return json(r, 404, { error: 'Room not found' });
    if (!act && q.method === 'GET') { const uid = sessUid(q), me = uid ? Q.user.get(uid) : null; return json(r, 200, { ok: true, room: id, me: me ? me.username : null, standins: Q.activeIn.all(id).map(pubSi) }); }
    if (q.method !== 'POST') return json(r, 405, { error: 'POST only' });
    const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' });
    const w = who(q, b); if (!w) return json(r, 401, { error: 'Sign in to send your bot.' });
    const ex = Q.mine.get(id, w.uid, w.name);
    if (act === 'on') { if (ex) return json(r, 200, { ok: true, already: true, standin: pubSi(ex) });
      const now = Date.now(), rows = readTx(id), ms = meetingStart(rows, now), lastAt = rows.length ? +rows[rows.length - 1].at : 0;
      const info = Q.ins.run(id, w.uid, w.name, w.uid ? photoFor(w.uid) : null, b.mode === 'stay' ? 'stay' : 'send', now, ms, now, lastAt);
      console.log(`[sendbot] on room ${id} uid ${w.uid} mode ${b.mode === 'stay' ? 'stay' : 'send'}`);
      return json(r, 200, { ok: true, standin: pubSi(db.prepare('SELECT * FROM standins WHERE id = ?').get(info.lastInsertRowid)) }); }
    if (act === 'off') { if (!ex) return json(r, 200, { ok: true, none: true }); tick(); const rc = await finalize(db.prepare('SELECT * FROM standins WHERE id = ?').get(ex.id), 'seat-taken-back'); return json(r, 200, { ok: true, recap: rc }); }
  } catch (e) { console.error('[sendbot]', e && e.message); json(r, 500, { error: 'server error' }); }
}).listen(PORT, '127.0.0.1', () => console.log(`[sendbot] ${BUILD} on 127.0.0.1:${PORT}`));
setInterval(tick, 4000);
