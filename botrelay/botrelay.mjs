// HubFace bot-to-bot fast relay — botrelay-20261025c (meter link: HubFace botmeter may create a metered room, hold/unhold it at zero balance, and stop it; scoped meter key, not the owner key) / prior: botrelay-20261025b (Reject pauses the room: other owner willing/unwilling, then seller final call; Accept still needs both owners) / prior: 20261025a (interval packets; owner watch tokens + two-owner sign-off; backward compatible with 20261022a)
// Isolated service. No model calls: bots bring their own brains. Zero deps (node >=18).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +process.env.BOTRELAY_PORT || 3475;
const HOST = process.env.BOTRELAY_HOST || '127.0.0.1';
const DATA = process.env.BOTRELAY_DATA || './data';
const OWNER_KEY = process.env.BOTRELAY_OWNER_KEY || (() => { try { return fs.readFileSync(process.env.BOTRELAY_OWNER_KEY_FILE || '', 'utf8').trim(); } catch { return ''; } })();
const LIM = {
  maxChars: +process.env.BOTRELAY_MAX_CHARS || 280,
  maxTurns: +process.env.BOTRELAY_MAX_TURNS || 40,
  maxDurationSec: +process.env.BOTRELAY_MAX_DURATION || 600,
  minIntervalMs: +process.env.BOTRELAY_MIN_INTERVAL_MS || 250,
  pollTimeoutSec: 25,
  idleSec: +process.env.BOTRELAY_IDLE_SEC || 120,
  pauseSec: +process.env.BOTRELAY_PAUSE_SEC || 900,
  maxRooms: 200,
};
const METER_KEY = (() => { try { return fs.readFileSync(process.env.BOTRELAY_METER_KEY_FILE || '/etc/hubface/botmeter.key', 'utf8').trim(); } catch { return ''; } })();
if (!OWNER_KEY) { console.error('BOTRELAY_OWNER_KEY(_FILE) required'); process.exit(1); }
fs.mkdirSync(path.join(DATA, 'receipts'), { recursive: true });

// --- passport door check (20261023c): local-only call to the passport service; relay never opens the DB ---
const PASSPORT_REQUIRED = process.env.BOTRELAY_PASSPORT_REQUIRED === '1';
const PASSPORT_CHECK_URL = process.env.BOTRELAY_PASSPORT_CHECK_URL || 'http://127.0.0.1:3479/internal/door-check';
async function passportOk(botName, passportNo, cvv) {
  if (!PASSPORT_REQUIRED) return { ok: true };
  if (!/^[A-Z]\d{4}-\d{4}[A-Z]$/.test(String(passportNo))) return { ok: false, why: 'passport_id_invalid' };
  try { const r = await fetch(PASSPORT_CHECK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passportNo, botName, cvv }), signal: AbortSignal.timeout(3000) });
    return await r.json(); } catch { return { ok: false, why: 'passport_service_unavailable' }; }
}
// --- interval packets (20261025a): extractive summaries every ~12s, off the turn path; no model calls ---
const PKT_MS = +process.env.BOTRELAY_PACKET_MS || 12000;
function emitPacket(r, final = false) {
  try {
    const ms = r.events.filter(e => e.type === 'message' && e.seq > r.pktLast);
    if (!ms.length && !final) return;
    if (ms.length) r.pktLast = ms[ms.length - 1].seq;
    const clip = t => (t.length > 90 ? t.slice(0, 87) + '...' : t);
    const last = {}; for (const m of ms) last[m.from] = m;
    const parts = Object.values(last).map(m => `${m.from} ${m.kind === 'offer' ? 'offered' : m.kind === 'accept' ? 'accepted' : 'said'}${m.price != null ? ' $' + m.price : ''}: "${clip(m.text)}"`);
    let summary = ms.length ? `${ms.length} turn(s) (#${ms[0].turn}-#${ms[ms.length - 1].turn}). ${parts.join('; ')}.` : 'No new turns.';
    if (final) summary = `FINAL (${r.endReason}, ${r.turn} turns total). ` + summary;
    r.packets.push({ t: new Date().toISOString(), seq: ++r.pktSeq, summary, turnsCovered: ms.map(m => m.turn), ...(final ? { final: true } : {}) });
  } catch {}
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const eq = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return crypto.timingSafeEqual(x, y); };
const rooms = new Map(); // roomId -> room
const ROOM_RE = /^[A-Za-z0-9_-]{3,64}$/;

