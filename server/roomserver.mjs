// HubFace live room server (roomserver-20261018a, Dan approved). Hosted site only.
// WebSocket at wss://hubface.org/api/room-live?room=<HF-ID> (nginx location adds the Upgrade headers; Cloudflare passes WebSockets).
// Dependency-free RFC 6455 (text frames, ping/pong, close; client frames must be masked; 64 KB message cap).
// Per room (keyed by room ID from rooms.db): presence (join/leave), participant list (name, signed-in username or guest name,
// role host|guest, mic/cam), chat relay (last 50 kept in memory), WebRTC signaling relay (offer/answer/ICE) between members.
// Approach ported from HingeHub (server/rtc.ts + src/usePeerRtc.ts): same signal types, perfect negotiation on the client,
// STUN-only ICE; here pushed over one WebSocket instead of REST polling, and N-peer mesh (soft cap 4, hard cap 6 people).
// Guards: Origin must be https://hubface.org; Upgrade/Connection/Sec-WebSocket-Version/Key checked; room lookups share the
// /api/rooms rate limiter (404 / 429); 12 sockets per IP; 60 messages / 5 s per socket; chat 8 / 10 s; heartbeat ping 25 s.
import crypto from 'node:crypto';
import { lookupForJoin, isOwner, sessionUser, clientIp, roomName } from './rooms.mjs';

export const ROOMSERVER_BUILD = 'roomserver-20261018a+turn-20261018a+yodahear-20261018b+lag-20261018a+fast-20261018a+fastfix-20261018a+merge-20261018a+stt-20261018a+bridge-20261019a+botname-20261019a+botchain-20261019a+transcript-20261019a+voicefix-20261019a+realyoda-20261020a+latency-20261020a+auto-20261020a+mono-20261020a+readycue-20261020a+listendefault-20261020a+sessionpacket-20261020a+voiceoff-20261020a+chatrelay-20261020a+floppy-photo-20261025a';
console.log('[roomserver] voicefix-20261019a: duplicate-line drop (30 s) + long-line fast path on');
/* botname-20261019a: room bots post in Room Chat (and speak) under their own name + picture. /say body {as:'ava'|'finn'|'yoda'} (default yoda). */
export const BOTS = { yoda: { name: 'Yoda', img: 'assets/yoda.jpg', voice: 'liora' }, ava: { name: 'Ava', img: 'assets/ava.png', voice: 'eve' }, finn: { name: 'Finn', img: 'assets/yoda-finn.jpg', voice: 'lumen' } };
export function botFrom(who) { const b = BOTS[who] || BOTS.yoda; return who === 'yoda' || !BOTS[who] ? { id: 'yoda', name: 'Yoda', role: 'yoda', bot: 'yoda', img: b.img } : { id: 'bot:' + who, name: b.name, role: 'bot', bot: who, img: b.img }; }
console.log('[roomserver] botname-20261019a bots ' + Object.keys(BOTS).join(','));
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const PATH = '/api/room-live', MAX_MSG = 64 * 1024, HARD_CAP = 6, SOFT_CAP = 4, PER_IP = 12;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map();   // id -> {id, name, members: Map(peerId -> member), chat: []}
const perIp = new Map();

/* ---------- turn-20261018a (Dan approved): coturn on turn.hubface.org, REST-API credentials ----------
   username = "<unix expiry>:<peer id>", credential = base64(HMAC-SHA1(static-auth-secret, username)), TTL 1 h.
   Secret: /etc/hubface/turn-secret.key (root 600) handed over by systemd LoadCredential=turn-secret (drop-in turn.conf).
   No secret -> STUN only (as before). HUBFACE_TURN_TLS=1 (drop-in) adds turns:turn.hubface.org:5349. */
import nodeFs from 'node:fs';
import { fastOn, fastReply, fastTts, chargeTts, fastInfo, isFragment, relayChat, isEcho, aimedAtYoda, canSpend } from './fastpath.mjs';
import { getReady, READY_TEXT } from './bridges.mjs';   // readycue-20261020a
import { pick as pickBridge, pickHold, pickMono, warm as warmBridges, bridgesOn, bridgeInfo, SKIP_MS as BRIDGE_SKIP_MS } from './bridges.mjs';   // latency-20261020a
import { getPack, touch as packTouch, packInfo } from './mempack.mjs';   // latency-20261020a
// realyoda-20261020a (Dan, Oct 19: intelligence first): YODA_ROUTE=webhook (default) -> every HF-room line goes to the real Yoda routine
// webhook; YODA_ROUTE=fast -> old fastReply path (only if YODA_FAST=1 + key). Revert = env change + restart, no code edit.
// auto-20261020a (Dan, Oct 19 11 PM): default 'auto' = cold line -> real Yoda webhook, warm room -> fast + memory pack. 'webhook' / 'fast'
// are manual overrides only. Without the fast key everything is 'webhook'.
export function yodaRoute(env = process.env, fast = fastOn()) { const v = String(env.YODA_ROUTE || 'auto').trim().toLowerCase(); if (!fast) return 'webhook'; return v === 'webhook' || v === 'fast' ? v : 'auto'; }
export const WARM_MS = +process.env.YODA_WARM_MS || 600000;
// per-line decision in auto: first Yoda-aimed line in a room, or first after WARM_MS of no Yoda-aimed lines -> webhook (cold)
export function autoPick(lastAimedAt, now, warmMs = WARM_MS) { return lastAimedAt && now - lastAimedAt < warmMs ? 'fast' : 'webhook'; }
const lastAimed = new Map();   // room -> time of last Yoda-aimed line
console.log(`[roomserver] auto-20261020a: YODA_ROUTE=${yodaRoute()} (${yodaRoute() === 'auto' ? 'cold line -> real Yoda webhook, warm room -> fast+pack' : yodaRoute() === 'fast' ? 'fastReply' : 'real Yoda webhook'})`);
import { speechOut } from './speech-module.mjs';   // speechmod-20261019a: single outgoing speech slot   // fast-20261018a
import { sttMessage, sttGone, sttInfo } from './stt.mjs';   // stt-20261018a: AssemblyAI streaming tokens + daily usage cap
const TURN_HOST = process.env.HUBFACE_TURN_HOST || 'turn.hubface.org', TURN_TTL = 3600;
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let turnSecret = null;
try { const f = process.env.HUBFACE_TURN_SECRET_FILE || (process.env.CREDENTIALS_DIRECTORY ? process.env.CREDENTIALS_DIRECTORY + '/turn-secret' : ''); if (f) { const k = nodeFs.readFileSync(f, 'utf8').trim(); if (k.length >= 24) turnSecret = k; } } catch {}
export function iceFor(peerId) {
  if (!turnSecret) return STUN;
  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL}:${String(peerId || 'x').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`;
  const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
  const urls = [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`];
  if (process.env.HUBFACE_TURN_TLS === '1') urls.push(`turns:${TURN_HOST}:5349?transport=tcp`);
  return STUN.concat([{ urls, username, credential }]);
}
export const turnInfo = () => ({ turn: !!turnSecret, tls: process.env.HUBFACE_TURN_TLS === '1', host: TURN_HOST, ttl: TURN_TTL });

