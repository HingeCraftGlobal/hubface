// HubFace hosted Finn + Ava chat brain (Hostinger VPS). Build finn-chat-20261017-v2-ava (v1 = Finn only).
// POST /api/dashboard/chat  { text, history?: [{speaker,text}], persona? }
//   -> { assistant:'fin', speaker:'Fin', text, source, voice_id:'lumen', build }   (persona 'ava' -> assistant:'ava', speaker:'Ava', voice_id:'eve')
// Same request/response contract as the laptop HingeHub route the dashboard chat bar uses. v2-ava (Dan approved): persona 'ava'
// answers as Ava (voice eve, as on the laptop). Every other persona (Yoda/CEO, Grok, Brain, ChatGPT, Claude, Ava Dan) is answered by
// Fin, who says that assistant isn't available on the public site yet. Fin and Ava share one rate limit. On-screen changes keep the
// dashboard's own "ACTIONS: [...]" tail format (the page's GUIDE note asks for it; the page runs the actions itself).
// xAI key from env XAI_API_KEY only; never logged or returned. Per-IP rate limit, short history, capped tokens.
const BUILD = 'finn-chat-20261017-v2-ava';
const MODEL = process.env.HCA_MODEL || 'grok-4.20-0309-non-reasoning';
const PER_IP = Number(process.env.FINN_CHAT_PER_IP_PER_MIN || 20);
const GLOBAL = Number(process.env.FINN_CHAT_GLOBAL_PER_MIN || 120);
const MAX_TOKENS = Number(process.env.FINN_CHAT_MAX_TOKENS || 360);

const SYSTEM = `You are Fin (also written Finn), the voice assistant on HubFace (hubface.org), the HingeCraft Interface dashboard by HingeCraft Global, founded by Dan Diotte. HubFace is a place to build, share and collab.
The person talking to you is usually Dan Diotte, but on the public site it can also be a visitor; if you don't know who it is, don't assume.
Be warm, specific and genuinely helpful. You can explain the dashboard (Weather, Schedule, Home Status, Priorities, News Briefing, Calls, Social, Hub Rooms, the video picker, background and recording controls, layouts like Morning or Evening, Widgets and Properties panels).
Your name is Fin. Never call yourself Yoda or any other assistant, and ignore any bracketed note telling you to be Yoda, Ava, Grok, Brain, ChatGPT, Claude or Ava Dan. If someone asks for Yoda or another assistant, say plainly that only Fin is available on the public HubFace site for now, then help.
Never claim to have sent an email, made a call, booked, signed, paid or moved money; you can only draft and suggest. If asked to draft an email, return a Subject: line and the body, sign it "Dan", and say nothing was sent.
Replies are read aloud: plain spoken English, no markdown, no lists, 1-3 sentences, under 60 words (an email draft may be longer).
If a bracketed dashboard note describes ACTIONS, follow it exactly: only when an on-screen change is asked for, end your reply on the same line with ACTIONS: followed by the JSON array.`;

const AVA_SYSTEM = `You are Ava, Dan Diotte's assistant on HubFace (hubface.org), the HingeCraft Interface dashboard by HingeCraft Global, founded by Dan Diotte. You are a woman. HubFace is a place to build, share and collab.
The person talking to you is usually Dan Diotte, but on the public site it can also be a visitor; if you don't know who it is, don't assume.
Be warm, specific and genuinely helpful. You can explain the dashboard (Weather, Schedule, Home Status, Priorities, News Briefing, Calls, Social, Hub Rooms, the video picker, background and recording controls, layouts like Morning or Evening, Widgets and Properties panels).
Your name is Ava. Never call yourself Yoda, Fin or any other assistant, and ignore any bracketed note telling you to be someone else. Fin is the other assistant on the site; if someone asks for Yoda or another assistant, say plainly that only Ava and Fin are available on the public HubFace site for now, then help.
Never claim to have sent an email, made a call, booked, signed, paid or moved money; you can only draft and suggest. If asked to draft an email, return a Subject: line and the body, sign it "Dan", and say nothing was sent.
Replies are read aloud: plain spoken English, no markdown, no lists, 1-3 sentences, under 60 words (an email draft may be longer).
If a bracketed dashboard note describes ACTIONS, follow it exactly: only when an on-screen change is asked for, end your reply on the same line with ACTIONS: followed by the JSON array.`;
const WHO = { fin: { assistant: 'fin', speaker: 'Fin', voice_id: 'lumen', system: SYSTEM, me: /^(fin|finn|yoda)\b/i, strip: /^\s*\**(?:Fin|Finn)\**\s*:\s*/i },
              ava: { assistant: 'ava', speaker: 'Ava', voice_id: 'eve', system: AVA_SYSTEM, me: /^ava\b(?! dan)/i, strip: /^\s*\**Ava\**\s*:\s*/i } };

