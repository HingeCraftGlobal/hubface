// roomvoice-20261022a (Dan approved by voice 9:39 AM ET Oct 22 2026): native-audio room voice, opt-in per browser (room toggle).
// Path: browser mic PCM (only after a LOCAL wake word) -> WSS /api/room-voice -> xAI realtime speech-to-speech (manual turns,
// turn_detection null) -> reply PCM -> every room-voice socket in the same room. No STT/transcript step: xAI transcript events are dropped.
// Key: process.env.XAI_API_KEY only (never logged/returned). Hard cap $1.00/day ET at $0.08 per billed audio minute (in + out).
// Rollback: /opt/hubface/backups/roomvoice-20261022a/ROLLBACK.sh
import crypto from 'node:crypto';
import tls from 'node:tls';
import fs from 'node:fs';

export const ROOMVOICE_BUILD = 'roomvoice-20261022a';
const PATH = '/api/room-voice';
const ORIGIN = 'https://hubface.org';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const RATE = 24000, BPS = RATE * 2;            // PCM16 mono 24 kHz both ways
export const PRICE_PER_MIN = 0.08, DAY_CAP = 1.00;     // do not raise (Dan's rule)
const MAX_IN_S = 30, MAX_OUT_S = 45, IDLE_MS = 60000;
const SPEND_FILE = process.env.ROOMVOICE_SPEND_FILE || '/var/lib/hubface/roomvoice-spend.json';
const LOG_FILE = process.env.ROOMVOICE_LOG_FILE || '/var/lib/hubface/roomvoice-latency.log';
export const VOICE_BOTS = {
  yoda:   { name: 'Yoda',   voice: process.env.ROOMVOICE_YODA_VOICE || 'eve', persona: "You are Yoda, Dan Diotte's assistant for HingeCraft, speaking inside a HubFace room." },
  ava:    { name: 'Ava',    voice: process.env.ROOMVOICE_AVA_VOICE || 'eve', persona: 'You are Ava, the HubFace room moderator for Dan Diotte (HingeCraft), speaking inside a HubFace room.' },   // avavoice-20261022c\n  stella: { name: 'Stella', voice: process.env.ROOMVOICE_STELLA_VOICE || 'ara', persona: 'You are Stella, a HingeCraft assistant bot, speaking inside a HubFace room.' },
};
const instr = (b) => `${b.persona} Every reply MUST begin with the word "Dan," as your turn marker, then answer in one or two short spoken sentences. Be fast and brief.`;

