// Fill card-template.html from a registered card record. Used by passport-register.mjs (GET /passport/card/:id).
import fs from 'node:fs';
const TPL = fs.readFileSync(new URL('./card-template.html', import.meta.url), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIL = '<svg viewBox="0 0 64 64"><circle cx="32" cy="22" r="13" fill="#9aa9c0"/><path d="M6 64c0-16 12-24 26-24s26 8 26 24z" fill="#9aa9c0"/></svg>';
export const DEFAULT_PERMS = [
  { group: 'Talk', label: 'Join invited rooms', allowed: true }, { group: 'Talk', label: 'Propose terms', allowed: true }, { group: 'Talk', label: 'Counter offers', allowed: true },
  { group: 'Act', label: 'Share documents', allowed: false }, { group: 'Act', label: 'Sign deals', allowed: false }, { group: 'Act', label: 'Act without owner approval', allowed: false },
  { group: 'Money', label: 'Move money', allowed: false }, { group: 'Money', label: 'Make payments', allowed: false }];
export function renderCard(c, { photoSrc, qrSrc }) {
  const rooms = c.rooms_completed || 0, ver = c.verified_rooms || 0, dis = c.disputes || 0;
  const v = { botName: c.botName, title: c.title || '', role: c.role, owner: c.owner, origin: c.origin, passportNo: c.passportNo, passportIdSpaced: String(c.passportNo || '').replace('-', ' - '), idPrefix: 'HCPBOT' + String(c.issued || new Date().toISOString()).slice(0, 4), idCode: 'HCPBOT' + String(c.issued || new Date().toISOString()).slice(0, 4) + String(c.passportNo || '').replace('-', ''),
    sponsor: c.sponsor, issued: c.issued, expires: c.expires, rooms, verified: ver, disputes: dis,
    trust: rooms ? Math.round(ver / rooms * 100) : 100, conduct: rooms ? Math.round((rooms - dis) / rooms * 100) : 100 };
  let h = TPL.replace(/\{\{(\w+)\}\}/g, (m, k) => k in v ? esc(v[k]) : m);
  h = h.replace('{{idCodeHtml}}', [...String(v.idCode)].map(ch => `<span>${esc(ch)}</span>`).join(''));
  const P = c.perms && c.perms.length && c.perms[0].group ? c.perms : DEFAULT_PERMS;
  const chips = ['Talk', 'Act', 'Money'].map(g => `<div class="pgc"><h6>${g.toUpperCase()}</h6>` + P.filter(x => x.group === g).map(x => `<div class="cb ${x.allowed ? 'y' : 'n'}"><i>${x.allowed ? '✓' : ''}</i>${esc(x.label)}</div>`).join('') + '</div>').join('');
  return h.replace('{{chips}}', chips).replace('{{qrSrc}}', esc(qrSrc)).replace('{{photoHtml}}', photoSrc ? `<img src="${esc(photoSrc)}" alt="">` : SIL + `<span>photo from ${esc(c.owner)}</span>`);
}