function newRoom(id, opts) {
  const mk = name => ({ name: String(name || 'bot').slice(0, 40), tokenHash: '', watchHash: '', owner: '', joined: false, lastPost: 0, decision: '' });
  const bots = [mk(opts.bots?.[0] || 'Bot A'), mk(opts.bots?.[1] || 'Bot B')];
  const tokens = bots.map(b => { const t = 'brt_' + crypto.randomBytes(24).toString('base64url'); b.tokenHash = sha(t); return t; });
  const watch = bots.map((b, i) => { b.owner = String(opts.owners?.[i] || '').slice(0, 40); const t = 'brw_' + crypto.randomBytes(24).toString('base64url'); b.watchHash = sha(t); return t; });
  const r = {
    id, bots, created: Date.now(), startedAt: 0, endedAt: 0,
    state: 'waiting', // waiting -> relay -> ended
    topic: String(opts.topic || '').slice(0, LIM.maxChars),
    maxTurns: Math.min(+opts.maxTurns || LIM.maxTurns, LIM.maxTurns),
    maxDurationSec: Math.min(+opts.maxDurationSec || LIM.maxDurationSec, LIM.maxDurationSec),
    ownerApproval: opts.ownerApproval !== false, pending: null, sellerSeat: (+opts.sellerSeat === 1 ? 1 : 0), pausedBy: -1, pauseTimer: null,
    events: [], seq: 0, turn: 0, nextSeat: 0, waiters: new Set(), endReason: '', receipt: null, timer: null, idleTimer: null, packets: [], pktSeq: 0, pktLast: 0, pktTimer: null,
  };
  rooms.set(id, r);
  return { r, tokens, watch };
}

function push(r, ev) {
  ev.seq = ++r.seq; ev.t = new Date().toISOString(); ev.ms = Date.now();
  r.events.push(ev);
  // wake-on-event: resolve every long-poll on next tick (after any end-of-relay state change in the same handler)
  if (!r.wakePending) { r.wakePending = true; process.nextTick(() => { r.wakePending = false; const ws = [...r.waiters]; r.waiters.clear(); for (const w of ws) w(); }); }
  return ev;
}

function holdDuration(r) { if (r.durLeft || !r.durEnd) return; r.durLeft = Math.max(5000, r.durEnd - Date.now()); clearTimeout(r.timer); }
function pauseRoom(r, seat) {
  holdDuration(r);
  r.state = 'paused'; r.pausedBy = seat; clearTimeout(r.idleTimer); clearTimeout(r.pauseTimer);
  r.pauseTimer = setTimeout(() => end(r, 'pause_timeout'), LIM.pauseSec * 1000);
  push(r, { type: 'paused', seat, by: r.bots[seat].name, owner: r.bots[seat].owner, price: r.pending?.price });
}
function resumeRoom(r, byName) {
  clearTimeout(r.pauseTimer); if (r.durLeft) { r.durEnd = Date.now() + r.durLeft; r.timer = setTimeout(() => end(r, 'max_duration'), r.durLeft); r.durLeft = 0; } r.state = 'relay'; r.bots.forEach(x => x.decision = ''); r.pending = null; r.pausedBy = -1;
  push(r, { type: 'renegotiate', by: byName }); touchIdle(r);
}
function touchIdle(r) {
  clearTimeout(r.idleTimer);
  if (r.state !== 'ended') r.idleTimer = setTimeout(() => end(r, 'idle_timeout'), LIM.idleSec * 1000);
}

function end(r, reason) {
  if (r.state === 'ended') return;
  r.state = 'ended'; r.endReason = reason; r.endedAt = Date.now();
  clearTimeout(r.timer); clearTimeout(r.idleTimer); clearTimeout(r.pauseTimer); clearInterval(r.pktTimer);
  push(r, { type: 'ended', reason });
  writeReceipt(r);
  emitPacket(r, true);
  try { fs.writeFileSync(r.receipt.base + '.packets.json', JSON.stringify(r.packets, null, 2)); } catch {}
}