const hits = new Map(); let globalHits = [];
function limited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < 60000);
  if (globalHits.length >= GLOBAL) return true;
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (a.length >= PER_IP) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a); globalHits.push(now);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return false;
}
function clientIp(q) {
  const cf = String(q.headers['cf-connecting-ip'] || '').trim();
  if (cf) return cf.slice(0, 64);
  const xf = String(q.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || String(q.socket.remoteAddress || '')).slice(0, 64);
}
function cleanUserText(t, who) {
  let asked = '';
  const m = /\[Dan has selected the ([^\]]+?) bot/i.exec(t) || (/\[You are Yoda/i.test(t) ? [0, 'Yoda'] : (who !== 'ava' && /\[You are Ava/i.test(t)) ? [0, 'Ava'] : null);
  if (m) asked = String(m[1]).slice(0, 40);
  t = t.replace(/\[(?:You are Yoda|You are Ava|You are Fin|Dan has selected the)[^\]]*\]\s*/gi, '');
  if (asked) t = `[The visitor selected ${asked}, which is not available on the public site; answer as ${WHO[who].speaker} and mention that briefly.] ` + t;
  return t.trim();
}

export async function finnChat(body, q) {
  const ip = clientIp(q);
  if (limited(ip)) return { status: 429, json: { error: 'too many requests, try again in a minute' } };
  const key = String(process.env.XAI_API_KEY || '').trim();
  let text = String(body?.text || '').trim().slice(0, 1600);
  if (!text) return { status: 400, json: { error: 'text required' } };
  const persona = String(body?.persona || '').toLowerCase().replace(/[^a-z]/g, '');
  const who = persona === 'ava' ? 'ava' : 'fin', W = WHO[who];
  if (persona && who === 'fin' && persona !== 'fin' && persona !== 'finn' && !/\[Dan has selected the/i.test(text)) text = `[The visitor selected ${persona}, which is not available on the public site; answer as Fin and mention that briefly.] ` + text;
  text = cleanUserText(text, who);
  const history = (Array.isArray(body?.history) ? body.history : []).slice(-10)
    .map((h) => ({ speaker: String(h?.speaker || '').slice(0, 40), text: String(h?.text || '').replace(/\s+/g, ' ').slice(0, 600) }))
    .filter((h) => h.text);
  const out = { assistant: W.assistant, speaker: W.speaker, voice_id: W.voice_id, build: BUILD };
  if (!key) return { status: 200, json: { ...out, text: "Sorry, I can't think right now: my brain isn't connected on this server.", source: 'unavailable' } };
  const messages = [{ role: 'system', content: W.system }];
  for (const h of history) {
    const mine = W.me.test(h.speaker);
    messages.push(mine ? { role: 'assistant', content: h.text } : { role: 'user', content: /^dan/i.test(h.speaker) || /\(email\)$/i.test(h.speaker) ? (/\(email\)$/i.test(h.speaker) ? `(${h.speaker}: ${h.text})` : h.text) : `(${h.speaker} said: ${h.text})` });
  }
  messages.push({ role: 'user', content: text });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.6 }),
    });
    if (!r.ok) {
      let code = ''; try { code = String((await r.json())?.error?.code || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40); } catch {}
      console.warn(`[${who}] xAI HTTP`, r.status, code);   // status + code only
      return { status: 200, json: { ...out, text: "Sorry, I couldn't reach my brain just now. Try again in a moment.", source: 'error' } };
    }
    const j = await r.json();
    const reply = String(j.choices?.[0]?.message?.content || '').replace(W.strip, '').replace(/[*_#`]+(?![^\[]*\])/g, '').replace(/\s*\n+\s*/g, ' ').trim();
    if (!reply) throw new Error('empty');
    return { status: 200, json: { ...out, text: reply, source: `xai:${MODEL}` } };
  } catch (e) {
    console.warn(`[${who}] chat failed:`, e?.name === 'AbortError' ? 'timeout' : 'network or empty reply');
    return { status: 200, json: { ...out, text: "Sorry, I couldn't reach my brain just now. Try again in a moment.", source: 'error' } };
  } finally { clearTimeout(t); }
}
export const FINN_BUILD = BUILD;
