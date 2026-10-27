// stickies-20261026a (Dan approved by voice Oct 26 2026, Brain OS task #129): Sticky Note widget backend.
//   Auth: HubFace account session (hf_session) for create/edit/vault/delete. Door reads + media are public (unguessable ids).
//   GET    /api/stickies/me                 -> {user|null}
//   GET    /api/stickies/door?door=KEY      -> {stickies:[...]} placed on that door (any visitor)
//   GET    /api/stickies/vault              -> {stickies:[...]} mine (saved or placed)
//   POST   /api/stickies/new                -> create {door,x,y,w,h,rot,color,text,forName,media:[{id,kind,type}],saved}
//   PUT    /api/stickies/<id>               -> edit (author only); door:null takes it off the door
//   POST   /api/stickies/<id>/dismiss       -> X on a door (any signed-in member): off the door; deleted unless saved
//   DELETE /api/stickies/<id>               -> permanent delete (author only), media removed
//   POST   /api/stickies/media              -> raw body upload (image/*, audio/*, video/*), 25 MB cap -> {id,type}
//   GET    /api/stickies/media/<id>         -> the file
// Data: /var/lib/hubface/stickies/stickies.json + media/. Roll back: remove the stickies lines in hubface-vps.mjs + nginx block.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ROOT = (process.env.HUBFACE_DATA || '/var/lib/hubface') + '/stickies';
const MED = ROOT + '/media', DBF = ROOT + '/stickies.json';
const CAP = 25 * 1024 * 1024, MAX_PER_USER = 500, MAX_PER_DOOR = 40;
fs.mkdirSync(MED, { recursive: true });
let DB = { stickies: {}, media: {} };
try { DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); DB.stickies ||= {}; DB.media ||= {}; } catch {}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { const t = DBF + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, DBF); }, 50); }
function saveNow() { clearTimeout(saveT); const t = DBF + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, DBF); }
const hits = new Map();
function limited(k, n = 120) { const now = Date.now(), a = (hits.get(k) || []).filter((t) => now - t < 60e3); a.push(now); hits.set(k, a); return a.length > n; }
const id = () => crypto.randomBytes(12).toString('base64url');
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
const doorKey = (v) => { const s = String(v ?? '').trim().slice(0, 120); return /^[A-Za-z0-9:_./ -]{1,120}$/.test(s) ? s : null; };
const COLOR = /^#[0-9a-fA-F]{6}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/webm': 'weba', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
function clean(b, prev = {}) {
  const o = { ...prev };
  if ('door' in b) o.door = b.door == null || b.door === '' ? null : doorKey(b.door);
  if ('x' in b) o.x = num(b.x, 0, 100, 50); if ('y' in b) o.y = num(b.y, 0, 100, 40);
  if ('w' in b) o.w = num(b.w, 160, 640, 300); if ('h' in b) o.h = num(b.h, 160, 760, 340);
  if ('rot' in b) o.rot = num(b.rot, -45, 45, 20);
  if ('color' in b) o.color = COLOR.test(String(b.color)) ? String(b.color) : '#ffe94d';
  if ('text' in b) o.text = str(b.text, 600); if ('forName' in b) o.forName = str(b.forName, 40).trim();
  if ('caption' in b) o.caption = str(b.caption, 40);
  if ('saved' in b) o.saved = !!b.saved;
  if ('media' in b) o.media = (Array.isArray(b.media) ? b.media : []).slice(0, 3).filter((m) => m && DB.media[m.id]).map((m) => ({ id: m.id, kind: DB.media[m.id].kind, type: DB.media[m.id].type }));
  return o;
}
// hubface-sticky-20261026b: surface 'hubface' = stuck on HubFace itself. Personal: only the author, or a member named in For, sees it.
const HF = 'hubface';
const names = (f) => String(f || '').toLowerCase().split(/\s*(?:,|&|\/|\band\b|\+)\s*/).map((x) => x.trim()).filter(Boolean);
const canSee = (s, me) => !!me && (s.by === me.id || (me.name && names(s.forName).includes(String(me.name).toLowerCase())));
function seedDemo() {   // pre-built demo sticky in the owner's vault (not placed)
  const OWNER = Number(process.env.HF_YODA_OWNER_IDS ? String(process.env.HF_YODA_OWNER_IDS).split(',')[0] : 14) || 14;
  if (DB.seededDemo) return; const src = '/opt/hubface/server/sticky-demo-mom.jpg'; if (!fs.existsSync(src)) return;
  const mid = id(), f = `${mid}.jpg`; fs.copyFileSync(src, `${MED}/${f}`);
  DB.media[mid] = { file: f, type: 'image/jpeg', kind: 'image', by: OWNER, size: fs.statSync(src).size, created: new Date().toISOString() };
  const t = new Date().toISOString(), sid = id();
  DB.stickies[sid] = { id: sid, by: OWNER, byName: 'Dan', door: null, x: 50, y: 40, w: 320, h: 400, rot: 20, color: '#ffe94d', forName: 'Ava & Finn', text: 'Be good, my loves!\nHome by 6. Love, Mom', caption: 'Mom \u2665', media: [{ id: mid, kind: 'image', type: 'image/jpeg' }], saved: true, demo: true, created: t, updated: t };
  DB.seededDemo = true; saveNow();
}
try { seedDemo(); } catch (e) { console.warn('[stickies] demo seed', e && e.message); }
const pub = (s) => ({ id: s.id, door: s.door, x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, color: s.color, text: s.text, forName: s.forName, caption: s.caption || '', media: s.media || [], saved: !!s.saved, by: s.byName || 'HubFace member', created: s.created, updated: s.updated });
async function body(q, cap) {
  return new Promise((res, rej) => { let n = 0; const ch = []; let big = false; q.on('data', (c) => { n += c.length; if (n > cap) { big = true; ch.length = 0; } else if (!big) ch.push(c); }); q.on('end', () => big ? rej(Object.assign(new Error('too large'), { code: 413 })) : res(Buffer.concat(ch))); q.on('error', rej); });
}
export function isStickiesPath(p) { return p === '/api/stickies' || p.startsWith('/api/stickies/'); }
export function stickiesHealth() { return { ok: true, stickies: Object.keys(DB.stickies).length, media: Object.keys(DB.media).length }; }
export async function stickiesRoute(q, r, p, u, { who, json, ip }) {
  if (!isStickiesPath(p)) return false;
  const me = who(q); const M = q.method;
  if (limited((me && 'u' + me.id) || ('ip' + (ip ? ip(q) : '')), M === 'GET' ? 300 : 90)) { json(r, 429, { error: 'too many requests' }); return true; }
  const need = () => { if (!me) { json(r, 401, { error: 'sign in to HubFace first' }); return false; } return true; };
  try {
    if (p === '/api/stickies/me' && M === 'GET') { json(r, 200, { user: me ? { id: me.id, name: me.name } : null }); return true; }
    if (p === '/api/stickies/health') { json(r, 200, stickiesHealth()); return true; }
    if (p === '/api/stickies/door' && M === 'GET') {
      const d = doorKey(u.searchParams.get('door')); if (!d) { json(r, 400, { error: 'door required' }); return true; }
      const list = Object.values(DB.stickies).filter((s) => s.door === d && (d !== HF || canSee(s, me))).sort((a, b) => a.created < b.created ? -1 : 1).map(pub);
      json(r, 200, { door: d, stickies: list, me: me ? { id: me.id, name: me.name } : null, mine: me ? list.filter((s) => DB.stickies[s.id].by === me.id).map((s) => s.id) : [] }); return true;
    }
    if (p === '/api/stickies/vault' && M === 'GET') {
      if (!need()) return true;
      json(r, 200, { stickies: Object.values(DB.stickies).filter((s) => s.by === me.id).sort((a, b) => a.updated > b.updated ? -1 : 1).map(pub) }); return true;
    }
    if (p === '/api/stickies/media' && M === 'POST') {
      if (!need()) return true;
      const type = String(q.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!EXT[type]) { json(r, 415, { error: 'unsupported media type' }); return true; }
      const len = Number(q.headers['content-length'] || 0); if (len > CAP) { json(r, 413, { error: 'file over 25 MB' }); return true; }
      const buf = await body(q, CAP); if (!buf.length) { json(r, 400, { error: 'empty' }); return true; }
      const mid = id(), f = `${mid}.${EXT[type]}`; fs.writeFileSync(`${MED}/${f}`, buf);
      DB.media[mid] = { file: f, type, kind: type.split('/')[0], by: me.id, size: buf.length, created: new Date().toISOString() }; save();
      json(r, 200, { id: mid, type, kind: DB.media[mid].kind, size: buf.length }); return true;
    }
    let m = p.match(/^\/api\/stickies\/media\/([A-Za-z0-9_-]{10,40})$/);
    if (m && M === 'GET') {
      const md = DB.media[m[1]]; if (!md) { json(r, 404, { error: 'not found' }); return true; }
      const fp = `${MED}/${md.file}`; let st; try { st = fs.statSync(fp); } catch { json(r, 404, { error: 'not found' }); return true; }
      const rg = /bytes=(\d*)-(\d*)/.exec(String(q.headers.range || ''));
      const h = { 'Content-Type': md.type, 'Cache-Control': 'private, max-age=86400', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
      if (rg) { const s = rg[1] ? +rg[1] : 0, e = rg[2] ? Math.min(+rg[2], st.size - 1) : st.size - 1; r.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 }); fs.createReadStream(fp, { start: s, end: e }).pipe(r); }
      else { r.writeHead(200, { ...h, 'Content-Length': st.size }); fs.createReadStream(fp).pipe(r); }
      return true;
    }
    if ((p === '/api/stickies' || p === '/api/stickies/new') && M === 'POST') {
      if (!need()) return true;
      const b = JSON.parse((await body(q, 64e3)).toString('utf8') || '{}');
      if (Object.values(DB.stickies).filter((s) => s.by === me.id).length >= MAX_PER_USER) { json(r, 409, { error: 'vault full' }); return true; }
      const s = clean({ x: 50, y: 40, w: 300, h: 340, rot: 20, color: '#ffe94d', text: '', forName: '', media: [], saved: false, door: null, ...b });
      if (b.door && !s.door) { json(r, 400, { error: 'bad door' }); return true; }
      if (s.door && Object.values(DB.stickies).filter((x) => x.door === s.door && (s.door !== HF || x.by === me.id)).length >= MAX_PER_DOOR) { json(r, 409, { error: 'door is full' }); return true; }
      const t = new Date().toISOString(); Object.assign(s, { id: id(), by: me.id, byName: me.name, created: t, updated: t });
      DB.stickies[s.id] = s; save(); json(r, 200, { sticky: pub(s) }); return true;
    }
    m = p === '/api/stickies/new' ? null : p.match(/^\/api\/stickies\/([A-Za-z0-9_-]{10,40})(\/dismiss)?$/);
    if (m) {
      const s = DB.stickies[m[1]]; if (!s) { json(r, 404, { error: 'not found' }); return true; }
      if (!need()) return true;
      if (m[2] && M === 'POST') {
        if (s.door === HF && !canSee(s, me)) { json(r, 403, { error: 'not your sticky' }); return true; }
        if (s.saved) { s.door = null; s.updated = new Date().toISOString(); }
        else { delete DB.stickies[s.id]; }
        save(); json(r, 200, { ok: true, kept: !!DB.stickies[s.id] }); return true;
      }
      if (s.by !== me.id) { json(r, 403, { error: 'only the author can change this sticky' }); return true; }
      if (M === 'PUT') {
        const b = JSON.parse((await body(q, 64e3)).toString('utf8') || '{}');
        const n = clean(b, s); if (b.door && !n.door) { json(r, 400, { error: 'bad door' }); return true; }
        n.updated = new Date().toISOString(); DB.stickies[s.id] = n; save(); json(r, 200, { sticky: pub(n) }); return true;
      }
      if (M === 'DELETE') {
        delete DB.stickies[s.id];
        for (const md of s.media || []) { const used = Object.values(DB.stickies).some((x) => (x.media || []).some((y) => y.id === md.id)); if (!used && DB.media[md.id]) { try { fs.unlinkSync(`${MED}/${DB.media[md.id].file}`); } catch {} delete DB.media[md.id]; } }
        saveNow(); json(r, 200, { ok: true, deleted: true }); return true;
      }
    }
    json(r, 405, { error: 'method not allowed' }); return true;
  } catch (e) {
    if (e && e.code === 413) { try { json(r, 413, { error: 'file over 25 MB' }); } catch {} return true; }
    if (e instanceof SyntaxError) { json(r, 400, { error: 'bad json' }); return true; }
    console.warn('[stickies]', e && e.message); try { json(r, 500, { error: 'server error' }); } catch {} return true;
  }
}
