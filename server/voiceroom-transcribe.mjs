#!/usr/bin/env node
// voiceroom-20261029 (STAGED): after-the-fact transcript for a voice room record. Runs on its own, never inside the live server.
// Usage:  node voiceroom-transcribe.mjs BR-XXXX-YYYY [--dry-run] [--force]     one room (on demand)
//         node voiceroom-transcribe.mjs --ended [--dry-run]                     every recorded room whose pre-room is no longer live and has no transcript
// Uses the existing AssemblyAI key from the environment (ASSEMBLYAI_API_KEY; run through run-transcribe.sh which loads /etc/hubface/assemblyai.env).
// The key is never printed. Each audio segment is one person's own microphone, so the speaker label is that person; AssemblyAI speaker_labels
// is also on, to split any other voices the mic picked up (e.g. bot speech from the speakers). Bot replies are also merged from the live record
// (br_owner_chat) with their exact words. Writes recordings/<BR>/transcript.json + transcript.txt and marks meta.json.
import fs from 'node:fs'; import path from 'node:path'; import Database from 'better-sqlite3';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface', REC = process.env.VOICEROOM_DIR || path.join(ROOT, 'recordings');
const API = process.env.ASSEMBLYAI_BASE || 'https://api.assemblyai.com';
const args = process.argv.slice(2), DRY = args.includes('--dry-run'), FORCE = args.includes('--force');
const key = () => String(process.env.ASSEMBLYAI_API_KEY || '').trim();
const etTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' ET';
const readMeta = (br) => { try { return JSON.parse(fs.readFileSync(path.join(REC, br, 'meta.json'), 'utf8')); } catch { return null; } };
function writeAtomic(f, s) { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s, { mode: 0o600 }); fs.renameSync(t, f); }
async function aai(pathname, opt = {}) { const r = await fetch(API + pathname, { ...opt, headers: { authorization: key(), ...(opt.headers || {}) }, signal: AbortSignal.timeout(120e3) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('assemblyai ' + r.status + ' ' + String(j.error || '').slice(0, 120)); return j; }
async function transcribeFile(fp) {
  const up = await aai('/v2/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: fs.readFileSync(fp) });
  const job = await aai('/v2/transcript', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio_url: up.upload_url, speaker_labels: true, punctuate: true, format_text: true }) });
  for (let i = 0; i < 240; i++) { await new Promise((r) => setTimeout(r, 5000)); const t = await aai('/v2/transcript/' + job.id); if (t.status === 'completed') return t; if (t.status === 'error') throw new Error('transcript error: ' + String(t.error || '').slice(0, 160)); }
  throw new Error('transcript timeout'); }
function liveLines(br) { try { const db = new Database(process.env.HUBFACE_DB || path.join(ROOT, 'accounts.db'), { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT from_name AS "from", role, text, at FROM br_owner_chat WHERE room = ? ORDER BY id').all(br); } finally { db.close(); } } catch { return []; } }
export async function transcribeRoom(br) {
  const m = readMeta(br); if (!m) throw new Error('no recording for ' + br);
  if (m.transcribedMs && !FORCE) { console.log(`[transcribe] ${br} already transcribed at ${etTime(m.transcribedMs)} (use --force)`); return null; }
  const segs = Object.values(m.segments || {}).filter((s) => s.bytes > 800); const U = [];
  console.log(`[transcribe] ${br}: ${segs.length} audio segment(s), ${segs.reduce((a, s) => a + s.bytes, 0)} bytes${DRY ? ' (dry run, nothing sent)' : ''}`);
  if (!DRY && segs.length && !key()) throw new Error('ASSEMBLYAI_API_KEY not set (run via run-transcribe.sh)');
  for (const s of segs) { const fp = path.join(REC, br, s.file); if (!fs.existsSync(fp)) continue; if (DRY) { console.log(`  would send ${s.file} (${s.speaker || s.name}, ${s.bytes} B)`); continue; }
    const t = await transcribeFile(fp); const labels = new Set((t.utterances || []).map((u) => u.speaker));
    for (const u of (t.utterances && t.utterances.length ? t.utterances : (t.text ? [{ start: 0, end: 0, text: t.text, speaker: 'A' }] : []))) {
      const extra = labels.size > 1 && u.speaker !== [...labels][0];   // first diarized voice on a person's own mic = that person; others = other voices heard on that mic
      U.push({ at: s.firstMs + (u.start || 0), endAt: s.firstMs + (u.end || 0), speaker: extra ? `${s.name} mic (other voice ${u.speaker})` : s.name, source: 'audio', seg: s.seg, text: u.text }); }
    console.log(`  ${s.file}: ${(t.utterances || []).length} utterance(s), ${Math.round(t.audio_duration || 0)} s audio`); }
  for (const x of liveLines(br)) if (x.role !== 'owner') U.push({ at: x.at, speaker: x.from, source: 'bot spoken reply (exact text)', text: x.text });   // bots speak only; their words go to the transcript here
  U.sort((a, b) => a.at - b.at);
  if (DRY) { console.log(`  would write transcript with ${U.length} bot line(s) + audio utterances`); return { dry: true, lines: U.length }; }
  const dir = path.join(REC, br); writeAtomic(path.join(dir, 'transcript.json'), JSON.stringify({ room: br, preroom: m.preroom, builtMs: Date.now(), engine: 'assemblyai v2 (speaker_labels)', utterances: U }, null, 1));
  writeAtomic(path.join(dir, 'transcript.txt'), `HubFace voice room ${br} transcript (after the session)\n\n` + U.map((u) => `[${etTime(u.at)}] ${u.speaker}: ${u.text}`).join('\n') + '\n');
  const m2 = readMeta(br) || m; m2.transcribedMs = Date.now(); m2.transcriptUtterances = U.length; writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(m2, null, 1));
  console.log(`[transcribe] ${br}: transcript written (${U.length} lines)`); return { lines: U.length }; }
async function endedRooms() { let ids = []; try { ids = fs.readdirSync(REC).filter((x) => /^BR-/.test(x)); } catch { return []; }
  const pdb = new Database(path.join(ROOT, 'prerooms.db'), { readonly: true, fileMustExist: true }); const out = [];
  try { for (const br of ids) { const m = readMeta(br); if (!m || (m.transcribedMs && !FORCE)) continue; const row = pdb.prepare('SELECT data FROM prerooms WHERE id = ?').get(m.preroom); const st = row ? JSON.parse(row.data).status : 'gone';
    const idle = Object.values(m.segments || {}).every((s) => Date.now() - (s.lastMs || 0) > 10 * 60e3); if (st !== 'live' && st !== 'starting' && idle) out.push(br); } } finally { pdb.close(); } return out; }
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) { (async () => { const list = args.includes('--ended') ? await endedRooms() : args.filter((a) => /^BR-[A-Z0-9-]{3,40}$/.test(a));
  if (!list.length) { console.log('[transcribe] nothing to do'); return; }
  for (const br of list) { try { await transcribeRoom(br); } catch (e) { console.error(`[transcribe] ${br} failed: ${String(e.message || e).slice(0, 200)}`); process.exitCode = 1; } } })(); }
