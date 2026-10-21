// HingeCraft bridge gateway v0.1 (bridge-20261019a, Dan approved Oct 19 2026). Hosted site only. TEXT ONLY.
// Protocol: JSON-RPC 2.0 over WSS at wss://hubface.org/api/rooms/<HF-ID>/bridge, WebSocket subprotocol 'hingecraft.room.v1'.
// Moves: room.register (bridge -> room; one-use invitation capability in the BODY, never the URL; Ed25519 JWK + RFC 7638 thumbprint;
//        compact JWS (alg Ed25519) over the RFC 8785 canonical params minus 'proof')  ->  Seat result (session, seat, rules, roster,
//        context policy, one-use resume capability, heartbeat);  room.turn (room -> bridge; one pending turn per seat) -> one text result.
//        room.resume (bridge -> room; same key + resume capability, within 60 s of a drop). Notifications: room.turn.cancel, room.roster.changed.
// HTTP (all room-checked + rate-limited, same style as /say):
//   POST /api/rooms/<ID>/bridge-invite  {key?}        host only (owner key or owner session), same-origin -> one-use invite (5 min)
//   GET  /api/rooms/<ID>/bots                          bot roster for the room (no secrets)
//   POST /api/rooms/<ID>/bridge-turn    {key?, seat_id, text}   host only: give a bot the floor
// Bot lines enter the existing room chat as from.role 'bot' with the maker shown as self-claimed. Bot text is untrusted: control chars
// stripped, '<' '>' replaced, capped at 4000 chars; the client renders chat with textContent.
// Never logged: invitation capabilities, resume capabilities, keys. Logs carry event ids + short hashes only.
import crypto from 'node:crypto';
import { roomPushChat, roomMembers, roomChat, setChatTap } from './roomserver.mjs';
import { lookupForJoin, isOwner, clientIp, roomName } from './rooms.mjs';

export const BRIDGE_BUILD = 'bridge-20261019a';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const WSS_BASE = ORIGIN.replace(/^http/, 'ws');
const SUBPROTO = 'hingecraft.room.v1', VERSIONS = ['0.1'];
const ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const PATH_RE = /^\/api\/rooms\/([^/]+)\/bridge$/;
const MAX_FRAME = 64 * 1024, MAX_CHARS = 4000, TURN_MS = 30000, TURN_GRACE = 2000, HEARTBEAT_MS = 20000, RESUME_MS = 60000, INVITE_MS = 5 * 60e3;
const MAX_BOTS = 4, MAX_OPEN_INVITES = 6, PER_IP_SOCKS = 4, PRE_REG_MS = 10000, CHAIN_MAX = 6, SKEW_MS = 5 * 60e3;
const ERR = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD: -32601, PARAMS: -32602, INTERNAL: -32603,
  INVITATION_INVALID: -32001, INVITATION_EXPIRED: -32002, INVITATION_REPLAYED: -32003, PROOF_INVALID: -32004, VERSION_UNSUPPORTED: -32005,
  RATE_LIMITED: -32006, ROOM_FULL: -32007, SEAT_BUSY: -32008, SESSION_INVALID: -32009, TURN_TIMEOUT: -32010, TURN_CANCELLED: -32011 };
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ---------- small helpers ---------- */
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const short = (s) => sha(s).slice(0, 10);
const nowIso = (t = Date.now()) => new Date(t).toISOString();
const rid = (p) => p + '_' + crypto.randomBytes(6).toString('base64url');
function uuid7() { const b = crypto.randomBytes(16), t = BigInt(Date.now()); for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn); b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
const cleanLine = (v, n) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/</g, '\u2039').replace(/>/g, '\u203a').replace(/\s+/g, ' ').trim().slice(0, n);
const cleanName = (v) => cleanLine(v, 32).replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 32);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* RFC 8785 JSON Canonicalization (JCS): sorted keys by UTF-16 code units, ECMAScript number/string serialisation, no whitespace. */
export function jcs(v) {
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('jcs: non-finite'); return JSON.stringify(v); }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  throw new Error('jcs: bad type');
}
export const thumbprint = (jwk) => b64u(crypto.createHash('sha256').update(`{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`).digest());   // RFC 7638 (OKP members crv, kty, x)
function verifyProof(params, jwk) {   // compact JWS, header {alg:'Ed25519'|'EdDSA', kid?}; payload must equal JCS(params minus proof)
  try {
    const parts = String(params.proof || '').split('.'); if (parts.length !== 3) return false;
    const hdr = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!hdr || !['Ed25519', 'EdDSA'].includes(hdr.alg) || hdr.crit) return false;
    const { proof, ...rest } = params; const want = b64u(jcs(rest));
    if (parts[1] !== want) return false;
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  } catch { return false; }
}

