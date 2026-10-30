// voiceroom-20261029 (Dan voice Oct 29 2026, STAGED): voice-only Bot Room record.
//  GET  /api/voiceroom/<BR>/state            member: recording state, room files, record status
//  POST /api/voiceroom/<BR>/audio?seg=&seq=  member with recording consent: one MediaRecorder chunk of THEIR OWN mic (audio only)
//  POST /api/voiceroom/<BR>/files?name=      member: room file (stored in the existing pre-room file store, card 'center') + metadata on the record
//  GET  /api/voiceroom/<BR>/record.zip       member: one bundle (audio, transcript, room data, attachments)
// Storage: /var/lib/hubface/recordings/<BR>/ (meta.json, audio/<seg>.webm, transcript.json/.txt). Auth = HubFace session + membership of the
// pre-room whose live room is <BR> (same rule as /api/prerooms/roster). No tokens, keys or passes are read or logged here.
// Roll back: remove the import + route line in hubface-vps.mjs and delete this file (recordings dir can stay).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process';
import { __vr } from './prerooms.mjs';
import { iceFor } from './roomserver.mjs';   // step 10: reuse roomserver's STUN + TURN (HMAC, 1 h) config, nothing new
export const VOICEROOM_BUILD = 'voiceroom-20261029v';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface';
export const REC_DIR = process.env.VOICEROOM_DIR || path.join(ROOT, 'recordings');
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
export const FILE_MAX = 25 * 1024 * 1024;        // per room file (same as pre-room files)
export const FILES_PER_ROOM = 100;
export const CHUNK_MAX = 4 * 1024 * 1024;        // one recorder chunk (10 s of opus is ~20 KB; generous)
export const ROOM_AUDIO_MAX = 1024 * 1024 * 1024; // 1 GB audio per room
export const LIVE_WINDOW_MS = 25e3;              // "recording" = a chunk arrived within this window
export const SHOW_BOT_LINES = process.env.VOICEROOM_HIDE_BOT_LINES !== '1';   // step 9 (Dan, later than step 7): live transcript labels Yoda/Licorice lines by bot name. VOICEROOM_HIDE_BOT_LINES=1 hides them.
const BR_RE = /^BR-[A-Z0-9]{4,20}-[A-F0-9]{4}$/;
const { db, FQ, FDIR, safeName, rosterOut } = __vr;
const mine = db.prepare('SELECT p.id, p.data, p.creator, m.side FROM preroom_members m JOIN prerooms p ON p.id = m.preroom WHERE m.user_id = ? ORDER BY p.updated_ms DESC LIMIT 50');
const hits = new Map(); function limited(k, max) { const n = Date.now(), a = (hits.get(k) || []).filter((t) => n - t < 60e3); if (a.length >= max) { hits.set(k, a); return true; } a.push(n); hits.set(k, a); return false; }
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
export function findRoom(uid, br) { for (const x of mine.all(uid)) { let d; try { d = JSON.parse(x.data); } catch { continue; } if (d.live && d.live.room === br && d.status !== 'deleted') return { row: x, d }; } return null; }
const dirOf = (br) => path.join(REC_DIR, br);
export function readMeta(br) { try { return JSON.parse(fs.readFileSync(path.join(dirOf(br), 'meta.json'), 'utf8')); } catch { return null; } }
export function writeMeta(br, m) { fs.mkdirSync(dirOf(br), { recursive: true, mode: 0o700 }); const f = path.join(dirOf(br), 'meta.json'), t = f + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(m, null, 1), { mode: 0o600 }); fs.renameSync(t, f); }
function metaFor(br, row, d) { const m = readMeta(br) || { build: VOICEROOM_BUILD, room: br, preroom: row.id, createdMs: Date.now(), liveStartMs: (d.live && d.live.startMs) || null, segments: {}, files: [] }; m.segments = m.segments || {}; m.files = m.files || []; return m; }
const nameOf = (d, uid) => { const c = d.cards.find((x) => x.owner === uid && x.kind === 'human'); return String((c && c.name) || 'Member').slice(0, 40); };
const consentOf = (d, uid) => { const c = d.cards.find((x) => x.owner === uid && x.kind === 'human'); return !!(c && c.consent); };
function stateOut(br, row, d, uid) { const m = readMeta(br) || { segments: {}, files: [] }; const now = Date.now();
  const segs = Object.values(m.segments || {}); const active = segs.filter((s) => now - (s.lastMs || 0) < LIVE_WINDOW_MS);
  return { ok: true, build: VOICEROOM_BUILD, room: br, preroom: row.id, status: d.status, live: d.status === 'live', autoRecord: true,
    recording: d.status === 'live' && active.length > 0, recorders: [...new Set(active.map((s) => s.name))], youConsented: consentOf(d, uid), youRecording: active.some((s) => s.uid === uid),
    files: (m.files || []).map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type, by: f.byName, ms: f.ms, url: '/api/prerooms/' + row.id + '/files/' + f.id })),
    transcript: m.transcribedMs ? { ms: m.transcribedMs, utterances: m.transcriptUtterances || 0 } : null, limits: { fileMax: FILE_MAX, filesPerRoom: FILES_PER_ROOM } }; }