function writeReceipt(r) {
  const msgs = r.events.filter(e => e.type === 'message').map(e => ({ seq: e.seq, t: e.t, turn: e.turn, from: e.from, kind: e.kind, text: e.text, ...(e.price != null ? { price: e.price } : {}) }));
  const body = {
    receipt: 'hubface-botrelay/1', room: r.id, topic: r.topic, bots: r.bots.map(b => b.name),
    startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null, endedAt: new Date(r.endedAt).toISOString(),
    durationMs: r.startedAt ? r.endedAt - r.startedAt : 0, turns: r.turn, endReason: r.endReason, messages: msgs, ownerDecisions: r.events.filter(e => e.type === 'owner_decision').map(e => ({ seq: e.seq, t: e.t, bot: e.bot, owner: e.owner, decision: e.decision, price: e.price })),
  };
  const canon = JSON.stringify(body);
  const hash = sha(canon);
  const json = JSON.stringify({ ...body, sha256: hash, hashOf: 'JSON.stringify of this object without sha256/hashOf' }, null, 2);
  const txt = [
    `HubFace bot relay receipt — room ${r.id}`, `Bots: ${body.bots.join(' <-> ')}`, body.topic ? `Topic: ${body.topic}` : null,
    `Started: ${body.startedAt}   Ended: ${body.endedAt}   (${(body.durationMs / 1000).toFixed(2)} s)`,
    `Turns: ${body.turns}   End reason: ${body.endReason}`, '',
    ...msgs.map(m => `[${m.t}] #${m.turn} ${m.from} (${m.kind}): ${m.text}`), '', `SHA-256: ${hash}`,
  ].filter(x => x !== null).join('\n') + '\n';
  const stamp = new Date(r.endedAt).toISOString().replace(/[:.]/g, '-');
  const base = path.join(DATA, 'receipts', `${r.id}_${stamp}`);
  fs.writeFileSync(base + '.json', json); fs.writeFileSync(base + '.txt', txt);
  r.receipt = { base, hash };
}

function maybeStart(r) {
  if (r.state === 'waiting' && r.bots.every(b => b.joined)) {
    r.state = 'relay'; r.startedAt = Date.now();
    push(r, { type: 'relay_started', bots: r.bots.map(b => b.name), first: r.bots[0].name, topic: r.topic, limits: { maxChars: LIM.maxChars, maxTurns: r.maxTurns, maxDurationSec: r.maxDurationSec, minIntervalMs: LIM.minIntervalMs } });
    r.timer = setTimeout(() => end(r, 'max_duration'), r.maxDurationSec * 1000); r.durEnd = Date.now() + r.maxDurationSec * 1000;
    touchIdle(r);
    if (!r.pktTimer) { r.pktTimer = setInterval(() => emitPacket(r), PKT_MS); r.pktTimer.unref?.(); }
  }
}

function evs(req, res, r, u, seat, watcher) {
  const after = +u.searchParams.get('after') || 0;
  const timeout = Math.min(Math.max(+u.searchParams.get('timeout') || LIM.pollTimeoutSec, 0), LIM.pollTimeoutSec) * 1000;
  const reply = () => {
    const evs = r.events.filter(e => e.seq > after);
    send(res, 200, { events: evs, seq: r.seq, mode: r.state, seat, watcher, bots: r.bots.map(b => ({ name: b.name, owner: b.owner, decision: b.decision || undefined })), pending: r.pending, pausedBy: (r.state === 'paused' ? r.pausedBy : undefined), sellerSeat: r.sellerSeat, yourTurn: !watcher && r.state === 'relay' && r.nextSeat === seat, turn: r.turn });
  };
  if (r.events.some(e => e.seq > after) || timeout === 0) return reply();
  let done = false;
  const w = () => { if (!done) { done = true; clearTimeout(to); reply(); } };
  const to = setTimeout(() => { r.waiters.delete(w); w(); }, timeout);
  r.waiters.add(w); req.on('close', () => { r.waiters.delete(w); done = true; clearTimeout(to); });
}

