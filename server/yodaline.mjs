// yodaline-20261024: HubFace direct line for Yoda (Dan approved Oct 24). Mirrors Brain OS /api/agent/ui + /api/ui/next.
//   POST /api/agent/hf/cmd    (Bearer token from /opt/hubface/data/yoda-agent.token) -> queue a command for the owner's pages
//   GET  /api/agent/hf/state  (Bearer)  -> latest page snapshot + recent command results
//   GET  /api/hf/ui/next?since=N  (owner session only) -> pending commands (expire after 30s)
//   POST /api/hf/ui/state         (owner session only) -> page posts snapshot / results
import fs from 'node:fs'; import crypto from 'node:crypto';
const TOKF = process.env.HF_YODA_TOKEN_FILE || '/opt/hubface/data/yoda-agent.token';
const OWNER_IDS = String(process.env.HF_YODA_OWNER_IDS || '14').split(',').map((s) => s.trim()).filter(Boolean);
const Q = { seq: 0, cmds: [] }; let STATE = { at: 0, pages: {} }; const RES = [];
const tok = () => { try { return fs.readFileSync(TOKF, 'utf8').trim(); } catch { return ''; } };
const agentOK = (q) => { const t = tok(), h = String(q.headers.authorization || ''); if (!t || !h.startsWith('Bearer ')) return false; const a = Buffer.from(h.slice(7).trim()), b = Buffer.from(t); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const OPS = ['click', 'type', 'set', 'toggle', 'resize', 'scroll', 'key', 'list', 'focus', 'hover', 'reload'];
export const isYodaLinePath = (p) => p === '/api/agent/hf/cmd' || p === '/api/agent/hf/state' || p === '/api/hf/ui/next' || p === '/api/hf/ui/state';
export async function yodaLineRoute(q, r, p, u, { who, readBody, json }) {
  const body = async () => { try { return JSON.parse((await readBody(q)).toString('utf8') || '{}') || {}; } catch { return null; } };
  if (p === '/api/agent/hf/cmd' || p === '/api/agent/hf/state') {
    if (!agentOK(q)) { json(r, 401, { error: 'unauthorized' }); return true; }
    if (p === '/api/agent/hf/state') { json(r, 200, { state: STATE, results: RES.slice(-20), queued: Q.cmds.length, seq: Q.seq }); return true; }
    if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
    const b = await body(); if (!b || !OPS.includes(b.op)) { json(r, 400, { error: 'bad command', ops: OPS }); return true; }
    const c = { n: ++Q.seq, at: Date.now(), op: b.op };
    for (const k of ['target', 'text', 'value', 'key', 'frame']) if (b[k] != null) c[k] = String(b[k]).slice(0, 2000);
    for (const k of ['scale', 'width', 'height', 'dx', 'dy', 'index']) if (b[k] != null && isFinite(+b[k])) c[k] = +b[k];
    Q.cmds.push(c); Q.cmds = Q.cmds.filter((x) => Date.now() - x.at < 30000).slice(-50); json(r, 200, c); return true;
  }
  const me = who(q); if (!me || !OWNER_IDS.includes(String(me.id))) { json(r, 403, { error: 'owner only' }); return true; }
  if (p === '/api/hf/ui/next') { const since = +(u.searchParams.get('since') ?? -1); const now = Date.now();
    json(r, 200, { seq: Q.seq, cmds: since < 0 ? [] : Q.cmds.filter((c) => c.n > since && now - c.at < 30000) }); return true; }
  if (q.method !== 'POST') { json(r, 405, { error: 'POST only' }); return true; }
  const b = await body(); if (!b) { json(r, 400, { error: 'bad json' }); return true; }
  const page = String(b.page || 'page').slice(0, 40);
  if (b.snapshot) { STATE.pages[page] = { at: Date.now(), url: String(b.url || '').slice(0, 300), title: String(b.title || '').slice(0, 200), controls: Array.isArray(b.snapshot) ? b.snapshot.slice(0, 600) : [] }; STATE.at = Date.now(); }
  if (b.result) { RES.push({ at: Date.now(), page, ...b.result }); if (RES.length > 100) RES.splice(0, RES.length - 100); }
  json(r, 200, { ok: true }); return true;
}
