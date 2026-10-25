// HubFace hosted wrapper (Hostinger VPS). Build vps-20261017-v1.
// Wraps an UNMODIFIED copy of the laptop server.mjs. Adds, on the hosted site only:
//   POST /api/tts, GET /api/tts/status  (xAI /v1/tts, same as HingeHub's handler; key from env, never logged/returned)
//   GET  /api/yt-search, GET /api/health, GET /api/contacts (empty)  (small hosted equivalents)
//   /engine/callbridge/*  -> 503 "not available on hosted site" (call bridge is laptop-only)
//   any other path the laptop proxied to HingeHub :3456 -> 503 JSON (HingeHub stays on the laptop / rooms.hubface.org)
//   Response header X-HubFace-Host: hostinger-vps (marker to prove where a response came from)
import http from 'node:http';
process.env.HCA_UPSTREAM_PORT = process.env.HCA_UPSTREAM_PORT || '1'; // nothing listens there: original proxy() never reached anyway
const { createServer } = await import('./server.mjs');
const { finnChat, FINN_BUILD } = await import('./finn-chat.mjs'); // finn-chat-20261017-v1: POST /api/dashboard/chat (Finn only)
const { botAsk, BOTS_BUILD } = await import('./bots-chat.mjs'); // botschat-20261021a: Moderator + Mara/Theo (shared $1/day cap)
const { professorAsk, PROF_BUILD } = await import('./professor-chat.mjs'); // professor-20261021a: POST /api/bots/professor/ask (shared $1/day cap)
const { dashChat, DASH_CHAT_BUILD } = await import('./dash-chat.mjs'); // dash-chat-20261017-v3 (Dan approved): faithful port of the laptop /api/dashboard/chat (Fin, Ava, Grok, Brain, Ava Dan)
const { accountsRoute, internalRoute } = await import('./accounts.mjs'); // accounts-20261017-v1 (Dan approved): /api/account/* + /api/stripe/webhook, SQLite in /var/lib/hubface
const { layoutRoute } = await import('./layouts.mjs'); // layouts-20261017-v1 (Dan approved): GET/PUT /api/account/layout, per-account dashboard layouts
const { homePlanRoute } = await import('./homeplan.mjs'); // homeplan-20261024a (Dan approved 2026-10-24): GET/PUT /api/account/home-plan + history
const { savedRoomsRoute } = await import('./savedrooms.mjs'); // savedrooms-20261019a: GET/PUT /api/account/saved-rooms, per-account Hub Rooms saves
const { vaultRoute } = await import('./vault.mjs'); // vault-20261018-v2 (Dan approved): /api/vault/*, /vault/, /vault-export.js
const { inviteRoute } = await import('./invite-mail.mjs'); // inappsend-20261018-v1 (Dan approved): POST /api/invite/email (members only), GET /api/invite/email/status
const { roomsRoute, sessionUser, clientIp } = await import('./rooms.mjs'); // roomid-20261018a (Dan approved): POST /api/rooms, GET /api/rooms/<ID>, POST /api/rooms/<ID>/name; /var/lib/hubface/rooms.db
const { isRoomVoicePath, roomVoiceUpgrade, roomVoiceHealth } = await import('./roomvoice.mjs'); // roomvoice-20261022a (Dan approved Oct 22): native-audio room voice, WSS /api/room-voice
const { roomLiveUpgrade, roomSayRoute, externalHook } = await import('./roomserver.mjs'); // roomserver-20261018a (Dan approved): WebSocket /api/room-live (presence, chat, WebRTC signaling)
const { chatRelayRoute, isChatRelayPath, relayTake, initChatRelay } = await import('./chatrelay.mjs'); { const rs = await import('./roomserver.mjs'); initChatRelay({ roomPushChat: rs.roomPushChat, botFrom: rs.botFrom }); rs.setRelayTap(relayTake); }   // chatrelay-20261020a
const { textOnlyRoute, isTextOnlyPath } = await import('./textonly.mjs'); // textonly-20261020a (Dan approved): standalone text-only Yoda bridge, no TTS
const { bridgeRoute, bridgeUpgrade, isBridgePath, bridgeHealth } = await import('./bridge.mjs'); // bridge-20261019a (Dan approved): HingeCraft bridge gateway v0.1, JSON-RPC over WSS /api/rooms/<ID>/bridge
const { relayChat, relayTts, fastReply, chargeTts, fastInfo, canSpend } = await import('./fastpath.mjs'); // fastvoice-20261019a: + HF-room fast path for NR rooms // roomrelay-20261019a (Dan approved Oct 19): capped Yoda text + voice relay for HingeHub on the internal port
const { userDataRoute, isUserDataPath } = await import('./userdata.mjs'); // userdata-20261019a (Dan approved via Yoda): GET /api/account/email-feed, GET/PUT /api/account/priorities (per-account, session + rate limit)
const { seatcardRoute, isSeatcardPath } = await import('./seatcard-api.mjs'); // seatcard-api-20261023a (Dan approved Oct 23 3:43 PM ET): GET/PUT /api/account/seatcard
const { yodaLineRoute, isYodaLinePath } = await import("./yodaline.mjs"); /*yodaline-20261024*/
const inner = createServer().listeners('request')[0];
const PORT = Number(process.env.HCA_PORT || 3470);
const VBUILD = 'vps-20261017-v1';
const key = () => String(process.env.XAI_API_KEY || '').trim();
const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); r.end(JSON.stringify(o)); };
const readBody = (q) => new Promise((res, rej) => { let n = 0; const ch = []; q.on('data', (c) => { n += c.length; if (n > 1e6) { rej(new Error('too large')); q.destroy(); } else ch.push(c); }); q.on('end', () => res(Buffer.concat(ch))); q.on('error', rej); });
let ttsCalls = [];
const S = (v, n = 400) => String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, n);
async function ytSearch(query) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&sp=EgIQAQ%253D%253D', { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' } });
    if (!res.ok) throw new Error('http_' + res.status);
    const html = (await res.text()).slice(0, 3 * 1024 * 1024);
    const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/); const out = [];
    const walk = (n, d = 0) => { if (!n || d > 40 || out.length >= 8 || typeof n !== 'object') return; if (Array.isArray(n)) { for (const x of n) walk(x, d + 1); return; }
      const v = n.videoRenderer; if (v && /^[\w-]{11}$/.test(String(v.videoId || ''))) { out.push({ id: v.videoId, title: S(v.title?.runs?.map((x) => x.text).join('') || v.title?.simpleText, 160), channel: S(v.ownerText?.runs?.[0]?.text, 80), length: S(v.lengthText?.simpleText, 12) }); return; }
      for (const k of Object.keys(n)) walk(n[k], d + 1); };
    if (m) { try { walk(JSON.parse(m[1])); } catch {} }
    if (!out.length) for (const x of html.matchAll(/"videoId":"([\w-]{11})"/g)) { if (!out.some((o) => o.id === x[1])) out.push({ id: x[1], title: '', channel: '', length: '' }); if (out.length >= 8) break; }
    return out;
  } finally { clearTimeout(t); }
}
const ttsOnce = async (text, voiceId) => {   // roomserver-20261018a phase 2: one xAI TTS call per POST /api/rooms/<ID>/say (same upstream + 60/min limit as /api/tts; key never returned)
  if (!key()) return { error: 'tts key missing' };
  const now = Date.now(); ttsCalls = ttsCalls.filter((x) => now - x < 60000); if (ttsCalls.length >= 60) return { error: 'tts rate limit' }; ttsCalls.push(now);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const up = await fetch('https://api.x.ai/v1/tts', { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice_id: voiceId, language: 'en' }) });
    if (!up.ok) { console.warn('[vps] say tts upstream', up.status); return { error: `tts ${up.status}` }; }
    return { buf: Buffer.from(await up.arrayBuffer()), type: up.headers.get('content-type') || 'audio/mpeg' };
  } catch { return { error: 'tts unreachable' }; } finally { clearTimeout(t); }
};
const OWN = (p) => p === '/' || p === '/interface' || p.startsWith('/interface/') || p === '/assistants/agent.js' || p.startsWith('/api/assistant/');
http.createServer(async (q, r) => {
  r.setHeader('X-HubFace-Host', 'hostinger-vps');
  const u = new URL(q.url, 'http://127.0.0.1'); const p = u.pathname;
  try {
    if ((p === '/api/vault' || p.startsWith('/api/vault/') || p === '/vault' || p === '/vault/' || p === '/vault/vault.js' || p === '/vault-export.js') && await vaultRoute(q, r, p, u)) return;   // vault-20261018-v2
    if (p.startsWith('/api/invite/') && await inviteRoute(q, r, p)) return;   // inappsend-20261018-v1
    if (isTextOnlyPath(p) && await textOnlyRoute(q, r, p, u, { readBody, json })) return;   // textonly-20261020a
    if (isChatRelayPath(p) && await chatRelayRoute(q, r, p, u, { readBody, json })) return;   // chatrelay-20261020a
    if (p.startsWith('/api/rooms/') && /\/(say|listen|say-audio\/[0-9a-f]{32})$/.test(p) && await roomSayRoute(q, r, p, { readBody, json, tts: ttsOnce })) return;   // roomserver-20261018a phase 2: Yoda voice; yodahear-20261018a: /listen
    if (p.startsWith('/api/rooms/') && /\/(bridge-invite|bots|bridge-turn)$/.test(p) && await bridgeRoute(q, r, p, { readBody, json })) return;   // bridge-20261019a
    if (p === '/api/room-voice/health') return json(r, 200, roomVoiceHealth());   // roomvoice-20261022a
    if (p === '/api/bridge/health') return json(r, 200, bridgeHealth());   // bridge-20261019a
    if ((p === '/api/rooms' || p.startsWith('/api/rooms/')) && await roomsRoute(q, r, p)) return;   // roomid-20261018a
    if (isYodaLinePath(p) && await yodaLineRoute(q, r, p, u, { who: sessionUser, readBody, json })) return;   /*yodaline-20261024*/
    if (isUserDataPath(p) && await userDataRoute(q, r, p, { who: sessionUser, readBody, json, ip: clientIp })) return;   // userdata-20261019a
    if (isSeatcardPath(p) && await seatcardRoute(q, r, p, { who: sessionUser, readBody, json, ip: clientIp })) return;   // seatcard-api-20261023a
    if (p === '/api/account/layout' && await layoutRoute(q, r, p)) return;   // layouts-20261017-v1
    if ((p === '/api/account/home-plan' || p.startsWith('/api/account/home-plan/')) && await homePlanRoute(q, r, p)) return;   // homeplan-20261024a
    if (p === '/api/account/saved-rooms' && await savedRoomsRoute(q, r, p)) return;   // savedrooms-20261019a
    if ((p.startsWith('/api/account/') || p === '/api/stripe/webhook') && await accountsRoute(q, r, p)) return;
    if (p === '/api/tts' && q.method === 'POST') {
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return json(r, 400, { error: 'bad json' }); }
      const text = String(b.text || '').trim().slice(0, 2000); if (!text) return json(r, 400, { error: 'text required' });
      const voiceId = String(b.voice_id || 'liora').replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'liora';
      if (!key()) return json(r, 503, { error: 'XAI_API_KEY not set — Grok TTS unavailable' });
      if (!canSpend(text.length)) return json(r, 429, { error: 'daily-cap' });   // voice4-20261021a: /api/tts now counts toward the shared $1/day xAI cap
      const now = Date.now(); ttsCalls = ttsCalls.filter((x) => now - x < 60000); if (ttsCalls.length >= 60) return json(r, 429, { error: 'too many requests' }); ttsCalls.push(now);
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      try {
        const up = await fetch('https://api.x.ai/v1/tts', { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice_id: voiceId, language: 'en' }) });
        if (!up.ok) { console.warn('[vps] tts upstream', up.status); return json(r, up.status, { error: `Grok TTS failed (${up.status})` }); }
        const buf = Buffer.from(await up.arrayBuffer()); chargeTts(text.length);   // voice4-20261021a
        r.writeHead(200, { 'Content-Type': up.headers.get('content-type') || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Yoda-Voice': voiceId, 'Content-Length': buf.length }); return r.end(buf);
      } catch (e) { console.warn('[vps] tts error', e?.name === 'AbortError' ? 'timeout' : 'fetch failed'); return json(r, 502, { error: 'Grok TTS unreachable' }); }
      finally { clearTimeout(t); }
    }
    if (p === '/api/tts/status') return json(r, 200, { ok: !!key(), endpoint: 'https://api.x.ai/v1/tts', host: 'hostinger-vps' });
    if (p === '/api/health') return json(r, 200, { ok: true, host: 'hostinger-vps', build: VBUILD, key: key() ? 'loaded' : 'missing', finn: FINN_BUILD, chat: DASH_CHAT_BUILD });
    if (p === '/api/contacts') return json(r, 200, { source: 'hosted site (no address book)', contacts: [] });
    if (p === '/api/yt-search' && q.method === 'GET') {
      const query = String(u.searchParams.get('q') || '').trim().slice(0, 120); if (!query) return json(r, 400, { error: 'empty' });
      try { return json(r, 200, { q: query, results: await ytSearch(query) }); } catch { return json(r, 502, { error: 'search_failed' }); }
    }
    if ((p === '/api/bots/moderator/ask' || p === '/api/bots/companion/ask') && q.method === 'POST') {   // botschat-20261021a: capped by fastpath $1/day counter
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return json(r, 400, { error: 'bad json' }); }
      const who = p === '/api/bots/moderator/ask' ? 'moderator' : String(b.who || '');
      const o = await botAsk(who, b); return json(r, o.status, o.json);
    }
    if (p === '/api/bots/professor/ask' && q.method === 'POST') {   // professor-20261021a (Dan approved Oct 21): capped by fastpath $1/day counter
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return json(r, 400, { error: 'bad json' }); }
      const o = await professorAsk(b); return json(r, o.status, o.json);
    }
    if (p === '/api/dashboard/chat' && q.method === 'POST') {   // finn-chat-20261017-v1 (Dan approved): Finn's chat brain on the hosted site
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { return json(r, 400, { error: 'bad json' }); }
      const o = await dashChat(b, q); return json(r, o.status, o.json);   // v3: laptop port (was finnChat)
    }
    if (p.startsWith('/engine/callbridge/')) return json(r, 503, { ok: false, state: 'unavailable', error: 'not available on hosted site (call bridge runs on the laptop only)' });
    if (OWN(p)) return inner(q, r);
    return json(r, 503, { error: 'not available on hosted site', path: p.slice(0, 80) });
  } catch (e) { console.warn('[vps] error', String(e?.message || e).slice(0, 120)); if (!r.headersSent) json(r, 500, { error: 'server error' }); else r.end(); }
}).on('upgrade', (q, sock, head) => { try { if (isBridgePath(q.url)) return bridgeUpgrade(q, sock, head); if (isRoomVoicePath(q.url)) return roomVoiceUpgrade(q, sock, head); roomLiveUpgrade(q, sock, head); } catch (e) { console.warn('[vps] upgrade error', String(e?.message || e).slice(0, 120)); try { sock.destroy(); } catch {} } })   // roomserver-20261018a
  .listen(PORT, '127.0.0.1', () => console.log(`[vps] ${VBUILD} on 127.0.0.1:${PORT} (dash ${process.env.HCA_DASH_DIR}; xAI key ${key() ? 'loaded' : 'MISSING'})`));
