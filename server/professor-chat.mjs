// professor-chat-20261021a — STAGED, NOT APPLIED. Professor bot brain for POST /api/bots/professor/ask.
// Uses fastpath.mjs relayChat: same XAI key (env only, never logged), same model, SAME persisted $1/day counter + hard cap.
// Body { q, level:'simple'|'standard'|'deep', alt:int, voice:bool, history?:[{role,text}] }
// -> { text (short spoken reply), steps[], check, glossary[{term,def}], build, spentUsd, capUsd }
import { relayChat } from './fastpath.mjs';
export const PROF_BUILD = 'professor-chat-20261021a';
const SYS = `You are the Professor on HubFace (hubface.org), by HingeCraft Global, founded by Dan Diotte. You are a calm, clean-cut, mid-30s male academic with broad general knowledge across subjects: the go-to person everyone brings their general questions to. Scholarly and thoughtful but conversational, like explaining ideas to students. Patient and curious, never condescending; no question is silly. Never claim to have sent, booked or paid anything. If something is medical, legal or financial and high-stakes, explain the general idea and suggest a qualified professional.
Reply with ONLY a JSON object, no markdown: {"say":"spoken answer, plain English, 1-3 sentences, under 55 words","steps":["3-5 short step-by-step points"],"check":"one short check-your-understanding question","glossary":[{"term":"...","def":"one line"}]} (0-3 glossary terms).`;
const LV = { simple: 'Explain like to a curious 12-year-old, everyday analogy.', standard: 'Explain for a smart adult new to the topic.', deep: 'Go deeper: mechanisms, nuance, one caveat. "say" may be up to 80 words.' };
const S = (v, n) => String(v == null ? '' : v).replace(/[*_#`]+/g, '').trim().slice(0, n);
export async function professorAsk(b) {
  const q = S(b && b.q, 800); if (!q) return { status: 400, json: { error: 'q required' } };
  const level = LV[b.level] ? b.level : 'standard', alt = Math.max(0, Math.min(9, +b.alt || 0));
  const msgs = [{ role: 'system', content: SYS + '\nLevel: ' + LV[level] + (alt ? `\nThis is re-explanation #${alt}: use a completely different analogy and angle than before.` : '') }];
  for (const h of (Array.isArray(b.history) ? b.history : []).slice(-6)) msgs.push({ role: h && h.role === 'assistant' ? 'assistant' : 'user', content: S(h && h.text, 500) });
  msgs.push({ role: 'user', content: q });
  const o = await relayChat({ messages: msgs, max_tokens: level === 'deep' ? 380 : 280, temperature: 0.6, from: 'professor' });
  if (o.status !== 200) return { status: o.status === 429 ? 429 : 502, json: { error: o.json && o.json.error || 'model error', build: PROF_BUILD } };
  let d = {}; const raw = String(o.json.text || ''); try { d = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { d = { say: raw }; }
  const steps = (Array.isArray(d.steps) ? d.steps : []).map((x) => S(x, 240)).filter(Boolean).slice(0, 6);
  const glossary = (Array.isArray(d.glossary) ? d.glossary : []).map((g) => ({ term: S(g && g.term, 40), def: S(g && g.def, 160) })).filter((g) => g.term).slice(0, 3);
  return { status: 200, json: { text: S(d.say || steps.join(' '), 600), steps, check: S(d.check, 200), glossary, build: PROF_BUILD, spentUsd: o.json.spentUsd, capUsd: o.json.capUsd } };
}