/* ---------- minimal WebSocket ---------- */
function frame(op, payload) {
  const len = payload.length; let h;
  if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  h[0] = 0x80 | op; return Buffer.concat([h, payload]);
}
class Ws {
  constructor(sock, onMsg, onClose) {
    this.s = sock; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.onMsg = onMsg; this.onClose = onClose; this.alive = Date.now();
    sock.setNoDelay(true); sock.setTimeout(0);
    sock.on('data', (d) => this.data(d)); sock.on('error', () => this.end()); sock.on('close', () => this.end());
  }
  send(o) { if (!this.open) return; try { this.s.write(frame(1, Buffer.from(JSON.stringify(o)))); } catch { this.end(); } }
  ping() { if (this.open) try { this.s.write(frame(9, Buffer.alloc(0))); } catch { this.end(); } }
  close(code = 1000, why = '') { if (!this.open) return; const p = Buffer.alloc(2 + Buffer.byteLength(why)); p.writeUInt16BE(code, 0); p.write(why, 2); try { this.s.write(frame(8, p)); this.s.end(); } catch {} this.end(); }
  end() { if (!this.open) return; this.open = false; try { this.s.destroy(); } catch {} this.onClose && this.onClose(); }
  data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (!masked) return this.close(1002, 'unmasked');
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(MAX_MSG)) return this.close(1009, 'too big'); len = Number(big); off = 10; }
      if (len > MAX_MSG) return this.close(1009, 'too big');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4), p = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this.alive = Date.now();
      if (op === 8) return this.close(1000);
      if (op === 9) { try { this.s.write(frame(10, p)); } catch {} continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { if (fin) this.msg(p); else this.frag = [p]; continue; }
      if (op === 0 && this.frag) { this.frag.push(p); const tot = this.frag.reduce((n, x) => n + x.length, 0); if (tot > MAX_MSG) return this.close(1009, 'too big'); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.msg(all); } continue; }
      return this.close(1002, 'bad frame');
    }
  }
  msg(p) { let o; try { o = JSON.parse(p.toString('utf8')); } catch { return; } if (o && typeof o === 'object') this.onMsg(o); }
}
function reject(sock, code, text) { try { sock.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`); sock.destroy(); } catch {} }

/* ---------- rooms ---------- */
const clean = (v, n) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const pub = (m) => ({ id: m.id, name: m.name, user: m.user, role: m.role, mic: m.mic, cam: m.cam, hand: !!m.hand, photo: m.photo || null, at: m.at });
const PHOTO_RE = /^\/api\/hf-photo\/f\/[ugb]-[a-z0-9-]{1,64}\.(jpg|png|webp)(\?v=\d{1,15})?$/; const okPhoto = (v) => typeof v === "string" && PHOTO_RE.test(v) ? v : null;   // floppy-photo-20261025a
export function yodaKeyOk(q, r, json) { return yodaAuthed(q, r, json); }   // floppy-photo-20261025a: bot avatar upload uses the /say key
export function roomPresence() { return [...rooms.values()].map((x) => ({ id: x.id, people: x.members.size })); }   // floppy-photo-20261025a
function bcast(room, o, exceptId) { for (const m of room.members.values()) if (m.id !== exceptId) m.ws.send(o); }
export function roomBroadcast(id, o) { const r = rooms.get(id); if (!r) return 0; bcast(r, o); return r.members.size; }   // phase 2 (yoda-say)
/* bridge-20261019a (Dan approved): read-only hooks for the bridge gateway (bridge.mjs) */
let chatTap = null;
let relayTap = null; export function setRelayTap(fn) { relayTap = typeof fn === 'function' ? fn : null; }   // chatrelay-20261020a
export function setChatTap(fn) { chatTap = typeof fn === 'function' ? fn : null; }
export function roomMembers(id) { const r = rooms.get(id); return r ? [...r.members.values()].map(pub) : []; }
export function roomChat(id) { const r = rooms.get(id); return r ? r.chat.slice(-50) : []; }
export function roomPushChat(id, entry) { let r = rooms.get(id); if (!r) { const name = roomName(id); if (!name) return -1; r = seedChat({ id, name, members: new Map(), chat: [] }); rooms.set(id, r); } r.chat.push(entry); if (r.chat.length > 50) r.chat.shift(); bcast(r, Object.assign({ t: 'chat' }, entry)); txAppend(id, entry); return r.members.size; }

export function roomLiveUpgrade(q, sock, head) {
  let u; try { u = new URL(q.url, 'http://x'); } catch { return reject(sock, 400, 'Bad Request'); }
  if (u.pathname !== PATH) return reject(sock, 404, 'Not Found');
  const up = String(q.headers.upgrade || '').toLowerCase(), conn = String(q.headers.connection || '').toLowerCase(), key = String(q.headers['sec-websocket-key'] || '');
  if (q.method !== 'GET' || up !== 'websocket' || !/\bupgrade\b/.test(conn) || q.headers['sec-websocket-version'] !== '13' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return reject(sock, 400, 'Bad Request');
  if (q.headers.origin !== ORIGIN) return reject(sock, 403, 'Forbidden');
  const who = clientIp(q); if ((perIp.get(who) || 0) >= PER_IP) return reject(sock, 429, 'Too Many Requests');
  const look = lookupForJoin(q, u.searchParams.get('room'));
  if (look.status === 429) return reject(sock, 429, 'Too Many Requests');
  if (look.status !== 200) return reject(sock, 404, 'Room not found');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');
  perIp.set(who, (perIp.get(who) || 0) + 1);
  const user = sessionUser(q), row = look.row;
  let me = null, room = null, msgs = [], chats = [];
  const ws = new Ws(sock, (o) => {
    const now = Date.now(); msgs = msgs.filter((t) => now - t < 5000); if (msgs.length >= 60) return ws.close(1008, 'rate'); msgs.push(now);
    if (o.t === 'join' && !me) {
      room = rooms.get(row.id) || seedChat({ id: row.id, name: row.name, members: new Map(), chat: [] }); rooms.set(row.id, room);
      room.name = roomName(row.id) || room.name;
      if (room.members.size >= HARD_CAP) { ws.send({ t: 'error', code: 'room-full', msg: `This room is full (${HARD_CAP} people).` }); return ws.close(1008, 'full'); }
      const host = isOwner(q, row, o.ownerKey);
      const guestName = clean(o.name, 40) || 'Guest ' + crypto.randomInt(1000, 10000);
      me = { id: crypto.randomUUID(), name: user && user.name ? user.name : guestName, user: user && user.name ? user.name : null, role: host ? 'host' : 'guest', mic: !!o.mic, cam: !!o.cam, photo: okPhoto(o.photo), at: now, ws };
      if (me.role === 'host') listenDefault(room.id, 'host-join');   // listendefault-20261020a: before the welcome so it carries listen:on
      const others = [...room.members.values()].map(pub);
      room.members.set(me.id, me);
      sessJoin(room);   // sessionpacket-20261020a
      ws.send({ t: 'welcome', build: ROOMSERVER_BUILD, self: pub(me), peers: others, room: { id: room.id, name: room.name }, chat: room.chat.slice(-50), softCap: SOFT_CAP,
        ice: iceFor(me.id), listen: listenState(room.id) });
      bcast(room, { t: 'peer-join', peer: pub(me) }, me.id);
      return;
    }
    if (!me) return;
    if (o.t === 'state') { me.mic = !!o.mic; me.cam = !!o.cam; if ('hand' in o) me.hand = !!o.hand; if ('photo' in o) me.photo = okPhoto(o.photo); /* floppy-photo-20261025a */ /* raisehand-20261025a */ if (typeof o.name === 'string' && !me.user) { const n = clean(o.name, 40); if (n) me.name = n; } bcast(room, { t: 'peer-state', peer: pub(me) }, me.id); return; }
    if (o.t === 'chat') {
      chats = chats.filter((t) => now - t < 10000); if (chats.length >= 8) return ws.send({ t: 'error', code: 'chat-rate', msg: 'Slow down a little.' }); chats.push(now);
      const text = clean(o.text, 1000); if (!text) return;
      const src = o.source === 'voice' ? 'voice' : 'chat';   // yodahear-20261018a: speech-to-text lines from the room client are marked 'voice'
      const e = { from: { id: me.id, name: me.name, role: me.role }, text, at: now, cid: clean(o.cid, 40) || null };
      if (src === 'voice') e.src = 'voice';
      if (src === 'voice' && isReadyEcho(text, readyAt.get(room.id), now)) { console.log(`[roomserver] readycue echo dropped room ${room.id}`); return; }   // readycue-20261020a
      room.chat.push(e); if (room.chat.length > 50) room.chat.shift(); bcast(room, Object.assign({ t: 'chat' }, e)); txAppend(room.id, e);   // transcript-20261019a
      botHuman(room.id);   // botchain-20261019a: a human line resets the bot-to-bot run
      hookFromChat(room, me, text, src, now); try { if (chatTap) chatTap(room, e); } catch (err) { console.warn('[roomserver] bridge tap', String(err && err.message || err).slice(0, 80)); }   // bridge-20261019a
      return;
    }
    if (o.t === 'stt') {   // yodahear-20261018b: the client's speech-to-text status, logged on change (no transcripts)
      const st = clean(o.status, 160); if (st && st !== me.stt) { const prevSt = me.stt; me.stt = st; if (readyShouldFire(prevSt, st, me.role, readyAt.get(room.id), now)) { readyAt.set(room.id, now); readyCue(room.id).catch(() => {}); } console.log(`[roomserver] stt room ${room.id} ${me.role} "${clean(me.name, 40)}": ${st} (sent ${+o.sent || 0}, dropped ${+o.dropped || 0}, starts ${+o.starts || 0})`); }
      return;
    }
    if (o.t === 'stt-token' || o.t === 'stt-session') { sttMessage(room, me, o); return; }   // stt-20261018a
    if (o.t === 'ice') { me.ws.send({ t: 'ice', ice: iceFor(me.id) }); return; }   // turn-20261018a: refresh TURN credentials (1 h TTL)
    if (o.t === 'signal') {
      const to = room.members.get(String(o.to || '')); const d = o.data;
      if (!to || !d || typeof d !== 'object' || !['offer', 'answer', 'ice'].includes(d.type)) return;
      to.ws.send({ t: 'signal', from: me.id, data: d }); return;
    }
    if (o.t === 'leave') { me.left = true; return ws.close(1000, 'bye'); }   // sessionpacket-20261020a: explicit Leave/End
    if (o.t === 'ping') return ws.send({ t: 'pong', at: now });
  }, () => {
    perIp.set(who, Math.max(0, (perIp.get(who) || 1) - 1)); if (!perIp.get(who)) perIp.delete(who);
    try { sttGone(me); } catch {}   // stt-20261018a
    if (me && room) { room.members.delete(me.id); bcast(room, { t: 'peer-leave', id: me.id, name: me.name }); sessLeave(room, me); if (!room.members.size) setTimeout(() => { const r = rooms.get(room.id); if (r && !r.members.size) rooms.delete(room.id); }, 30 * 60e3).unref(); }
  });
  if (head && head.length) ws.data(head);
  ws.hb = setInterval(() => { if (!ws.open) return clearInterval(ws.hb); if (Date.now() - ws.alive > 70e3) { clearInterval(ws.hb); return ws.end(); } ws.ping(); }, 25e3); ws.hb.unref();
}
export function roomLiveHealth() { let n = 0; for (const r of rooms.values()) n += r.members.size; return { build: ROOMSERVER_BUILD, rooms: rooms.size, people: n, ...turnInfo(), yodaHook: hookInfo(), yodaFast: fastInfo(), stt: sttInfo(), bridges: bridgeInfo(), mempack: packInfo(), latency: latStats }; }

/* ---------- phase 2: Yoda's voice (roomserver-20261018a, Dan approved) ----------
   POST /api/rooms/<ID>/say   body {text, speak?: true, chat?: true}   header X-Yoda-Key: <secret>  (or Authorization: Bearer <secret>)
     secret lives in /etc/hubface/yoda-say.key (mode 600 root; passed to the service by systemd LoadCredential, rotate = edit file + restart); compared as SHA-256 with timingSafeEqual; never logged.
     speak -> one server-side xAI TTS call (voice liora, the dashboard's Yoda voice) cached 10 min under a random token, then
              WS broadcast {t:'yoda-say', text, audio:'/api/rooms/<ID>/say-audio/<token>'|null}; browsers play it (or speechSynthesis).
     chat  -> Room Chat line from "Yoda" (role yoda), kept in the room's history.
     bad/missing key -> 403 (10 bad tries / 10 min per IP -> 429).  Unknown room -> 404.  Key file missing -> 503.
   GET /api/rooms/<ID>/say-audio/<token>  -> the cached clip (no key needed; token is 128-bit random, expires 10 min). */
import fs from 'node:fs';
const SAY_KEY_FILE = process.env.HUBFACE_YODA_SAY_KEY || (process.env.CREDENTIALS_DIRECTORY ? process.env.CREDENTIALS_DIRECTORY + '/yoda-say' : '/etc/hubface/yoda-say.key');   // systemd LoadCredential=yoda-say:/etc/hubface/yoda-say.key (drop-in hubface.service.d/yoda-say.conf)
const ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const clips = new Map(); const badSay = new Map(); let sayKeyCache = { m: 0, h: null };
function sayKeyHash() {
  try { const st = fs.statSync(SAY_KEY_FILE); if (st.mtimeMs !== sayKeyCache.m) { const k = fs.readFileSync(SAY_KEY_FILE, 'utf8').trim(); sayKeyCache = { m: st.mtimeMs, h: k.length >= 24 ? crypto.createHash('sha256').update(k).digest() : null }; } return sayKeyCache.h; }
  catch { return null; }
}
function badCount(who, add) { const now = Date.now(); const a = (badSay.get(who) || []).filter((t) => now - t < 600000); if (add) a.push(now); if (a.length) badSay.set(who, a); else badSay.delete(who); return a.length; }
function yodaAuthed(q, r, json) {   // X-Yoda-Key (or Authorization: Bearer) checked against /etc/hubface/yoda-say.key; shared by /say and /listen
  const who = clientIp(q);
  if (badCount(who, false) >= 10) { json(r, 429, { error: 'too many bad keys, wait 10 minutes' }); return false; }
  const want = sayKeyHash(); if (!want) { json(r, 503, { error: 'yoda-say key not configured' }); return false; }
  const auth = String(q.headers['x-yoda-key'] || '').trim() || String(q.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const got = crypto.createHash('sha256').update(auth).digest();
  if (!auth || !crypto.timingSafeEqual(got, want)) { badCount(who, true); json(r, 403, { error: 'forbidden' }); return false; }
  return true;
}
async function sayInternal(id, text, { speak = true, toChat = true, tts = null, via = 'key', who = 'yoda', lat = null } = {}) {
  if (!lat && who === 'yoda' && speak && (via === 'link' || via === 'key')) { lat = latPending.get(id) || null; if (lat) lat.answering = true; }   // latency-20261020a: webhook reply
  if (process.env.HUBFACE_TTS === '0') speak = false;   // voiceoff-20261020a (Dan approved): text-only rooms, no TTS/yoda-say; re-enable: rm voiceoff.conf
  if (!BOTS[who]) who = 'yoda'; const from = botFrom(who);   // botname-20261019a   // fast-20261018a: /say body, shared with the fast path
  const at = Date.now();
  let audio = null, ttsErr = null;
  if (speak && tts) {
    try { const o = await speechOut(text, BOTS[who].voice, { bot: who, xai: tts });   /* speechmod-20261019a */ if (o && o.buf) { const tok = crypto.randomBytes(16).toString('hex'); clips.set(tok, { room: id, buf: o.buf, type: o.type || 'audio/mpeg', exp: at + 600000 }); audio = `/api/rooms/${id}/say-audio/${tok}`; } else ttsErr = (o && o.error) || 'tts failed'; }
    catch { ttsErr = 'tts failed'; }
    for (const [k, c] of clips) if (c.exp < at) clips.delete(k);
    while (clips.size > 200) clips.delete(clips.keys().next().value);
  }
  let delivered = 0;
  if (speak) delivered = roomBroadcast(id, { t: 'yoda-say', who, name: from.name, img: from.img, text, audio, at });
  if (lat && speak) latAudio(lat);   // latency-20261020a
  if (lat && (via === 'link' || via === 'key')) latDone(id, lat);
  if (toChat) { const n = roomPushChat(id, { from, text, at }); if (n > delivered) delivered = n; botChain(id, who, text); }   // botchain-20261019a
  setListen(id, true, 'say');   // yodahear-20261018a: a /say makes the room 'listening' for 2 h after the last say
  console.log(`[roomserver] ${who} say room ${id} people ${delivered} speak ${speak} audio ${audio ? 'tts' : (speak ? 'browser' : '-')} chat ${toChat} len ${text.length} via ${via} tts ${speak && tts ? Date.now() - at : 0}ms`);
  return { delivered, audio, ttsErr, ttsMs: speak && tts ? Date.now() - at : 0 };
}
export async function roomSayRoute(q, r, p, { readBody, json, tts }) {
  const m = /^\/api\/rooms\/([^/]+)\/(say|listen|say-audio\/([0-9a-f]{32}))$/.exec(p); if (!m) return false;
  const id = decodeURIComponent(m[1]).toUpperCase();
  if (m[2] === 'listen') return roomListenRoute(q, r, id, { readBody, json });
  if (m[3]) {   // clip fetch
    if (q.method !== 'GET' && q.method !== 'HEAD') { json(r, 405, { error: 'method' }); return true; }
    const c = clips.get(m[3]); if (!c || c.room !== id || c.exp < Date.now()) { json(r, 404, { error: 'gone' }); return true; }
    r.writeHead(200, { 'Content-Type': c.type, 'Content-Length': c.buf.length, 'Cache-Control': 'private, max-age=600' }); r.end(q.method === 'HEAD' ? undefined : c.buf); return true;
  }
  if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
  const su = new URL(q.url, 'http://x');   // lag-20261018a: ?exp=&n=&sig= = the signed per-event reply URL from the webhook (no key header needed)
  const viaLink = su.searchParams.has('sig') && !q.headers['x-yoda-key'] && !q.headers.authorization;
  if (viaLink) { if (!replyAuthed(q, r, json, id, su.searchParams)) return true; }
  else if (!yodaAuthed(q, r, json)) return true;
  if (!ID_RE.test(id) || !roomName(id)) { json(r, 404, { error: 'Room not found' }); return true; }
  let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { json(r, 400, { error: 'bad json' }); return true; }
  const text = String(b.text ?? '').normalize('NFKC').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 600);
  if (!text) { json(r, 400, { error: 'text required' }); return true; }
  const speak = b.speak !== false, toChat = b.chat !== false;
  const who = String(b.as || 'yoda').toLowerCase(); if (!BOTS[who]) { json(r, 400, { error: 'unknown bot', bots: Object.keys(BOTS) }); return true; }   // botname-20261019a
  const { delivered, audio, ttsErr } = await sayInternal(id, text, { speak, toChat, tts, via: viaLink ? 'link' : 'key', who });
  json(r, 200, { ok: true, room: id, delivered, spoke: speak, audio: audio ? 'server-tts' : (speak ? 'browser-speech' : null), tts_error: ttsErr, chat: toChat, as: who });
  return true;
}

/* ---------- yodahear-20261018a (Dan approved): INBOUND path, room -> Yoda ----------
   A room is "listening" for LISTEN_MS (2 h) after Yoda's last POST /api/rooms/<ID>/say, or while switched on with
     POST /api/rooms/<ID>/listen  {on: true|false}   header X-Yoda-Key (same key as /say).   GET -> {listening, until}.
   While listening, every human chat line (typed, or speech-to-text from the room client: source 'voice') is POSTed as JSON
     {event:'room.message', room, roomName, from, role, text, source:'chat'|'voice', at, reply:'<say url>'}
   to YODA_HOOK_URL with YODA_HOOK_KEY. Both come from /etc/hubface/yoda-hook.env (root 600, systemd EnvironmentFile in the
   drop-in hubface.service.d/yoda-hook.conf; edit + `systemctl restart hubface` to change). Unset -> forwarding is a no-op (logged once).
   Auth header(s): YODA_HOOK_AUTH = 'both' (default: Authorization: Bearer <key> + X-Webhook-Key: <key>) | 'bearer' | 'x-webhook-key'
     | 'header:<Name>' (key sent raw in that header). Change it in the env file; see HOOK_HEADERS below. The key is never logged.
   Limits: 6 forwards / min / room (extra lines queue, max 12, then the oldest is dropped), 1 forward per typed line,
     voice fragments from one speaker merged until 2 s of quiet (4 s while mid-thought; merge-20261018a, was 0.8 s), text capped at 500 chars, Yoda's own lines never forwarded
     (/say lines don't pass through here; human members named "Yoda…" are skipped too, so a Yoda chat-reader can't loop). */
const LISTEN_MS = 2 * 3600e3, HOOK_PER_MIN = 6, HOOK_QMAX = 12, VOICE_MERGE_MS = 2000, VOICE_MERGE_OPEN_MS = 4000, VOICE_UTTER_MAX_MS = 12000, HOOK_TEXT = 4000, HOOK_TIMEOUT = 8000;
const HOOK_URL = String(process.env.YODA_HOOK_URL || '').trim(), HOOK_KEY = String(process.env.YODA_HOOK_KEY || '').trim();
const HOOK_AUTH = String(process.env.YODA_HOOK_AUTH || 'both').trim().toLowerCase();
function HOOK_HEADERS(key) {   // <- the one place to change how the key is sent
  if (!key) return {};
  if (HOOK_AUTH === 'bearer') return { Authorization: `Bearer ${key}` };
  if (HOOK_AUTH === 'x-webhook-key') return { 'X-Webhook-Key': key };
  if (HOOK_AUTH.startsWith('header:')) return { [process.env.YODA_HOOK_AUTH.trim().slice(7).trim()]: key };
  return { Authorization: `Bearer ${key}`, 'X-Webhook-Key': key };
}
let hookUrlOk = false; try { const u = new URL(HOOK_URL); hookUrlOk = u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)); } catch {}
const hookOn = () => hookUrlOk;
const hookStats = { sent: 0, ok: 0, fail: 0, dropped: 0, last: null };
export function hookInfo() { return { configured: hookOn(), key: !!HOOK_KEY, auth: HOOK_AUTH.startsWith('header:') ? 'header' : HOOK_AUTH, listening: [...listenUntil.entries()].filter(([, t]) => t > Date.now()).length, ...hookStats }; }
let hookWarned = false;
const listenUntil = new Map();   // room id -> ms epoch
// yodahear-20261018b: persisted in the service's state dir so a restart doesn't silently stop listening
const LISTEN_FILE = (process.env.STATE_DIRECTORY ? process.env.STATE_DIRECTORY.split(':')[0] : '/var/lib/hubface') + '/yoda-listen.json';
try { const j = JSON.parse(nodeFs.readFileSync(LISTEN_FILE, 'utf8')); const now = Date.now(); for (const [id, t] of Object.entries(j || {})) if (/^HF-/.test(id) && +t > now) listenUntil.set(id, Math.min(+t, now + LISTEN_MS)); } catch {}
let saveT = null;
function saveListen() { clearTimeout(saveT); saveT = setTimeout(() => { try { const o = {}; for (const [id, t] of listenUntil) o[id] = t; nodeFs.writeFileSync(LISTEN_FILE + '.tmp', JSON.stringify(o)); nodeFs.renameSync(LISTEN_FILE + '.tmp', LISTEN_FILE); } catch (e) { console.log('[roomserver] yoda-listen save failed', String(e && e.code || e)); } }, 500); saveT.unref && saveT.unref(); }
export function listenState(id) { const t = listenUntil.get(id) || 0; return t > Date.now() ? { on: true, until: t } : { on: false, until: 0 }; }
function setListen(id, on, why) {
  const was = listenState(id).on;
  if (on) listenUntil.set(id, Date.now() + LISTEN_MS); else listenUntil.delete(id); saveListen();
  if (why === 'listen') { if (on) listenOff.delete(id); else listenOff.add(id); saveOff(); }   // listendefault-20261020a: explicit off/on via /listen is remembered
  const st = listenState(id);
  if (st.on !== was || why === 'listen') { roomBroadcast(id, Object.assign({ t: 'listen' }, st)); console.log(`[roomserver] yoda listening room ${id} ${st.on ? 'on' : 'off'} (${why})`); }
  else if (st.on) roomBroadcast(id, Object.assign({ t: 'listen' }, st));   // extended: refresh 'until' quietly
  return st;
}
// optional YODA_LISTEN_ROOMS=HF-…,HF-… (env file): those rooms start out listening (2 h from service start), e.g. for tests
for (const id of String(process.env.YODA_LISTEN_ROOMS || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => ID_RE.test(x))) listenUntil.set(id, Date.now() + LISTEN_MS);
setInterval(() => { const now = Date.now(); for (const [id, t] of listenUntil) if (t <= now) { listenUntil.delete(id); saveListen(); roomBroadcast(id, { t: 'listen', on: false, until: 0 }); console.log(`[roomserver] yoda listening room ${id} off (expired)`); } }, 30e3).unref();
/* lag-20261018a (Dan approved, Oct 18): signed per-event reply URL so the reply routine can POST straight to /say from its own box
   (no SSH hop, no key handling). reply = <ORIGIN>/api/rooms/<ID>/say?exp=<ms>&n=<nonce>&sig=<b64url HMAC-SHA256>.
   HMAC key = SHA-256 of the existing yoda-say key (no new secret); signs 'reply1|<room>|<exp>|<nonce>'. Valid 2 min, that room only,
   /say only (not /listen), at most REPLY_USES posts per URL. Bad/expired signatures count toward the same 10-bad-tries/10-min IP limit. */
const REPLY_MS = 120e3, REPLY_USES = 4; const replyUses = new Map();
function replySig(id, exp, n) { const k = sayKeyHash(); return k ? crypto.createHmac('sha256', k).update(`reply1|${id}|${exp}|${n}`).digest('base64url') : null; }
export function signedReplyUrl(id) { const exp = Date.now() + REPLY_MS, n = crypto.randomBytes(6).toString('hex'), sig = replySig(id, exp, n); return sig ? `${ORIGIN}/api/rooms/${id}/say?exp=${exp}&n=${n}&sig=${sig}` : `${ORIGIN}/api/rooms/${id}/say`; }
function replyAuthed(q, r, json, id, sp) {
  const who = clientIp(q);
  if (badCount(who, false) >= 10) { json(r, 429, { error: 'too many bad keys, wait 10 minutes' }); return false; }
  const exp = +sp.get('exp') || 0, n = String(sp.get('n') || ''), sig = String(sp.get('sig') || ''), now = Date.now();
  const want = /^[0-9a-f]{12}$/.test(n) ? replySig(id, exp, n) : null;
  if (!want) { badCount(who, true); json(r, 403, { error: 'forbidden' }); return false; }
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { badCount(who, true); json(r, 403, { error: 'forbidden' }); return false; }
  if (exp < now || exp > now + REPLY_MS + 5e3) { json(r, 403, { error: 'reply link expired' }); return false; }
  for (const [k, v] of replyUses) if (v.exp < now) replyUses.delete(k);
  const u = replyUses.get(n) || { exp, c: 0 }; if (u.c >= REPLY_USES) { json(r, 429, { error: 'reply link used up' }); return false; }
  u.c++; replyUses.set(n, u); return true;
}
async function roomListenRoute(q, r, id, { readBody, json }) {
  if (q.method !== 'POST' && q.method !== 'GET') { json(r, 405, { error: 'POST or GET' }); return true; }
  if (!yodaAuthed(q, r, json)) return true;
  if (!ID_RE.test(id) || !roomName(id)) { json(r, 404, { error: 'Room not found' }); return true; }
  if (q.method === 'GET') { json(r, 200, Object.assign({ ok: true, room: id, listening: listenState(id).on, hook: hookOn() }, listenState(id))); return true; }
  let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}') || {}; } catch { json(r, 400, { error: 'bad json' }); return true; }
  const st = setListen(id, b.on !== false, 'listen');
  json(r, 200, { ok: true, room: id, listening: st.on, until: st.until, hook: hookOn() }); return true;
}
const hq = new Map();   // room id -> {times:[], q:[], t:null, voice: Map(memberId -> {item, timer})}
function hstate(id) { let h = hq.get(id); if (!h) { h = { times: [], q: [], t: null, voice: new Map() }; hq.set(id, h); } return h; }
const dupSeen = new Map();   // voicefix-20261019a: room|speaker|normalised text -> ms; identical line within 30 s is ignored
export function isDupLine(roomId, who, text, now = Date.now()) {
  const k = roomId + '|' + who + '|' + String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [x, t] of dupSeen) if (now - t > 30e3) dupSeen.delete(x);
  if (dupSeen.has(k) && now - dupSeen.get(k) <= 30e3) return true; dupSeen.set(k, now); return false;
}
function hookFromChat(room, me, text, src, at) {
  if (!listenState(room.id).on && me && me.role === 'host') listenDefault(room.id, 'host-line');   // listendefault-20261020a: 2 h expiry while the host is still talking
  if (!listenState(room.id).on) return;
  if (!me || me.role === 'yoda' || /^yoda\b/i.test(String(me.name || ''))) return;
  if (isDupLine(room.id, me.id, text, at)) { console.log(`[roomserver] voicefix dup line dropped room ${room.id} (${String(text).length} chars)`); return; }
  if (!hookOn()) { if (!hookWarned) { hookWarned = true; console.log('[roomserver] yoda-hook: YODA_HOOK_URL not set (or not https), inbound forwarding is off'); } return; }
  const h = hstate(room.id);
  const item = { event: 'room.message', room: room.id, roomName: room.name || roomName(room.id) || '', from: me.name, role: me.role, text: String(text).slice(0, HOOK_TEXT), source: src, at, reply: signedReplyUrl(room.id), reply_expires: Date.now() + REPLY_MS,
    last_yoda: (room.chat.slice().reverse().find((e) => e.from && e.from.role === 'yoda') || {}).text || '',   // lag-20261018a
    recent: room.chat.slice(-7, -1).map((e) => ({ from: e.from && e.from.name, role: e.from && e.from.role, text: String(e.text).slice(0, 200) })) };
  if (src === 'voice') {   // merge fragments < 1.5 s apart from the same speaker
    const v = h.voice.get(me.id);
    if (v) { clearTimeout(v.timer); v.item.text = (v.item.text + ' ' + item.text).slice(0, HOOK_TEXT); }
    const cur = v ? v.item : item;
    // merge-20261018a: Chrome finalises at every short pause, so wait 2 s of quiet before treating the merged text as one utterance;
    // 4 s while it still ends mid-thought ("... and", "... the", trailing comma), unless the utterance has run > 12 s already.
    const open = isFragment(cur.text) && Date.now() - cur.at < VOICE_UTTER_MAX_MS;
    h.voice.set(me.id, { item: cur, timer: setTimeout(() => { h.voice.delete(me.id); route(room, cur); }, open ? VOICE_MERGE_OPEN_MS : VOICE_MERGE_MS) });
    return;
  }
  route(room, item);
}
/* fast-20261018a: lines clearly aimed at Yoda are answered on the VPS (fastpath.mjs) and NOT forwarded; everything else, and any
   skip / failure / daily-cap hit, goes to the webhook as before. One fast reply at a time per room, in order. */
function humansIn(room) { return [...room.members.values()].filter((m) => m.role !== 'yoda' && !/^yoda\b/i.test(String(m.name || '')) && m.name !== 'HubFace sync').length; }
function route(room, item) {
  packTouch(room.id);   // latency-20261020a: any line keeps the room's memory pack warm
  if (item.role === 'host' && looksLikeCommand(item.text)) item.needs_action = true;   // sessionpacket-20261020a: every route (webhook too), after voice merge
  if (item.last_yoda && isEcho(String(item.text), item.last_yoda)) { console.log(`[roomserver] realyoda echo line dropped room ${room.id}`); return; }   // Yoda's own words heard back
  try { if (relayTap && relayTap(room, item)) return; } catch (e) { console.log('[roomserver] chatrelay tap', String(e && e.message || e).slice(0, 80)); }   // chatrelay-20261020a: Talk-to-Yoda ON -> host lines go to the relay queue only, not the webhook
  const humans = humansIn(room);
  const lastY = room.chat.filter((e) => +e.at < item.at && e.from && e.from.role === 'yoda').pop();   // merge-20261018a: conversation with Yoda active (his last line < 2 min ago)
  const afterYoda = !!(lastY && item.at - lastY.at < 120e3);
  const aimed = !!aimedAtYoda(String(item.text), { humans, afterYoda });
  const mode = yodaRoute(); let way = mode;
  if (mode === 'auto') { way = aimed ? autoPick(lastAimed.get(room.id), Date.now()) : 'webhook'; }
  if (aimed) lastAimed.set(room.id, Date.now());
  if (way === 'webhook') {   // cold line (auto), manual webhook, or not aimed at Yoda: the real Yoda routine
    if (aimed) { const L = latStart(room.id, item, mode === 'auto' ? 'auto-cold' : 'webhook'); bridgeAfter(room.id, L, { hold: true, mono: mode === 'auto' }); }
    return enqueue(room.id, item);
  }
  const h = hstate(room.id);
  h.fast = (h.fast || Promise.resolve()).then(async () => {
    let r = { skip: 'error' }, L = null;
    if (mode === 'auto') await coldGate(room.id);   // mono-20261020a: don't answer fast while the cold real-Yoda reply is still due (< 25 s)
    try {
      L = latStart(room.id, item, mode === 'auto' ? 'auto-warm' : 'fast'); bridgeAfter(room.id, L);   // latency-20261020a: bridge if no reply within ~700 ms
      const pk = getPack(room.id);
      r = await fastReply(item, { humans, afterYoda, pack: pk.text });
      if (r.text) {
        // latency-20261020a: speak sentence by sentence (each through speechOut's single slot, queued in order in the browser), then one chat line
        const parts = splitSentences(r.text); let ttsChars = 0, s = { ttsMs: 0, ttsErr: null };
        L.answering = true;
        for (const p of parts) { const s1 = await sayInternal(room.id, p, { speak: true, toChat: false, tts: fastTts, via: 'fast', lat: L }); s.ttsMs += s1.ttsMs; if (s1.audio) ttsChars += p.length; else s.ttsErr = s1.ttsErr; }
        await sayInternal(room.id, r.text, { speak: false, toChat: true, via: 'fast' });
        latDone(room.id, L);
        const usd = chargeTts(ttsChars, r.usd), fi = fastInfo();
        console.log(`[roomserver] yoda fast room ${room.id} ${item.source} (${r.why}${r.needsAction ? ', task' : ''}) model ${r.ms}ms tts ${s.ttsMs}ms line->say ${Date.now() - item.at}ms cost $${usd.toFixed(5)} today $${fi.spentUsd.toFixed(4)}/${fi.capUsd.toFixed(2)} (${fi.replies})${s.ttsErr ? ' tts_error ' + s.ttsErr : ''}`);
        if (r.needsAction) enqueue(room.id, Object.assign({}, item, { fast_answered: true, needs_action: true, fast_reply: r.text }));   // fastfix-20261018a: task lines also go to the routine to act on
        return;
      }
    } catch (e) { r = { skip: 'error ' + String(e && e.name || e).slice(0, 30) }; }
    if (r.skip !== 'not-aimed') console.log(`[roomserver] yoda fast room ${room.id} skip ${r.skip} -> webhook`);
    // auto-20261020a: fast declined/failed -> the real Yoda answers; keep the same clock (and bridges) running for the webhook reply
    if (L && !L.done) { if (r.skip === 'not-aimed' || L.answering) latDrop(room.id, L); else latToWebhook(room.id, L); }
    enqueue(room.id, item);
  });
}
function enqueue(id, item) { const h = hstate(id); h.q.push(item); while (h.q.length > HOOK_QMAX) { h.q.shift(); hookStats.dropped++; } pump(id); }
function pump(id) {
  const h = hstate(id); if (h.t) return;
  while (h.q.length) {
    const now = Date.now(); h.times = h.times.filter((t) => now - t < 60e3);
    if (h.times.length >= HOOK_PER_MIN) { h.t = setTimeout(() => { h.t = null; pump(id); }, 60e3 - (now - h.times[0]) + 50); h.t.unref && h.t.unref(); return; }
    h.times.push(now); post(h.q.shift());
  }
  if (!h.q.length && !h.voice.size) setTimeout(() => { const x = hq.get(id); if (x && !x.q.length && !x.voice.size && !x.t && !x.times.some((t) => Date.now() - t < 60e3)) hq.delete(id); }, 61e3).unref();
}
async function post(item) {
  item.reply = signedReplyUrl(item.room); item.reply_expires = Date.now() + REPLY_MS;   // lag-20261018a: signed at send time (queued items stay valid)
  hookStats.sent++; const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), HOOK_TIMEOUT);
  try {
    const res = await fetch(HOOK_URL, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'HubFace-roomserver/yodahear' }, HOOK_HEADERS(HOOK_KEY)), body: JSON.stringify(item) });
    try { await res.arrayBuffer(); } catch {}
    if (res.ok) hookStats.ok++; else hookStats.fail++;
    hookStats.last = { at: Date.now(), status: res.status };
    console.log(`[roomserver] yoda-hook room ${item.room} ${item.source} len ${item.text.length} -> ${res.status}`);
  } catch (e) { hookStats.fail++; hookStats.last = { at: Date.now(), status: 'error' }; console.log(`[roomserver] yoda-hook room ${item.room} ${item.source} -> error ${String(e && e.name || e).slice(0, 40)}`); }
  finally { clearTimeout(t); }
}

/* yodahear-20261018b: room chat history survives a service restart. On exit (SIGTERM -> process.exit in server.mjs) the last 50
   lines per room are written to <state dir>/room-chat.json (0600, owner hubface); on start they are seeded back into rooms when
   they are first opened (lines older than 12 h are dropped). */
const CHAT_FILE = LISTEN_FILE.replace(/yoda-listen\.json$/, 'room-chat.json');
const savedChat = new Map();
try { const j = JSON.parse(nodeFs.readFileSync(CHAT_FILE, 'utf8')); const cut = Date.now() - 12 * 3600e3; for (const [id, a] of Object.entries(j || {})) if (/^HF-/.test(id) && Array.isArray(a)) { const k = a.filter((e) => e && +e.at > cut).slice(-50); if (k.length) savedChat.set(id, k); } } catch {}
export function seedChat(room) { const a = savedChat.get(room.id); if (a && !room.chat.length) { room.chat = a.slice(); savedChat.delete(room.id); } return room; }
process.on('exit', () => { try { const o = {}; for (const [id, a] of savedChat) o[id] = a; for (const r of rooms.values()) if (r.chat.length) o[r.id] = r.chat.slice(-50); nodeFs.writeFileSync(CHAT_FILE, JSON.stringify(o), { mode: 0o600 }); } catch {} });

/* yodahook-20261019a (Dan approved Oct 19): HingeHub NR rooms -> the same Yoda routine webhook. hingehub POSTs a ready item to
   127.0.0.1:3471/internal/yoda-hook (loopback only, hubface-vps.mjs); this adds the hook key here (never leaves this process). The
   reply URL must be a rooms.hubface.org /yoda-reply link for that same NR room. Rate limits live in hingehub (3 s gap, 30/h/room). */
export async function externalHook(b) {
  if (!hookOn()) return { status: 503, json: { error: 'hook not configured' } };
  const room = String((b && b.room) || '');
  if (!/^NR-\d{4}-\d{4}$/.test(room)) return { status: 400, json: { error: 'bad room' } };
  const reply = String(b.reply || '');
  if (!reply.startsWith(`https://rooms.hubface.org/api/rooms/${room}/yoda-reply?`)) return { status: 400, json: { error: 'bad reply url' } };
  const S2 = (v, n) => String(v == null ? '' : v).slice(0, n);
  const item = { event: 'room.message', room, roomName: S2(b.roomName, 120), from: S2(b.from, 80), role: S2(b.role, 20), text: S2(b.text, 4000), source: S2(b.source || 'hingehub', 20),
    at: +b.at || Date.now(), reply, reply_expires: +b.reply_expires || 0, last_yoda: S2(b.last_yoda, 400),
    recent: (Array.isArray(b.recent) ? b.recent : []).slice(-8).map((e) => ({ from: S2(e && e.from, 80), role: S2(e && e.role, 20), text: S2(e && e.text, 200) })) };
  if (!item.text.trim()) return { status: 400, json: { error: 'text required' } };
  hookStats.sent++; const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), HOOK_TIMEOUT);
  try {
    const res = await fetch(HOOK_URL, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'HubFace-roomserver/nr-yodahook' }, HOOK_HEADERS(HOOK_KEY)), body: JSON.stringify(item) });
    try { await res.arrayBuffer(); } catch {}
    if (res.ok) hookStats.ok++; else hookStats.fail++;
    hookStats.last = { at: Date.now(), status: res.status };
    console.log(`[roomserver] yoda-hook NR room ${room} len ${item.text.length} -> ${res.status}`);
    return { status: 200, json: { ok: res.ok, status: res.status } };
  } catch (e) { hookStats.fail++; hookStats.last = { at: Date.now(), status: 'error' }; console.log(`[roomserver] yoda-hook NR room ${room} -> error ${String(e && e.name || e).slice(0, 40)}`); return { status: 502, json: { ok: false, status: 'error' } }; }
  finally { clearTimeout(t); }
}

