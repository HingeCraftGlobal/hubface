// latency-20261020a: memory pack for the fast room path. Base file (Dan, HingeCraft/HubFace basics, room roles; Yoda fills it,
// NO secrets) + the room's own transcript tail. Built once per room, kept in memory; rebuilt only when the room has been quiet
// >= MEMPACK_QUIET_MS (default 10 min) or the base file changed. Size-capped so the $1/day cap still covers ~250+ replies.
import fs from 'node:fs';
import path from 'node:path';
const STATE = (process.env.STATE_DIRECTORY ? process.env.STATE_DIRECTORY.split(':')[0] : '/var/lib/hubface');
export const PACK_FILE = process.env.MEMPACK_FILE || path.join(STATE, 'memory-pack.md');
export const TX_DIR = process.env.MEMPACK_TX_DIR || path.join(STATE, 'transcripts');
export const QUIET_MS = +process.env.MEMPACK_QUIET_MS || 600000;
const BASE_MAX = 3500, TX_MAX = 3000;
const packs = new Map();   // room -> {text, built, lastActive, baseMtime}
const SECRETISH = /(api[_-]?key|secret|password|token|bearer\s|xai-[a-z0-9]|sk-[a-z0-9])/i;
export function readBase(file = PACK_FILE) {
  try { const st = fs.statSync(file); const t = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !SECRETISH.test(l) && !/^\s*<!--/.test(l)).join('\n').trim(); return { text: t.slice(0, BASE_MAX), mtime: st.mtimeMs }; }
  catch { return { text: '', mtime: 0 }; }
}
export function txTail(room, dir = TX_DIR, max = TX_MAX) {
  if (!/^HF-[A-Z0-9-]+$/.test(String(room))) return '';
  let raw = ''; try { const f = path.join(dir, `${room}.jsonl`); const st = fs.statSync(f); const fd = fs.openSync(f, 'r'); const n = Math.min(st.size, 64 * 1024); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); raw = b.toString('utf8'); } catch { return ''; }
  const lines = []; for (const l of raw.split('\n')) { try { const o = JSON.parse(l); if (o && o.text && o.kind !== 'latency') lines.push(`${o.speaker || 'Someone'}: ${String(o.text).replace(/\s+/g, ' ').slice(0, 300)}`); } catch {} }
  let out = ''; for (let i = lines.length - 1; i >= 0; i--) { const n = lines[i] + '\n' + out; if (n.length > max) break; out = n; }
  return out.trim();
}
export function build(room, opts = {}) {
  const b = readBase(opts.file); const tx = txTail(room, opts.dir);
  const text = (b.text ? `ABOUT DAN, HINGECRAFT AND HUBFACE (Yoda's notes):\n${b.text}\n\n` : '') + (tx ? `EARLIER IN THIS ROOM (oldest first):\n${tx}\n` : '');
  return { text, baseMtime: b.mtime };
}
// call on every line in the room (touch) and before every fast reply (get)
export function getPack(room, now = Date.now(), opts = {}) {
  const p = packs.get(room); const quiet = opts.quietMs ?? QUIET_MS;
  let baseM = 0; try { baseM = fs.statSync(opts.file || PACK_FILE).mtimeMs; } catch {}
  if (!p || now - p.lastActive >= quiet || baseM !== p.baseMtime) {
    const b = build(room, opts); const np = { text: b.text, built: now, lastActive: now, baseMtime: b.baseMtime, rebuilt: true };
    packs.set(room, np); return np;
  }
  p.lastActive = now; p.rebuilt = false; return p;
}
export function touch(room, now = Date.now()) { const p = packs.get(room); if (p) p.lastActive = now; }
export const _packs = packs;
export const packInfo = () => ({ file: PACK_FILE, rooms: packs.size, quietMs: QUIET_MS });
