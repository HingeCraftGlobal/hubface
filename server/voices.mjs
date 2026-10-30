// voicetype-20261029 (Dan, voice call Oct 29): card Type + Voice, and per-room seat voices. Pure helpers, no side effects.
export const VOICES = ['altair','ara','atlas','aurora','carina','castor','celeste','cosmo','eve','helios','helix','iris','kepler','leo','liora','lumen','luna','lux','naksh','orion','perseus','rex','rigel','sal','sirius','ursa','zagan','zenith']; // xAI GET /v1/tts/voices, fetched 2026-10-29
export const BOT_TYPES = ['Sales','Marketing','Operations','Engineering','Legal','Research','Story','Studio','Other'];
export function cleanVoice(v) { const k = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24); return VOICES.includes(k) ? k : ''; }
export function cleanType(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40); }
export function typeLabel(c) { return cleanType(c && c.type) || (c && c.kind === 'bot' ? 'Bot' : 'Person'); }
export function defaultVoice(name) { return /licorice/i.test(String(name || '')) ? 'iris' : 'liora'; }
export function voicesMap(cards) { const o = {}; for (const c of cards || []) { const n = String(c && c.name || '').trim().toLowerCase(); const v = cleanVoice(c && c.voice); if (n && v && !o[n]) o[n] = v; } return o; }
export function pickVoice(map, bot) { const n = String(bot || '').trim().toLowerCase(); const v = map && n ? cleanVoice(map[n]) : ''; return v || defaultVoice(n); }