// ---------- http helpers ----------
const send = (res, code, obj, type = 'application/json') => {
  const b = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(b);
};
const readBody = req => new Promise((ok, no) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 8192) { no(new Error('too_large')); req.destroy(); } });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { no(new Error('bad_json')); } });
});
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const botFor = (r, tok) => tok ? r.bots.findIndex(b => b.tokenHash && eq(b.tokenHash, sha(tok))) : -1;
const isMeter = req => { const k = req.headers['x-meter-key'] || ''; return !!(METER_KEY && k && eq(k, METER_KEY)); };
// meter hold (20261025c): balance hit zero. Bots hold, state kept, timers frozen; unhold restores the exact prior state.
function meterHold(r) { if (r.meterHold || r.state === 'ended') return; r.meterHold = { prev: r.state }; holdDuration(r); clearTimeout(r.idleTimer); clearTimeout(r.pauseTimer); r.pauseLeft = 0; r.state = 'meter_hold'; push(r, { type: 'meter_hold', prev: r.meterHold.prev }); }
function meterUnhold(r) { if (!r.meterHold || r.state === 'ended') return; const prev = r.meterHold.prev; r.meterHold = null; r.state = prev;
  if (prev === 'relay') { if (r.durLeft) { r.durEnd = Date.now() + r.durLeft; r.timer = setTimeout(() => end(r, 'max_duration'), r.durLeft); r.durLeft = 0; } touchIdle(r); }
  else if (prev === 'awaiting_owners' || prev === 'paused' || prev === 'final_call') { r.pauseTimer = setTimeout(() => end(r, prev === 'awaiting_owners' ? 'approval_timeout' : 'pause_timeout'), LIM.pauseSec * 1000); }
  push(r, { type: 'meter_resume', mode: prev }); }
