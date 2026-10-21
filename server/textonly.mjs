// textonly-20261020a (Dan approved Oct 20 2026 9:50 AM ET): STANDALONE text-only Yoda bridge for measuring the raw text round trip.
// Separate from the voice/speech pipeline: no TTS, no bridges, no room chat, no roomserver.mjs import. Text in, text out.
//   GET  /textonly?room=<HF-ID>                 -> small page (room owner, signed in)
//   POST /api/textonly/<ID>/ask   {text,t0}     -> posts to the same Yoda webhook (YODA_HOOK_URL), returns {tid,t1,t2,t3}
//   GET  /api/textonly/<ID>/wait?tid=           -> long-poll (<=100 s) for Yoda's reply {text,t4,...}
//   POST /api/textonly/<ID>/reply?tid=&exp=&sig= -> Yoda's reply (signed per-turn URL, sent as item.reply); never touches TTS
//   POST /api/textonly/<ID>/done  {tid,t5}      -> writes one {kind:'texttiming'} row to transcripts/<ID>.jsonl
// Off switch: remove the one route line in hubface-vps.mjs (or HUBFACE_TEXTONLY=0) and restart.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { lookupForJoin, isOwner, roomName } from './rooms.mjs';
export const TEXTONLY_BUILD = 'textonly-20261020a+chattop-20261020a';
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const HOOK_URL = String(process.env.YODA_HOOK_URL || '').trim(), HOOK_KEY = String(process.env.YODA_HOOK_KEY || '').trim();
const HOOK_AUTH = String(process.env.YODA_HOOK_AUTH || 'both').trim().toLowerCase();
const TX_DIR = (process.env.STATE_DIRECTORY || '/var/lib/hubface').split(':')[0] + '/transcripts';
const ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const SECRET = crypto.randomBytes(32);   // per-process; reply URLs die on restart (fine for a test tool)
const TTL = 120e3, turns = new Map();    // tid -> turn
function headers(k) { if (!k) return {}; if (HOOK_AUTH === 'bearer') return { Authorization: `Bearer ${k}` }; if (HOOK_AUTH === 'x-webhook-key') return { 'X-Webhook-Key': k };
  if (HOOK_AUTH.startsWith('header:')) return { [process.env.YODA_HOOK_AUTH.trim().slice(7).trim()]: k }; return { Authorization: `Bearer ${k}`, 'X-Webhook-Key': k }; }
const sig = (id, tid, exp) => crypto.createHmac('sha256', SECRET).update(`t1|${id}|${tid}|${exp}`).digest('base64url');
const on = () => process.env.HUBFACE_TEXTONLY !== '0';
function gc() { const n = Date.now(); for (const [k, t] of turns) if (n - t.t1 > 600e3) turns.delete(k); }
function owner(q, id) { const look = lookupForJoin(q, id); if (look.status !== 200) return look.status; return isOwner(q, look.row, String(q.headers['x-owner-key'] || '')) ? 200 : 403; }
function tx(id, row) { try { const f = `${TX_DIR}/${id}.jsonl`; fs.appendFileSync(f, JSON.stringify(Object.assign({ at: Date.now(), iso: new Date().toISOString(), room: id, speaker: 'texttiming', role: 'system', bot: 'yoda', text: '' }, row)) + '\n', { mode: 0o600 }); } catch (e) { console.log('[textonly] tx write failed', String(e && e.code || e)); } }
function timing(t) { const s = (a, b) => (a && b ? b - a : null);
  return { kind: 'texttiming', build: TEXTONLY_BUILD, tid: t.tid, t0: t.t0, t1: t.t1, t2: t.t2, t3: t.t3, t4: t.t4 || null, t5: t.t5 || null, hook_status: t.status,
    browser_to_server_ms: s(t.t0, t.t1), server_to_webhook_ms: s(t.t1, t.t2), webhook_accept_ms: s(t.t2, t.t3), waiting_on_yoda_ms: s(t.t3, t.t4), post_to_reply_ms: s(t.t2, t.t4),
    reply_to_screen_ms: s(t.t4, t.t5), total_ms: s(t.t0, t.t5 || t.t4), q_len: t.text.length, a_len: t.reply ? t.reply.length : 0, end: t.end || null }; }
function finish(t, why) { if (t.logged) return; t.logged = true; t.end = why; const row = timing(t); tx(t.room, row);
  console.log(`[textonly] room ${t.room} ${why} hook ${row.webhook_accept_ms}ms(${t.status}) yoda ${row.waiting_on_yoda_ms}ms screen ${row.reply_to_screen_ms}ms total ${row.total_ms}ms`); }
