// takeit-20261031a (Dan asked by voice, call-2460/2a344825, Oct 31 2026): "Take it with me" per-user stash.
//   Auth: hf_session cookie via rooms.mjs sessionUser() (same as stickies/userdata). No session -> 401. Rows are scoped by user_id.
//   GET    /api/stash              -> {items:[...]} mine, newest first
//   POST   /api/stash              {ref,type?,title?,channel?,thumb?,meta?} -> {item, created:bool}  (idempotent per user+ref)
//   DELETE /api/stash/<id>         -> {ok}
//   GET    /api/stash/<id>/pull    -> the item as it is right now: {kind:'link'|'file'|'text'|'email', url?, text?, ...}
//   GET    /api/stash/health
// Item refs: yt:<11-char id> | vault:<id> | sticky:<mediaId> | photo:<file> | email:<threadId> | url:<https url> | text:<hash>
// Nothing is copied at tap time: YouTube = link + title/channel/thumb only; files stay where they live and are pulled at view time.
// Data: /var/lib/hubface/stash.db (better-sqlite3, own file). Roll back: remove the 2 stash lines in hubface-vps.mjs (+ restart).
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
export const STASH_BUILD = 'takeit-shortcut-20261031b';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface';
const DBF = process.env.HF_STASH_DB || path.join(ROOT, 'stash.db');
const db = new Database(DBF); db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS stash (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, item_ref TEXT NOT NULL, item_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL DEFAULT '', thumbnail TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, UNIQUE(user_id, item_ref));
CREATE INDEX IF NOT EXISTS stash_user ON stash(user_id, created_at);
CREATE TABLE IF NOT EXISTS stash_tokens (user_id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used TEXT);`);
// takeit-shortcut-20261031b: per-user Shortcut token. Only sha256(token) is stored; the token is shown once and never logged.
const TQ = {
  get: db.prepare('SELECT user_id, created_at, last_used FROM stash_tokens WHERE user_id=?'),
  byHash: db.prepare('SELECT user_id FROM stash_tokens WHERE token_hash=?'),
  put: db.prepare('INSERT INTO stash_tokens (user_id, token_hash, created_at, last_used) VALUES (?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at, last_used=NULL'),
  del: db.prepare('DELETE FROM stash_tokens WHERE user_id=?'),
  used: db.prepare('UPDATE stash_tokens SET last_used=? WHERE user_id=?'),
};
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function tokenUser(q) {
  const h = String(q.headers['authorization'] || ''); const m = /^Bearer\s+(hfs_[A-Za-z0-9_-]{40,60})\s*$/.exec(h); if (!m) return null;
  const row = TQ.byHash.get(sha(m[1])); if (!row) return null; TQ.used.run(new Date().toISOString(), row.user_id); return { id: row.user_id, hash: sha(m[1]).slice(0, 16) };
}
function ytId(u) { try { const x = new URL(u); const h = x.hostname.replace(/^(www\.|m\.|music\.)/, ''); let id = '';
  if (h === 'youtu.be') id = x.pathname.slice(1, 12); else if (h === 'youtube.com') id = x.searchParams.get('v') || (/^\/(shorts|embed|live)\/([\w-]{11})/.exec(x.pathname) || [])[2] || '';
  return /^[\w-]{11}$/.test(id) ? { id, t: parseInt(x.searchParams.get('t') || '', 10) } : null; } catch { return null; } }
async function ytMeta(id) { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: ctl.signal }); if (!r.ok) return {}; const j = await r.json(); return { title: j.title || '', channel: j.author_name || '' }; } catch { return {}; } finally { clearTimeout(tm); } }
const Q = {
  list: db.prepare('SELECT * FROM stash WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 500'),
  get: db.prepare('SELECT * FROM stash WHERE id=? AND user_id=?'),
  byRef: db.prepare('SELECT * FROM stash WHERE user_id=? AND item_ref=?'),
  count: db.prepare('SELECT COUNT(*) n FROM stash WHERE user_id=?'),
  ins: db.prepare('INSERT INTO stash (user_id,item_ref,item_type,title,channel,thumbnail,meta,created_at) VALUES (?,?,?,?,?,?,?,?)'),
  del: db.prepare('DELETE FROM stash WHERE id=? AND user_id=?'),
};
const MAX_PER_USER = 500;
const hits = new Map();
function limited(k, n) { const now = Date.now(), a = (hits.get(k) || []).filter((t) => now - t < 60e3); a.push(now); hits.set(k, a); return a.length > n; }
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const httpsUrl = (v) => { try { const x = new URL(String(v)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.slice(0, 1000) : ''; } catch { return ''; } };
const thumbOk = (v) => { const s = String(v || ''); if (/^\/api\/(vault\/file|stickies\/media|hf-photo\/f)\/[A-Za-z0-9._-]+(\?v=[\w.-]+)?$/.test(s)) return s; return httpsUrl(s).startsWith('https://') ? httpsUrl(s) : ''; };
const REF = {
  yt: /^[\w-]{11}$/, vault: /^[A-Za-z0-9_-]{1,64}$/, sticky: /^[A-Za-z0-9_-]{8,40}$/, photo: /^[a-z0-9-]{1,80}\.(jpg|png|webp)$/,
  email: /^[0-9a-f]{8,32}$/, text: /^[0-9a-f]{8,64}$/,
};
function parseRef(ref) {
  const s = String(ref || '').trim(); const i = s.indexOf(':'); if (i < 1) return null;
  const k = s.slice(0, i), v = s.slice(i + 1);
  if (k === 'url') { const u = httpsUrl(v); return u ? { k, v: u, ref: 'url:' + u } : null; }
  if (REF[k] && REF[k].test(v)) return { k, v, ref: k + ':' + v };
  return null;
}
const TYPE_OF = { yt: 'youtube', vault: 'vault', sticky: 'sticky', photo: 'photo', email: 'email', url: 'link', text: 'text' };
const out = (x) => { let meta = {}; try { meta = JSON.parse(x.meta || '{}'); } catch {} return { id: x.id, ref: x.item_ref, type: x.item_type, title: x.title, channel: x.channel, thumb: x.thumbnail, meta, created: x.created_at }; };
function emailThread(uid, tid) {
  try { const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'email-feed', `${Number(uid)}.json`), 'utf8')); return (f.items || []).find((m) => m && m.threadId === tid) || null; } catch { return null; }
}
function pull(uid, row) {
  const p = parseRef(row.item_ref); let meta = {}; try { meta = JSON.parse(row.meta || '{}'); } catch {}
  if (!p) return { kind: 'gone' };
  switch (p.k) {
    case 'yt': return { kind: 'link', url: 'https://www.youtube.com/watch?v=' + p.v + (meta.t ? '&t=' + Math.max(0, Math.floor(Number(meta.t) || 0)) + 's' : ''), title: row.title, channel: row.channel, thumb: 'https://i.ytimg.com/vi/' + p.v + '/hqdefault.jpg' };
    case 'vault': return { kind: 'file', url: '/api/vault/file/' + encodeURIComponent(p.v), name: meta.name || row.title || 'vault-item', mime: meta.mime || '' };
    case 'sticky': return { kind: 'file', url: '/api/stickies/media/' + encodeURIComponent(p.v), name: meta.name || row.title || 'sticky-media', mime: meta.mime || '' };
    case 'photo': return { kind: 'file', url: '/api/hf-photo/f/' + p.v, name: p.v, mime: '' };
    case 'email': { const t = emailThread(uid, p.v); if (!t) return { kind: 'link', url: 'https://mail.google.com/mail/u/0/#all/' + p.v, title: row.title, stale: true };
      const text = [`${t.subject || ''}`, `From: ${t.from || ''} <${t.fromEmail || ''}>`, `Date: ${t.date || ''}`, '', ...(t.messages || []).map((m) => `${m.from || ''}: ${m.text || ''}`)].join('\n').slice(0, 20000);
      return { kind: 'email', url: t.url || ('https://mail.google.com/mail/u/0/#all/' + p.v), title: t.subject || row.title, text }; }
    case 'url': return { kind: /\.(jpe?g|png|webp|gif|mp4|mov|webm|pdf)(\?|$)/i.test(p.v) ? 'file' : 'link', url: p.v, title: row.title, name: meta.name || '' };
    case 'text': return { kind: 'text', text: String(meta.text || row.title || ''), title: row.title };
  }
  return { kind: 'gone' };
}
function addItem(uid, b) {
  const pr = parseRef(b.ref); if (!pr) return { code: 400, body: { error: 'bad item ref' } };
  const had = Q.byRef.get(uid, pr.ref); if (had) return { code: 200, body: { item: out(had), created: false } };
  if (Q.count.get(uid).n >= MAX_PER_USER) return { code: 409, body: { error: 'stash full (500)' } };
  const m = b.meta && typeof b.meta === 'object' ? b.meta : {};
  const meta = { name: str(m.name, 160), mime: str(m.mime, 80), t: Number.isFinite(+m.t) ? Math.max(0, Math.floor(+m.t)) : undefined, text: pr.k === 'text' ? str(m.text, 4000) : undefined, src: str(m.src, 60) };
  const thumb = pr.k === 'yt' ? `https://i.ytimg.com/vi/${pr.v}/mqdefault.jpg` : thumbOk(b.thumb);
  const info = Q.ins.run(uid, pr.ref, TYPE_OF[pr.k], str(b.title, 300), str(b.channel, 120), thumb, JSON.stringify(meta), new Date().toISOString());
  return { code: 201, body: { item: out(Q.get.get(info.lastInsertRowid, uid)), created: true } };
}
async function shortcutRoute(q, r, p, { readBody, json }) {
  const M = q.method; const u = tokenUser(q);
  if (limited('tok' + (u ? u.hash : 'bad:' + String(q.socket && q.socket.remoteAddress)), u ? 60 : 20)) { json(r, 429, { error: 'too many requests' }); return true; }
  if (!u) { json(r, 401, { error: 'bad or missing stash token' }); return true; }
  const uid = Number(u.id);
  if (p === '/api/stash/shortcut/list' && M === 'GET') {
    const items = Q.list.all(uid).map((row) => { const pl = pull(uid, row); return { row, pl }; }).filter((x) => (x.pl.kind === 'link' || x.pl.kind === 'file') && x.pl.url)
      .map(({ row, pl }) => ({ id: row.id, type: row.item_type, title: row.title || pl.title || pl.name || '', url: pl.url.startsWith('/') ? 'https://hubface.org' + pl.url : pl.url, kind: pl.kind }));
    json(r, 200, { items }); return true;
  }
  if (p === '/api/stash/shortcut/add' && M === 'POST') {
    let raw; try { raw = (await readBody(q)).toString('utf8'); } catch { json(r, 413, { error: 'too large' }); return true; }
    let b = {}; const ct = String(q.headers['content-type'] || '');
    if (/json/.test(ct) || /^\s*\{/.test(raw)) { try { b = JSON.parse(raw || '{}'); } catch { json(r, 400, { error: 'bad json' }); return true; } }
    else if (/form-urlencoded/.test(ct)) { const f = new URLSearchParams(raw); b = { url: f.get('url'), title: f.get('title') }; }
    else b = { url: raw };
    if (!b || typeof b !== 'object') { json(r, 400, { error: 'bad body' }); return true; }
    const found = (String(b.url ?? '').match(/https?:\/\/[^\s<>"']+/) || [])[0] || '';
    const link = httpsUrl(found); if (!link) { json(r, 400, { error: 'send a http(s) url' }); return true; }
    const yt = ytId(link); let item;
    if (yt) { const md = Q.byRef.get(uid, 'yt:' + yt.id) ? {} : await ytMeta(yt.id);
      item = { ref: 'yt:' + yt.id, title: str(b.title, 300) || md.title || '', channel: md.channel || '', meta: { t: Number.isFinite(yt.t) ? yt.t : undefined, src: 'shortcut' } }; }
    else item = { ref: 'url:' + link, title: str(b.title, 300), meta: { src: 'shortcut' } };
    const a = addItem(uid, item); json(r, a.code, a.body); return true;
  }
  json(r, 405, { error: 'method' }); return true;
}
export function isStashPath(p) { return p === '/api/stash' || p.startsWith('/api/stash/'); }
export function stashHealth() { return { ok: true, build: STASH_BUILD, tokens: db.prepare('SELECT COUNT(*) n FROM stash_tokens').get().n, rows: db.prepare('SELECT COUNT(*) n FROM stash').get().n }; }
export async function stashRoute(q, r, p, { who, readBody, json, ip }) {
  if (!isStashPath(p)) return false;
  const M = q.method;
  if (p === '/api/stash/health') { json(r, 200, stashHealth()); return true; }
  if (p.startsWith('/api/stash/shortcut/')) { try { return await shortcutRoute(q, r, p, { readBody, json }); } catch (e) { console.warn('[stash] shortcut error'); json(r, 500, { error: 'server error' }); return true; } }
  const me = who(q);
  if (limited((me && 'u' + me.id) || 'ip' + (ip ? ip(q) : ''), M === 'GET' ? 300 : 90)) { json(r, 429, { error: 'too many requests' }); return true; }
  if (!me || !me.id) { json(r, 401, { error: 'sign in to HubFace first' }); return true; }
  const uid = Number(me.id);
  try {
    if (p === '/api/stash/token') {   // takeit-shortcut-20261031b: cookie-only token management
      if (M === 'GET') { const t = TQ.get.get(uid); json(r, 200, { has: !!t, created: t ? t.created_at : null, last_used: t ? t.last_used : null }); return true; }
      if (M === 'POST') { const tok = 'hfs_' + crypto.randomBytes(32).toString('base64url'); TQ.put.run(uid, sha(tok), new Date().toISOString()); json(r, 201, { token: tok, note: 'shown once' }); return true; }
      if (M === 'DELETE') { TQ.del.run(uid); json(r, 200, { ok: true }); return true; }
      json(r, 405, { error: 'method' }); return true;
    }
    if (p === '/api/stash' && M === 'GET') { json(r, 200, { items: Q.list.all(uid).map(out) }); return true; }
    if (p === '/api/stash' && M === 'POST') {
      let b; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { json(r, 400, { error: 'bad json' }); return true; }
      const a = addItem(uid, b); json(r, a.code, a.body); return true;
    }
    const m = /^\/api\/stash\/(\d{1,12})(\/pull)?$/.exec(p);
    if (m) {
      const row = Q.get.get(Number(m[1]), uid); if (!row) { json(r, 404, { error: 'not found' }); return true; }
      if (m[2] && M === 'GET') { json(r, 200, { item: out(row), pull: pull(uid, row), at: new Date().toISOString() }); return true; }
      if (!m[2] && M === 'DELETE') { Q.del.run(row.id, uid); json(r, 200, { ok: true }); return true; }
    }
    json(r, 405, { error: 'method' }); return true;
  } catch (e) { console.warn('[stash]', String(e && e.message || e).slice(0, 120)); json(r, 500, { error: 'server error' }); return true; }
}