function readTo(q, fp, max) { return new Promise((res) => { let n = 0, bad = false; const ws = fs.createWriteStream(fp, { flags: 'a', mode: 0o600 });
  q.on('data', (ch) => { n += ch.length; if (n > max && !bad) { bad = true; q.unpipe(ws); ws.destroy(); res(-1); } });
  q.pipe(ws); ws.on('finish', () => { if (!bad) res(n); }); ws.on('error', () => { if (!bad) { bad = true; res(0); } }); q.on('error', () => { if (!bad) { bad = true; res(0); } }); }); }
// audio chunks of one MediaRecorder session (segment) are appended in order to one .webm, which stays a valid file
async function audioPost(q, r, json, br, row, d, uid) {
  if (d.status !== 'live') return json(r, 409, { error: 'Room is not live.' });
  if (!consentOf(d, uid)) return json(r, 403, { error: 'No recording consent on your card.', consentRequired: true });
  const u = new URL(q.url, 'http://x'), seg = String(u.searchParams.get('seg') || ''), seq = Math.floor(+u.searchParams.get('seq'));
  if (!/^[a-z0-9]{8,32}$/.test(seg) || !(seq >= 0 && seq < 100000)) return json(r, 400, { error: 'bad seg/seq' });
  const len = Number(q.headers['content-length'] || 0); if (len > CHUNK_MAX) return json(r, 413, { error: 'chunk too large' });
  const ct = String(q.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)$/.test(ct)) return json(r, 415, { error: 'audio only' });
  const m = metaFor(br, row, d); const total = Object.values(m.segments).reduce((a, s) => a + (s.bytes || 0), 0); if (total > ROOM_AUDIO_MAX) return json(r, 507, { error: 'room audio limit reached' });
  let s = m.segments[seg]; if (s && s.uid !== uid) return json(r, 409, { error: 'segment belongs to someone else' });
  if (s && seq !== (s.chunks || 0)) return json(r, 409, { error: 'out of order', expect: s.chunks || 0 });
  if (!s && seq !== 0) return json(r, 409, { error: 'out of order', expect: 0 });
  const ext = ct === 'audio/ogg' ? 'ogg' : ct === 'audio/mp4' ? 'm4a' : ct === 'audio/mpeg' ? 'mp3' : /wav/.test(ct) ? 'wav' : 'webm';
  fs.mkdirSync(path.join(dirOf(br), 'audio'), { recursive: true, mode: 0o700 }); const now = Date.now();
  if (!s) s = m.segments[seg] = { seg, uid, name: nameOf(d, uid), file: 'audio/' + seg + '.' + ext, mime: ct, firstMs: now, lastMs: now, bytes: 0, chunks: 0 };
  const n = await readTo(q, path.join(dirOf(br), s.file), CHUNK_MAX); if (n <= 0) return json(r, n < 0 ? 413 : 400, { error: n < 0 ? 'chunk too large' : 'empty chunk' });
  const m2 = metaFor(br, row, d); const s2 = m2.segments[seg] || s; s2.bytes = (s2.bytes || 0) + n; s2.chunks = (s2.chunks || 0) + 1; s2.lastMs = Date.now(); if (seq === 0) s2.firstMs = now - 0; m2.segments[seg] = s2; writeMeta(br, m2);
  if (seq === 0) console.log(`[voiceroom] ${br} recording segment ${seg} started by ${uid}`);
  return json(r, 200, { ok: true, seq: s2.chunks, recording: true }); }