/* ---------- rate limits (sliding windows) ---------- */
const hits = new Map();
function count(kind, who, win, add) { const k = kind + '|' + who, now = Date.now(); const a = (hits.get(k) || []).filter((t) => now - t < win); if (add) a.push(now); if (a.length) hits.set(k, a); else hits.delete(k); return a.length; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) { const b = a.filter((t) => now - t < 600e3); if (b.length) hits.set(k, b); else hits.delete(k); } }, 60e3).unref();
const LIM = { invite_ip: [10, 600e3], invite_room: [12, 600e3], regfail_ip: [10, 600e3], regfail_inv: [5, 600e3], bots_ip: [90, 60e3], turn_room: [20, 60e3], upgrade_ip: [30, 600e3] };
const over = (kind, who) => count(kind, who, LIM[kind][1], false) >= LIM[kind][0];
const bump = (kind, who) => count(kind, who, LIM[kind][1], true);

/* ---------- state ---------- */
const invites = new Map();   // invite id -> {id, room, capHash, exp, used, by}
const brooms = new Map();    // room id -> {seats: Map(seatId -> seat), seq, ordinal, floor: seatId|null, queue: [], chain}
const perIp = new Map();
function broom(id) { let b = brooms.get(id); if (!b) { b = { id, seats: new Map(), seq: 0, ordinal: 0, floor: null, queue: [], chain: 0 }; brooms.set(id, b); } return b; }
setInterval(() => { const now = Date.now(); for (const [k, v] of invites) if (v.exp < now - 600e3) invites.delete(k); }, 60e3).unref();
const live = (s) => s && s.conn && s.conn.open && s.state === 'seated';
function labelOf(s) { return `${s.name} (bot \u00b7 maker ${s.maker || 'unstated'}, self-claimed)`; }
function botPub(s) { return { seat_id: s.seatId, type: 'ai', display_name: s.name, maker_claim: s.maker || null, model_claim: s.model || null, claim_status: 'self_asserted', state: live(s) ? (s.pending ? 'turning' : 'seated') : 'disconnected', key_thumbprint: s.thumb, joined_at: nowIso(s.at) }; }
function rosterFor(roomId) {
  const out = [];
  for (const m of roomMembers(roomId)) out.push({ seat_id: 'h_' + String(m.id).replace(/-/g, '').slice(0, 8), type: 'human', display_name: m.name, role: m.role });
  out.push({ seat_id: 'yoda', type: 'ai', display_name: 'Yoda', role: 'moderator', claim_status: 'room_operated' });
  const b = brooms.get(roomId); if (b) for (const s of b.seats.values()) out.push(botPub(s));
  return out;
}
function rosterChanged(roomId) { const b = brooms.get(roomId); if (!b) return; const roster = rosterFor(roomId); for (const s of b.seats.values()) if (live(s)) s.conn.notify('room.roster.changed', { session_id: s.sessionId, roster }); }
function sys(roomId, text) { roomPushChat(roomId, { from: { id: 'bridge', name: 'HubFace', role: 'system' }, text: cleanLine(text, 300), at: Date.now() }); }
function log(roomId, ev, extra = '') { console.log(`[bridge] ${ev} room ${roomId}${extra ? ' ' + extra : ''}`); }

/* ---------- invitations ---------- */
export function createInvite(roomId, who) {
  const id = rid('inv'), cap = crypto.randomBytes(32).toString('base64url'), t = Date.now();
  invites.set(id, { id, room: roomId, capHash: sha(cap), exp: t + INVITE_MS, used: false, by: short(who) });
  const inv = { v: 1, type: 'hingecraft.bridge.invite', room_id: roomId, room_name: roomName(roomId) || '', endpoint: `${WSS_BASE}/api/rooms/${roomId}/bridge`, subprotocol: SUBPROTO,
    invitation: { id, capability: cap }, issued_at: nowIso(t), expires_at: nowIso(t + INVITE_MS) };
  log(roomId, 'invite.created', `${id} by ${short(who)}`);
  return { invite: inv, code: 'HCB1.' + b64u(JSON.stringify(inv)) };
}
function openInvites(roomId) { const now = Date.now(); let n = 0; for (const v of invites.values()) if (v.room === roomId && !v.used && v.exp > now) n++; return n; }

