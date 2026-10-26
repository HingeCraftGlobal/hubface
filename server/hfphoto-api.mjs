// floppy-photo-20261025a (Dan asked Oct 25 2026 call): camera-off tile photos.
//   POST /api/hf-photo/me        raw jpeg/png/webp body (<=2 MB). Signed-in: saved to the account (stable file). Guest: hosted for the session (random file).
//   GET  /api/hf-photo/me        -> {ok,url|null} (signed-in only)
//   POST /api/hf-photo/bot/<nm>  raw image, header X-Yoda-Key (same key as /say). Bot avatar per bot name.
//   GET  /api/hf-photo/bot/<nm>  -> image or 404
//   GET  /api/hf-photo/f/<file>  -> image (nosniff, CSP none)
// Files in /var/lib/hubface/hfphotos, mode 0600, names [a-z0-9-] + .jpg/.png/.webp only; magic bytes checked.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
export const HFPHOTO_BUILD = 'floppy-photo-20261025a';
const DIR = path.join(process.env.HUBFACE_DATA || '/var/lib/hubface', 'hfphotos'), MAX = 2 * 1024 * 1024;
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SALT = (() => { const f = path.join(DIR, '.salt'); try { return fs.readFileSync(f, 'utf8'); } catch { fs.mkdirSync(DIR, { recursive: true, mode: 0o700 }); const s = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(f, s, { mode: 0o600 }); return s; } })();
function sniff(b) { if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'; if (b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'; if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'; return null; }
const hits = new Map(); function limited(k, max, win) { const n = Date.now(), a = (hits.get(k) || []).filter((t) => n - t < win); if (a.length >= max) { hits.set(k, a); return true; } a.push(n); hits.set(k, a); return false; }
const body = (q) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > MAX) { rej(new Error('big')); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
function find(base) { for (const e of Object.keys(TYPES)) { const f = path.join(DIR, base + '.' + e); try { const s = fs.statSync(f); return { f, e, m: s.mtimeMs | 0 }; } catch {} } return null; }
function save(base, ext, b) { fs.mkdirSync(DIR, { recursive: true, mode: 0o700 }); for (const e of Object.keys(TYPES)) if (e !== ext) try { fs.unlinkSync(path.join(DIR, base + '.' + e)); } catch {} const f = path.join(DIR, base + '.' + ext); fs.writeFileSync(f + '.tmp', b, { mode: 0o600 }); fs.renameSync(f + '.tmp', f); return '/api/hf-photo/f/' + base + '.' + ext + '?v=' + Date.now(); }
function serve(r, x, cache) { r.writeHead(200, { 'Content-Type': TYPES[x.e], 'Content-Length': fs.statSync(x.f).size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Content-Disposition': 'inline' }); fs.createReadStream(x.f).pipe(r); }
export const isHfPhotoPath = (p) => p.startsWith('/api/hf-photo/');
export async function hfPhotoRoute(q, r, p, { who, json, ip, yodaOk }) {
  const k = ip ? ip(q) : '';
  const upload = async () => { if (q.method !== 'POST') return null; const o = q.headers.origin || ''; let b; try { b = await body(q); } catch { json(r, 413, { error: 'max 2 MB' }); return false; } const e = sniff(b); if (!e) { json(r, 415, { error: 'jpeg, png or webp only' }); return false; } return { b, e, o }; };
  if (p === '/api/hf-photo/me') {
    const u = who(q); r.setHeader('Cache-Control', 'no-store');
    if (q.method === 'GET') { if (!u || !u.id) return json(r, 401, { error: 'sign in' }), true; const x = find('u-' + crypto.createHash('sha256').update(SALT + '|' + u.id).digest('hex').slice(0, 32)); return json(r, 200, { ok: true, url: x ? '/api/hf-photo/f/' + path.basename(x.f) + '?v=' + x.m : null }), true; }
    if (q.method !== 'POST') return json(r, 405, { error: 'method' }), true;
    if ((q.headers.origin || '') && q.headers.origin !== 'https://hubface.org') return json(r, 403, { error: 'origin' }), true;
    if (limited('m' + (u && u.id || k), 12, 3600e3)) return json(r, 429, { error: 'slow down' }), true;
    const up = await upload(); if (!up) return true;
    const base = u && u.id ? 'u-' + crypto.createHash('sha256').update(SALT + '|' + u.id).digest('hex').slice(0, 32) : 'g-' + crypto.randomBytes(16).toString('hex');
    return json(r, 200, { ok: true, url: save(base, up.e, up.b), member: !!(u && u.id) }), true;
  }
  let m = p.match(/^\/api\/hf-photo\/bot\/([a-z0-9-]{1,32})$/);
  if (m) {
    if (q.method === 'GET') { const x = find('b-' + m[1]); if (!x) return json(r, 404, { error: 'none' }), true; return serve(r, x, 'public, max-age=300'), true; }
    if (q.method !== 'POST') return json(r, 405, { error: 'method' }), true;
    if (!yodaOk(q, r, json)) return true;
    const up = await upload(); if (!up) return true;
    return json(r, 200, { ok: true, url: save('b-' + m[1], up.e, up.b) }), true;
  }
  m = p.match(/^\/api\/hf-photo\/f\/([ugb]-[a-z0-9-]{1,64})\.(jpg|png|webp)$/);
  if (m && q.method === 'GET') { const f = path.join(DIR, m[1] + '.' + m[2]); if (!fs.existsSync(f)) return json(r, 404, { error: 'none' }), true; return serve(r, { f, e: m[2] }, 'public, max-age=86400'), true; }
  return json(r, 404, { error: 'not found' }), true;
}
