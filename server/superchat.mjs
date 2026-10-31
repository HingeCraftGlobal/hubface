/* superchat-20261029s (Dan, Oct 29-30 2026, STAGED): text-only Bot Room "Super Chat". Yoda and Licorice trade turns on a topic Dan writes.
   - Start (owner only, via accounts.mjs route POST /api/account/botmeter/superchat {action:'start', bots:[...], topic}) saves the topic and sends turn 1.
   - Each turn goes to ONE bot's webhook with a server-minted, single-forward reply link (same HMAC as yoda-reply, nonce remembered here).
     When that bot replies through the link, the reply is saved/shown as usual, then forwarded to the OTHER bot as the next turn.
   - Stops at TURN_CAP, on Stop, on any line Dan sends (his line then goes the normal way), at HOURLY_CAP, or if a turn gets no reply in TURN_WAIT_MS.
   - On cap or Stop, Yoda gets one 'botroom.superchat_summary' event and posts a short executive summary through its own link.
   - Every Super Chat line is tagged in br_owner_chat.hook as superchat:<scid>:start | :t<n>/<max> | :summary | :late.
   No model calls or spend on this server: turns are handled by the bots' own agents. Roll back: remove the superchat lines in accounts.mjs. */
export const TURN_CAP = 12, HOURLY_CAP = 60, TURN_WAIT_MS = 180e3, REPLY_MS = 600e3, TOPIC_MAX = 1500;
export const CONNECTED = ['Yoda', 'Licorice'];   // only these two have webhooks today; any other seat is "not connected"
export function makeSuperChat(d) {
  // d: { ins(room,uid,from,to,role,text,at)->id, hook(tag,id), push(room,msg,seat), sig(room,exp,n), yodaHook(body), licHook(body), recent(room), now(), hex(), base, log }
  const now = d.now || Date.now, log = d.log || (() => {}), rooms = new Map(), links = new Map(), hourly = [];
  const st = (room) => rooms.get(room) || null;
  function view(s) { return s ? { id: s.id, state: s.state, turn: s.turn, max: s.max, bots: s.bots, next: s.next, topic: s.topic, startedAt: s.startedAt, endedWhy: s.why || null } : { state: 'none' }; }
  function sys(room, text, tag) { const t = now(); const id = d.ins(room, null, 'Super Chat', 'room', 'system', text, t); d.hook(tag, id); d.push(room, { id, from: 'Super Chat', to: 'room', role: 'system', text, at: t, superchat: true }, null); return id; }
  function link(room, who, kind, s, turn) { const t = now(), exp = t + REPLY_MS, n = d.hex(); const sg = d.sig(room, exp, n); if (!sg) return null;
    links.set(n, { room, who, kind, sc: s.id, turn, exp, used: false });
    for (const [k, v] of links) if (v.exp < t) links.delete(k);
    return { n, exp, url: `${d.base}/api/account/botmeter/yoda-reply?room=${room}&exp=${exp}&n=${n}&sig=${sg}` + (who === 'Licorice' ? '&as=licorice' : '') }; }
  async function sendTurn(room, s, text) {
    const t = now(); while (hourly.length && t - hourly[0] > 3600e3) hourly.shift();
    if (hourly.length >= HOURLY_CAP) return end(room, s, 'hourly_cap', true);
    const who = s.next, turn = s.turn + 1, L = link(room, who, 'turn', s, turn); if (!L) return end(room, s, 'no_reply_key', false);
    s.turn = turn; hourly.push(t); clearTimeout(s.timer); s.timer = setTimeout(() => { const c = st(room); if (c === s && s.state === 'running' && s.turn === turn) end(room, s, 'no_reply', true); }, TURN_WAIT_MS); if (s.timer.unref) s.timer.unref();
    const other = s.bots.find((b) => b !== who) || '';
    const body = { event: 'botroom.superchat_turn', room, roomName: 'Bot Room ' + room, from: turn === 1 ? s.owner : other, role: turn === 1 ? 'host' : 'bot', to: who, source: 'botroom', at: t, text,
      superchat_turn: { id: s.id, turn, max: s.max, of: `${turn}/${s.max}`, topic: s.topic, bots: s.bots, partner: other, last: turn >= s.max, started_by: s.owner },
      instructions: `Super Chat turn ${turn} of ${s.max} with ${other} about the topic. Reply ONCE through the reply link: 1-4 short sentences, on topic, building on ${other}'s last line. Address ${other}, not ${s.owner}. No spending, sending, or outside actions. ${s.owner} can stop it any time.`,
      reply: L.url, reply_expires: L.exp, reply_body: '{"text":"..."}', recent: d.recent(room), needs_action: false };
    log(`[superchat] ${room} ${s.id} turn ${turn}/${s.max} -> ${who}`);
    let o = null; try { o = await (who === 'Licorice' ? d.licHook(body) : d.yodaHook(body)); } catch (e) { o = { status: 'error' }; }
    s.lastHook = o && o.status; if (!(o && /^2\d\d$/.test(String(o.status)))) { if (st(room) === s && s.state === 'running') end(room, s, 'hook_' + (o && o.status || 'error'), false); }
    return view(s); }
  async function summary(room, s) {
    if (!s.bots.includes('Yoda')) return;
    const L = link(room, 'Yoda', 'summary', s, s.turn); if (!L) return; s.state = 'summary';
    const body = { event: 'botroom.superchat_summary', room, roomName: 'Bot Room ' + room, from: 'Super Chat', role: 'system', to: 'Yoda', source: 'botroom', at: now(),
      text: `Super Chat ended (${s.why}, ${s.turn} turns). Post ONE short executive summary for ${s.owner}: what we found, what we will do next, anything that needs ${s.owner}'s decision.`,
      superchat_turn: { id: s.id, turn: s.turn, max: s.max, topic: s.topic, bots: s.bots, summary: true }, transcript: s.log.slice(-40), reply: L.url, reply_expires: L.exp, reply_body: '{"text":"..."}', needs_action: false };
    try { await d.yodaHook(body); } catch (e) {} }
  function end(room, s, why, sum) { if (!s || s.state !== 'running') return view(s); clearTimeout(s.timer); s.state = 'ended'; s.why = why; s.endedAt = now();
    sys(room, `Super Chat ended (${why.replace(/_/g, ' ')}) after ${s.turn} of ${s.max} turns.`, `superchat:${s.id}:end`); log(`[superchat] ${room} ${s.id} end ${why}`);
    if (sum) { summary(room, s).catch(() => {}); } return view(s); }
  return {
    status(room) { return view(st(room)); },
    active(room) { const s = st(room); return !!(s && (s.state === 'running')); },
    async start(room, { bots, topic, owner, uid }) {
      const c = st(room); if (c && c.state === 'running') return { error: 'already_running', status: view(c) };
      const B = [...new Set((Array.isArray(bots) ? bots : []).map((x) => String(x || '').trim()))].map((x) => CONNECTED.find((k) => k.toLowerCase() === x.toLowerCase()) || x);
      const off = B.filter((x) => !CONNECTED.includes(x)), on = CONNECTED.filter((x) => B.includes(x));
      if (on.length !== 2) return { error: 'pick_yoda_and_licorice', not_connected: off };
      const T = String(topic || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, TOPIC_MAX); if (T.length < 3) return { error: 'topic_required' };
      const s = { id: 'SC' + now().toString(36) + d.hex().slice(0, 4), room, bots: on, topic: T, owner: owner || 'Owner', turn: 0, max: TURN_CAP, next: on[0], state: 'running', startedAt: now(), log: [] };
      rooms.set(room, s);
      const t = now(), tid = d.ins(room, uid || null, s.owner, on.join(' + '), 'owner', 'Super Chat topic: ' + T, t); d.hook(`superchat:${s.id}:start`, tid);
      d.push(room, { id: tid, from: s.owner, to: on.join(' + '), role: 'owner', text: 'Super Chat topic: ' + T, at: t, superchat: true }, null);
      s.log.push({ from: s.owner, text: T });
      await sendTurn(room, s, T); return { ok: true, status: view(s), not_connected: off }; },
    stop(room, why) { const s = st(room); if (!s || s.state !== 'running') return view(s); return end(room, s, why || 'stopped', true); },
    interrupt(room) { const s = st(room); if (s && s.state === 'running') end(room, s, 'owner_line', false); },
    // called by yoda-reply AFTER the line is saved and pushed. Returns true if the nonce belonged to a Super Chat.
    async onReply(room, n, who, text, id) {
      const L = links.get(n); if (!L || L.room !== room) return false; const s = st(room);
      if (L.used || !s || s.id !== L.sc) { d.hook(`superchat:${L.sc}:late`, id); return true; }
      L.used = true;
      if (L.kind === 'summary') { d.hook(`superchat:${s.id}:summary`, id); if (s.state === 'summary') s.state = 'ended'; return true; }
      d.hook(`superchat:${s.id}:t${L.turn}/${s.max}`, id);
      if (s.state !== 'running' || L.turn !== s.turn || L.who !== who) return true;   // stopped meanwhile, stale, or wrong bot: saved, not forwarded
      s.log.push({ from: who, text });
      if (s.turn >= s.max) { end(room, s, 'turn_cap', true); return true; }
      s.next = s.bots.find((b) => b !== who); await sendTurn(room, s, text); return true; },
    _links: links, _rooms: rooms };
}
