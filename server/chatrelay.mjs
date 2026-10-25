// chatrelay-20261020d: reply ids single-use (409), canceled on relay-off (410), per-id timing log <state>/chatrelay-timing.jsonl, POST /api/chatrelay/mark for helper stages.
// chatrelay-20261020a (Dan approved Oct 20 10:58 AM ET): room host lines -> laptop helper -> Grok Bot "Message Yoda" bar -> text reply into Room Chat.
// Gate = the red "Talk to Yoda" mic (Properties > Behavior, next to Auto fog). ON for a room: host lines (STT finals + typed) go ONLY to this
// queue, never to the Yoda webhook. OFF: nothing relayed, normal path. State persists in <state>/chatrelay.json.
//   GET  /api/chatrelay/state?room=ID            owner session or relay token -> {on}
//   POST /api/chatrelay/toggle {room,on}          owner session or relay token
//   GET  /api/chatrelay/pull?room=ID&after=<id>   relay token only -> {lines:[{id,t,iso,text,reply}], cursor}
//   POST /api/chatrelay/reply?room=&id=&exp=&sig= {text}  signed per-line URL (5 min) -> Yoda text line in Room Chat (no TTS)
// Token: only its SHA-256 is on the VPS (<state>/chatrelay-token.sha256); the token itself lives on Dan's laptop.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { lookupForJoin, isOwner } from './rooms.mjs';
export const CHATRELAY_BUILD = 'chatrelay-20261020d';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const ST = (process.env.STATE_DIRECTORY || '/var/lib/hubface').split(':')[0];
const STATE_FILE = ST + '/chatrelay.json', TOKEN_FILE = ST + '/chatrelay-token.sha256', TX_DIR = ST + '/transcripts', TIMING_FILE = ST + '/chatrelay-timing.jsonl';
const ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const SECRET = crypto.randomBytes(32), REPLY_MS = 300e3, QMAX = 50;
let deps = null; export function initChatRelay(d) { deps = d; }
let on = new Set(); try { const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (Array.isArray(j.rooms)) on = new Set(j.rooms.filter((x) => ID_RE.test(x))); } catch {}
function save() { try { fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify({ rooms: [...on], build: CHATRELAY_BUILD }), { mode: 0o600 }); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); } catch (e) { console.log('[chatrelay] save failed', String(e && e.code || e)); } }
const queues = new Map(); let seq = Date.now(); const lines = new Map();   // id -> line (for reply lookups)
const used = new Map();     // id -> {status:409|410, t} for consumed / canceled reply ids
function timing(id, room, stage, extra) { try { fs.appendFileSync(TIMING_FILE, JSON.stringify(Object.assign({ id, room, stage, at: Date.now(), iso: new Date().toISOString() }, extra || {})) + '\n', { mode: 0o600 }); } catch {} }
function gcUsed(now) { for (const [k, v] of used) if (v.t < now - 2 * REPLY_MS) used.delete(k); }
const recent = new Map();   // room -> [{text, t}] for 5 s identical-text dedupe
const sig = (room, id, exp) => crypto.createHmac('sha256', SECRET).update(`cr1|${room}|${id}|${exp}`).digest('base64url');
function tx(room, row) { try { fs.appendFileSync(`${TX_DIR}/${room}.jsonl`, JSON.stringify(Object.assign({ at: Date.now(), iso: new Date().toISOString(), room, speaker: 'chatrelay', role: 'system', bot: 'yoda', text: '', kind: 'chatrelay' }, row)) + '\n', { mode: 0o600 }); } catch {} }
// called from roomserver route() for host lines; true = taken (do not send to the webhook)
export function relayTake(room, item) {
  if (!on.has(room.id) || item.role !== 'host') return false;
  const text = String(item.text || '').trim(); if (!text) return true;
  const now = Date.now(), norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const rc = (recent.get(room.id) || []).filter((x) => now - x.t < 5000); if (rc.some((x) => x.n === norm)) { console.log(`[chatrelay] dup within 5 s dropped room ${room.id}`); return true; }
  rc.push({ n: norm, t: now }); recent.set(room.id, rc);
  const id = String(++seq), exp = now + REPLY_MS;
  const line = { id, t: now, iso: new Date(now).toISOString(), line_at: +item.at || now, source: item.source || 'chat', text: text.slice(0, 2000), room: room.id,
    reply: `${ORIGIN}/api/chatrelay/reply?room=${room.id}&id=${id}&exp=${exp}&sig=${sig(room.id, id, exp)}`, exp };
  const q = queues.get(room.id) || []; q.push(line); while (q.length > QMAX) q.shift(); queues.set(room.id, q); lines.set(id, line);
  for (const [k, l] of lines) if (l.exp < now - 60e3) lines.delete(k);
  timing(id, room.id, 'queued', { line_at: line.line_at, source: line.source, len: line.text.length });
  console.log(`[chatrelay] queued room ${room.id} id ${id} ${line.source} len ${line.text.length} (stt->queue ${now - line.line_at}ms)`);
  return true;
}
function tokenOk(q) { const t = String(q.headers['x-relay-token'] || '').trim(); if (t.length < 32) return false;
  try { const want = Buffer.from(fs.readFileSync(TOKEN_FILE, 'utf8').trim(), 'hex'); const got = crypto.createHash('sha256').update(t).digest(); return want.length === 32 && crypto.timingSafeEqual(got, want); } catch { return false; } }