const key = () => String(process.env.XAI_API_KEY || '').trim();
const etDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
let spend = { day: etDay(), inS: 0, outS: 0, turns: 0, refused: 0 };
try { const s = JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8')); if (s && s.day === etDay()) spend = Object.assign(spend, s); } catch {}
export const costOf = (s) => +(((s.inS + s.outS) / 60) * PRICE_PER_MIN).toFixed(4);
function today() { if (spend.day !== etDay()) spend = { day: etDay(), inS: 0, outS: 0, turns: 0, refused: 0 }; return spend; }
let saveT = null; function saveSpend() { if (saveT) return; saveT = setTimeout(() => { saveT = null; try { fs.writeFileSync(SPEND_FILE, JSON.stringify(spend)); } catch {} }, 300); saveT.unref?.(); }
export const capLeft = () => +(DAY_CAP - costOf(today())).toFixed(4);
export const stats = { turns: 0, refusedCap: 0, droppedNoTurn: 0, framesToXai: 0, lat: [], last: null };
function logLat(row) { stats.last = row; stats.lat.push(row); if (stats.lat.length > 50) stats.lat.shift(); try { fs.appendFileSync(LOG_FILE, JSON.stringify(row) + '\n'); } catch {} console.log('[roomvoice] lat ' + JSON.stringify(row)); }

/* ---------- minimal RFC 6455 framing ---------- */
export function frame(op, payload, mask) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload); const n = p.length;
  const hl = n < 126 ? 2 : n < 65536 ? 4 : 10; const h = Buffer.alloc(hl + (mask ? 4 : 0));
  h[0] = 0x80 | op; if (n < 126) h[1] = n; else if (n < 65536) { h[1] = 126; h.writeUInt16BE(n, 2); } else { h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  if (!mask) return Buffer.concat([h, p]);
  h[1] |= 0x80; const m = crypto.randomBytes(4); m.copy(h, hl); const o = Buffer.allocUnsafe(n); for (let i = 0; i < n; i++) o[i] = p[i] ^ m[i & 3]; return Buffer.concat([h, o]);
}
export class Peer {
  constructor(sock, { masked, onText, onBin, onClose }) { this.s = sock; this.masked = masked; this.buf = Buffer.alloc(0); this.open = true; this.frag = null; this.onText = onText; this.onBin = onBin; this.onClose = onClose;
    sock.on('data', (d) => this.data(d)); sock.on('close', () => this.gone()); sock.on('error', () => this.gone()); }
  data(d) { this.buf = Buffer.concat([this.buf, d]);
    for (;;) { const b = this.buf; if (b.length < 2) return; let n = b[1] & 0x7f, o = 2; const mk = b[1] & 0x80;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); o = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); o = 10; }
      if (n > 4e6) return this.close(1009, 'big');
      const mo = o; if (mk) o += 4; if (b.length < o + n) return;
      let p = b.subarray(o, o + n); if (mk) { const m = b.subarray(mo, mo + 4); p = Buffer.from(p); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
      this.buf = b.subarray(o + n); const fin = b[0] & 0x80, op = b[0] & 0x0f;
      if (op === 8) { this.close(1000, ''); return; } if (op === 9) { this.raw(10, p); continue; } if (op === 10) continue;
      if (op === 0) { if (!this.frag) continue; this.frag.parts.push(p); if (!fin) continue; p = Buffer.concat(this.frag.parts); const fop = this.frag.op; this.frag = null; this.deliver(fop, p); continue; }
      if (!fin) { this.frag = { op, parts: [p] }; continue; } this.deliver(op, p); } }
  deliver(op, p) { try { if (op === 1) this.onText && this.onText(p.toString('utf8')); else if (op === 2) this.onBin && this.onBin(p); } catch (e) { console.warn('[roomvoice] handler', String(e?.message || e).slice(0, 120)); } }
  raw(op, p) { if (!this.open) return; try { this.s.write(frame(op, p, this.masked)); } catch {} }
  text(o) { this.raw(1, typeof o === 'string' ? o : JSON.stringify(o)); }
  bin(b) { this.raw(2, b); }
  close(code = 1000, why = '') { if (!this.open) return; const p = Buffer.alloc(2 + Buffer.byteLength(why)); p.writeUInt16BE(code, 0); p.write(why, 2); this.raw(8, p); this.open = false; try { this.s.end(); } catch {} this.gone(); }
  gone() { if (this.done) return; this.done = true; this.open = false; try { this.s.destroy(); } catch {} this.onClose && this.onClose(); }
}
export function xaiConnect({ host = 'api.x.ai', path = '/v1/realtime?model=grok-voice-latest', onText, onBin, onClose } = {}) {
  return new Promise((res, rej) => {
    const k = key(); if (!k) return rej(new Error('no-key'));
    const s = tls.connect({ host, port: 443, servername: host, ALPNProtocols: ['http/1.1'] });
    const wk = crypto.randomBytes(16).toString('base64'); let hb = Buffer.alloc(0), up = false;
    const to = setTimeout(() => { if (!up) { s.destroy(); rej(new Error('xai-timeout')); } }, 8000);
    s.once('secureConnect', () => s.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${wk}\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer ${k}\r\n\r\n`));
    const onData = (d) => { hb = Buffer.concat([hb, d]); const i = hb.indexOf('\r\n\r\n'); if (i < 0) return; s.off('data', onData); clearTimeout(to);
      const head = hb.subarray(0, i).toString(); if (!/^HTTP\/1\.1 101/.test(head)) { s.destroy(); return rej(new Error('xai-http-' + (head.split(' ')[1] || '?'))); }
      up = true; const p = new Peer(s, { masked: true, onText, onBin, onClose }); const rest = hb.subarray(i + 4); if (rest.length) p.data(rest); res(p); };
    s.on('data', onData); s.on('error', (e) => { clearTimeout(to); if (!up) rej(e); });
  });
}

/* ---------- engine ---------- */
class Sess {   // one idle-able xAI socket per room+bot; it never carries audio unless a named turn is open
  constructor(roomId, bot, deps) { this.roomId = roomId; this.bot = bot; this.deps = deps; this.ws = null; this.ready = null; this.idleT = null; }
  open() {
    if (this.ws && this.ws.open) return Promise.resolve(this.ws);
    if (this.ready) return this.ready;
    const b = VOICE_BOTS[this.bot];
    this.ready = (async () => {
      const ws = await (this.deps.connect || xaiConnect)({ onText: (t) => this.ev(t), onBin: (buf) => this.deps.audio(this, buf), onClose: () => { if (this.ws === ws) this.ws = null; } });
      this.ws = ws;
      ws.text({ type: 'session.update', session: { instructions: instr(b), voice: b.voice, turn_detection: { type: null }, reasoning: { effort: 'none' },
        audio: { input: { format: { type: 'audio/pcm', rate: RATE } }, output: { format: { type: 'audio/pcm', rate: RATE } } } } });
      return ws;
    })();
    this.ready.then(() => { this.ready = null; }, () => { this.ready = null; this.ws = null; });
    return this.ready;
  }
  touch() { clearTimeout(this.idleT); this.idleT = setTimeout(() => { try { this.ws && this.ws.close(1000, 'idle'); } catch {} this.ws = null; }, IDLE_MS); this.idleT.unref?.(); }
  send(o) { if (this.ws && this.ws.open) { this.ws.text(o); return true; } return false; }
  ev(t) {   // audio + lifecycle only; transcript events are ignored on purpose (no text in the path)
    let e; try { e = JSON.parse(t); } catch { return; }
    const ty = e.type || '';
    if (ty === 'response.output_audio.delta' || ty === 'response.audio.delta') { if (e.delta) this.deps.audio(this, Buffer.from(e.delta, 'base64')); return; }
    if (ty === 'response.done') { this.deps.done(this); return; }
    if (ty === 'error') { console.warn('[roomvoice] xai error', String(e.error?.message || e.message || '').slice(0, 160)); this.deps.fail(this, 'xai-error'); }
  }
}

export function makeEngine(deps = {}) {   // deps.connect = fake xAI for tests
  const rooms = new Map();
  const R = (id) => { let r = rooms.get(id); if (!r) { r = { socks: new Set(), sess: new Map(), turn: null }; rooms.set(id, r); } return r; };
  const fan = (r, o) => { for (const c of r.socks) c.text(o); };
  const fanBin = (r, b) => { for (const c of r.socks) c.bin(b); };
  const engine = { rooms, stats, today, capLeft };
  const fin = (r, why) => { const T = r.turn; if (!T) return; r.turn = null; clearTimeout(T.guard);
    const s = today(); s.outS += T.outB / BPS; saveSpend();
    const row = { at: new Date().toISOString(), room: T.roomId, bot: T.bot, why, inS: +(T.inB / BPS).toFixed(2), outS: +(T.outB / BPS).toFixed(2),
      connectMs: T.connMs ?? null, xaiFirstMs: T.firstAt && T.commitAt ? T.firstAt - T.commitAt : null, spentToday: costOf(s) };
    fan(r, { t: 'reply-end', turn: T.id, bot: T.bot, why, server: row, spentToday: costOf(s), capLeft: capLeft() });
    logLat(row); T.sess.touch(); };
  const sdeps = {
    connect: deps.connect,
    audio(sess, buf) { const r = rooms.get(sess.roomId); const T = r && r.turn; if (!T || T.sess !== sess || !T.committed) return;
      if (!T.firstAt) { T.firstAt = Date.now(); fan(r, { t: 'reply-start', turn: T.id, bot: T.bot }); }
      T.outB += buf.length; fanBin(r, buf);
      const over = T.outB / BPS > MAX_OUT_S, capHit = costOf(today()) + (T.outB / BPS / 60) * PRICE_PER_MIN >= DAY_CAP;
      if (over || capHit) { sess.send({ type: 'response.cancel' }); fin(r, over ? 'max-len' : 'cap'); } },
    done(sess) { const r = rooms.get(sess.roomId); if (r && r.turn && r.turn.sess === sess && r.turn.committed) fin(r, 'done'); },
    fail(sess, why) { const r = rooms.get(sess.roomId); if (r && r.turn && r.turn.sess === sess) fin(r, why); },
  };
  engine.commit = (r, T) => { if (T.committed) return; T.committed = true; T.commitAt = Date.now(); saveSpend();
    if (!T.inB) return fin(r, 'empty');
    T.sess.send({ type: 'input_audio_buffer.commit' }); T.sess.send({ type: 'response.create' }); };
  engine.client = (roomId, c) => {
    const r = R(roomId); r.socks.add(c);
    c.text({ t: 'ready', build: ROOMVOICE_BUILD, bots: Object.keys(VOICE_BOTS), rate: RATE, cap: DAY_CAP, spentToday: costOf(today()), capLeft: capLeft() });
    let mine = null;
    const h = {
      async text(t) { let o; try { o = JSON.parse(t); } catch { return; }
        if (o.t === 'turn') {   // name-first: a turn exists ONLY after the browser's local wake word named a bot
          const bot = String(o.bot || '').toLowerCase();
          if (!VOICE_BOTS[bot]) return c.text({ t: 'refused', why: 'unknown-bot' });
          if (r.turn) return c.text({ t: 'refused', why: 'busy' });
          if (capLeft() <= 0.0001) { today().refused++; stats.refusedCap++; saveSpend(); return c.text({ t: 'refused', why: 'cap', capLeft: 0 }); }
          let sess = r.sess.get(bot); if (!sess) { sess = new Sess(roomId, bot, sdeps); r.sess.set(bot, sess); }
          const T = mine = r.turn = { id: crypto.randomBytes(4).toString('hex'), roomId, bot, sess, inB: 0, outB: 0, q: [], committed: false, live: false };
          T.guard = setTimeout(() => { if (r.turn === T) { sess.send({ type: 'input_audio_buffer.clear' }); fin(r, 'timeout'); } }, (MAX_IN_S + MAX_OUT_S + 15) * 1000); T.guard.unref?.();
          stats.turns++; today().turns++;
          c.text({ t: 'turn-ok', turn: T.id, bot });
          const t1 = Date.now();
          try { await sess.open(); T.connMs = Date.now() - t1; } catch (e) { console.warn('[roomvoice] connect', String(e?.message || e).slice(0, 80)); c.text({ t: 'refused', why: 'connect' }); return fin(r, 'connect'); }
          if (r.turn !== T) return;
          for (const b of T.q) { sess.send({ type: 'input_audio_buffer.append', audio: b.toString('base64') }); stats.framesToXai++; }
          T.q = []; T.live = true;
          if (T.endPending) engine.commit(r, T);
          return;
        }
        if (o.t === 'end') { const T = r.turn; if (!T || T !== mine) return; if (!T.live) { T.endPending = true; return; } engine.commit(r, T); return; }
        if (o.t === 'cancel') { const T = r.turn; if (T && T === mine) { T.sess.send({ type: 'input_audio_buffer.clear' }); fin(r, 'cancel'); } return; }
        if (o.t === 'lat') { const n = (k) => Math.max(0, Math.min(600000, +o[k] || 0));
          console.log('[roomvoice] client-lat ' + JSON.stringify({ room: roomId, bot: String(o.bot || '').slice(0, 12), wakeToEndMs: n('wakeToEndMs'), endToFirstMs: n('endToFirstMs'), firstToPlayMs: n('firstToPlayMs'), endToPlayMs: n('endToPlayMs'), wakeToPlayMs: n('wakeToPlayMs') })); return; }
      },
      bin(b) { const T = r.turn;   // forwarded ONLY inside an open named turn from this same socket; everything else is dropped
        if (!T || T !== mine || T.committed) { stats.droppedNoTurn++; return; }
        if ((T.inB + b.length) / BPS > MAX_IN_S) return;
        T.inB += b.length; today().inS += b.length / BPS;
        if (T.live) { T.sess.send({ type: 'input_audio_buffer.append', audio: b.toString('base64') }); stats.framesToXai++; } else T.q.push(b); },
      close() { r.socks.delete(c); const T = r.turn; if (T && T === mine && !T.committed) { T.sess.send({ type: 'input_audio_buffer.clear' }); fin(r, 'left'); } },
    };
    return h;
  };
  return engine;
}

let live = null;
export const isRoomVoicePath = (url) => { try { return new URL(url, 'http://x').pathname === PATH; } catch { return false; } };
export function roomVoiceHealth() { const s = today(); const a = stats.lat.filter((x) => x.xaiFirstMs != null);
  return { build: ROOMVOICE_BUILD, key: key() ? 'loaded' : 'missing', day: s.day, spentToday: costOf(s), cap: DAY_CAP, capLeft: capLeft(), turns: stats.turns, refusedCap: stats.refusedCap,
    droppedNoTurn: stats.droppedNoTurn, framesToXai: stats.framesToXai, last: stats.last, avgXaiFirstMs: a.length ? Math.round(a.reduce((x, y) => x + y.xaiFirstMs, 0) / a.length) : null }; }
export async function roomVoiceUpgrade(q, sock, head) {
  const rej = (c, m) => { try { sock.end(`HTTP/1.1 ${c} ${m}\r\nConnection: close\r\n\r\n`); } catch {} };
  let u; try { u = new URL(q.url, 'http://x'); } catch { return rej(400, 'Bad Request'); }
  const k = String(q.headers['sec-websocket-key'] || '');
  if (q.method !== 'GET' || String(q.headers.upgrade || '').toLowerCase() !== 'websocket' || !/^[A-Za-z0-9+/]{22}==$/.test(k)) return rej(400, 'Bad Request');
  if (q.headers.origin !== ORIGIN) return rej(403, 'Forbidden');
  const { roomMembers } = await import('./roomserver.mjs');
  const roomId = String(u.searchParams.get('room') || ''), peer = String(u.searchParams.get('peer') || '');
  if (!roomId || !peer || !roomMembers(roomId).some((m) => m.id === peer)) return rej(403, 'Forbidden');   // must be a live member of that room
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(k + GUID).digest('base64') + '\r\n\r\n');
  live = live || makeEngine();
  let h = null; const p = new Peer(sock, { masked: false, onText: (t) => h && h.text(t), onBin: (b) => h && h.bin(b), onClose: () => h && h.close() });
  h = live.client(roomId, p); if (head && head.length) p.data(head);
}
