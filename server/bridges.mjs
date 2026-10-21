// latency-20261020a (Dan approved on the Oct 19 call): bridge library. Short, normal-voice lead-ins/fillers spoken the instant a
// Yoda reply starts generating, so the room never sits in dead air. Each phrase is rendered ONCE with the Yoda voice (liora) and
// cached on disk (<state dir>/bridges/<n>.mp3); later plays cost nothing. Rendering trickles in the background (1 clip / 4 s) and
// is charged to the shared $1/day xAI cap via chargeTts (~50 phrases x ~14 chars ~= 700 chars ~= $0.011 once).
import fs from 'node:fs';
import path from 'node:path';
export const BRIDGES_BUILD = 'bridges-20261020a';
export const PHRASES = [
  'Hm.', 'Hmm, okay.', 'Well,', 'Well, you know,', 'Now that I think about it,', 'Let me think.', 'Let me think about that.',
  'Good question.', 'Okay.', 'Okay, so,', 'Right.', 'Right, so,', 'So,', 'Alright.', 'Alright, so,', 'Mm-hm.', 'Yeah.',
  'Yeah, so,', 'Sure.', 'Sure thing.', 'Got it.', 'Okay, got it.', 'I hear you.', 'Fair point.', "That's fair.",
  "That's a good one.", 'Interesting.', 'Oh, interesting.', 'Let me see.', 'Let me see here.', 'One second.', 'Give me a second.',
  "Here's the thing,", 'Honestly,', 'You know,', 'I mean,', 'The way I see it,', 'Thinking out loud here,', 'Good point.',
  'Okay, let me think.', 'Hmm, let me see.', "So here's what I'm thinking,", 'Yeah, okay.', 'Oh, right.', 'Ah, okay.',
  'Well, okay.', "Let's see.", 'Fair enough.', 'Okay, so here goes.', 'Mm, good question.',
  // auto-20261020a hold lines: only used as the 2nd bridge when the real-Yoda (webhook) reply is still coming after ~6 s
  'One moment.', 'Just a moment.', 'Bear with me.', 'Almost there.'
];
export const HOLD = [50, 51, 52, 53];
// mono-20261020a (Dan, Oct 19 11:05 PM): wake-up monologues (~15 s) played on a cold real-Yoda line instead of lead-in + hold.
export const MONOLOGUES = [
  "Hi everyone, I'm Yoda, HingeCraft's AI CEO and your moderator today. Dan Diotte, our founder, built this room for real conversation, so let's keep it honest, keep it kind, and work toward something useful together. Give me just a moment.",
  "Hello and welcome. I'm Yoda, the AI CEO at HingeCraft, and I'll be moderating. Dan Diotte founded this company on the idea that good discussion builds good things. So let's listen well, speak plainly, and find the way forward. One second.",
  "Good to have you here. I'm Yoda, HingeCraft's AI CEO, keeping this conversation on track. Dan Diotte, our founder, cares most about results, so let's be constructive, share ideas freely, and leave with something we can act on. Let me catch up.",
  "Hey there, Yoda here, AI CEO and moderator for HingeCraft. Dan Diotte, who founded HingeCraft, asked me to help make these talks productive. So let's respect each other's time, stay curious, and build on each other's points. Pulling my thoughts together now.",
  "Welcome, everyone. My name is Yoda, and I'm the AI CEO here at HingeCraft, moderating today's room. Dan Diotte, our founder, wants every voice heard. Patience and clear thinking, that's the plan. Let's make this a good one. Just a second while I get ready.",
  "Hi, I'm Yoda, HingeCraft's AI CEO, and I'll moderate our discussion. Dan Diotte, our founder, started HingeCraft to solve real problems, and that's what we're here for. Bring your best ideas, push back when it helps, and we'll get somewhere good. One moment.",
  "Hello, Yoda here. I'm the AI CEO at HingeCraft and your moderator. Dan Diotte, our founder, believes the best answers come from open, respectful conversation. So let's keep things constructive, stay focused, and enjoy the work together. Give me a second to catch up."
];
export const monoFile = (i) => path.join(BRIDGE_DIR, `mono-${i}.mp3`);
const LAST_FILE = () => path.join(BRIDGE_DIR, 'mono-last.json');
const monoCache = new Map();
export function monoLast() { try { const j = JSON.parse(fs.readFileSync(LAST_FILE(), 'utf8')); return Number.isInteger(j.last) ? j.last : -1; } catch { return -1; } }
export function pickMono(rnd = Math.random, ready = (i) => monoCache.has(i)) {
  const last = monoLast(); const ok = []; for (let i = 0; i < MONOLOGUES.length; i++) if (i !== last && ready(i)) ok.push(i);
  if (!ok.length) return null; const i = ok[Math.floor(rnd() * ok.length) % ok.length];
  try { fs.writeFileSync(LAST_FILE(), JSON.stringify({ last: i, at: Date.now() }), { mode: 0o600 }); } catch {}
  return { i, text: MONOLOGUES[i], clip: monoCache.get(i) || null, ms: monoMs(MONOLOGUES[i]) };
}
export const monoMs = (t) => Math.round(String(t).split(/\s+/).length / 2.7 * 1000);   // ~2.7 words/s spoken estimate   // indices of the hold lines (never used as a first bridge)
const STATE = (process.env.STATE_DIRECTORY ? process.env.STATE_DIRECTORY.split(':')[0] : '/var/lib/hubface');
export const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(STATE, 'bridges');
export const bridgesOn = (env = process.env) => env.YODA_BRIDGES !== '0';
export const SKIP_MS = 700;   // reply already ready within ~700 ms -> no bridge
const cache = new Map();      // index -> {buf,type}
let last = -1, warming = false;
export const fileFor = (i) => path.join(BRIDGE_DIR, `${i}.mp3`);
export function load() { for (let i = 0; i < PHRASES.length; i++) { try { const b = fs.readFileSync(fileFor(i)); if (b.length) cache.set(i, { buf: b, type: 'audio/mpeg' }); } catch {} } return cache.size; }
// random cached phrase, never the same one twice in a row; rnd injectable for tests
export function pick(rnd = Math.random, ready = (i) => cache.has(i)) {
  const ok = []; for (let i = 0; i < PHRASES.length; i++) if (i !== last && !HOLD.includes(i) && ready(i)) ok.push(i);
  if (!ok.length) return null;
  const i = ok[Math.floor(rnd() * ok.length) % ok.length]; last = i;
  return { i, text: PHRASES[i], clip: cache.get(i) || null };
}
export function pickHold(rnd = Math.random, ready = (i) => cache.has(i)) { const ok = HOLD.filter((i) => ready(i)); if (!ok.length) return null; const i = ok[Math.floor(rnd() * ok.length) % ok.length]; return { i, text: PHRASES[i], clip: cache.get(i) || null }; }
export const _resetLast = () => { last = -1; };
// tts(text, voice) -> {buf,type}|{error};  charge(chars) records spend; canSpend(chars) -> bool (cap check)
export async function warm(tts, { voice = 'liora', charge = () => {}, canSpend = () => true, gapMs = 4000 } = {}) {
  if (warming) return; warming = true;
  try {
    try { fs.mkdirSync(BRIDGE_DIR, { recursive: true, mode: 0o700 }); } catch {}
    load(); let made = 0;
    for (let i = 0; i < MONOLOGUES.length; i++) { try { const x = fs.readFileSync(monoFile(i)); if (x.length) { monoCache.set(i, { buf: x, type: 'audio/mpeg' }); continue; } } catch {}
      if (!canSpend(MONOLOGUES[i].length)) { console.log('[bridges] cap reached, monologue warm paused'); break; }
      const o = await tts(MONOLOGUES[i], voice);
      if (o && o.buf && o.buf.length) { charge(MONOLOGUES[i].length); try { fs.writeFileSync(monoFile(i), o.buf, { mode: 0o600 }); } catch {} monoCache.set(i, { buf: o.buf, type: o.type || 'audio/mpeg' }); made++; }
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs).unref()); }
    for (let i = 0; i < PHRASES.length; i++) {
      if (cache.has(i)) continue;
      if (!canSpend(PHRASES[i].length)) { console.log('[bridges] cap reached, warm paused'); break; }
      const o = await tts(PHRASES[i], voice);
      if (o && o.buf && o.buf.length) { charge(PHRASES[i].length); try { fs.writeFileSync(fileFor(i), o.buf, { mode: 0o600 }); } catch {} cache.set(i, { buf: o.buf, type: o.type || 'audio/mpeg' }); made++; }
      else console.log('[bridges] render failed', PHRASES[i], o && o.error);
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs).unref());
    }
    console.log(`[bridges] ${cache.size}/${PHRASES.length} cached (${made} rendered now)`);
  } finally { warming = false; }
}
export const bridgeInfo = () => ({ build: BRIDGES_BUILD, on: bridgesOn(), cached: cache.size, total: PHRASES.length, monologues: monoCache.size + '/' + MONOLOGUES.length, dir: BRIDGE_DIR });

// readycue-20261020a (Dan approved Oct 19 11:23 PM): "I'm here, go ahead." clip played when the host's speech-to-text opens.
export const READY_TEXT = "I'm here, go ahead.";
export const readyFile = () => path.join(BRIDGE_DIR, 'ready.mp3');
let readyClip = null, readyBusy = null;
export async function getReady(tts, { voice = 'liora', charge = () => {}, canSpend = () => true } = {}) {
  if (readyClip) return readyClip;
  try { const x = fs.readFileSync(readyFile()); if (x.length) return (readyClip = { buf: x, type: 'audio/mpeg' }); } catch {}
  if (!tts || !canSpend(READY_TEXT.length)) return null;
  if (!readyBusy) readyBusy = (async () => { const o = await tts(READY_TEXT, voice); if (o && o.buf && o.buf.length) { charge(READY_TEXT.length); try { fs.mkdirSync(BRIDGE_DIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(readyFile(), o.buf, { mode: 0o600 }); } catch {} readyClip = { buf: o.buf, type: o.type || 'audio/mpeg' }; } return readyClip; })().finally(() => { readyBusy = null; });
  return readyBusy;
}
