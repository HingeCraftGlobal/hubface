// signup-20261028a (Dan, voice call Oct 28): /start sign-up -> own room -> 7-day trial -> copyable guest invite -> trial wall.
// Sidecar only. Does NOT touch accounts.db or existing sign-in. Store: /var/lib/hubface/signup/store.json. No email is ever sent. No payment.
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
const PORT = Number(process.env.SIGNUP_PORT || 3483);
const DIR = process.env.SIGNUP_DIR || '/var/lib/hubface/signup'; const FILE = path.join(DIR, 'store.json');
const ORIGIN = 'https://hubface.org'; const ROOMS_API = 'http://127.0.0.1:3470/api/rooms';
const TRIAL_MS = 7 * 864e5; const BUILD = 'signup-20261028a';
// Plan tiers: set by Dan on the Oct 28 voice call. Display only; no checkout here. No separate transaction-charge line (not specified).
const PLANS = [
  { id: 'monthly10', name: 'Monthly', usd: 1.33, interval: 'month', allowance: 'Up to 10 seats' },
  { id: 'annual10', name: 'Annual', usd: 10, interval: 'year', allowance: 'Up to 10 seats · 37% off' },
  { id: 'unlimited', name: 'Unlimited', usd: 2.00, interval: 'month', allowance: 'Unlimited seats' },
];
const TOKEN = { usd: 6, minutes: 15 };
const PLANS_URL = 'https://rooms.hubface.org/start?plans=1';
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
let S = { owners: {}, sessions: {}, invites: {}, guests: {} };
try { S = Object.assign(S, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
const save = () => { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(S), { mode: 0o600 }); fs.renameSync(t, FILE); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rnd = (n) => crypto.randomBytes(n).toString('base64url');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = (v) => String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanEmail = (v) => { const e = String(v ?? '').trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null; };
const hits = new Map(); const limit = (k, n, ms) => { const t = Date.now(); const a = (hits.get(k) || []).filter((x) => t - x < ms); a.push(t); hits.set(k, a); return a.length <= n; };
const ipOf = (q) => String(q.headers['cf-connecting-ip'] || q.headers['x-real-ip'] || String(q.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim().slice(0, 64);
const cookies = (q) => Object.fromEntries(String(q.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setCookie = (r, tok) => r.setHeader('Set-Cookie', `hfstart=${tok}; Path=/start; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax`);
const json = (r, c, o) => { r.writeHead(c, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const body = (q) => new Promise((res) => { let b = ''; q.on('data', (d) => { b += d; if (b.length > 8000) q.destroy(); }); q.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res(null); } }); });
function who(q, u) {
  const tok = (u && u.searchParams.get('k')) || cookies(q).hfstart; if (!tok || tok.length > 80) return null;
  const s = S.sessions[sha(tok)]; if (!s) return null;
  if (s.kind === 'owner') { const o = S.owners[s.id]; return o ? { kind: 'owner', o, tok } : null; }
  const g = S.guests[s.id]; const o = g && S.owners[g.owner]; return o ? { kind: 'guest', g, o, tok } : null;
}
const trial = (o) => { const end = Date.parse(o.trialEnd); const left = end - Date.now(); return { start: o.trialStart, end: o.trialEnd, active: left > 0, daysLeft: Math.max(0, Math.ceil(left / 864e5)) }; };
const view = (w) => { const t = trial(w.o); const inv = w.kind === 'owner' && w.o.invite ? ORIGIN + '/start/j/' + w.o.invite : null;
  return { kind: w.kind, name: w.kind === 'owner' ? w.o.name : w.g.name, owner: w.o.name, room: w.o.room, roomLink: t.active ? ORIGIN + '/interface/#room=' + w.o.room : null, trial: t, inviteLink: t.active ? inv : null, wall: !t.active, plans: t.active ? undefined : PLANS, token: TOKEN, plansUrl: PLANS_URL, checkout: false }; };
async function makeRoom(name, ip) {
  const r = await fetch(ROOMS_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, Origin: ORIGIN }, body: JSON.stringify({ name: (name + "'s room").slice(0, 60), meta: { desc: 'signup trial room', mode: 'trial' } }) });
  const j = await r.json().catch(() => ({})); if (r.status !== 201 || !j.id) throw new Error('room create ' + r.status); return j;
}
async function api(q, r, p, u) {
  const ip = ipOf(q);
  if (p === '/start/api/health') return json(r, 200, { ok: true, build: BUILD, owners: Object.keys(S.owners).length, guests: Object.keys(S.guests).length });
  if (p === '/start/api/me') { const w = who(q, u); return w ? json(r, 200, view(w)) : json(r, 200, { kind: 'none' }); }
  if (q.method !== 'POST') return json(r, 405, { error: 'POST only' });
  if (!/^https:\/\/hubface\.org$/.test(String(q.headers.origin || ''))) return json(r, 403, { error: 'bad origin' });
  const b = await body(q); if (!b) return json(r, 400, { error: 'bad json' });
  if (p === '/start/api/signup') {
    if (!limit('su:' + ip, 5, 36e5)) return json(r, 429, { error: 'Too many sign-ups from here. Try again later.' });
    const name = cleanName(b.name), email = cleanEmail(b.email);
    if (!name || name.length < 2) return json(r, 400, { error: 'Please enter your name.' }); if (!email) return json(r, 400, { error: 'Please enter a valid email.' });
    if (Object.values(S.owners).some((o) => o.email === email)) return json(r, 409, { error: 'That email already has a room. Open it from your HubFace shortcut on this device.' });
    let room; try { room = await makeRoom(name, ip); } catch (e) { console.warn('[signup] room fail', String(e.message).slice(0, 60)); return json(r, 502, { error: 'Could not create your room. Please try again.' }); }
    const id = 'o_' + rnd(9), t = new Date(), tok = rnd(32);
    S.owners[id] = { id, email, name, room: room.id, roomKeyHash: sha(room.key), createdAt: t.toISOString(), trialStart: t.toISOString(), trialEnd: new Date(t.getTime() + TRIAL_MS).toISOString(), invite: rnd(12) };
    S.sessions[sha(tok)] = { kind: 'owner', id, at: t.toISOString() }; save(); setCookie(r, tok);
    console.log(`[signup] owner ${id} room ${room.id} trial to ${S.owners[id].trialEnd}`);
    return json(r, 201, view({ kind: 'owner', o: S.owners[id], tok }));
  }
  if (p === '/start/api/join') {
    if (!limit('jn:' + ip, 20, 36e5)) return json(r, 429, { error: 'Too many joins from here. Try again later.' });
    const code = String(b.code || '').slice(0, 40); const o = Object.values(S.owners).find((x) => x.invite === code);
    if (!o) return json(r, 404, { error: 'This invite link is not valid.' });
    if (!trial(o).active) return json(r, 403, { error: 'This room\'s free trial has ended. Ask the owner to pick a plan.', wall: true });
    const name = cleanName(b.name); if (!name || name.length < 2) return json(r, 400, { error: 'Please enter your name.' });
    const gid = 'g_' + rnd(9), tok = rnd(32); S.guests[gid] = { id: gid, owner: o.id, name, joinedAt: new Date().toISOString() };
    S.sessions[sha(tok)] = { kind: 'guest', id: gid, at: new Date().toISOString() }; save(); setCookie(r, tok);
    console.log(`[signup] guest ${gid} -> owner ${o.id}`); return json(r, 201, view({ kind: 'guest', g: S.guests[gid], o }));
  }
  if (p === '/start/api/new-invite') { const w = who(q, u); if (!w || w.kind !== 'owner') return json(r, 403, { error: 'owner only' }); w.o.invite = rnd(12); save(); return json(r, 200, view(w)); }
  return json(r, 404, { error: 'not found' });
}
function shortcut(q, r, u) {   // Windows/desktop internet shortcut (.url): plain text, opens the browser. Not software.
  const w = who(q, u); const target = ORIGIN + '/start/' + (w ? '?k=' + encodeURIComponent(w.tok) : '');
  const txt = `[InternetShortcut]\r\nURL=${target}\r\nIconFile=${ORIGIN}/favicon.ico\r\nIconIndex=0\r\n`;
  r.writeHead(200, { 'Content-Type': 'application/internet-shortcut', 'Content-Disposition': 'attachment; filename="HubFace.url"', 'Cache-Control': 'no-store' }); r.end(txt);
}
const MANIFEST = JSON.stringify({ name: 'HubFace', short_name: 'HubFace', start_url: '/start/', scope: '/start/', display: 'standalone', background_color: '#0b1020', theme_color: '#0b1020', icons: [{ src: '/app/icon-192-v2.png', sizes: '192x192', type: 'image/png' }, { src: '/app/icon-512-v2.png', sizes: '512x512', type: 'image/png' }] });
const SW = "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());self.addEventListener('fetch',()=>{});";
const PAGE = fs.readFileSync(new URL('./start.html', import.meta.url), 'utf8');
http.createServer(async (q, r) => {
  try {
    const u = new URL(q.url, 'http://x'); const p = u.pathname;
    if (p.startsWith('/start/api/')) return await api(q, r, p, u);
    if (p === '/start/shortcut.url') return shortcut(q, r, u);
    if (p === '/start/manifest.webmanifest') { r.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return r.end(MANIFEST); }
    if (p === '/start/sw.js') { r.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/start/', 'Cache-Control': 'no-cache' }); return r.end(SW); }
    if (p === '/start' ) { r.writeHead(301, { Location: '/start/' + (u.search || '') }); return r.end(); }
    if (p === '/start/' || /^\/start\/j\/[A-Za-z0-9_-]{4,40}$/.test(p)) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); return r.end(PAGE); }
    json(r, 404, { error: 'not found' });
  } catch (e) { console.warn('[signup] error', String(e?.message || e).slice(0, 100)); if (!r.headersSent) json(r, 500, { error: 'server error' }); else r.end(); }
}).listen(PORT, '127.0.0.1', () => console.log(`[signup] ${BUILD} on 127.0.0.1:${PORT}`));