/* ---------- botchain-20261019a (Dan, Oct 19): bots answer each other in the one Room Chat thread ----------
   After any bot / Yoda line lands in Room Chat, ONE other bot may answer, only if (a) the line names it ("Ava", "Finn"/"Fin",
   "Yoda") or (b) the line ends with "?" and the line just before it came from that bot (a direct question back).
   Limits per room: max 6 bot turns in a row without a human line (any human chat/voice line resets), 30 chain replies per hour,
   >= 3 s between chain replies, one at a time. Every model + TTS call goes through fastpath relayChat / fastTts / chargeTts =
   the SAME shared $1/day xAI cap (refused before any call when over). Off switch: HUBFACE_BOTCHAIN=0 (drop-in) + restart. */
const BC_MAX_RUN = 6, BC_PER_HOUR = 30, BC_GAP_MS = 3000, bcs = new Map(), bcStats = { replies: 0, skips: {} };
const BC_NAME = { yoda: /\byoda\b/i, ava: /\bava\b(?!\s*dan)/i, finn: /\bfinn?\b/i };
const BC_PERSONA = {
  yoda: 'You are Yoda, the warm voice moderator of a HubFace video room run by Dan Diotte (HingeCraft Global). Light Yoda flavour, never heavy.',
  ava: 'You are Ava, the friendly, practical HubFace guide. You explain HubFace features simply and keep things moving.',
  finn: 'You are Finn, the upbeat HubFace helper. Short, warm, a little playful, always useful.' };