// memberauth-20261018-v1 (Dan approved): internal-only bridge for HingeHub (rooms.hubface.org) member sign-in; loopback only, not in nginx.
const IPORT = Number(process.env.HCA_INTERNAL_PORT || 3471);
async function relayRoute(q, r) {   // roomrelay-20261019a: POST /internal/llm, /internal/tts (loopback port only; shared $1/day cap in fastpath.mjs)
  const ip = new URL(q.url, 'http://127.0.0.1').pathname; if (q.method !== 'POST' || (ip !== '/internal/llm' && ip !== '/internal/tts' && ip !== '/internal/yoda-hook' && ip !== '/internal/yoda-fast')) return false;
  let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}'); } catch { json(r, 400, { error: 'bad json' }); return true; }
  if (ip === '/internal/yoda-hook') { const o = await externalHook(b); json(r, o.status, o.json); return true; }   // yodahook-20261019a (HingeHub NR rooms)
  if (ip === '/internal/yoda-fast') {   // fastvoice-20261019a (Dan's order): NR-room Yoda lines get yesterday's HF-room fast reply (fastpath.mjs). Model cost goes on the SAME $1/day counter here; voice chars when HingeHub renders via /internal/tts.
    const S2 = (v, n) => String(v == null ? '' : v).slice(0, n);
    const item = { room: S2(b.room, 40), from: S2(b.from, 80), text: S2(b.text, 600), at: Date.now(), last_yoda: S2(b.last_yoda, 400),
      recent: (Array.isArray(b.recent) ? b.recent : []).slice(-8).map((e) => ({ from: S2(e && e.from, 80), role: S2(e && e.role, 20), text: S2(e && e.text, 200) })) };
    if (!/^NR-\d{4}-\d{4}$/.test(item.room)) { json(r, 400, { error: 'bad room' }); return true; }
    let o; try { o = await fastReply(item, { humans: Math.max(1, Math.min(20, +b.humans || 1)), afterYoda: !!b.afterYoda }); } catch (e) { o = { skip: 'error' }; }
    if (o && o.text) { chargeTts(0, o.usd); const fi = fastInfo(); console.log(`[vps] yoda fast NR ${item.room} (${o.why}${o.needsAction ? ', task' : ''}) model ${o.ms}ms cost $${(o.usd || 0).toFixed(5)} today $${fi.spentUsd.toFixed(4)}/${fi.capUsd.toFixed(2)}`); json(r, 200, { text: o.text, ms: o.ms, why: o.why, task: !!o.needsAction }); return true; }
    console.log(`[vps] yoda fast NR ${item.room} skip ${(o && o.skip) || '?'}`); json(r, 200, { skip: (o && o.skip) || 'none' }); return true;
  }
  if (ip === '/internal/llm') { const o = await relayChat(b); json(r, o.status, o.json); return true; }
  const o = await relayTts(b); if (o.buf) { r.writeHead(200, { 'Content-Type': o.type || 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Yoda-Voice': o.voice, 'Content-Length': o.buf.length }); r.end(o.buf); return true; }
  json(r, o.status || 502, { error: o.error || 'tts failed' }); return true;
}
http.createServer(async (q, r) => { try { if (await relayRoute(q, r)) return; } catch (e) { console.warn('[vps] relay error', String(e?.message || e).slice(0, 120)); if (!r.headersSent) json(r, 500, { error: 'server error' }); else r.end(); return; } internalRoute(q, r).catch((e) => { console.warn('[vps] internal error', String(e?.message || e).slice(0, 120)); if (!r.headersSent) json(r, 500, { error: 'server error' }); else r.end(); }); })
  .listen(IPORT, '127.0.0.1', () => console.log(`[vps] member bridge on 127.0.0.1:${IPORT}`));