async function filePost(q, r, json, br, row, d, uid) {
  if (d.status !== 'live') return json(r, 409, { error: 'Room is not live.' });
  const m = metaFor(br, row, d); if ((m.files || []).length >= FILES_PER_ROOM) return json(r, 400, { error: 'Max ' + FILES_PER_ROOM + ' files in a room.' });
  const len = Number(q.headers['content-length'] || 0); if (len > FILE_MAX) return json(r, 413, { error: 'Max 25 MB per file.' });
  const name = safeName(String(new URL(q.url, 'http://x').searchParams.get('name') || ''));
  const type = (String(q.headers['content-type'] || '').split(';')[0].trim().toLowerCase().replace(/[^a-z0-9.+\/-]/g, '').slice(0, 80)) || 'application/octet-stream';
  const id = 'f' + crypto.randomBytes(8).toString('hex'); fs.mkdirSync(path.join(FDIR, row.id), { recursive: true, mode: 0o700 }); const fp = path.join(FDIR, row.id, id);
  const n = await readTo(q, fp, FILE_MAX); if (n <= 0) { try { fs.unlinkSync(fp); } catch {} return json(r, n < 0 ? 413 : 400, { error: n < 0 ? 'Max 25 MB per file.' : 'Upload failed or empty file.' }); }
  const ms = Date.now(); FQ.ins.run(id, row.id, 'center', uid, name, n, ms);   // existing store: visible to every member on the center card too
  const m2 = metaFor(br, row, d); m2.files.push({ id, name, size: n, type, by: uid, byName: nameOf(d, uid), ms }); writeMeta(br, m2);
  console.log(`[voiceroom] ${br} file ${id} (${n} B) by ${uid}`); return json(r, 201, stateOut(br, row, d, uid)); }
// room data for the record: roster, times, consent (names only, no account ids / passes / tokens)
export function roomData(br, row, d) { const m = readMeta(br) || {};
  return { room: br, preroom: row.id, type: d.type, access: d.access, status: d.status, about: (d.center && d.center.about) || '', goal: (d.center && d.center.goal) || '',
    liveStartMs: (d.live && d.live.startMs) || null, roster: rosterOut(d, -1).map((x) => ({ ...x, you: undefined })),
    consent: d.cards.filter((c) => c.kind === 'human' || c.joined === true).map((c) => ({ name: c.name || (c.kind === 'bot' ? 'Bot' : 'Member'), kind: c.kind, consent: c.consent === true ? 'self' : (c.consent || false), consentMs: c.consentMs || null })),
    segments: Object.values(m.segments || {}).map((s) => ({ seg: s.seg, speaker: s.name, file: s.file, mime: s.mime, firstMs: s.firstMs, lastMs: s.lastMs, bytes: s.bytes })),
    files: (m.files || []).map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type, by: f.byName, ms: f.ms })), transcribedMs: m.transcribedMs || null, bundleBuiltMs: Date.now() }; }
let accDb = null; export async function liveLines(br) { try { if (!accDb) { const D = (await import('better-sqlite3')).default; accDb = new D(process.env.HUBFACE_DB || path.join(ROOT, 'accounts.db'), { readonly: true, fileMustExist: true }); }
  return accDb.prepare('SELECT id, from_name AS "from", role, text, at FROM br_owner_chat WHERE room = ? ORDER BY id LIMIT 5000').all(br); } catch { return []; } }