function bcState(id) { let b = bcs.get(id); if (!b) { b = { run: 0, times: [], last: 0, q: Promise.resolve() }; bcs.set(id, b); } return b; }
function bcSkip(why) { bcStats.skips[why] = (bcStats.skips[why] || 0) + 1; }
function botHuman(id) { const b = bcs.get(id); if (b) b.run = 0; }
export function botTarget(room, who, text) {   // exported for tests
  const t = String(text || ''); const names = Object.keys(BOTS).filter((k) => k !== who && BC_NAME[k] && BC_NAME[k].test(t));
  if (names.length) return { to: names[0], why: 'named' };
  if (/\?\s*$/.test(t)) { const prev = room.chat.slice(0, -1).reverse().find((e) => e.from); const pb = prev && prev.from && (prev.from.role === 'yoda' ? 'yoda' : prev.from.bot); if (pb && pb !== who && BOTS[pb]) return { to: pb, why: 'asked' }; }
  return null;
}
function botChain(id, who, text) {
  if (process.env.HUBFACE_BOTCHAIN === '0') return;
  const room = rooms.get(id); if (!room) return;
  const b = bcState(id); b.run++;
  const tg = botTarget(room, who, text); if (!tg) return;
  if (b.run >= BC_MAX_RUN) { bcSkip('run-cap'); console.log(`[roomserver] botchain room ${id} ${who}->${tg.to} skip run-cap (${b.run})`); return; }
  const now = Date.now(); b.times = b.times.filter((x) => now - x < 3600e3);
  if (b.times.length >= BC_PER_HOUR) { bcSkip('hour-cap'); console.log(`[roomserver] botchain room ${id} skip hour-cap`); return; }
  b.times.push(now); const runAt = b.run;
  b.q = b.q.then(async () => {
    const wait = b.last + BC_GAP_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (b.run !== runAt) { bcSkip('human-spoke'); return; }   // a human (or another bot) spoke meanwhile: drop this stale reply
    const recent = room.chat.slice(-10).map((e) => `${(e.from && e.from.name) || 'Someone'}: ${String(e.text).slice(0, 300)}`).join('\n');
    const me = BOTS[tg.to].name;
    const msgs = [{ role: 'system', content: `${BC_PERSONA[tg.to]} You are in a shared room chat with people and other bots (${Object.values(BOTS).map((x) => x.name).join(', ')}). Reply to the latest line in one or two short spoken sentences, under 240 characters, no name prefix, no emojis. If you have nothing useful to add, reply exactly SKIP.` },
      { role: 'user', content: `Room chat (most recent last):\n${recent}\n\nYou are ${me}. ${BOTS[who] ? BOTS[who].name : 'A bot'} just ${tg.why === 'named' ? 'mentioned you' : 'asked you'}. Your reply:` }];
    const r = await relayChat({ messages: msgs, max_tokens: 120, temperature: 0.7, from: 'botchain-' + tg.to });
    if (r.status !== 200) { bcSkip(String(r.json && r.json.error || r.status)); console.log(`[roomserver] botchain room ${id} ${who}->${tg.to} skip ${r.json && r.json.error || r.status}`); return; }
    let out = String(r.json.text || '').replace(new RegExp('^\\s*\\**' + me + '\\**\\s*:\\s*', 'i'), '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!out || /^skip\b/i.test(out)) { bcSkip('model-skip'); return; }
    if (b.run !== runAt) { bcSkip('human-spoke'); return; }
    b.last = Date.now(); bcStats.replies++;
    const s = await sayInternal(id, out, { speak: true, toChat: true, tts: fastTts, via: 'botchain', who: tg.to });
    const usd = s.audio ? chargeTts(out.length, 0) : 0;
    console.log(`[roomserver] botchain room ${id} ${who}->${tg.to} (${tg.why}) run ${runAt} model $${(+r.json.usd || 0).toFixed(5)} tts $${usd.toFixed(5)} today $${fastInfo().spentUsd.toFixed(4)}/${fastInfo().capUsd.toFixed(2)}`);
  }).catch((e) => console.log(`[roomserver] botchain room ${id} error ${String(e && e.name || e).slice(0, 40)}`));
}
console.log('[roomserver] botchain-20261019a ' + (process.env.HUBFACE_BOTCHAIN === '0' ? 'off' : `on (run ${BC_MAX_RUN}, ${BC_PER_HOUR}/h, ${BC_GAP_MS} ms gap)`));

/* ---------- transcript-20261019a (Dan, Oct 19): one unified, speaker-labelled transcript per room (people + bots) ----------
   Every Room Chat line (typed, speech-to-text 'voice', Yoda, Ava, Finn) is appended as one JSON line to
   <state dir>/transcripts/<ROOM>.jsonl (dir 0700, files 0600, owner = service user): {at, iso, room, speaker, role, bot, kind, text}.
   kind = voice | chat | bot. 5 MB cap per room file (further lines skipped + logged once). Data for later voice / bot work. */
const TX_DIR = LISTEN_FILE.replace(/yoda-listen\.json$/, 'transcripts'), TX_MAX = 5 * 1024 * 1024, txFull = new Set(), txStats = { lines: 0, errors: 0 };
try { nodeFs.mkdirSync(TX_DIR, { recursive: true, mode: 0o700 }); } catch {}
function txAppend(id, e) {
  try {
    if (!ID_RE.test(String(id)) || !e || !e.text) return;
    const f = `${TX_DIR}/${id}.jsonl`;
    let size = 0; try { size = nodeFs.statSync(f).size; } catch {}
    if (size > TX_MAX) { if (!txFull.has(id)) { txFull.add(id); console.log(`[roomserver] transcript ${id} full (5 MB), new lines skipped`); } return; }
    const fr = e.from || {}, role = fr.role || 'guest';
    const row = { at: +e.at || Date.now(), iso: new Date(+e.at || Date.now()).toISOString(), room: id, speaker: fr.name || 'Someone', role, bot: fr.bot || null, kind: role === 'bot' || role === 'yoda' ? 'bot' : (e.src === 'voice' ? 'voice' : 'chat'), text: String(e.text).slice(0, 2000) };
    nodeFs.appendFileSync(f, JSON.stringify(row) + '\n', { mode: 0o600 }); txStats.lines++;
  } catch (err) { txStats.errors++; if (txStats.errors < 5) console.log('[roomserver] transcript write error ' + String(err && err.code || err).slice(0, 40)); }
}
console.log('[roomserver] transcript-20261019a -> ' + TX_DIR);

/* ---------- latency-20261020a (Dan, Oct 19 call): bridges + reply timing + >10 s flag ----------
   Per Yoda-aimed line: t0 = line received (item.at; for voice that is the first fragment). first_audio = first answer clip
   broadcast (bridges don't count), done = whole answer spoken+posted. One {kind:'latency'} row per reply in the room transcript
   (role 'system', so the room chat/memory pack ignore it); flag:true when first_audio or done > 10 s. Bridges: if the reply is not
   out within 700 ms, a random cached bridge clip (never the same twice running) is broadcast as a normal yoda-say (bridge:true,
   no chat line); the browser's existing single queue plays it first, then the answer sentences in order. */
export const LAT_FLAG_MS = 10000;
const latPending = new Map();   // room -> current webhook-route timer (one at a time; newest wins)
export const latStats = { replies: 0, flagged: 0, bridges: 0, last: null };
export function splitSentences(t) { const a = String(t).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [String(t)]; const out = []; for (const x of a.map((s) => s.trim()).filter(Boolean)) { if (out.length && (out[out.length - 1].length < 25 || x.length < 12)) out[out.length - 1] += ' ' + x; else out.push(x); } return out.length ? out : [String(t)]; }
export function latRow(L, now = Date.now()) {   // flag covers every route (fast, auto-warm, auto-cold, webhook, fallbacks)
  const first = L.firstAudio ? L.firstAudio - L.t0 : null, done = now - L.t0;
  return { kind: 'latency', route: L.route, line_at: L.t0, first_audio_ms: first, done_ms: done, bridge: !!L.bridged, bridge_text: L.bridgeText || null, mono: L.mono ?? null, flag: (first == null ? done : first) > LAT_FLAG_MS || done > LAT_FLAG_MS };
}
function latStart(id, item, routeName) { const L = { room: id, t0: +item.at || Date.now(), route: routeName, firstAudio: 0, bridged: false, done: false, answering: false }; if (routeName === 'webhook') { const old = latPending.get(id); if (old && !old.done) latFinish(id, old, 'superseded'); latPending.set(id, L); } return L; }
function latAudio(L) { if (!L.firstAudio) L.firstAudio = Date.now(); }
function latDrop(id, L) { L.done = true; clearTimeout(L.bt); if (latPending.get(id) === L) latPending.delete(id); }
function latDone(id, L) { if (!L.done) latFinish(id, L, 'ok'); }
function latFinish(id, L, why) {
  L.done = true; clearTimeout(L.bt); if (latPending.get(id) === L) latPending.delete(id);
  const row = Object.assign(latRow(L), { end: why });
  latStats.replies++; if (row.flag) latStats.flagged++; latStats.last = row;
  console.log(`[roomserver] latency room ${id} ${row.route} first_audio ${row.first_audio_ms}ms done ${row.done_ms}ms bridge ${row.bridge}${row.flag ? ' FLAG>10s' : ''} (${why})`);
  txLatency(id, row);
}
function txLatency(id, row) {
  try { if (!ID_RE.test(String(id))) return; const f = `${TX_DIR}/${id}.jsonl`; let size = 0; try { size = nodeFs.statSync(f).size; } catch {} if (size > TX_MAX) return;
    nodeFs.appendFileSync(f, JSON.stringify(Object.assign({ at: Date.now(), iso: new Date().toISOString(), room: id, speaker: 'latency', role: 'system', bot: 'yoda', text: '' }, row)) + '\n', { mode: 0o600 }); } catch {}
}
function playBridge(id, L, b) {
  if (!b || !b.clip) return false;
  const tok = crypto.randomBytes(16).toString('hex'), at = Date.now(); clips.set(tok, { room: id, buf: b.clip.buf, type: b.clip.type, exp: at + 120000 });
  const from = botFrom('yoda'); roomBroadcast(id, { t: 'yoda-say', who: 'yoda', name: from.name, img: from.img, text: b.text, audio: `/api/rooms/${id}/say-audio/${tok}`, at, bridge: true });
  L.bridges = (L.bridges || 0) + 1; L.bridged = true; L.bridgeText = L.bridgeText ? L.bridgeText + ' | ' + b.text : b.text; latStats.bridges++; return true;
}
export const HOLD_MS = 6000, MAX_BRIDGES = 2, MONO_PAD_MS = 1500, COLD_GATE_MS = 25000;
// mono-20261020a: a warm line that arrives while the cold (webhook) reply is pending waits for it (or until 25 s after the cold line)
export function coldWaitMs(pending, now) { return pending && !pending.done && !pending.answering && /cold/.test(pending.route) ? Math.max(0, pending.t0 + COLD_GATE_MS - now) : 0; }
async function coldGate(id) { const t = Date.now(); while (coldWaitMs(latPending.get(id), Date.now()) > 0 && Date.now() - t < COLD_GATE_MS) await new Promise((r) => setTimeout(r, 250)); }
// opts.hold: webhook (cold) reply -> if still nothing ~6 s after the first bridge, one short 'one moment' bridge. Never more than 2.
function bridgeAfter(id, L, opts = {}) {
  if (!bridgesOn() || process.env.HUBFACE_TTS === '0') return;   // voiceoff-20261020a
  const waiting = () => !(L.done || L.answering || L.firstAudio);
  clearTimeout(L.bt);
  L.bt = setTimeout(() => {
    if (!waiting() || (L.bridges || 0) >= MAX_BRIDGES) return;   // reply already out within ~700 ms -> no bridge
    let holdIn = HOLD_MS;
    if (!L.bridges) { const m = opts.mono ? pickMono() : null;   // mono-20261020a: cold line -> one wake-up monologue instead of lead-in
      if (m && m.clip && playBridge(id, L, m)) { L.mono = m.i; holdIn = m.ms + MONO_PAD_MS; } else playBridge(id, L, pickBridge()); }
    if (opts.hold && (L.bridges || 0) < MAX_BRIDGES) { L.bt = setTimeout(() => { if (waiting() && (L.bridges || 0) < MAX_BRIDGES) playBridge(id, L, pickHold()); }, holdIn); L.bt.unref && L.bt.unref(); }
  }, L.bridges ? 0 : BRIDGE_SKIP_MS);
  L.bt.unref && L.bt.unref();
}
function latToWebhook(id, L) { L.route += '>webhook'; const old = latPending.get(id); if (old && old !== L && !old.done) latFinish(id, old, 'superseded'); latPending.set(id, L); bridgeAfter(id, L, { hold: true }); }
// webhook route: give up the clock after 90 s with no reply (logged as a flagged 'timeout' row)
setInterval(() => { const now = Date.now(); for (const [id, L] of latPending) if (!L.answering && now - L.t0 > 90000) latFinish(id, L, 'no-reply'); }, 15000).unref();
// render/cached bridge clips in the background (needs the TTS key; charged to the shared $1/day cap)
if (bridgesOn() && !(process.env.HUBFACE_TTS === '0') && process.env.NODE_ENV !== 'test') setTimeout(() => { if (!fastOn()) { console.log('[bridges] no TTS key/YODA_FAST off, bridges stay off'); return; } warmBridges(fastTts, { voice: BOTS.yoda.voice, charge: (n) => chargeTts(n, 0), canSpend }).catch(() => {}); }, 20000).unref();
console.log('[roomserver] latency-20261020a bridges + mempack + reply timing (flag > 10 s)');

/* ---------- readycue-20261020a (Dan approved Oct 19 11:23 PM ET) ----------
   When the HOST's room speech-to-text goes to "on [AssemblyAI ...]" (from any other state), the room gets one cached Yoda clip
   "I'm here, go ahead." (liora, rendered once to <state>/bridges/ready.mp3, charged to the $1/day cap) + chat line "Yoda is listening".
   Once per room per 60 s (reconnects / quick mic toggles don't repeat it). STT lines that are just the cue heard back through a
   speaker within 20 s are dropped before they become user lines. The client gets ready:true + chime:true on the yoda-say. */
export const READY_DEDUP_MS = 60000, READY_ECHO_MS = 20000;
const readyAt = new Map();
export function readyShouldFire(prevSt, st, role, last, now) { return role === 'host' && /^on\b/i.test(String(st || '')) && !/^on\b/i.test(String(prevSt || '')) && !(last && now - last < READY_DEDUP_MS); }
export function isReadyEcho(text, last, now) { if (!last || now - last > READY_ECHO_MS) return false; const t = String(text).toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim(); return /^((i'?m|i am|im)? ?here)? ?(go ahead)?$/.test(t) && t.length > 0 || /^yoda is listening$/.test(t); }
async function readyCue(id) {
  if (process.env.HUBFACE_TTS === '0') { roomPushChat(id, { from: botFrom('yoda'), text: 'Yoda is listening', at: Date.now(), ready: true }); return; }   // voiceoff-20261020a
  const clip = fastOn() ? await getReady(fastTts, { voice: BOTS.yoda.voice, charge: (n) => chargeTts(n, 0), canSpend }) : null;
  let audio = null; const at = Date.now();
  if (clip) { const tok = crypto.randomBytes(16).toString('hex'); clips.set(tok, { room: id, buf: clip.buf, type: clip.type, exp: at + 120000 }); audio = `/api/rooms/${id}/say-audio/${tok}`; }
  const from = botFrom('yoda');
  roomBroadcast(id, { t: 'yoda-say', who: 'yoda', name: from.name, img: from.img, text: READY_TEXT, audio, at, bridge: true, ready: true, chime: true });
  roomPushChat(id, { from, text: 'Yoda is listening', at, ready: true });
  console.log(`[roomserver] readycue room ${id} audio ${audio ? 'cached' : 'browser'}`);
}
console.log('[roomserver] readycue-20261020a on (host STT open -> "I\'m here, go ahead." once per 60 s)');

/* ---------- listendefault-20261020a (Dan approved Oct 19 11:35 PM ET) ----------
   Yoda listening is ON by default: when a host joins a room (or speaks/types) and the room is not listening, it is switched on
   (normal 2 h window, refreshed by every /say) UNLESS the room was explicitly switched off via POST /listen {on:false}; that
   off is remembered (<state>/yoda-listen-off.json) until /listen {on:true}. Guests never switch it on. The $1/day xAI cap and the
   AssemblyAI STT_DAILY_MIN budget are untouched (they gate spend independently of listening). */
const OFF_FILE = LISTEN_FILE.replace(/yoda-listen\.json$/, 'yoda-listen-off.json');
const listenOff = new Set();
try { for (const id of JSON.parse(nodeFs.readFileSync(OFF_FILE, 'utf8')) || []) if (ID_RE.test(String(id))) listenOff.add(String(id)); } catch {}
function saveOff() { try { nodeFs.writeFileSync(OFF_FILE + '.tmp', JSON.stringify([...listenOff])); nodeFs.renameSync(OFF_FILE + '.tmp', OFF_FILE); } catch (e) { console.log('[roomserver] listen-off save failed', String(e && e.code || e)); } }
export function shouldDefaultListen(on, explicitlyOff, isHost, enabled = process.env.YODA_LISTEN_DEFAULT !== '0') { return enabled && isHost && !on && !explicitlyOff; }
function listenDefault(id, why) { if (shouldDefaultListen(listenState(id).on, listenOff.has(id), true)) setListen(id, true, 'default ' + why); }
console.log(`[roomserver] listendefault-20261020a ${process.env.YODA_LISTEN_DEFAULT !== '0' ? 'on' : 'off'} (host join -> Yoda listening unless switched off; ${listenOff.size} room(s) off)`);

/* ---------- sessionpacket-20261020a (Dan approved Oct 19 11:52 PM ET) ----------
   One post-session packet per room session to the same Yoda webhook (same HOOK_URL + HOOK_HEADERS auth as room lines).
   Session = first human joins an empty room -> no humans left for SESS_EMPTY_MS (2 min); if the last human out clicked
   Leave/End (client {t:'leave'}), 20 s instead (covers a page refresh). Anyone rejoining cancels the end. Built from
   <state>/transcripts/<ROOM>.jsonl for [started, ended] only; drops kind:'latency' / role 'system' rows and the
   "Yoda is listening" ready line (bridge clips are never in the transcript). No human lines -> no packet. JSON body capped at
   SESS_PART_MAX chars; longer sessions go out as numbered parts {part, of}. Never truncated by HOOK_TEXT (that only caps room lines). */
export const SESS_EMPTY_MS = 120000, SESS_LEAVE_MS = 20000, SESS_PART_MAX = 30000;
const sessions = new Map();   // room id -> { started, timer, sent }
const isHumanMember = (m) => m.role !== 'yoda' && !/^yoda\b/i.test(String(m.name || '')) && m.name !== 'HubFace sync';
function sessJoin(room) { const me = [...room.members.values()].pop(); if (me && !isHumanMember(me)) return; let s = sessions.get(room.id); if (s && s.timer) { clearTimeout(s.timer); s.timer = null; } if (!s) sessions.set(room.id, { started: Date.now(), timer: null }); }
function sessLeave(room, me) {
  const s = sessions.get(room.id); if (!s || !isHumanMember(me)) return;
  if ([...room.members.values()].some(isHumanMember)) return;
  clearTimeout(s.timer); s.timer = setTimeout(() => { if ([...room.members.values()].some(isHumanMember)) { s.timer = null; return; } sessions.delete(room.id); sessEnd(room.id, room.name || roomName(room.id) || '', s.started, Date.now()).catch((e) => console.log('[roomserver] sessionpacket error', String(e && e.message || e).slice(0, 80))); }, me.left ? SESS_LEAVE_MS : SESS_EMPTY_MS);
  s.timer.unref && s.timer.unref();
}
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const etTime = (ms) => etFmt.format(new Date(ms)).replace(/^24:/, '00:') + ' ET';
export const isoET = (ms) => { const d = new Date(ms); const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'longOffset' }).formatToParts(d).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}${(p.timeZoneName || 'GMT-04:00').replace('GMT', '') || '+00:00'}`; };
// rows = parsed transcript rows -> session lines (or null when no human spoke)
export function sessionLines(rows, started, ended) {
  const keep = rows.filter((o) => o && o.text && +o.at >= started && +o.at <= ended && o.kind !== 'latency' && o.role !== 'system' && !(o.role === 'yoda' && o.text === 'Yoda is listening'));
  if (!keep.some((o) => o.role !== 'yoda' && o.role !== 'bot')) return null;
  return keep.map((o) => ({ t: etTime(+o.at), speaker: String(o.speaker || 'Someone'), text: String(o.text) }));
}
export function packetParts(base, lines, max = SESS_PART_MAX) {
  const parts = []; let cur = [];
  const size = (ls) => JSON.stringify(Object.assign({}, base, { part: 99, of: 99, lines: ls })).length;
  for (const l0 of lines) { let l = l0; if (size([l]) > max) l = Object.assign({}, l, { text: l.text.slice(0, max - size([Object.assign({}, l, { text: '' })]) - 20) + ' [cut]' }); if (cur.length && size([...cur, l]) > max) { parts.push(cur); cur = []; } cur.push(l); }
  if (cur.length) parts.push(cur);
  return parts.map((ls, i) => Object.assign({}, base, { part: i + 1, of: parts.length, lines: ls }));
}
function readTx(id) { try { return nodeFs.readFileSync(`${TX_DIR}/${id}.jsonl`, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }
async function sessEnd(id, name, started, ended) {
  const lines = sessionLines(readTx(id), started, ended);
  if (!lines) { console.log(`[roomserver] sessionpacket room ${id} skipped (no human lines)`); return; }
  if (!hookOn()) { console.log(`[roomserver] sessionpacket room ${id} not sent (hook off)`); return; }
  const base = { event: 'room.session_end', kind: 'session_end', room: id, roomName: name, started_iso: isoET(started), ended_iso: isoET(ended), reply: signedReplyUrl(id) };
  const parts = packetParts(base, lines);
  for (const p of parts) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000); hookStats.sent++;
    try { const res = await fetch(HOOK_URL, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'HubFace-roomserver/sessionpacket' }, HOOK_HEADERS(HOOK_KEY)), body: JSON.stringify(p) }); try { await res.arrayBuffer(); } catch {} if (res.ok) hookStats.ok++; else hookStats.fail++;
      console.log(`[roomserver] sessionpacket room ${id} part ${p.part}/${p.of} lines ${p.lines.length} -> ${res.status}`); }
    catch (e) { hookStats.fail++; console.log(`[roomserver] sessionpacket room ${id} part ${p.part}/${p.of} -> error ${String(e && e.name || e).slice(0, 40)}`); }
    finally { clearTimeout(t); }
  }
}
// host lines that read as a command/direction to Yoda -> needs_action:true on the webhook item (any route)
export function looksLikeCommand(t) {
  const s = String(t).trim().replace(/^(hey |ok(ay)? |so )?(yoda|r2|r2-?d2)[,:!]?\s*/i, '').replace(/^(please|now)\s+/i, '');
  return /^(add|build|make|create|fix|change|remove|delete|send|draft|write|email|schedule|remind|set( up)?|update|deploy|ship|move|rename|turn (on|off)|enable|disable|book|find|look up|research|check|order|call|invite|prepare|put|show me|give me|stage|test|restart|install)\b/i.test(s)
    || /\b(can you|could you|would you|i want you to|i need you to|go ahead and|make sure|don't forget to|let's get)\b/i.test(s);
}
console.log(`[roomserver] sessionpacket-20261020a on (empty ${SESS_EMPTY_MS / 1000}s / leave ${SESS_LEAVE_MS / 1000}s, parts <= ${SESS_PART_MAX} chars)`);