async function body(q, readBody) { try { return JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return null; } }
export function isTextOnlyPath(p) { return p === '/textonly' || p.startsWith('/api/textonly/'); }
export async function textOnlyRoute(q, r, p, u, { readBody, json }) {
  if (!on()) { json(r, 404, { error: 'textonly off' }); return true; }
  if (p === '/textonly') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(PAGE); return true; }
  const m = /^\/api\/textonly\/([^/]+)\/(ask|wait|reply|done)$/.exec(p); if (!m) { json(r, 404, { error: 'not found' }); return true; }
  const id = decodeURIComponent(m[1]).toUpperCase(); if (!ID_RE.test(id)) { json(r, 404, { error: 'Room not found' }); return true; }
  gc();
  if (m[2] === 'reply') {   // from the Yoda routine (signed URL, no session)
    if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    const tid = String(u.searchParams.get('tid') || ''), exp = +u.searchParams.get('exp') || 0, sg = String(u.searchParams.get('sig') || '');
    const want = sig(id, tid, exp); const t = turns.get(tid);
    if (!t || t.room !== id || exp < Date.now() || sg.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sg), Buffer.from(want))) { json(r, 403, { error: 'forbidden' }); return true; }
    const b = await body(q, readBody); const text = b && String(b.text || '').trim().slice(0, 8000); if (!text) { json(r, 400, { error: 'text required' }); return true; }
    if (t.t4) { t.extra = (t.extra || 0) + 1; t.reply += '\n' + text; } else { t.t4 = Date.now(); t.reply = text; }
    for (const w of t.waiters.splice(0)) w();
    setTimeout(() => finish(t, 'no-screen-ack'), 30e3).unref();
    console.log(`[textonly] reply room ${id} tid ${tid} len ${text.length} after ${t.t4 - t.t2}ms`);
    json(r, 200, { ok: true, room: id, textonly: true, spoke: false, chat: false }); return true;
  }
  const st = owner(q, id); if (st !== 200) { json(r, st === 429 ? 429 : st === 404 ? 404 : 403, { error: st === 403 ? 'room owner only (sign in on hubface.org)' : 'Room not found' }); return true; }
  if (m[2] === 'ask') {
    if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    const t1 = Date.now(); const b = await body(q, readBody); const text = b && String(b.text || '').trim().slice(0, 4000);
    if (!text) { json(r, 400, { error: 'text required' }); return true; }
    if (!HOOK_URL) { json(r, 503, { error: 'webhook not configured' }); return true; }
    if ([...turns.values()].filter((x) => t1 - x.t1 < 60e3).length >= 6) { json(r, 429, { error: 'max 6 asks/min' }); return true; }
    const tid = crypto.randomBytes(8).toString('hex'), exp = t1 + TTL;
    const t = { tid, room: id, text, t0: +b.t0 || null, t1, t2: 0, t3: 0, status: null, waiters: [] }; turns.set(tid, t);
    const reply = `${ORIGIN}/api/textonly/${id}/reply?tid=${tid}&exp=${exp}&sig=${sig(id, tid, exp)}`;
    const item = { event: 'room.message', textonly: true, room: id, roomName: roomName(id) || '', from: 'Dan Diotte', role: 'host', text, source: 'text', at: t1, reply, reply_expires: exp,
      reply_note: 'TEXT-ONLY latency test: POST {"text":"..."} to reply. Plain text, no speech.', last_yoda: '', recent: [] };
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try { t.t2 = Date.now(); const res = await fetch(HOOK_URL, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json', 'User-Agent': 'HubFace-textonly' }, headers(HOOK_KEY)), body: JSON.stringify(item) });
      try { await res.arrayBuffer(); } catch {} t.t3 = Date.now(); t.status = res.status; }
    catch (e) { t.t3 = Date.now(); t.status = 'error ' + String(e && e.name || e).slice(0, 30); } finally { clearTimeout(to); }
    console.log(`[textonly] ask room ${id} tid ${tid} len ${text.length} hook ${t.status} ${t.t3 - t.t2}ms`);
    if (!(t.status >= 200 && t.status < 300)) finish(t, 'hook-failed');
    json(r, 200, { ok: true, tid, t1, t2: t.t2, t3: t.t3, hook_status: t.status, build: TEXTONLY_BUILD }); return true;
  }
  const tid = m[2] === 'wait' ? String(u.searchParams.get('tid') || '') : null;
  if (m[2] === 'wait') { const t = turns.get(tid); if (!t || t.room !== id) { json(r, 404, { error: 'no such turn' }); return true; }
    if (!t.t4) await new Promise((res) => { const w = () => { clearTimeout(k); res(); }; const k = setTimeout(() => { t.waiters = t.waiters.filter((x) => x !== w); res(); }, 100e3); t.waiters.push(w); q.on('close', w); });
    json(r, 200, t.t4 ? { ok: true, text: t.reply, t4: t.t4, ...timing(t) } : { ok: false, pending: true, ...timing(t) }); return true; }
  if (m[2] === 'done') { const b = await body(q, readBody) || {}; const t = turns.get(String(b.tid || '')); if (!t || t.room !== id) { json(r, 404, { error: 'no such turn' }); return true; }
    if (!t.t5) t.t5 = +b.t5 || null; if (t.t5 && t.t0 && (t.t5 < t.t0 || t.t5 - t.t0 > 600e3)) t.t5 = null; finish(t, b.timeout ? 'timeout' : 'ok'); json(r, 200, { ok: true, ...timing(t) }); return true; }
  json(r, 404, { error: 'not found' }); return true;
}
console.log(`[textonly] ${TEXTONLY_BUILD} on: ${on()} webhook ${HOOK_URL ? 'set' : 'MISSING'} (no TTS, standalone)`);
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Text-only Yoda</title>
<style>body{font:16px system-ui;max-width:760px;margin:20px auto;padding:0 12px;background:#111;color:#eee}#log div.m{margin:10px 0;padding:8px 10px;border-radius:8px}
.q{background:#1d2b44}.a{background:#24331f;white-space:pre-wrap}.t{font:12px ui-monospace,monospace;color:#9ab;margin-top:4px}form{display:flex;gap:6px}input{flex:1;padding:10px;font-size:16px}button{padding:10px 16px}</style></head>
<body><h3>Text-only Yoda <small style="color:#888">${TEXTONLY_BUILD} · no speech</small></h3><div>Room: <b id="rid"></b></div><form id="f" style="position:sticky;top:0;background:#111;padding:6px 0;z-index:1"><input id="i" autocomplete="off" placeholder="Type a question for Yoda"><button>Send</button></form>
<div id="log"></div>
<script>
const room=(new URLSearchParams(location.search).get('room')||'').toUpperCase();document.getElementById('rid').textContent=room||'(add ?room=HF-XXXXX-XXXXX)';
const ok=new URLSearchParams(location.search).get('k')||localStorage.getItem('hf-owner-'+room)||'';const H={'Content-Type':'application/json'};if(ok)H['X-Owner-Key']=ok;
const log=document.getElementById('log'),s=x=>x==null?'?':(x/1000).toFixed(2)+'s';
let turn=null;function add(c,t){const d=document.createElement('div');d.className='m '+c;d.textContent=t;if(c==='q'){turn=document.createElement('div');log.insertBefore(turn,log.firstChild);}turn.appendChild(d);return d;}
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const i=document.getElementById('i'),text=i.value.trim();if(!text)return;i.value='';
 const t0=Date.now();add('q',text);const a=add('a','waiting on Yoda…');const tl=document.createElement('div');tl.className='t';a.after(tl);
 let j;try{j=await (await fetch('/api/textonly/'+room+'/ask',{method:'POST',headers:H,body:JSON.stringify({text,t0})})).json();}catch(x){a.textContent='send failed';return;}
 if(!j.ok){a.textContent='error: '+(j.error||'?');return;}tl.textContent='webhook '+j.hook_status+' accepted in '+s(j.t3-j.t2)+' … waiting';
 let w,tries=0;do{w=await (await fetch('/api/textonly/'+room+'/wait?tid='+j.tid,{headers:H})).json();}while(!w.ok&&w.pending&&++tries<1);
 if(!w.ok){a.textContent='(no reply in 100 s)';await fetch('/api/textonly/'+room+'/done',{method:'POST',headers:H,body:JSON.stringify({tid:j.tid,timeout:1})});return;}
 a.textContent=w.text;const t5=Date.now();
 const d=await (await fetch('/api/textonly/'+room+'/done',{method:'POST',headers:H,body:JSON.stringify({tid:j.tid,t5})})).json();
 tl.textContent='browser->server '+s(d.browser_to_server_ms)+', server->webhook '+s(d.server_to_webhook_ms)+', webhook accept '+s(d.webhook_accept_ms)+', waiting on Yoda '+s(d.waiting_on_yoda_ms)+', reply->screen '+s(d.reply_to_screen_ms)+', total '+s(d.total_ms);};
</script></body></html>`;