const ZIP_PY = `import sys,json,zipfile,os
j=json.load(sys.stdin);z=zipfile.ZipFile(j['out'],'w',zipfile.ZIP_DEFLATED)
for e in j['items']:
    if 'text' in e: z.writestr(e['arc'],e['text'])
    elif os.path.isfile(e['path']): z.write(e['path'],e['arc'],compress_type=zipfile.ZIP_STORED if e.get('store') else zipfile.ZIP_DEFLATED)
z.close()`;
export async function buildZip(br, row, d, out) { const dir = dirOf(br), rd = roomData(br, row, d), items = [];
  items.push({ arc: 'room.json', text: JSON.stringify(rd, null, 1) });
  for (const s of rd.segments) items.push({ arc: s.file, path: path.join(dir, s.file), store: true });
  for (const f of ['transcript.json', 'transcript.txt']) if (fs.existsSync(path.join(dir, f))) items.push({ arc: 'transcript/' + f, path: path.join(dir, f) });
  const L = await liveLines(br); items.push({ arc: 'transcript/live-lines.json', text: JSON.stringify(L.map((x) => ({ at: x.at, speaker: x.from, kind: x.role === 'owner' ? 'person (speech-to-text)' : 'bot (spoken reply)', text: x.text })), null, 1) });
  const used = new Set(); for (const f of rd.files) { let a = 'attachments/' + f.name; while (used.has(a)) a = 'attachments/' + f.id + '-' + f.name; used.add(a); items.push({ arc: a, path: path.join(FDIR, row.id, f.id) }); }
  items.push({ arc: 'README.txt', text: 'HubFace voice room record ' + br + ' (pre-room ' + row.id + ').\nroom.json: roster, times, recording consent, audio segments, files.\naudio/: one file per person per recording session (their own microphone).\ntranscript/: after-the-fact transcript (if run) and live-lines.json (speech-to-text lines and bot spoken replies captured live).\nattachments/: files posted in the room.\n' });
  await new Promise((res, rej) => { const p = spawn('python3', ['-c', ZIP_PY], { stdio: ['pipe', 'ignore', 'pipe'] }); let er = ''; p.stderr.on('data', (x) => { er += x; }); p.on('close', (c) => c === 0 ? res() : rej(new Error('zip failed ' + er.slice(0, 200)))); p.stdin.end(JSON.stringify({ out, items })); });
  return out; }
