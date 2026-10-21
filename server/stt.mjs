/* stt-20261018a: AssemblyAI Universal-3.6 Pro Realtime for HubFace live rooms.
   The API key lives only here (process.env.ASSEMBLYAI_API_KEY from /etc/hubface/assemblyai.env, systemd EnvironmentFile).
   A joined room member asks over the room WebSocket ({t:'stt-token'}); we mint a short-lived AssemblyAI streaming token
   (GET https://streaming.assemblyai.com/v3/token) and send it back with the connection parameters. The browser streams its own
   mic straight to wss://streaming.assemblyai.com/v3/ws and posts each finished turn to the room as a normal 'voice' chat line.
   The browser reports session open/close ({t:'stt-session'}); we count session seconds per day (America/New_York), log them,
   refuse new tokens and stop open sessions once the daily cap is reached (STT_DAILY_MIN, default 180 min). Usage file:
   <state dir>/stt-usage.json. No transcripts are stored here. */
import fs from 'node:fs';
const KEY = () => String(process.env.ASSEMBLYAI_API_KEY || '').trim();
const MODEL = process.env.STT_MODEL || 'universal-3-6-pro';
const MIN_SIL = +process.env.STT_MIN_TURN_SILENCE || 400, MAX_SIL = +process.env.STT_MAX_TURN_SILENCE || 2000;
const CAP_SEC = (+process.env.STT_DAILY_MIN || 180) * 60, PRICE_HR = 0.45;
const FILE = (process.env.STATE_DIRECTORY ? process.env.STATE_DIRECTORY.split(':')[0] : '/var/lib/hubface') + '/stt-usage.json';
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let use = { day: day(), sec: 0, sessions: 0, tokens: 0, denied: 0 };
try { const u = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (u && u.day === use.day) use = Object.assign(use, u); } catch {}
const open = new Map();   // peer id -> { me, room, at }
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(use)); } catch (e) { console.log('[stt] usage save failed: ' + e.message); } }, 500); saveT.unref && saveT.unref(); }
function roll() { const d = day(); if (use.day !== d) { console.log(`[stt] day ${use.day} total ${(use.sec / 60).toFixed(1)} min, ${use.sessions} sessions, $${(use.sec / 3600 * PRICE_HR).toFixed(3)}`); use = { day: d, sec: 0, sessions: 0, tokens: 0, denied: 0 }; for (const s of open.values()) s.at = Date.now(); save(); } }
function running() { let n = 0; const now = Date.now(); for (const s of open.values()) n += (now - s.at) / 1000; return n; }
function usedSec() { roll(); return use.sec + running(); }
const nm = (me) => String(me && me.name || '').replace(/[\r\n"]/g, ' ').slice(0, 40);
function closeSession(me, why) {
  const s = open.get(me.id); if (!s) return 0; open.delete(me.id);
  roll(); const sec = Math.max(0, (Date.now() - s.at) / 1000); use.sec += sec; save();
  console.log(`[stt] room ${s.room} "${nm(me)}": session closed after ${sec.toFixed(0)} s (${why}); today ${(use.sec / 60).toFixed(1)}/${CAP_SEC / 60} min, $${(use.sec / 3600 * PRICE_HR).toFixed(3)}`);
  return sec;
}
const lastTok = new Map();
export async function sttMessage(room, me, o) {
  const send = (x) => { try { me.ws.send(x); } catch {} };
  if (o.t === 'stt-session') {
    if (o.state === 'open') { if (!open.has(me.id)) { open.set(me.id, { me, room: room.id, at: Date.now() }); roll(); use.sessions++; save(); console.log(`[stt] room ${room.id} "${nm(me)}": AssemblyAI session open (${MODEL})`); } }
    else closeSession(me, String(o.why || 'client').slice(0, 40));
    return;
  }
  if (o.t !== 'stt-token') return;
  if (!KEY()) return send({ t: 'stt-token', ok: false, why: 'not-configured' });
  const left = CAP_SEC - usedSec();
  if (left < 30) { use.denied++; save(); return send({ t: 'stt-token', ok: false, why: 'daily-cap', msg: `Daily speech limit (${CAP_SEC / 60} min) reached` }); }
  const now = Date.now(), lt = lastTok.get(me.id) || []; const recent = lt.filter((t) => now - t < 3600e3);
  if (recent.length && now - recent[recent.length - 1] < 2000 || recent.length >= 60) return send({ t: 'stt-token', ok: false, why: 'rate' });
  recent.push(now); lastTok.set(me.id, recent);
  const maxSess = Math.max(60, Math.min(3600, Math.floor(left) + 30));
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=${maxSess}`, { headers: { authorization: KEY() }, signal: ctl.signal });
    clearTimeout(tm);
    if (!r.ok) { console.log(`[stt] token mint failed: HTTP ${r.status}`); return send({ t: 'stt-token', ok: false, why: 'mint-' + r.status }); }
    const j = await r.json(); if (!j || !j.token) return send({ t: 'stt-token', ok: false, why: 'mint-empty' });
    roll(); use.tokens++; save();
    send({ t: 'stt-token', ok: true, token: j.token, url: 'wss://streaming.assemblyai.com/v3/ws', maxSession: maxSess,
      params: { speech_model: MODEL, sample_rate: 16000, encoding: 'pcm_s16le', min_turn_silence: MIN_SIL, max_turn_silence: MAX_SIL } });
  } catch (e) { console.log('[stt] token mint error: ' + (e && e.name === 'AbortError' ? 'timeout' : e && e.message)); send({ t: 'stt-token', ok: false, why: 'mint-error' }); }
}
export function sttGone(me) { if (me) { closeSession(me, 'left room'); lastTok.delete(me.id); } }
/* daily cap: stop open sessions once the day's total reaches the cap */
setInterval(() => { if (!open.size) return roll(); if (usedSec() < CAP_SEC) return; for (const s of [...open.values()]) { try { s.me.ws.send({ t: 'stt-stop', why: 'daily-cap' }); } catch {} closeSession(s.me, 'daily cap'); } }, 15e3).unref();
export function sttInfo() { const u = usedSec(); return { configured: !!KEY(), model: MODEL, minTurnSilence: MIN_SIL, maxTurnSilence: MAX_SIL, today: use.day, minutes: +(u / 60).toFixed(1), capMinutes: CAP_SEC / 60, sessions: use.sessions, tokens: use.tokens, open: open.size, usd: +(u / 3600 * PRICE_HR).toFixed(3) }; }
