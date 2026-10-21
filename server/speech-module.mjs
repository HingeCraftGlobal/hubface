/* speechmod-20261019a (Dan approved Oct 19): the ONE outgoing speech slot. Every outgoing bot TTS line goes through speechOut().
   Engine: env SPEECH_ENGINE = 'xai' (default; exactly the previous behaviour: the caller's xAI TTS function) | 'local'
   ('local' = Piper HTTP service on 127.0.0.1:${SPEECH_LOCAL_PORT||5005}, 1.5 s timeout, any error -> falls back to xAI).
   Dataset capture (env VOICE_DATASET, on unless '0'): each spoken bot line's audio + text + bot is saved to
   /var/lib/hubface/voice-dataset/<bot>/ (<ts>-<rand>.mp3|wav + metadata.jsonl), dirs 0700 / files 0600, 2 GB total cap.
   Outgoing side ONLY: nothing here ever sees human/incoming audio (incoming speech stays text). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SPEECHMOD_BUILD = 'speechmod-20261019a';
const DS_DIR = process.env.VOICE_DATASET_DIR || '/var/lib/hubface/voice-dataset';
const DS_CAP = 2 * 1024 ** 3;
const LOCAL_MS = 1500;
let dsBytes = -1, capLogged = false;

const engine = () => (process.env.SPEECH_ENGINE || 'xai').toLowerCase();
const dsOn = () => process.env.VOICE_DATASET !== '0';

function dirBytes(d) { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); n += e.isDirectory() ? dirBytes(f) : fs.statSync(f).size; } } catch {} return n; }

async function localTts(text, voiceId, bot) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), LOCAL_MS);
  try {
    const port = +process.env.SPEECH_LOCAL_PORT || 5005;
    const up = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, bot, voice: voiceId }) });
    if (!up.ok) return { error: `local ${up.status}` };
    const buf = Buffer.from(await up.arrayBuffer()); if (!buf.length) return { error: 'local empty' };
    return { buf, type: up.headers.get('content-type') || 'audio/wav' };
  } catch (e) { return { error: e && e.name === 'AbortError' ? 'local timeout' : 'local unreachable' }; } finally { clearTimeout(t); }
}

function capture(bot, text, o, eng, voiceId) {
  try {
    if (!dsOn() || !o || !o.buf || !o.buf.length) return;
    if (dsBytes < 0) dsBytes = dirBytes(DS_DIR);
    if (dsBytes + o.buf.length > DS_CAP) { if (!capLogged) { console.warn('[speechmod] voice-dataset 2 GB cap reached, capture paused'); capLogged = true; } return; }
    const b = String(bot || 'yoda').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'yoda';
    const d = path.join(DS_DIR, b); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const ext = /wav/i.test(o.type || '') ? 'wav' : 'mp3';
    const file = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(d, file), o.buf, { mode: 0o600 });
    const row = JSON.stringify({ file, bot: b, text: String(text).slice(0, 2000), engine: eng, voice: voiceId, type: o.type || null, bytes: o.buf.length, at: new Date().toISOString(), build: SPEECHMOD_BUILD }) + '\n';
    fs.appendFileSync(path.join(d, 'metadata.jsonl'), row, { mode: 0o600 });
    dsBytes += o.buf.length + row.length;
  } catch (e) { console.warn('[speechmod] capture failed', e && e.code); }
}

/* xai = the caller's existing xAI TTS function (text, voiceId) -> {buf,type}|{error}. Returns the same shape. */
export async function speechOut(text, voiceId, { bot = 'yoda', xai } = {}) {
  let o = null, eng = engine();
  if (eng === 'local') {
    o = await localTts(text, voiceId, bot);
    if (!o.buf) { console.warn(`[speechmod] local engine ${o.error}, falling back to xai`); eng = 'xai'; o = null; }
  }
  if (!o) { eng = 'xai'; o = xai ? await xai(text, voiceId) : { error: 'no tts' }; }
  if (o && o.buf) setImmediate(() => capture(bot, text, o, eng, voiceId));
  return o;
}
export const speechInfo = () => ({ build: SPEECHMOD_BUILD, engine: engine(), dataset: dsOn() ? DS_DIR : null });