export function isVoiceroomPath(p) { return p.startsWith('/api/voiceroom/'); }
export async function voiceroomRoute(q, r, p, { who, json }) {
  if (!isVoiceroomPath(p)) return false; r.setHeader('Cache-Control', 'no-store');
  const mm = /^\/api\/voiceroom\/(BR-[A-Z0-9-]{3,40})\/(state|audio|files|lines|record\.zip|rtc\/ice|rtc\/events|rtc\/signal)$/.exec(p); if (!mm || !BR_RE.test(mm[1])) return json(r, 404, { error: 'not found' }), true;
  const u = who(q); if (!u || !u.id) return json(r, 401, { error: 'Sign in to HubFace first.' }), true;
  const br = mm[1], ep = mm[2], uid = u.id;
  if (limited(uid + '|' + ep, ep === 'audio' ? 30 : ep === 'state' ? 60 : ep === 'rtc/signal' ? 600 : ep === 'lines' ? 60 : 20)) return json(r, 429, { error: 'slow down' }), true;
  const hit = findRoom(uid, br); if (!hit) return json(r, 404, { error: 'not found' }), true;
  const { row, d } = hit;
  if (ep.startsWith('rtc/')) return await rtcRoute(q, r, json, br, d, uid, ep), true;
  if (ep === 'state' && q.method === 'GET') return json(r, 200, stateOut(br, row, d, uid)), true;
  if (ep === 'lines' && q.method === 'GET') { const after = Math.max(0, +new URL(q.url, 'http://x').searchParams.get('after') || 0);   // step 9: live transcript feed (people's streaming speech-to-text lines; bot lines only if SHOW_BOT_LINES)
    const L = (await liveLines(br)).filter((x) => x.id > after && (SHOW_BOT_LINES || x.role === 'owner')).slice(-300); return json(r, 200, { ok: true, lines: L.map((x) => ({ id: x.id, at: x.at, speaker: (x.from && x.from !== '[object Object]') ? x.from : 'Bot', bot: x.role !== 'owner', text: x.text })), showBots: SHOW_BOT_LINES }), true; }
  if (q.method === 'POST' && !sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' }), true;
  if (ep === 'audio' && q.method === 'POST') return await audioPost(q, r, json, br, row, d, uid), true;
  if (ep === 'files' && q.method === 'POST') return await filePost(q, r, json, br, row, d, uid), true;
  if (ep === 'record.zip' && q.method === 'GET') { const tmp = path.join(REC_DIR, '.tmp-' + br + '-' + crypto.randomBytes(4).toString('hex') + '.zip'); fs.mkdirSync(REC_DIR, { recursive: true, mode: 0o700 });
    try { await buildZip(br, row, d, tmp); } catch (e) { try { fs.unlinkSync(tmp); } catch {} return json(r, 500, { error: 'Could not build the record.' }), true; }
    const st = fs.statSync(tmp); r.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="hubface-record-${br}.zip"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    const rs = fs.createReadStream(tmp); rs.pipe(r); rs.on('close', () => { try { fs.unlinkSync(tmp); } catch {} }); console.log(`[voiceroom] ${br} record.zip (${st.size} B) by ${uid}`); return true; }
  return json(r, 405, { error: 'method' }), true; }

/* step 10 (Dan Oct 29): human-to-human audio in Bot Rooms. Audio-only WebRTC mesh (browser to browser, max RTC_MAX people);
   this server only relays offers/answers/ICE over SSE. Allowed: signed-in members of the pre-room whose live room is BR AND who own a
   human card on its roster (so Sarah, uid 46, only if she is on that room's roster). The room must be live. No audio passes the server. */
const RTC_MAX = 6; const rtcRooms = new Map();   // br -> Map(pid -> { uid, name, res })
function rtcSend(res, ev, data) { try { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} }
async function rtcRoute(q, r, json, br, d, uid, ep) {
  const card = d.cards.find((x) => x.owner === uid && x.kind === 'human'); if (!card) return json(r, 403, { error: 'Not on this room roster.' });
  if (d.status !== 'live') return json(r, 409, { error: 'Room is not live.' });
  const name = String(card.name || 'Member').slice(0, 40), M = rtcRooms.get(br) || new Map(); rtcRooms.set(br, M);
  if (ep === 'rtc/ice' && q.method === 'GET') return json(r, 200, { iceServers: iceFor(br + '-' + uid) });
  if (ep === 'rtc/events' && q.method === 'GET') {
    if (M.size >= RTC_MAX) return json(r, 409, { error: 'Voice mesh is full (' + RTC_MAX + ').' });
    const pid = crypto.randomBytes(8).toString('hex');
    r.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    rtcSend(r, 'hello', { pid, peers: [...M].map(([k, v]) => ({ pid: k, name: v.name })) });
    for (const v of M.values()) rtcSend(v.res, 'join', { pid, name });
    M.set(pid, { uid, name, res: r }); const ka = setInterval(() => { try { r.write(': k\n\n'); } catch {} }, 20000);
    q.on('close', () => { clearInterval(ka); M.delete(pid); for (const v of M.values()) rtcSend(v.res, 'leave', { pid }); if (!M.size) rtcRooms.delete(br); });
    console.log(`[voiceroom] ${br} rtc join ${uid} (${M.size} in mesh)`); return; }
  if (ep === 'rtc/signal' && q.method === 'POST') {
    if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' });
    let b; try { b = JSON.parse(await readSmall(q, 64 * 1024)); } catch { return json(r, 400, { error: 'bad json' }); }
    const from = M.get(String(b.from || '')), to = M.get(String(b.to || ''));
    if (!from || from.uid !== uid) return json(r, 403, { error: 'not your peer' }); if (!to) return json(r, 404, { error: 'peer gone' });
    if (!['offer', 'answer', 'ice'].includes(b.type)) return json(r, 400, { error: 'type' });
    rtcSend(to.res, 'signal', { from: b.from, name: from.name, type: b.type, data: b.data }); return json(r, 200, { ok: true }); }
  return json(r, 405, { error: 'method' }); }
function readSmall(q, max) { return new Promise((res, rej) => { let n = 0; const a = []; q.on('data', (c) => { n += c.length; if (n > max) { rej(new Error('big')); q.destroy(); } else a.push(c); }); q.on('end', () => res(Buffer.concat(a).toString('utf8'))); q.on('error', rej); }); }
export const __rtc = { rtcRooms, RTC_MAX };