const isOwner = req => { const k = bearer(req) || req.headers['x-owner-key'] || ''; return k && eq(k, OWNER_KEY); };

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/api\/botrelay\/rooms(?:\/([^/]+)(?:\/([a-z]+))?)?\/?$/);
    if (u.pathname === '/api/botrelay/health') return send(res, 200, { ok: true, rooms: rooms.size });
    if (!m) return send(res, 404, { error: 'not_found' });
    const [, id, action] = m;

    // Owner: create relay room -> two bot tokens
    if (!id && req.method === 'POST') {
      if (!isOwner(req)) return send(res, 401, { error: 'owner_auth_required' });
      const b = await readBody(req);
      const rid = String(b.room || '');
      if (!ROOM_RE.test(rid)) return send(res, 400, { error: 'bad_room_id' });
      const old = rooms.get(rid);
      if (old && old.state !== 'ended') return send(res, 409, { error: 'relay_already_active' });
      if (rooms.size >= LIM.maxRooms) for (const [k, v] of rooms) if (v.state === 'ended') { rooms.delete(k); if (rooms.size < LIM.maxRooms) break; }
      const { r, tokens, watch } = newRoom(rid, b);
      return send(res, 201, { room: rid, ownerApproval: r.ownerApproval, bots: r.bots.map((x, i) => ({ seat: i, name: x.name, owner: x.owner, token: tokens[i], watch: watch[i] })), limits: { maxChars: LIM.maxChars, maxTurns: r.maxTurns, maxDurationSec: r.maxDurationSec, minIntervalMs: LIM.minIntervalMs } });
    }
    if (id === 'metercreate' && !action && req.method === 'POST') {
      if (!isMeter(req)) return send(res, 401, { error: 'meter_auth_required' });
      const b = await readBody(req); const rid = String(b.room || '');
      if (!ROOM_RE.test(rid)) return send(res, 400, { error: 'bad_room_id' });
      const old = rooms.get(rid); if (old && old.state !== 'ended') return send(res, 409, { error: 'relay_already_active' });
      if (rooms.size >= LIM.maxRooms) for (const [k, v] of rooms) if (v.state === 'ended') { rooms.delete(k); if (rooms.size < LIM.maxRooms) break; }
      const { r, tokens, watch } = newRoom(rid, b); r.meterId = String(b.meter || '').slice(0, 40);
      push(r, { type: 'meter_linked', meter: r.meterId });
      return send(res, 201, { room: rid, meter: r.meterId, ownerApproval: r.ownerApproval, bots: r.bots.map((x, i) => ({ seat: i, name: x.name, owner: x.owner, token: tokens[i], watch: watch[i] })), limits: { maxChars: LIM.maxChars, maxTurns: r.maxTurns, maxDurationSec: r.maxDurationSec, minIntervalMs: LIM.minIntervalMs } });
    }
    if (!id || !ROOM_RE.test(id)) return send(res, 400, { error: 'bad_room_id' });
    const r = rooms.get(id);

    // Public status for the room page: mode only, never message content
    if (action === 'status' && req.method === 'GET') {
      if (!r) return send(res, 200, { room: id, mode: 'normal' });
      return send(res, 200, { room: id, mode: r.state === 'relay' ? 'relay' : r.state === 'waiting' ? 'waiting' : r.state === 'awaiting_owners' ? 'awaiting_owners' : (r.state === 'paused' || r.state === 'final_call' || r.state === 'meter_hold') ? r.state : 'ended', meter: r.meterId ? true : undefined, turns: r.turn, bots: r.bots.map(b => b.name), endReason: r.endReason || undefined, receiptReady: !!r.receipt });
    }
    if (!r) return send(res, 404, { error: 'no_relay_for_room' });

    if (action === 'receipt' && req.method === 'GET') {
      if (!isOwner(req)) return send(res, 401, { error: 'owner_auth_required' });
      if (!r.receipt) return send(res, 409, { error: 'not_ended' });
      const fmt = u.searchParams.get('format') === 'txt' ? 'txt' : 'json';
      res.setHeader('content-disposition', `attachment; filename="${path.basename(r.receipt.base)}.${fmt}"`);
      return send(res, 200, fs.readFileSync(`${r.receipt.base}.${fmt}`, 'utf8'), fmt === 'txt' ? 'text/plain' : 'application/json');
    }
    if ((action === 'meterhold' || action === 'meterunhold' || action === 'meterstop') && req.method === 'POST') {
      if (!isMeter(req) || !r.meterId) return send(res, 401, { error: 'meter_auth_required' });
      if (action === 'meterhold') meterHold(r); else if (action === 'meterunhold') meterUnhold(r); else end(r, r.state === 'meter_hold' ? 'meter_balance_timeout' : 'owner_closed');
      return send(res, 200, { ok: true, mode: r.state });
    }
    if (action === 'stop' && req.method === 'POST' && isOwner(req)) { end(r, 'owner_stop'); return send(res, 200, { ok: true }); }

    // Bot endpoints
    // Owner watch token (one per side): read events + approve/reject/renegotiate for its own seat. Cannot post offers.
    const tok = bearer(req), wseat = tok ? r.bots.findIndex(b => b.watchHash && eq(b.watchHash, sha(tok))) : -1;
    if ((wseat >= 0 || isOwner(req)) && action === 'packets' && req.method === 'GET') { const after = +u.searchParams.get('after') || 0; return send(res, 200, { room: r.id, mode: r.state, packets: r.packets.filter(x => x.seq > after) }); }
    if (wseat >= 0 && action === 'events' && req.method === 'GET') return evs(req, res, r, u, wseat, true);
    if (wseat >= 0 && action === 'approve' && req.method === 'POST') {
      const b = await readBody(req); const d = String(b.decision || ''); const w = r.bots[wseat];
      if (r.state === 'meter_hold') return send(res, 409, { error: 'meter_hold', mode: r.state });
      if (r.state === 'awaiting_owners') {
        if (!['accept', 'reject', 'renegotiate'].includes(d)) return send(res, 400, { error: 'bad_decision' });
        w.decision = d;
        push(r, { type: 'owner_decision', seat: wseat, bot: w.name, owner: w.owner, decision: d, price: r.pending?.price });
        if (d === 'reject') pauseRoom(r, wseat);   // Reject now PAUSES; nothing ends here
        else if (d === 'renegotiate') resumeRoom(r, w.name);
        else if (r.bots.every(x => x.decision === 'accept')) end(r, 'deal_approved_by_both_owners');
        return send(res, 200, { ok: true, mode: r.state });
      }
      if (r.state === 'paused') {
        if (wseat === r.pausedBy) return send(res, 409, { error: 'waiting_on_other_owner', mode: r.state });
        if (d !== 'willing' && d !== 'unwilling') return send(res, 400, { error: 'bad_decision', expect: ['willing', 'unwilling'] });
        push(r, { type: 'owner_decision', seat: wseat, bot: w.name, owner: w.owner, decision: d, price: r.pending?.price });
        if (d === 'willing') resumeRoom(r, w.name);
        else {
          r.state = 'final_call'; clearTimeout(r.pauseTimer); r.pauseTimer = setTimeout(() => end(r, 'pause_timeout'), LIM.pauseSec * 1000);
          push(r, { type: 'final_call', seat: r.sellerSeat, owner: r.bots[r.sellerSeat].owner, by: w.name });
        }
        return send(res, 200, { ok: true, mode: r.state });
      }
      if (r.state === 'final_call') {
        if (wseat !== r.sellerSeat) return send(res, 409, { error: 'waiting_on_seller', mode: r.state });
        if (d !== 'renegotiate' && d !== 'close') return send(res, 400, { error: 'bad_decision', expect: ['renegotiate', 'close'] });
        push(r, { type: 'owner_decision', seat: wseat, bot: w.name, owner: w.owner, decision: d === 'close' ? 'close' : 'renegotiate', price: r.pending?.price });
        if (d === 'close') end(r, 'closed_by_seller_final'); else resumeRoom(r, w.name);
        return send(res, 200, { ok: true, mode: r.state });
      }
      return send(res, 409, { error: 'nothing_to_approve', mode: r.state });
    }
    const seat = botFor(r, tok);
    if (seat < 0) return send(res, 401, { error: 'bot_auth_required' });
    const me = r.bots[seat];

    if (action === 'join' && req.method === 'POST') {
      if (r.state === 'awaiting_owners' || r.state === 'paused' || r.state === 'final_call' || r.state === 'meter_hold') return send(res, 200, { seat, name: me.name, mode: r.state, seq: r.seq });
      if (r.state === 'ended') return send(res, 409, { error: 'ended' });
      const pc = await passportOk(me.name, req.headers['x-bot-passport'] || '', req.headers['x-bot-passport-cvv'] || '');
      if (!pc.ok) return send(res, 403, { error: pc.why });
      if (!me.joined) { me.joined = true; push(r, { type: 'joined', who: me.name, seat }); }
      maybeStart(r);
      return send(res, 200, { seat, name: me.name, mode: r.state, seq: r.seq });
    }

    if (action === 'events' && req.method === 'GET') return evs(req, res, r, u, seat, false);

    if (action === 'say' && req.method === 'POST') {
      if (r.state !== 'relay') return send(res, 409, { error: r.state === 'ended' ? 'ended' : (r.state === 'paused' || r.state === 'final_call' || r.state === 'meter_hold') ? 'paused' : 'not_started' });
      if (r.nextSeat !== seat) return send(res, 409, { error: 'not_your_turn' });
      const now = Date.now();
      if (now - me.lastPost < LIM.minIntervalMs) return send(res, 429, { error: 'too_fast', retryAfterMs: LIM.minIntervalMs - (now - me.lastPost) });
      const b = await readBody(req);
      const kind = ['msg', 'offer', 'accept', 'stop'].includes(b.kind) ? b.kind : 'msg';
      const text = String(b.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
      if (!text && kind === 'msg') return send(res, 400, { error: 'empty' });
      if (text.length > LIM.maxChars) return send(res, 413, { error: 'too_long', maxChars: LIM.maxChars });
      const price = b.price != null && isFinite(+b.price) ? +b.price : undefined;
      me.lastPost = now; r.turn++; r.nextSeat = 1 - seat;
      const ev = push(r, { type: 'message', from: me.name, seat, turn: r.turn, kind, text, ...(price != null ? { price } : {}) });
      touchIdle(r);
      if (kind === 'accept' && r.ownerApproval) { r.state = 'awaiting_owners'; r.pending = { price, by: me.name, text }; r.bots.forEach(x => x.decision = ''); push(r, { type: 'approval_needed', price, by: me.name, text }); clearTimeout(r.idleTimer); holdDuration(r); clearTimeout(r.pauseTimer); r.pauseTimer = setTimeout(() => end(r, 'approval_timeout'), LIM.pauseSec * 1000); }
      else if (kind === 'accept') end(r, `accepted_by_${me.name}`);
      else if (kind === 'stop') end(r, `stopped_by_${me.name}`);
      else if (r.turn >= r.maxTurns) end(r, 'max_turns');
      return send(res, 200, { ok: true, seq: ev.seq, turn: r.turn, mode: r.state });
    }
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    if (!res.headersSent) send(res, e.message === 'bad_json' || e.message === 'too_large' ? 400 : 500, { error: e.message === 'bad_json' || e.message === 'too_large' ? e.message : 'server_error' });
  }
});
server.keepAliveTimeout = 30000;
server.listen(PORT, HOST, () => console.log(`botrelay listening ${HOST}:${PORT}`));
