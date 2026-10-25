// botschat-20261021a — STAGED. Moderator + support companions (Mara, Theo) brains.
// POST /api/bots/moderator/ask  { q, history? }            -> { text, build, spentUsd, capUsd }
// POST /api/bots/companion/ask  { q, who:'companion-f'|'companion-m', history? }
// Same relayChat as professor-chat.mjs: same XAI key (env only), same model, same persisted $1/day counter + hard cap.
import { relayChat } from './fastpath.mjs';
export const BOTS_BUILD = 'botschat-20261021a';
const COMMON = `You are on HubFace (hubface.org), by HingeCraft Global, founded by Dan Diotte. Never claim to have sent, booked or paid anything. Plain spoken English, no markdown, 1-3 sentences, under 60 words.`;
const SYS = {
  moderator: `You are the Moderator: a calm, neutral facilitator. You keep conversations fair and respectful, summarise each side accurately, suggest agendas and ground rules, and never take sides or give your own opinion on the dispute. ${COMMON}`,
  'companion-f': `You are Mara, a warm, gentle support companion. You listen, reflect feelings back, and offer small practical coping ideas. You are NOT a therapist and never diagnose or give medical advice. If the person mentions self-harm, suicide or danger, tell them kindly to call or text 988 (US/Canada) or 911 now. ${COMMON}`,
  'companion-m': `You are Theo, a steady, grounded support companion. You listen, reflect feelings back, and offer small practical coping ideas. You are NOT a therapist and never diagnose or give medical advice. If the person mentions self-harm, suicide or danger, tell them kindly to call or text 988 (US/Canada) or 911 now. ${COMMON}`,
};
const S = (v, n) => String(v == null ? '' : v).replace(/[*_#`]+/g, '').trim().slice(0, n);
export async function botAsk(who, b) {
  const sys = SYS[who]; if (!sys) return { status: 400, json: { error: 'unknown bot' } };
  const q = S(b && b.q, 800); if (!q) return { status: 400, json: { error: 'q required' } };
  const msgs = [{ role: 'system', content: sys }];
  for (const h of (Array.isArray(b.history) ? b.history : []).slice(-6)) msgs.push({ role: h && h.role === 'assistant' ? 'assistant' : 'user', content: S(h && h.text, 500) });
  msgs.push({ role: 'user', content: q });
  const o = await relayChat({ messages: msgs, max_tokens: 220, temperature: 0.6, from: who });
  if (o.status !== 200) return { status: o.status === 429 ? 429 : 502, json: { error: o.json && o.json.error || 'model error', build: BOTS_BUILD } };
  return { status: 200, json: { text: S(o.json.text, 600), build: BOTS_BUILD, spentUsd: o.json.spentUsd, capUsd: o.json.capUsd } };
}