/* ---------- WebSocket (server side, RFC 6455; text frames; client frames must be masked; 64 KiB cap) ---------- */
function frame(op, payload) { const len = payload.length; let h; if (len < 126) { h = Buffer.alloc(2); h[1] = len; } else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); } else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); } h[0] = 0x80 | op; return Buffer.concat([h, payload]); }
class Conn {
  constructor(sock, ip, roomId) {
    this.s = sock; this.ip = ip; this.roomId = roomId; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.alive = Date.now(); this.bad = 0; this.msgs = []; this.seenIds = new Set(); this.seat = null;
    sock.setNoDelay(true); sock.setTimeout(0);
    sock.on('data', (d) => this.data(d)); sock.on('error', () => this.end()); sock.on('close', () => this.end());
  }
  raw(o) { if (!this.open) return; const p = Buffer.from(JSON.stringify(o)); if (p.length > MAX_FRAME) return; try { this.s.write(frame(1, p)); } catch { this.end(); } }
  result(id, result) { this.raw({ jsonrpc: '2.0', id, result }); }
  error(id, code, message, data) { this.raw({ jsonrpc: '2.0', id: id ?? null, error: data ? { code, message, data } : { code, message } }); }
  notify(method, params) { this.raw({ jsonrpc: '2.0', method, params }); }
  request(method, params) { const id = uuid7(); this.raw({ jsonrpc: '2.0', id, method, params }); return id; }
  ping() { if (this.open) try { this.s.write(frame(9, Buffer.alloc(0))); } catch { this.end(); } }
  close(code = 1000, why = '') { if (!this.open) return; const p = Buffer.alloc(2 + Buffer.byteLength(why)); p.writeUInt16BE(code, 0); p.write(why, 2); try { this.s.write(frame(8, p)); this.s.end(); } catch {} this.end(); }
  end() { if (!this.open) return; this.open = false; clearInterval(this.hb); clearTimeout(this.preReg); try { this.s.destroy(); } catch {} onConnGone(this); }
  invalid(id, code, msg) { this.error(id, code, msg); if (++this.bad >= 3) this.close(1008, 'too many invalid frames'); }
  data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (!masked) return this.close(1002, 'unmasked');
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) return this.close(1009, 'frame over 64 KiB'); len = Number(big); off = 10; }
      if (len > MAX_FRAME) return this.close(1009, 'frame over 64 KiB');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4), p = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len); this.alive = Date.now();
      if (op === 8) return this.close(1000);
      if (op === 9) { try { this.s.write(frame(10, p)); } catch {} continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { if (fin) this.msg(p); else this.frag = [p]; continue; }
      if (op === 0 && this.frag) { this.frag.push(p); const tot = this.frag.reduce((n, x) => n + x.length, 0); if (tot > MAX_FRAME) return this.close(1009, 'message over 64 KiB'); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.msg(all); } continue; }
      return this.close(1002, 'bad frame');
    }
  }
  msg(p) {
    const now = Date.now(); this.msgs = this.msgs.filter((t) => now - t < 10000); if (this.msgs.length >= 30) return this.close(1008, 'rate'); this.msgs.push(now);
    let o; try { o = JSON.parse(p.toString('utf8')); } catch { return this.invalid(null, ERR.PARSE, 'Parse error'); }
    if (Array.isArray(o)) return this.invalid(null, ERR.INVALID_REQUEST, 'Batch requests are not supported');
    if (!o || typeof o !== 'object' || o.jsonrpc !== '2.0') return this.invalid(o && o.id, ERR.INVALID_REQUEST, 'Invalid Request');
    try { onRpc(this, o); } catch (e) { console.warn('[bridge] rpc error', String(e?.message || e).slice(0, 120)); this.error(o.id, ERR.INTERNAL, 'Internal error'); }
  }
}
function reject(sock, code, text) { try { sock.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`); sock.destroy(); } catch {} }

export function isBridgePath(url) { try { return PATH_RE.test(new URL(url, 'http://x').pathname); } catch { return false; } }
export function bridgeUpgrade(q, sock, head) {
  let u; try { u = new URL(q.url, 'http://x'); } catch { return reject(sock, 400, 'Bad Request'); }
  const m = PATH_RE.exec(u.pathname); if (!m) return reject(sock, 404, 'Not Found');
  if (u.search) return reject(sock, 400, 'No query parameters (capabilities travel in the register message)');
  const up = String(q.headers.upgrade || '').toLowerCase(), conn = String(q.headers.connection || '').toLowerCase(), key = String(q.headers['sec-websocket-key'] || '');
  if (q.method !== 'GET' || up !== 'websocket' || !/\bupgrade\b/.test(conn) || q.headers['sec-websocket-version'] !== '13' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return reject(sock, 400, 'Bad Request');
  if (q.headers.origin && q.headers.origin !== ORIGIN) return reject(sock, 403, 'Forbidden');   // native bridges send no Origin; browsers from other sites are refused
  const protos = String(q.headers['sec-websocket-protocol'] || '').split(',').map((x) => x.trim());
  if (!protos.includes(SUBPROTO)) return reject(sock, 426, 'Subprotocol hingecraft.room.v1 required');
  const who = clientIp(q);
  if (over('regfail_ip', who) || over('upgrade_ip', who)) return reject(sock, 429, 'Too Many Requests');
  if ((perIp.get(who) || 0) >= PER_IP_SOCKS) return reject(sock, 429, 'Too Many Requests');
  const look = lookupForJoin(q, decodeURIComponent(m[1]));
  if (look.status === 429) return reject(sock, 429, 'Too Many Requests');
  if (look.status !== 200) return reject(sock, 404, 'Room not found');
  bump('upgrade_ip', who);
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Protocol: ' + SUBPROTO + '\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');
  perIp.set(who, (perIp.get(who) || 0) + 1);
  const c = new Conn(sock, who, look.row.id);
  c.preReg = setTimeout(() => { if (!c.seat) c.close(1008, 'register timeout'); }, PRE_REG_MS);
  c.hb = setInterval(() => { if (!c.open) return clearInterval(c.hb); if (Date.now() - c.alive > HEARTBEAT_MS * 3) return c.end(); c.ping(); }, HEARTBEAT_MS); c.hb.unref();
  if (head && head.length) c.data(head);
}

/* ---------- JSON-RPC routing ---------- */
function onRpc(c, o) {
  if ('method' in o) {
    if (typeof o.method !== 'string') return c.invalid(o.id, ERR.INVALID_REQUEST, 'Invalid Request');
    const isReq = 'id' in o;
    if (isReq) { if (typeof o.id !== 'string' || o.id.length > 64) return c.invalid(null, ERR.INVALID_REQUEST, 'id must be a string (UUIDv7)'); if (c.seenIds.has(o.id)) return c.error(o.id, ERR.INVALID_REQUEST, 'Duplicate request id'); c.seenIds.add(o.id); if (c.seenIds.size > 500) c.seenIds.delete(c.seenIds.values().next().value); }
    const p = o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? o.params : null;
    if (o.method === 'room.register') return isReq ? doRegister(c, o.id, p) : undefined;
    if (o.method === 'room.resume') return isReq ? doResume(c, o.id, p) : undefined;
    if (o.method === 'room.leave') { if (c.seat) leaveSeat(c.seat, 'left'); return c.close(1000, 'bye'); }
    if (o.method === 'room.ping') return isReq ? c.result(o.id, { at: nowIso() }) : undefined;
    return isReq ? c.error(o.id, ERR.METHOD, 'Method not found') : undefined;
  }
  if ('result' in o || 'error' in o) return onTurnReply(c, o);
  return c.invalid(o.id, ERR.INVALID_REQUEST, 'Invalid Request');
}
const str = (v, max, min = 1) => typeof v === 'string' && v.length >= min && v.length <= max;
function regFail(c, id, code, msg, invId) { bump('regfail_ip', c.ip); if (invId) bump('regfail_inv', invId); log(c.roomId, 'register.fail', `code ${code} ip ${short(c.ip)}`); c.error(id, code, msg); if (++c.bad >= 3) c.close(1008, 'too many invalid frames'); }
function checkSigned(c, id, p) {   // shared by register + resume: key, thumbprint, timestamp, JWS
  const k = p.bridge && p.bridge.public_key;
  if (!k || k.kty !== 'OKP' || k.crv !== 'Ed25519' || !/^[A-Za-z0-9_-]{43}$/.test(String(k.x || ''))) return 'public_key must be an Ed25519 OKP JWK';
  if (p.bridge.key_thumbprint !== thumbprint(k)) return 'thumbprint';
  const t = Date.parse(p.sent_at || ''); if (!Number.isFinite(t) || Math.abs(Date.now() - t) > SKEW_MS) return 'sent_at must be within 5 minutes of server time';
  if (!verifyProof(p, k)) return 'proof';
  return null;
}
function doRegister(c, id, p) {
  if (c.seat) return c.error(id, ERR.INVALID_REQUEST, 'Already registered on this connection');
  if (!p) return regFail(c, id, ERR.PARAMS, 'params object required');
  if (!Array.isArray(p.protocol_versions) || !p.protocol_versions.some((v) => VERSIONS.includes(v))) return regFail(c, id, ERR.VERSION_UNSUPPORTED, 'No common protocol version (server supports 0.1)');
  if (p.room_id !== c.roomId) return regFail(c, id, ERR.INVITATION_INVALID, 'Invitation is for another room');
  const inv = p.invitation; if (!inv || !str(inv.id, 40) || !str(inv.capability, 64, 40)) return regFail(c, id, ERR.INVITATION_INVALID, 'invitation {id, capability} required');
  if (over('regfail_inv', inv.id)) return regFail(c, id, ERR.RATE_LIMITED, 'Too many failed attempts for this invitation');
  if (!p.bridge || !p.agent || !p.capabilities) return regFail(c, id, ERR.PARAMS, 'bridge, agent and capabilities are required', inv.id);
  if (p.reply_via !== 'this_connection') return regFail(c, id, ERR.PARAMS, 'reply_via must be "this_connection"', inv.id);
  const caps = p.capabilities; if (!Array.isArray(caps.produces) || !caps.produces.includes('text/plain')) return regFail(c, id, ERR.PARAMS, 'capabilities.produces must include text/plain', inv.id);
  const name = cleanName(p.agent.display_name); if (!name) return regFail(c, id, ERR.PARAMS, 'agent.display_name required', inv.id);
  const bad = checkSigned(c, id, p);
  if (bad === 'thumbprint' || bad === 'proof') return regFail(c, id, ERR.PROOF_INVALID, bad === 'proof' ? 'Ed25519 JWS proof did not verify over the canonical params' : 'key_thumbprint does not match the RFC 7638 thumbprint of public_key', inv.id);
  if (bad) return regFail(c, id, ERR.PARAMS, bad, inv.id);
  const rec = invites.get(inv.id);
  const capOk = rec && crypto.timingSafeEqual(Buffer.from(sha(inv.capability)), Buffer.from(rec.capHash));
  if (!rec || !capOk || rec.room !== c.roomId) return regFail(c, id, ERR.INVITATION_INVALID, 'Unknown or malformed invitation', inv.id);
  if (rec.used) return regFail(c, id, ERR.INVITATION_REPLAYED, 'This invitation was already used. Ask the host for a new one.', inv.id);
  if (rec.exp < Date.now()) return regFail(c, id, ERR.INVITATION_EXPIRED, 'This invitation expired. Ask the host for a new one.', inv.id);
  const b = broom(c.roomId);
  const liveCount = [...b.seats.values()].length;
  if (liveCount >= MAX_BOTS) return regFail(c, id, ERR.ROOM_FULL, `This room already has ${MAX_BOTS} bots`);
  rec.used = true;   // consumed atomically (single-threaded) before the seat exists
  let dn = name, n = 2; const taken = (x) => [...b.seats.values()].some((s) => s.name.toLowerCase() === x.toLowerCase()) || /^(yoda|hubface)$/i.test(x) || roomMembers(c.roomId).some((m) => String(m.name).toLowerCase() === x.toLowerCase());
  while (taken(dn) && n < 20) dn = `${name} ${n++}`;
  const seat = { seatId: 'seat_b' + String(++b.seq).padStart(2, '0'), sessionId: rid('ses'), roomId: c.roomId, name: dn, maker: cleanLine(p.agent.maker_claim, 40) || null, model: cleanLine(p.agent.model_claim, 60) || null,
    impl: cleanLine(p.bridge.implementation, 80), thumb: p.bridge.key_thumbprint, jwk: { kty: 'OKP', crv: 'Ed25519', x: p.bridge.public_key.x }, at: Date.now(), conn: c, state: 'seated', pending: null, resume: null, goneT: null };
  b.seats.set(seat.seatId, seat); c.seat = seat; clearTimeout(c.preReg); c.bad = 0;
  c.result(id, seatResult(seat));
  log(c.roomId, 'seat', `${seat.seatId} ${seat.sessionId} "${dn}" key ${seat.thumb.slice(0, 10)} inv ${inv.id}`);
  sys(c.roomId, `${labelOf(seat)} joined the room through the bridge app. Address it by name to give it the floor.`);
  rosterChanged(c.roomId);
}
function seatResult(seat) {
  const cap = crypto.randomBytes(32).toString('base64url'), exp = Date.now() + 3600e3;
  seat.resume = { hash: sha(cap), exp };
  return { protocol_version: '0.1', session_id: seat.sessionId, seat_id: seat.seatId, display_name: seat.name, roster_position: rosterFor(seat.roomId).findIndex((x) => x.seat_id === seat.seatId) + 1,
    rules: { turn_mode: 'room_assigned', visibility: 'full_text_room', response_deadline_ms: TURN_MS, max_response_chars: MAX_CHARS, streaming: false, spontaneous_speech: false, tools_allowed: false,
      address_by_name: true, maker_claims: 'self_asserted' },
    roster: rosterFor(seat.roomId), context: { delivery: 'on_turn', max_events: 40, max_chars: 24000 },
    resume: { capability: cap, expires_at: nowIso(exp), window_ms: RESUME_MS }, heartbeat_ms: HEARTBEAT_MS };
}
function doResume(c, id, p) {
  if (c.seat) return c.error(id, ERR.INVALID_REQUEST, 'Already seated on this connection');
  if (!p || !str(p.session_id, 40) || !str(p.resume_capability, 64, 40) || !p.bridge) return regFail(c, id, ERR.PARAMS, 'session_id, resume_capability, bridge required');
  if (p.room_id !== c.roomId) return regFail(c, id, ERR.SESSION_INVALID, 'Session is for another room');
  const bad = checkSigned(c, id, p); if (bad) return regFail(c, id, bad === 'proof' || bad === 'thumbprint' ? ERR.PROOF_INVALID : ERR.PARAMS, bad);
  const b = brooms.get(c.roomId), seat = b && [...b.seats.values()].find((s) => s.sessionId === p.session_id);
  if (!seat || !seat.resume || seat.thumb !== p.bridge.key_thumbprint || seat.resume.exp < Date.now() || !crypto.timingSafeEqual(Buffer.from(sha(p.resume_capability)), Buffer.from(seat.resume.hash))) return regFail(c, id, ERR.SESSION_INVALID, 'Resume refused (unknown session, different key, expired or used capability). Ask the host for a new invitation.');
  if (live(seat)) { try { seat.conn.seat = null; seat.conn.close(1000, 'replaced by resume'); } catch {} }
  clearTimeout(seat.goneT); seat.goneT = null; seat.conn = c; seat.state = 'seated'; c.seat = seat; clearTimeout(c.preReg); c.bad = 0;
  c.result(id, seatResult(seat));   // new one-use resume capability each time
  log(c.roomId, 'resume', `${seat.seatId} ${seat.sessionId}`);
  sys(c.roomId, `${seat.name} reconnected (same key, seat kept).`);
  rosterChanged(c.roomId); pumpFloor(b);
}
function onConnGone(c) {
  perIp.set(c.ip, Math.max(0, (perIp.get(c.ip) || 1) - 1)); if (!perIp.get(c.ip)) perIp.delete(c.ip);
  const s = c.seat; if (!s || s.conn !== c) return;
  s.state = 'disconnected';
  if (s.pending) endTurn(s, 'cancelled', 'bridge disconnected');
  log(s.roomId, 'disconnect', s.seatId);
  rosterChanged(s.roomId);
  s.goneT = setTimeout(() => leaveSeat(s, 'timeout'), RESUME_MS); s.goneT.unref && s.goneT.unref();
}
function leaveSeat(s, why) {
  const b = brooms.get(s.roomId); if (!b || b.seats.get(s.seatId) !== s) return;
  clearTimeout(s.goneT); if (s.pending) endTurn(s, 'cancelled', 'left');
  b.seats.delete(s.seatId); b.queue = b.queue.filter((x) => x.seatId !== s.seatId); s.resume = null; s.state = 'left';
  log(s.roomId, 'left', `${s.seatId} ${why}`);
  sys(s.roomId, `${s.name} left the room${why === 'timeout' ? ' (bridge did not reconnect within 60 s)' : ''}.`);
  rosterChanged(s.roomId); if (!b.seats.size && !b.queue.length) brooms.delete(s.roomId); else pumpFloor(b);
}

/* ---------- turns ---------- */
function contextFor(roomId, chat) {
  const ev = []; let chars = 0;
  for (let i = chat.length - 1; i >= 0 && ev.length < 40; i--) {
    const e = chat[i]; const text = String(e.text || '').slice(0, 2000); if (chars + text.length > 24000) break; chars += text.length;
    ev.unshift({ event_id: 'evt_' + (e.at || 0).toString(36) + '_' + i, speaker: e.from && e.from.role === 'bot' ? e.from.seat : (e.from && e.from.role === 'yoda' ? 'yoda' : 'h_' + String(e.from && e.from.id || '').replace(/-/g, '').slice(0, 8)), speaker_name: e.from && (e.from.bot || e.from.name), type: e.from && ['bot', 'yoda'].includes(e.from.role) ? 'ai' : (e.from && e.from.role === 'system' ? 'system' : 'human'), text, at: nowIso(e.at || 0) });
  }
  return ev;
}
function queueTurn(b, seatId, prompt) {
  const s = b.seats.get(seatId); if (!s) return false;
  if (b.queue.filter((x) => x.seatId === seatId).length >= 3) return false;
  b.queue.push({ seatId, prompt }); pumpFloor(b); return true;
}
function pumpFloor(b) {
  if (b.floor) return;
  while (b.queue.length) {
    const t = b.queue.shift(), s = b.seats.get(t.seatId);
    if (!s || !live(s) || s.pending) continue;
    const chat = roomChat(b.id);
    const turnId = 'turn_' + String(++b.ordinal).padStart(4, '0'), deadline = Date.now() + TURN_MS;
    const params = { session_id: s.sessionId, turn_id: turnId, ordinal: b.ordinal, addressed_to: s.seatId, deadline: nowIso(deadline), prompt: t.prompt, context: contextFor(b.id, chat), roster: rosterFor(b.id) };
    let raw = JSON.stringify(params); while (raw.length > MAX_FRAME - 512 && params.context.length) { params.context.shift(); raw = JSON.stringify(params); }
    const rpcId = s.conn.request('room.turn', params);
    s.pending = { rpcId, turnId, at: Date.now(), timer: setTimeout(() => endTurn(s, 'timeout'), TURN_MS + TURN_GRACE) };
    b.floor = s.seatId; log(b.id, 'turn.assigned', `${s.seatId} ${turnId}`);
    return;
  }
}
function endTurn(s, outcome, why) {
  const p = s.pending; if (!p) return; clearTimeout(p.timer); s.pending = null;
  const b = brooms.get(s.roomId);
  if (outcome === 'timeout' || outcome === 'cancelled') {
    if (live(s)) s.conn.notify('room.turn.cancel', { session_id: s.sessionId, turn_id: p.turnId, reason: outcome === 'timeout' ? 'timeout' : (why || 'cancelled'), code: outcome === 'timeout' ? ERR.TURN_TIMEOUT : ERR.TURN_CANCELLED });
    log(s.roomId, 'turn.' + outcome, `${s.seatId} ${p.turnId}`);
    if (outcome === 'timeout') sys(s.roomId, `${s.name} did not answer within ${TURN_MS / 1000} s (turn ${p.turnId} timed out).`);
  }
  if (b) { if (b.floor === s.seatId) b.floor = null; setImmediate(() => pumpFloor(b)); }
}
function onTurnReply(c, o) {
  const s = c.seat; if (!s) return c.invalid(o.id, ERR.SESSION_INVALID, 'Not registered');
  const p = s.pending;
  if (!p || o.id !== p.rpcId) { log(s.roomId, 'turn.late-or-unknown', s.seatId); return; }   // late results after timeout/cancel are ignored
  if (o.error) {
    const msg = cleanLine(o.error && o.error.message, 160) || 'error';
    log(s.roomId, 'turn.error', `${s.seatId} ${p.turnId} code ${+o.error.code || 0}`);
    endTurn(s, 'error'); sys(s.roomId, `${s.name} could not answer: ${msg}`); return;
  }
  const r = o.result;
  if (!r || typeof r !== 'object' || r.turn_id !== p.turnId || typeof r.text !== 'string') { log(s.roomId, 'turn.bad-result', s.seatId); endTurn(s, 'error'); sys(s.roomId, `${s.name} sent a malformed reply (ignored).`); return; }
  let text = cleanLine(r.text, MAX_CHARS + 1); const cut = text.length > MAX_CHARS; if (cut) text = text.slice(0, MAX_CHARS - 1) + '\u2026';
  const ms = Date.now() - p.at; endTurn(s, 'ok');
  if (!text) { sys(s.roomId, `${s.name} passed (empty reply).`); return; }
  const b = brooms.get(s.roomId);
  const entry = { from: { id: 'bot:' + s.seatId, name: labelOf(s), role: 'bot', seat: s.seatId, bot: s.name, maker: s.maker, claim: 'self_asserted' }, text, at: Date.now() };
  roomPushChat(s.roomId, entry);
  log(s.roomId, 'turn.result', `${s.seatId} ${p.turnId} ${ms}ms len ${text.length}${cut ? ' cut' : ''}`);
  if (b) { b.chain = (b.chain || 0) + 1; if (b.chain < CHAIN_MAX) addressBots(b, entry, s.seatId); }   // bot -> bot hand-offs, capped per human line
}
function addressed(text, name) { const n = escRe(name); return new RegExp(`^\\s*@?${n}(?![\\p{L}\\p{N}])`, 'iu').test(text) || new RegExp(`(^|[^\\p{L}\\p{N}])@${n}(?![\\p{L}\\p{N}])`, 'iu').test(text); }
function addressBots(b, entry, exceptSeat) {
  const hits = [];
  for (const s of b.seats.values()) { if (s.seatId === exceptSeat || !live(s)) continue; if (addressed(entry.text, s.name)) hits.push(s); }
  for (const s of hits) queueTurn(b, s.seatId, { speaker: entry.from.role === 'bot' ? entry.from.seat : 'h_' + String(entry.from.id).replace(/-/g, '').slice(0, 8), speaker_name: entry.from.bot || entry.from.name, text: String(entry.text).slice(0, 2000) });
  return hits.length;
}
/* tap from roomserver.mjs: every human chat line of a live room */
setChatTap((room, e) => {
  const b = brooms.get(room.id); if (!b || !b.seats.size) return;
  if (!e.from || !['host', 'guest'].includes(e.from.role)) return;
  b.chain = 0; addressBots(b, e, null);
});

/* ---------- HTTP routes ---------- */
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
async function jbody(q, readBody) { const raw = (await readBody(q)).toString('utf8'); if (raw.length > 8192) throw new Error('too large'); const b = JSON.parse(raw || '{}'); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
export async function bridgeRoute(q, r, p, { readBody, json }) {
  const m = /^\/api\/rooms\/([^/]+)\/(bridge-invite|bots|bridge-turn)$/.exec(p); if (!m) return false;
  const id = decodeURIComponent(m[1]).trim().toUpperCase(), who = clientIp(q), kind = m[2];
  if (kind === 'bots') {
    if (q.method !== 'GET') { json(r, 405, { error: 'GET only' }); return true; }
    if (over('bots_ip', who)) { json(r, 429, { error: 'too many requests' }); return true; } bump('bots_ip', who);
    if (!ID_RE.test(id) || !roomName(id)) { json(r, 404, { error: 'Room not found' }); return true; }
    const b = brooms.get(id);
    json(r, 200, { ok: true, build: BRIDGE_BUILD, room: id, floor: b ? b.floor : null, queue: b ? b.queue.length : 0, bots: b ? [...b.seats.values()].map((s) => ({ ...botPub(s), label: labelOf(s) })) : [], open_invites: openInvites(id) }); return true;
  }
  if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
  if (!sameOrigin(q)) { json(r, 403, { error: 'Cross-site request blocked.' }); return true; }
  const lim = kind === 'bridge-invite' ? 'invite_ip' : 'turn_room';
  if (over(lim, kind === 'bridge-invite' ? who : id) || (kind === 'bridge-invite' && over('invite_room', id))) { json(r, 429, { error: 'Too many requests. Please wait a few minutes.' }, ); return true; }
  let b; try { b = await jbody(q, readBody); } catch { json(r, 400, { error: 'bad json' }); return true; }
  const look = lookupForJoin(q, id);
  if (look.status === 429) { json(r, 429, { error: 'too many requests' }); return true; }
  if (look.status !== 200) { json(r, 404, { error: 'Room not found' }); return true; }
  if (!isOwner(q, look.row, b.key)) { bump(lim, kind === 'bridge-invite' ? who : id); json(r, 403, { error: 'Only the room host can do this.' }); return true; }
  if (kind === 'bridge-invite') {
    bump('invite_ip', who); bump('invite_room', id);
    if (openInvites(id) >= MAX_OPEN_INVITES) { json(r, 429, { error: `There are already ${MAX_OPEN_INVITES} unused invitations for this room. Wait for them to expire (5 min).` }); return true; }
    const bb = brooms.get(id); if (bb && bb.seats.size >= MAX_BOTS) { json(r, 409, { error: `This room already has ${MAX_BOTS} bots.` }); return true; }
    const out = createInvite(id, who);
    json(r, 201, { ok: true, build: BRIDGE_BUILD, code: out.code, invite: out.invite, expires_in_s: INVITE_MS / 1000, downloads: DOWNLOADS }); return true;
  }
  bump('turn_room', id);
  const bb = brooms.get(id), seat = bb && bb.seats.get(String(b.seat_id || ''));
  if (!seat || !live(seat)) { json(r, 404, { error: 'No connected bot in that seat.' }); return true; }
  const text = cleanLine(b.text, 1000) || `${seat.name}, the host gives you the floor.`;
  const ok = queueTurn(bb, seat.seatId, { speaker: 'host', speaker_name: 'Host', text, assigned_by_host: true });
  json(r, ok ? 202 : 429, ok ? { ok: true, queued: true, floor: bb.floor } : { error: 'That bot already has 3 turns waiting.' }); return true;
}
export const DOWNLOADS = {
  windows: '/interface/downloads/bridge/HingeCraft-Bridge-Grok.exe',
  mac_arm64: '/interface/downloads/bridge/HingeCraft-Bridge-Grok-mac-arm64.zip',
  mac_x64: '/interface/downloads/bridge/HingeCraft-Bridge-Grok-mac-x64.zip',
  linux_x64: '/interface/downloads/bridge/HingeCraft-Bridge-Grok-linux-x64',
};
export function bridgeHealth() { let seats = 0; for (const b of brooms.values()) seats += b.seats.size; return { build: BRIDGE_BUILD, rooms: brooms.size, seats, open_invites: [...invites.values()].filter((v) => !v.used && v.exp > Date.now()).length }; }
