/* stellapush-20261029 (Dan GO in the Bot Room, Oct 29 2026): per-seat outbound PUSH for Bot Room lines.
   Every new line stored in br_owner_chat (owner line, Yoda/Licorice reply) is POSTed at once to the callback URL registered for a seat,
   so a guest bot (e.g. Stella, seat 1) gets each line instantly instead of polling.
   Config: /etc/hubface/br-seat-hooks.json (root 600), re-read when its mtime changes (registering a hook needs NO restart once this code is live):
     { "hooks": [ { "room": "*" | "BR-XXXX-YYYY", "seat": 1, "name": "Stella", "url": "https://...", "secret": "<shared secret>", "on": true } ] }
   Request: POST url, JSON body {event:"botroom.line", room, seat, line:{id,from,to,role,text,at}, from_seat}
     headers: X-HubFace-Event, X-HubFace-Timestamp (ms), X-HubFace-Delivery (line id),
              X-HubFace-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>
   Rules: https only (http only to localhost), 3 s timeout, one retry after 1 s, fire-and-forget (never blocks the room),
   skips lines sent by that seat (from_seat match or from == hook name). URLs/secrets/text never logged.
   Roll back: remove the import + the 4 brcPush seat args in accounts.mjs (or restore accounts.mjs.bak-stellapush-20261029). */
import crypto from 'node:crypto';
import fs from 'node:fs';
const FILE = process.env.BR_SEAT_HOOKS || '/etc/hubface/br-seat-hooks.json';
let cache = { mtime: -1, hooks: [] };
const stats = { sent: 0, ok: 0, fail: 0, retried: 0, skipped_own: 0, last: null };
function load() {
  let st; try { st = fs.statSync(FILE); } catch { cache = { mtime: 0, hooks: [] }; return cache.hooks; }
  if (st.mtimeMs === cache.mtime) return cache.hooks;
  let hooks = [];
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); hooks = (Array.isArray(j.hooks) ? j.hooks : []).filter((h) => h && h.on !== false && okUrl(h.url) && typeof h.secret === 'string' && h.secret.length >= 16 && Number.isInteger(+h.seat)); }
  catch (e) { console.log('[seathook] config unreadable, push off'); }
  cache = { mtime: st.mtimeMs, hooks }; console.log(`[seathook] ${hooks.length} seat hook(s) active`); return hooks;
}
function okUrl(s) { try { const u = new URL(String(s)); return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)); } catch { return false; } }
export function sign(secret, ts, raw) { return 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex'); }
async function post(h, raw, id) {
  const ts = String(Date.now());
  const x = await fetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-HubFace-Event': 'botroom.line', 'X-HubFace-Timestamp': ts, 'X-HubFace-Delivery': String(id), 'X-HubFace-Signature': sign(h.secret, ts, raw) }, body: raw, signal: AbortSignal.timeout(3000), redirect: 'manual' });
  return x.status;
}
async function send(h, room, raw, id) {
  const t0 = Date.now(); stats.sent++;
  for (let i = 0; i < 2; i++) {
    try { const s = await post(h, raw, id); if (s >= 200 && s < 300) { stats.ok++; stats.last = { at: Date.now(), seat: +h.seat, status: s, ms: Date.now() - t0 }; console.log(`[seathook] room ${room} seat ${h.seat} line ${id} -> ${s} ${Date.now() - t0}ms`); return; }
      if (s >= 400 && s < 500 && s !== 408 && s !== 429) { stats.fail++; console.log(`[seathook] room ${room} seat ${h.seat} line ${id} -> ${s} (no retry)`); return; } }
    catch (e) { if (i) { stats.fail++; console.log(`[seathook] room ${room} seat ${h.seat} line ${id} failed ${String(e && e.name || 'error').slice(0, 30)}`); return; } }
    if (!i) { stats.retried++; await new Promise((ok) => setTimeout(ok, 1000)); }
  }
  stats.fail++;
}
export function deliver(room, m, fromSeat) {
  try {
    const hooks = load(); if (!hooks.length || !m) return;
    for (const h of hooks) {
      if (h.room !== '*' && h.room !== room) continue;
      const seat = +h.seat;
      if ((fromSeat != null && +fromSeat === seat) || (h.name && String(m.from || '').toLowerCase() === String(h.name).toLowerCase())) { stats.skipped_own++; continue; }
      const raw = JSON.stringify({ event: 'botroom.line', room, seat, from_seat: fromSeat == null ? null : +fromSeat, line: { id: m.id, from: m.from, to: m.to, role: m.role, text: m.text, at: m.at } });
      send(h, room, raw, m.id).catch(() => {});
    }
  } catch (e) { console.log('[seathook] deliver error'); }
}
export function seatHookInfo() { const hk = load(); return { file: FILE, hooks: hk.map((h) => ({ room: h.room, seat: +h.seat })), ...stats }; }