function ownerOk(q, id) { try { const look = lookupForJoin(q, id); return look.status === 200 && isOwner(q, look.row, String(q.headers['x-owner-key'] || ''));  /* b: owner key or signed-in owner */ } catch { return false; } }
async function body(q, readBody) { try { return JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return null; } }
export const isChatRelayPath = (p) => p.startsWith('/api/chatrelay/');
export async function chatRelayRoute(q, r, p, u, { readBody, json }) {
  const what = p.slice('/api/chatrelay/'.length);
  if (what === 'reply') {
    if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    const room = String(u.searchParams.get('room') || '').toUpperCase(), id = String(u.searchParams.get('id') || ''), exp = +u.searchParams.get('exp') || 0, sg = String(u.searchParams.get('sig') || '');
    const want = sig(room, id, exp), line = lines.get(id), sigOk = sg.length === want.length && crypto.timingSafeEqual(Buffer.from(sg), Buffer.from(want));
    const u0 = used.get(id);
    if (sigOk && u0) { timing(id, room, u0.status === 410 ? 'reply_rejected_canceled' : 'reply_rejected_duplicate'); json(r, u0.status, { error: u0.status === 410 ? 'relay switched off; reply canceled' : 'reply already accepted' }); return true; }
    if (!line || line.room !== room || exp < Date.now() || sg.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sg), Buffer.from(want))) { json(r, 403, { error: 'forbidden' }); return true; }
    const b = await body(q, readBody); const text = b && String(b.text || '').trim().slice(0, 4000); if (!text) { json(r, 400, { error: 'text required' }); return true; }
    if (!deps) { json(r, 503, { error: 'not ready' }); return true; }
    if (!on.has(room)) { used.set(id, { status: 410, t: Date.now() }); lines.delete(id); timing(id, room, 'reply_rejected_canceled'); json(r, 410, { error: 'relay switched off; reply canceled' }); return true; }
    const now = Date.now(); used.set(id, { status: 409, t: now }); lines.delete(id); gcUsed(now); timing(id, room, 'reply_received', { len: text.length });
    const n = deps.roomPushChat(room, { from: deps.botFrom('yoda'), text, at: now });
    const row = { id, line_at: line.line_at, queued_at: line.t, pulled_at: line.pulled || null, reply_at: now, line_to_reply_ms: now - line.line_at, pull_to_reply_ms: line.pulled ? now - line.pulled : null, reply_len: text.length };
    timing(id, room, 'shown_in_room', { delivered: n, queued_at: line.t, pulled_at: line.pulled || null, accepted_at: line.accepted || null, queued_to_shown_ms: Date.now() - line.t });
    tx(room, row); console.log(`[chatrelay] reply room ${room} id ${id} line->reply ${row.line_to_reply_ms}ms pull->reply ${row.pull_to_reply_ms}ms people ${n}`);
    json(r, 200, { ok: true, room, delivered: n, spoke: false }); return true;
  }
  if (what === 'mark') {   // d: helper reports its stages (pulled / pasted / accepted / failed / skipped) for the same id
    if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    if (!tokenOk(q)) { json(r, 403, { error: 'relay token required' }); return true; }
    const b = await body(q, readBody) || {}; const id = String(b.id || ''), stage = String(b.stage || '');
    if (!/^\d{1,20}$/.test(id) || !/^(pulled|pasted|accepted|send_failed|skipped)$/.test(stage)) { json(r, 400, { error: 'bad mark' }); return true; }
    const l = lines.get(id); const at = Number.isFinite(+b.at) ? +b.at : Date.now();
    if (l && stage === 'accepted') l.accepted = at;
    timing(id, l ? l.room : String(b.room || '').slice(0, 20), stage, { helper_at: at, attempt: +b.attempt || null, note: String(b.note || '').slice(0, 200) });
    json(r, 200, { ok: true }); return true; }
  if (what === 'voice') { json(r, 200, { tts: process.env.HUBFACE_TTS !== '0' }); return true; }   // b: browsers stay silent when TTS is off
  if (what === 'pull' && !u.searchParams.get('room')) {   // b: all rooms with Talk to Yoda on
    if (!tokenOk(q)) { json(r, 403, { error: 'relay token required' }); return true; }
    const after = String(u.searchParams.get('after') || '0'), a = BigInt(/^\d+$/.test(after) ? after : '0'), now = Date.now(); let out = [];
    for (const [rid, qq] of queues) if (on.has(rid)) out = out.concat(qq.filter((l) => BigInt(l.id) > a && l.exp > now));
    out.sort((x, y) => (BigInt(x.id) < BigInt(y.id) ? -1 : 1)); for (const l of out) if (!l.pulled) l.pulled = now;
    json(r, 200, { ok: true, rooms: [...on], lines: out.map((l) => ({ id: l.id, room: l.room, t: l.t, iso: l.iso, source: l.source, text: l.text, reply: l.reply })), cursor: out.length ? out[out.length - 1].id : after }); return true; }
  const room = String(u.searchParams.get('room') || '').toUpperCase();
  if (what === 'toggle') { if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    const b = await body(q, readBody) || {}; const id = String(b.room || room).toUpperCase();
    if (!ID_RE.test(id)) { json(r, 404, { error: 'Room not found' }); return true; }
    if (!tokenOk(q) && !ownerOk(q, id)) { json(r, 403, { error: 'room owner only' }); return true; }
    if (b.on) on.add(id); else { on.delete(id); queues.delete(id); const now = Date.now(); let c = 0;
      for (const [k, l] of lines) if (l.room === id) { used.set(k, { status: 410, t: now }); lines.delete(k); timing(k, id, 'canceled_relay_off'); c++; }
      if (c) console.log(`[chatrelay] room ${id} off: ${c} outstanding reply id(s) canceled`); } save();
    console.log(`[chatrelay] room ${id} talk-to-yoda ${b.on ? 'ON' : 'off'}`); json(r, 200, { ok: true, room: id, on: on.has(id) }); return true; }
  if (!ID_RE.test(room)) { json(r, 404, { error: 'Room not found' }); return true; }
  if (what === 'state') { if (!tokenOk(q) && !ownerOk(q, room)) { json(r, 403, { error: 'room owner only' }); return true; } json(r, 200, { ok: true, room, on: on.has(room), build: CHATRELAY_BUILD }); return true; }
  if (what === 'pull') { if (!tokenOk(q)) { json(r, 403, { error: 'relay token required' }); return true; }
    const after = String(u.searchParams.get('after') || '0'), now = Date.now();
    const out = (queues.get(room) || []).filter((l) => BigInt(l.id) > BigInt(/^\d+$/.test(after) ? after : '0') && l.exp > now);
    for (const l of out) if (!l.pulled) l.pulled = now;
    json(r, 200, { ok: true, room, on: on.has(room), lines: out.map((l) => ({ id: l.id, t: l.t, iso: l.iso, source: l.source, text: l.text, reply: l.reply })), cursor: out.length ? out[out.length - 1].id : after }); return true; }
  json(r, 404, { error: 'not found' }); return true;
}
console.log(`[chatrelay] ${CHATRELAY_BUILD} rooms on: ${[...on].join(',') || 'none'}`);
