// prerooms-20261026a (Dan, voice Oct 26 2026; Brain OS #133): Bot Room pre-room cards.
// Center card (what the room is about, seating) visible to every member. Each participant card (human or bot) is visible ONLY to its
// owner account: every GET filters server-side by the signed-in session; other sides only ever get a waiting/ready flag per side.
// When every card is Ready, the server opens the live relay room through the existing botmeter golive path (same meter, same clock).
// Data: /var/lib/hubface/prerooms.db. Types: preroom-types.json (editable). No email/invite is ever sent from here.
// Roll back: remove the import + route line in hubface-vps.mjs (and the preroom* block at the end of accounts.mjs).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import Database from 'better-sqlite3';
import { VOICES, BOT_TYPES, cleanVoice, cleanType, typeLabel, voicesMap } from './voices.mjs';   // voicetype-20261029
export const PREROOMS_BUILD = 'prerooms-20261029v-voiceroom'; // voiceroom-20261029 (Dan voice, STAGED): recording consent (step zero) required for Ready / late join; consent on roster. prev 'prerooms-20261029e-noreset'; // voicetype-20261029 (Dan voice): card Type + Voice, seat voices copied to d.live.voices at go-live. prev prerooms-20261029c-yodaauto; // yodaauto-20261029 (Dan voice ~3:03 PM): Yoda picks up his own waiting invite (botjoin) + keeps his card Ready; Licorice invite pushed to her agent webhook. prev prerooms-20261029b-cardfix // cardfix-20261029 (Dan voice): card photos, own-card ownership, house bots join themselves, no duplicate bot cards, goLive ignores uncontrollable cards. prev prerooms-20261029a-botready // prev prerooms-20261026c28-yodacard // c: roster (names/ready only) + invitees on the center card
const PREROOMS_PREV = 'prerooms-20261026b'; // guestseat-20261026: ready guests (any owner) get a live pass + read-only view; seats/tokens per owner only // b: clockStartMs = moment all sides are present (room clock in the live shell)
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface';
const TYPES_FILE = new URL('./preroom-types.json', import.meta.url);
const ORIGIN = process.env.HUBFACE_ORIGIN || 'https://hubface.org';
const db = new Database(path.join(ROOT, 'prerooms.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS prerooms (id TEXT PRIMARY KEY, creator INTEGER NOT NULL, data TEXT NOT NULL, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS preroom_members (preroom TEXT NOT NULL, user_id INTEGER NOT NULL, side TEXT NOT NULL, PRIMARY KEY (preroom, user_id));
CREATE INDEX IF NOT EXISTS prm_user ON preroom_members(user_id);
CREATE TABLE IF NOT EXISTS preroom_files (id TEXT PRIMARY KEY, room TEXT NOT NULL, card TEXT NOT NULL, uploader INTEGER NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS prf_room ON preroom_files(room);
CREATE TABLE IF NOT EXISTS preroom_layouts (user_id INTEGER NOT NULL, room TEXT NOT NULL, data TEXT NOT NULL, updated_ms INTEGER NOT NULL, PRIMARY KEY (user_id, room));
CREATE TABLE IF NOT EXISTS preroom_card_defaults (user_id INTEGER NOT NULL, slot TEXT NOT NULL, data TEXT NOT NULL, updated_ms INTEGER NOT NULL, PRIMARY KEY (user_id, slot));`);
const Q = {
  get: db.prepare('SELECT * FROM prerooms WHERE id = ?'), ins: db.prepare('INSERT INTO prerooms (id, creator, data, created_ms, updated_ms) VALUES (?,?,?,?,?)'),
  put: db.prepare('UPDATE prerooms SET data = ?, updated_ms = ? WHERE id = ?'),
  mem: db.prepare('SELECT side FROM preroom_members WHERE preroom = ? AND user_id = ?'), addMem: db.prepare('INSERT OR IGNORE INTO preroom_members (preroom, user_id, side) VALUES (?,?,?)'),
  mine: db.prepare('SELECT p.id, p.data, p.updated_ms, p.creator, m.side FROM preroom_members m JOIN prerooms p ON p.id = m.preroom WHERE m.user_id = ? ORDER BY p.updated_ms DESC LIMIT 20'),
};
const FDIR = path.join(ROOT, 'prerooms-files'); const FMAX = 25 * 1024 * 1024, FPER = 10;
const FQ = { list: db.prepare('SELECT * FROM preroom_files WHERE room = ? ORDER BY ms'), get: db.prepare('SELECT * FROM preroom_files WHERE id = ? AND room = ?'), n: db.prepare('SELECT COUNT(*) n FROM preroom_files WHERE room = ? AND card = ?'),
  ins: db.prepare('INSERT INTO preroom_files (id, room, card, uploader, name, size, ms) VALUES (?,?,?,?,?,?,?)'), del: db.prepare('DELETE FROM preroom_files WHERE id = ?') };
function safeName(n) { let s = String(n || '').split(/[\\/]/).pop().normalize('NFC').replace(/[\u0000-\u001f\u007f"*:<>?|\\/]/g, '_').replace(/^\.+/, '').trim().slice(0, 120); return s || 'file'; }
// files on a card: visible only to the card's owner (same rule as card contents); center files: every member
function canSee(d, card, uid) { if (card === 'center') return true; const c = d.cards.find((x) => x.pid === card); return !!(c && c.owner === uid); }
function filesFor(roomId, d, uid) { const o = {}; for (const f of FQ.list.all(roomId)) if (canSee(d, f.card, uid)) (o[f.card] = o[f.card] || []).push({ id: f.id, name: f.name, size: f.size, ms: f.ms, mine: f.uploader === uid }); return o; }
let acc = null; async function A() { return acc || (acc = await import('./accounts.mjs')); }
function types() { try { return JSON.parse(fs.readFileSync(TYPES_FILE, 'utf8')); } catch { return { internal: [], external: [] }; } }
function typeOf(access, id) { const t = types(); const l = (access === 'external' ? t.external : t.internal) || []; return l.find((x) => x.id === id) || l[0] || { id: 'negotiation', label: 'Negotiation', ready: 'Ready', about: '', goal: '', prompts: [] }; }
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
const VP = { day: '', n: 0 };   // voicetype-20261029 preview cap
const hits = new Map(); function limited(k, max) { const n = Date.now(), a = (hits.get(k) || []).filter((t) => n - t < 60e3); if (a.length >= max) { hits.set(k, a); return true; } a.push(n); hits.set(k, a); return false; }
function sameOrigin(q) { const o = q.headers.origin; if (o) return o === ORIGIN; const ref = String(q.headers.referer || ''); return ref === ORIGIN || ref.startsWith(ORIGIN + '/'); }
const pid = () => 'c' + crypto.randomBytes(5).toString('hex');
function newCard(kind, owner, side, name, t, d) { const c = newCard0(kind, owner, side, name, t); if (kind === 'bot') { c.joined = false; if (name) c.name = txt(name, 40); } if (kind === 'bot') c.bi = d ? d.cards.filter((x) => x.owner === owner && x.kind === 'bot').length : 0; return applyDef(c, t.id); }
function newCard0(kind, owner, side, name, t) { return { pid: pid(), kind, owner, side, name: kind === 'bot' ? '' : txt(name, 40), role: '', notes: '', answers: (t.prompts || []).map(() => ''), ready: false }; }
function cleanCard(c, b) { if (b.name != null) c.name = txt(b.name, 40); if (b.role != null) c.role = txt(b.role, 80); if (b.notes != null) c.notes = txt(b.notes, 1000); if (b.type != null) c.type = cleanType(b.type); if (b.voice != null) c.voice = cleanVoice(b.voice);   /* voicetype-20261029 */
  if (Array.isArray(b.answers)) c.answers = b.answers.slice(0, 8).map((x) => txt(x, 500)); }
// c22: per-user saved card profile (private to its owner). slot = 'human' or 'bot:<name>'; answers kept per room type id.
const DQ = { get: db.prepare('SELECT data FROM preroom_card_defaults WHERE user_id = ? AND slot = ?'), all: db.prepare('SELECT slot, data FROM preroom_card_defaults WHERE user_id = ?'),
  put: db.prepare('INSERT INTO preroom_card_defaults (user_id, slot, data, updated_ms) VALUES (?,?,?,?) ON CONFLICT(user_id, slot) DO UPDATE SET data = excluded.data, updated_ms = excluded.updated_ms') };
const slotOf = (c) => c.kind === 'bot' ? 'bot#' + (c.bi || 0) : 'human';
function getDef(uid, slot) { try { const x = DQ.get.get(uid, slot); return x ? JSON.parse(x.data) : null; } catch { return null; } }
function saveDef(uid, c, typeId, b, explicit) {   // never blank a saved value unless the user explicitly saved an empty field (Save / Ready)
  const slot = slotOf(c), o = getDef(uid, slot) || { answers: {} }; o.answers = o.answers || {};
  for (const f of ['role', 'notes', 'type', 'voice']) if (b[f] != null) { if (c[f]) o[f] = c[f]; else if (explicit) o[f] = ''; }
  if (b.name != null) { if (c.name) o.name = c.name; else if (explicit) o.name = ''; }
  if (Array.isArray(b.answers)) { const prev = o.answers[typeId] || []; o.answers[typeId] = c.answers.map((x, i) => x ? x : (explicit ? '' : (prev[i] || ''))); }
  DQ.put.run(uid, slot, JSON.stringify(o), Date.now()); }
function applyDef(c, typeId, n) { if (typeof c.owner !== 'number') return c; const o = getDef(c.owner, slotOf(c)); if (!o) return c;
  if (c.kind === 'bot') { const dn = String(o.name || '').trim().toLowerCase(), cn = String(c.name || '').trim().toLowerCase(); if (!dn || !cn || dn !== cn || HOUSE_BOTS[dn] || HOUSE_BOTS[cn]) return c; }   // cardfix: a saved bot default only fills the same-named own bot, never a house bot or a differently named one
  if (o.name && (c.kind === 'bot' || !c.edited)) c.name = o.name; for (const f of ['role', 'notes', 'type', 'voice']) if (!c[f] && o[f]) c[f] = o[f];
  const a = (o.answers || {})[typeId]; if (Array.isArray(a)) c.answers = c.answers.map((x, i) => x || a[i] || ''); return c; }
// c24: a bot is in the room only once it has joined (new bots start joined:false; older cards without the flag count as joined)
const act = (c) => c.kind !== 'bot' || c.joined === true;   // c27: only an explicitly joined bot counts (older bot cards without the flag must be brought in too)
// yodacard-20261026: house bots invited from the Invite window (name or their mail address) join as a bot card instead of a waiting human invite
const HOUSE_BOTS = { yoda: 'Yoda', ava: 'Ava', finn: 'Finn', licorice: 'Licorice' };   // licbot-20261029 (Dan ok ~11:05 ET)
function houseBot(label) { const l = String(label || '').toLowerCase().trim(); if (HOUSE_BOTS[l]) return HOUSE_BOTS[l];
  const m = /^([a-z]+)[-._+a-z0-9]*@([a-z0-9.-]+)$/.exec(l); if (m && HOUSE_BOTS[m[1]] && /(grokbot|hubface|hingecraft)/.test(m[2])) return HOUSE_BOTS[m[1]]; return null; }
function bringBot(d, uid, side, t, name) { const mine = d.cards.filter((c) => c.owner === uid && c.kind === 'bot');
  let c = mine.find((x) => (x.name || '').toLowerCase() === name.toLowerCase()) || mine.find((x) => !x.name && x.joined !== true);
  if (!c) { if (mine.length >= 3) return false; c = newCard('bot', uid, side, name, t, d); d.cards.push(c); }
  if (!c.name) c.name = name; if (c.joined === true) return false; c.joined = true; /* noreset-20261029 */ return true; }
function fixBotInvites(d, uid, side, t) { let hh = 0; for (const x of d.invites || []) { if (x.status === 'waiting' && x.bot && d.cards.some((c) => c.kind === 'human' && typeof c.owner === 'number' && String(c.name || '').toLowerCase() === String(x.bot).toLowerCase())) { x.status = 'joined'; x.joinedMs = Date.now(); hh = 1; } } /* invmatch-20261029: heal an invite whose bot is already in the room as a person */ if (hh) return 1; return 0; /* cardfix-20261029: house bots join themselves (botjoin); an invite never makes a card under the inviter */ let ch = 0; for (const x of d.invites || []) { if (x.status !== 'waiting' || x.by !== uid) continue; const hb = houseBot(x.label); if (!hb) continue;
  bringBot(d, uid, side, t, hb); x.status = 'joined'; x.side = side; x.joinedMs = Date.now(); ch = 1; } return ch; }
// yodaauto-20261029: shared botjoin core (route + Yoda pickup). Returns an error string or null. Card owner = the bot itself.
function botJoinCore(row, d, hb) { if (botPresent(d, hb)) return hb + ' is already in this room.';
  d.invites = d.invites || []; const inv = d.invites.find((x) => x.status === 'waiting' && x.bot === hb);
  const t = typeOf(d.access, d.type); const c = newCard('bot', 'bot:' + lc(hb), (inv && inv.side) || 'A', hb, t, null); c.bi = 0; c.joined = true;
  /* noreset-20261029 */ d.cards.push(c); for (const x of d.invites) if (x.status === 'waiting' && x.bot === hb) { x.status = 'joined'; x.joinedMs = Date.now(); }
  d.error = null; Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} botjoin ${hb}${inv ? ' (invite)' : ''}`); return null; }
// yodaauto-20261029: Yoda pickup. Only Yoda. Every few seconds (and right after an invite) for rooms in setup: a waiting Yoda invite -> Yoda's own card joins;
// Yoda's own card (owner 'bot:yoda') not Ready -> Yoda presses Ready (re-Readies after any reset). Idempotent; duplicates refused by botJoinCore.
const YODA_AUTO = process.env.PREROOMS_YODA_AUTO !== '0';
const setupRows = db.prepare("SELECT * FROM prerooms WHERE json_extract(data, '$.status') = 'setup'");
let yodaBusy = false;
export async function yodaPickup() { if (!YODA_AUTO || yodaBusy) return; yodaBusy = true;
  try { for (const row of setupRows.all()) { try { const d = JSON.parse(row.data); if (d.status !== 'setup') continue;
      if ((d.invites || []).some((x) => x.status === 'waiting' && x.bot === 'Yoda') && !d.cards.some((c) => c.owner === 'bot:yoda')) { const e = botJoinCore(row, d, 'Yoda'); if (e) { for (const x of d.invites) if (x.status === 'waiting' && x.bot === 'Yoda') { x.status = 'refused'; x.note = e; } Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} yoda pickup refused: ${e}`); continue; } }
      const yc = d.cards.find((c) => c.owner === 'bot:yoda' && c.kind === 'bot' && c.joined === true);
      if (yc && !yc.ready) { yc.ready = true; if (!yc.consent) { yc.consent = 'bot'; yc.consentMs = Date.now(); } /* voiceroom-20261029 */ d.error = null; Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} yoda ready (auto)`); await maybeGoLive(row, d); }
    } catch (e) { console.warn('[prerooms] yoda pickup', row.id, String(e && e.message || e).slice(0, 120)); } } } finally { yodaBusy = false; } }
if (YODA_AUTO) { const tm = setInterval(() => { yodaPickup(); }, 4000); tm.unref && tm.unref(); }
// yodaauto-20261029: Licorice invite push. Inviting Licorice posts the join link to her own agent webhook (same LICORICE_HOOK_URL/AUTH the room uses).
// https only, once per invite, 8 s timeout, the link/key are never logged. Test hook: globalThis.__licPostStub.
const LIC_URL = String(process.env.LICORICE_HOOK_URL || '').trim(), LIC_AUTH = String(process.env.LICORICE_HOOK_AUTH || '').trim();
async function licInvitePush(row, d, inv, fromName) { let u; try { u = new URL(LIC_URL); } catch { console.log(`[prerooms] ${row.id} licorice invite push off (no hook)`); return; } if (u.protocol !== 'https:') return;
  const link = ORIGIN + '/interface/#prjoin=' + row.id + '&code=' + d.code;
  const body = { type: 'preroom_invite', to: 'licorice', room: row.id, from: txt(fromName, 40) || 'A HubFace member', about: txt(d.center && d.center.about, 200), join: link,
    howto: 'Open the join link signed in to your own HubFace account (licorice-hingecraft@mail.grokbot.com) and press Join. Your card is yours; press Ready on it.' };
  const h = { 'Content-Type': 'application/json', 'User-Agent': 'HubFace-prerooms/licorice' };
  if (LIC_AUTH) { const i = LIC_AUTH.indexOf(':'); if (i > 0 && !/^bearer\s/i.test(LIC_AUTH)) h[LIC_AUTH.slice(0, i).trim()] = LIC_AUTH.slice(i + 1).trim(); else h.Authorization = LIC_AUTH; }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const res = await (globalThis.__licPostStub || fetch)(LIC_URL, { method: 'POST', signal: ctl.signal, headers: h, body: JSON.stringify(body) }); try { await res.arrayBuffer(); } catch {} inv.pushed = res.ok ? 'ok' : 'http ' + res.status; }
  catch (e) { inv.pushed = 'error'; } finally { clearTimeout(t); }
  try { const r2 = Q.get.get(row.id); const d2 = JSON.parse(r2.data); const x = (d2.invites || []).find((y) => y.ms === inv.ms && y.bot === 'Licorice'); if (x) { x.pushed = inv.pushed; Q.put.run(JSON.stringify(d2), Date.now(), row.id); } } catch {}
  console.log(`[prerooms] ${row.id} licorice invite push -> ${inv.pushed}`); }
// cardfix-20261029 helpers
let accDb = null; function accEmail(uid) { try { if (!accDb) accDb = new Database(path.join(ROOT, 'accounts.db'), { readonly: true, fileMustExist: true }); const x = accDb.prepare('SELECT email FROM users WHERE id = ?').get(uid); return x ? String(x.email || '') : ''; } catch { return ''; } }
const lc = (x) => String(x || '').trim().toLowerCase();
const houseName = (n) => !!HOUSE_BOTS[lc(n)];
// is this name (bot) already in the room as a card, or as a real person whose account is that bot (e.g. Licorice's own account)?
function botPresent(d, name) { const n = lc(name); if (!n) return false; return d.cards.some((c) => lc(c.name) === n || (c.kind === 'human' && typeof c.owner === 'number' && lc(houseBot(accEmail(c.owner))) === n)); }
// a card counts for Ready only if someone real controls it: humans, a bot that joined itself, or a user's own (non-house) bot. Legacy house-bot cards under a user account do not.
const ctl = (c) => act(c) && !(c.kind === 'bot' && typeof c.owner === 'number' && houseName(c.name));
const PHDIR = path.join(ROOT, 'hfphotos'); let PSALT = null; function psalt() { if (PSALT === null) { try { PSALT = fs.readFileSync(path.join(PHDIR, '.salt'), 'utf8'); } catch { PSALT = ''; } } return PSALT; }
function phFind(base) { for (const e of ['jpg', 'png', 'webp']) { try { const st = fs.statSync(path.join(PHDIR, base + '.' + e)); return { f: base + '.' + e, m: Math.round(st.mtimeMs / 1000) }; } catch {} } return null; }
function picOf(c) { try { if (c.kind === 'human' && typeof c.owner === 'number') { const s = psalt(); if (!s) return null; const x = phFind('u-' + crypto.createHash('sha256').update(s + '|' + c.owner).digest('hex').slice(0, 32)); return x ? '/api/hf-photo/f/' + x.f + '?v=' + x.m : null; }
  if (c.kind === 'bot') { const nm = lc(c.name).replace(/[^a-z0-9-]/g, '').slice(0, 32); if (!nm) return null; const x = phFind('b-' + nm); return x ? '/api/hf-photo/bot/' + nm + '?v=' + x.m : null; } } catch {} return null; }
function sideState(d, s) { const cs = d.cards.filter((c) => c.side === s && ctl(c)); return cs.length && cs.every((c) => c.ready) ? 'ready' : 'waiting'; }
function sidesOf(d) { return [...new Set(d.cards.map((c) => c.side))].sort(); }
function view(row, d, uid, side) {
  const t = typeOf(d.access, d.type);
  const v = { build: PREROOMS_BUILD, id: row.id, access: d.access, type: t.id, typeLabel: t.label, readyLabel: t.ready, prompts: t.prompts || [], status: d.status, isCreator: row.creator === uid, mySide: side,
    center: d.center, sides: sidesOf(d).map((s) => ({ side: s, mine: s === side, label: s === side ? 'Your side' : (d.access === 'internal' ? 'Teammate' : 'Other side'), state: sideState(d, s) })),
    expectSides: d.access === 'external' ? 2 : 1,
    cards: d.cards.filter((c) => c.owner === uid).map((c) => ({ ...c, owner: undefined, mine: true, pic: picOf(c) || undefined })),   // <-- privacy: only the requester's own cards
    roster: d.cards.filter(act).map((c) => { const full = c.owner === uid || d.access === 'internal' || c.side === side;   /* seeall-20261029 (Dan): Zoom-style, every member sees every card; on an external (two-company) room the other side still gets only name, role, face and ready */
      return { name: c.name || (c.kind === 'bot' ? 'Bot' : 'Member'), kind: c.kind, side: c.side, ready: !!c.ready, consent: !!c.consent, you: c.owner === uid, pic: picOf(c) || undefined, role: c.role || undefined, type: typeLabel(c), voice: cleanVoice(c.voice) || undefined, ...(full ? { notes: c.notes || undefined, answers: Array.isArray(c.answers) ? c.answers : undefined } : {}) }; }),   // public: names + ready only, never notes/answers/owner ids
    invites: (d.invites || []).map((x) => ({ label: x.label, side: x.side, ms: x.ms, status: x.status, bot: x.bot || undefined, pic: x.bot ? (picOf({ kind: 'bot', name: x.bot }) || undefined) : undefined })),
    files: filesFor(row.id, d, uid),
    error: d.error || null, clockStartMs: d.status === 'closed' ? null : (d.live ? (d.live.startMs || null) : (d.allJoinedMs || null)),   // reset-20261026: live room clock starts at its own handoff, not the pre-room's
    voices: VOICES, botTypes: BOT_TYPES, serverNow: Date.now() };   // voicetype-20261029
  if (row.creator === uid && d.status === 'setup') v.joinCode = d.code;
  if (d.live) { const mine = d.live.sides[side] || [];   // guestseat-20261026: a viewer only ever gets the seats/tokens they own (old rows without uid: creator only)
    const own = (x) => x && (x.uid != null ? x.uid === uid : row.creator === uid); const g = (d.live.guests || []).find((x) => x.uid === uid);
    v.live = { room: d.live.room, meter: d.live.meter, seats: mine.filter(own).map((x) => ({ seat: x.seat, name: x.name, watch: x.watch, token: x.token })),
      guest: g ? { name: g.name, pass: g.pass } : null,
      roster: rosterOut(d, uid),   // nseat-20261029
      people: [...Object.values(d.live.sides).flat().filter(Boolean).map((x) => ({ name: x.name, side: x.side || null })), ...(d.live.guests || []).map((x) => ({ name: x.name, side: x.side, guest: true, kind: x.kind }))] }; }
  return v;
}
// nseat-20261029 (Dan, STAGED): one seat per participant. Every active card in the pre-room (humans, bots that joined, Yoda) is
// registered in d.live.roster at go-live, host first. Colours are fixed once here so every viewer sees the same colour per person.
const NS_FIX = { yoda: '#fb923c', licorice: '#a78bfa', stella: '#f472b6' }, NS_HOST = '#3ddc84', NS_PAL = ['#38bdf8', '#facc15', '#f87171', '#2dd4bf', '#e879f9', '#a3e635', '#fdba74', '#93c5fd'];
function liveRoster(row, d, seatedCards, b) { const all = d.cards.filter(act); const host = all.find((c) => c.kind === 'human' && c.owner === row.creator);
  const ord = [...(host ? [host] : []), ...all.filter((c) => c !== host)]; const used = new Set();
  return ord.map((c, i) => { const name = String(c.name || (c.kind === 'bot' ? 'Bot' : 'Member')).slice(0, 40); let col = c === host ? NS_HOST : NS_FIX[lc(name)];
    if (!col || used.has(col)) col = NS_PAL.find((x) => !used.has(x)) || NS_PAL[i % NS_PAL.length]; used.add(col);
    const rs = seatedCards.indexOf(c); return { n: i, name, kind: c.kind, side: c.side, host: c === host, ready: !!c.ready, color: col, relaySeat: rs >= 0 && b[rs] ? rs : null, uid: c.owner, consent: !!c.consent, consentMs: c.consentMs || null }; }); }
function rosterOut(d, uid) { return ((d.live && d.live.roster) || []).map((x) => ({ n: x.n, name: x.name, kind: x.kind, side: x.side, host: !!x.host, ready: !!x.ready, color: x.color, relaySeat: x.relaySeat, consent: !!x.consent, you: x.uid === uid })); }   // never owner ids
async function maybeGoLive(row, d) {
  if (d.status !== 'setup') return;
  const ss = sidesOf(d); if (ss.length < (d.access === 'external' ? 2 : 1)) return;
  const AC = d.cards.filter(ctl); if (!AC.length || !AC.every((c) => c.ready)) return; if (!AC.some((c) => c.kind === 'bot')) return;   // c24: wait until at least one bot has joined
  const sa = AC.filter((c) => c.side === 'A'), sb = d.access === 'external' ? AC.filter((c) => c.side === 'B') : sa;
  const botA = sa.filter((c) => c.kind === 'bot'), botB = sb.filter((c) => c.kind === 'bot');
  const humA = sa.find((c) => c.kind === 'human'), humB = sb.find((c) => c.kind === 'human');
  const humA2 = sa.find((c) => c.kind === 'human' && c !== humA);   // seatfix-20261029a (Dan): internal room 2nd seat goes to the 2nd member (e.g. Licorice), never a duplicate of the host
  const bot0 = botA[0] || humA, bot1 = d.access === 'external' ? (botB[0] || humB) : (botA[1] || humA2 || humA);
  d.status = 'starting'; Q.put.run(JSON.stringify(d), Date.now(), row.id);
  const setup = { access: d.access, type: d.type, topic: [d.center.about, d.center.topic].filter(Boolean).join(' · ').slice(0, 280), bot0: bot0 && (bot0.name || (bot0.kind === 'bot' ? 'Bot' : 'Member')), bot1: bot1 && (bot1.name || (bot1.kind === 'bot' ? 'Bot 2' : 'Member')),
    owner0: humA && (humA.name || 'Member'), owner1: (bot1 && bot1.kind === 'human' && bot1 !== humA && (bot1.name || 'Member')) || (humB && (humB.name || 'Member')) || (humA && (humA.name || 'Member')) /* owner1-20261029: internal room humB===humA made the 2nd seat owner the host; the seated member owns it */, sellerSeat: 0, preroom: row.id };
  let r; try { r = await (await A()).preroomGoLive(row.creator, d.meter, setup); } catch (e) { r = { status: 500, json: { error: String(e?.message || e).slice(0, 120) } }; }
  if (r.status !== 200) { d.status = 'setup'; d.error = r.json.error || 'Could not open the live room'; for (const c of d.cards) c.ready = false; Q.put.run(JSON.stringify(d), Date.now(), row.id); console.warn('[prerooms]', row.id, d.error); return; }
  const b = r.json.relay.bots || [];
  d.status = 'live'; d.error = null;
  if (b[0] && bot0) b[0].uid = (typeof bot0.owner === "number" ? bot0.owner : row.creator); if (b[1] && bot1) b[1].uid = (typeof bot1.owner === "number" ? bot1.owner : row.creator);   // seatuid-20261029: a bot-owned card (owner bot:<name>) has no browser, so its relay seat goes to the room creator, as before   // guestseat-20261026: remember who owns each relay seat
  const seated = new Set([bot0, bot1].filter(Boolean));
  const guests = AC.filter((c) => !seated.has(c) && c.ready).map((c) => ({ uid: c.owner, name: c.name || (c.kind === 'bot' ? 'Bot' : 'Member'), kind: c.kind, side: c.side, pass: 'brg_' + crypto.randomBytes(18).toString('base64url') }));
  d.live = { room: r.json.room, meter: r.json.meter, startMs: Date.now(), sides: d.access === 'external' ? { A: [b[0]], B: [b[1]] } : { A: [b[0], b[1]] }, guests, voices: voicesMap(AC), roster: liveRoster(row, d, [bot0, bot1], b) };   // nseat-20261029   // voicetype-20261029: seat voices fixed at go-live; brcSpeak reads them
  console.log(`[prerooms] ${row.id} live roster: ${d.live.roster.length} seats`); if (guests.length) console.log(`[prerooms] ${row.id} live guests seated: ${guests.length}`);
  Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} all ready -> live ${r.json.room}`);
}
export function isPreroomsPath(p) { return p === '/api/prerooms' || p.startsWith('/api/prerooms/'); }
export async function preroomsRoute(q, r, p, { who, readBody, json, ip }) {
  if (!isPreroomsPath(p)) return false; r.setHeader('Cache-Control', 'no-store');
  if (p === '/api/prerooms/types' && q.method === 'GET') { const t = types(); return json(r, 200, { ok: true, internal: t.internal, external: t.external }), true; }
  // botready-20261029a: a bot sets Ready on ITS OWN bot card (each agent controls its card). Loopback only (no proxy headers), so
  // only processes on this VPS (Yoda via ssh) can call it; matched by bot card name. Body: {bot:'Yoda', ready:true|false}
  // cardfix-20261029: botjoin. A house bot (Yoda, Ava, Finn, Licorice) puts ITS OWN card in the room. Loopback only, same guard as botready.
  // Body: {bot:'Yoda'}. Card owner is the bot itself ('bot:<name>'), never a user. Refused if that bot (or its real account) is already present.
  { const jm = /^\/api\/prerooms\/(PR-[0-9A-F]{10})\/botjoin$/.exec(p);
    if (jm && q.method === 'POST') { const ra = String((q.socket && q.socket.remoteAddress) || ''); const lo = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ra) && !q.headers['x-forwarded-for'] && !q.headers['x-real-ip'];
      if (!lo) return json(r, 404, { error: 'not found' }), true;
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}') || {}; } catch { return json(r, 400, { error: 'bad json' }), true; }
      const row = Q.get.get(jm[1]); if (!row) return json(r, 404, { error: 'not found' }), true; const d = JSON.parse(row.data);
      if (d.status !== 'setup') return json(r, 409, { error: 'Room already ' + d.status }), true;
      const hb = houseBot(b.bot); if (!hb) return json(r, 400, { error: 'not a house bot' }), true;
      const jr = botJoinCore(row, d, hb); if (jr) return json(r, 409, { error: jr }), true;
      return json(r, 200, { ok: true, build: PREROOMS_BUILD, bot: hb, status: d.status, roster: d.cards.filter(act).map((x) => ({ name: x.name || (x.kind === 'bot' ? 'Bot' : 'Member'), kind: x.kind, ready: !!x.ready })) }), true; } }
  { const bm = /^\/api\/prerooms\/(PR-[0-9A-F]{10})\/botready$/.exec(p);
    if (bm && q.method === 'POST') { const ra = String((q.socket && q.socket.remoteAddress) || ''); const lo = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ra) && !q.headers['x-forwarded-for'] && !q.headers['x-real-ip'];
      if (!lo) return json(r, 404, { error: 'not found' }), true;
      let b = {}; try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}') || {}; } catch { return json(r, 400, { error: 'bad json' }), true; }
      const row = Q.get.get(bm[1]); if (!row) return json(r, 404, { error: 'not found' }), true; const d = JSON.parse(row.data);
      if (d.status !== 'setup') return json(r, 409, { error: 'Room already ' + d.status }), true;
      const nm = String(b.bot || '').trim().toLowerCase(); const cs = d.cards.filter((c) => c.kind === 'bot' && c.joined !== false && String(c.name || '').trim().toLowerCase() === nm);
      if (!nm || cs.length !== 1) return json(r, 404, { error: 'bot card not found (or ambiguous)', matches: cs.length }), true;
      cs[0].ready = b.ready !== false; if (cs[0].ready && !cs[0].consent) { cs[0].consent = 'bot'; cs[0].consentMs = Date.now(); } /* voiceroom-20261029 */ d.error = null; Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} botready ${nm}=${cs[0].ready}`);
      await maybeGoLive(row, d); const d2 = JSON.parse(Q.get.get(row.id).data);
      return json(r, 200, { ok: true, build: PREROOMS_BUILD, bot: cs[0].name, ready: !!cs[0].ready, status: d2.status, roster: d2.cards.filter(act).map((c) => ({ name: c.name || (c.kind === 'bot' ? 'Bot' : 'Member'), kind: c.kind, ready: !!c.ready })) }), true; } }
  const u = who(q); if (!u || !u.id) return json(r, 401, { error: 'Sign in to HubFace first.' }), true;
  const uid = u.id, k = uid + '|' + (ip ? ip(q) : '');
  if (limited((q.method === 'GET' ? 'g' : 'w') + k, q.method === 'GET' ? 240 : 90)) return json(r, 429, { error: 'slow down' }), true;
  { const fm = /^\/api\/prerooms\/(PR-[0-9A-F]{10})\/files\/(center|c[0-9a-f]{10}|f[0-9a-f]{16})$/.exec(p);
    if (fm) { const row = Q.get.get(fm[1]); const mem = row && Q.mem.get(row.id, uid); if (!row || !mem) return json(r, 404, { error: 'not found' }), true;
      const d = JSON.parse(row.data);
      if (fm[2].startsWith('f')) { const f = FQ.get.get(fm[2], row.id); if (!f || !canSee(d, f.card, uid)) return json(r, 404, { error: 'not found' }), true;
        const fp = path.join(FDIR, row.id, f.id);
        if (q.method === 'GET') { let st; try { st = fs.statSync(fp); } catch { return json(r, 404, { error: 'not found' }), true; }
          const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
          r.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
            'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' });
          fs.createReadStream(fp).pipe(r); return true; }
        if (q.method === 'DELETE') { if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' }), true; if (f.uploader !== uid) return json(r, 403, { error: 'Only the person who uploaded it can delete it.' }), true;
          try { fs.unlinkSync(fp); } catch {} FQ.del.run(f.id); console.log(`[prerooms] ${row.id} file ${f.id} deleted by ${uid}`); return json(r, 200, view(row, d, uid, mem.side)), true; }
        return json(r, 405, { error: 'method' }), true; }
      if (q.method !== 'POST') return json(r, 405, { error: 'method' }), true;
      if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' }), true;
      if (!canSee(d, fm[2], uid)) return json(r, 404, { error: 'not found' }), true;
      if (d.status === 'closed') return json(r, 409, { error: 'Room is closed.' }), true;
      if (FQ.n.get(row.id, fm[2]).n >= FPER) return json(r, 400, { error: 'Max ' + FPER + ' files per card.' }), true;
      const len = Number(q.headers['content-length'] || 0); if (len > FMAX) return json(r, 413, { error: 'Max 25 MB per file.' }), true;
      const name = safeName(decodeURIComponent(String(new URL(q.url, 'http://x').searchParams.get('name') || '')));
      const id = 'f' + crypto.randomBytes(8).toString('hex'); fs.mkdirSync(path.join(FDIR, row.id), { recursive: true, mode: 0o700 }); const fp = path.join(FDIR, row.id, id);
      const ok = await new Promise((res) => { let n = 0, bad = false; const ws = fs.createWriteStream(fp, { mode: 0o600 });
        q.on('data', (ch) => { n += ch.length; if (n > FMAX && !bad) { bad = true; ws.destroy(); q.unpipe(ws); res(-1); } });
        q.pipe(ws); ws.on('finish', () => { if (!bad) res(n); }); ws.on('error', () => { if (!bad) { bad = true; res(0); } }); q.on('error', () => { if (!bad) { bad = true; res(0); } }); });
      if (ok <= 0) { try { fs.unlinkSync(fp); } catch {} return json(r, ok < 0 ? 413 : 400, { error: ok < 0 ? 'Max 25 MB per file.' : 'Upload failed or empty file.' }), true; }
      FQ.ins.run(id, row.id, fm[2], uid, name, ok, Date.now()); console.log(`[prerooms] ${row.id} file ${id} (${ok} B) on ${fm[2] === 'center' ? 'center' : 'card'} by ${uid}`);
      return json(r, 201, view(row, d, uid, mem.side)), true; } }
  // nseat-20261029: GET /api/prerooms/roster?live=BR-...  roster of the live room for a signed-in member of its pre-room (names, colours, ready; no ids)
  if (p === '/api/prerooms/roster' && q.method === 'GET') { const lr = String(new URL(q.url, 'http://x').searchParams.get('live') || '');
    if (!/^BR-[A-Z0-9-]{3,40}$/.test(lr)) return json(r, 400, { error: 'bad room' }), true;
    const hit = Q.mine.all(uid).map((x) => ({ x, d: JSON.parse(x.data) })).find((y) => y.d.live && y.d.live.room === lr);
    if (!hit) return json(r, 404, { error: 'not found' }), true;
    return json(r, 200, { ok: true, room: lr, preroom: hit.x.id, creatorIsYou: hit.x.creator === uid, roster: rosterOut(hit.d, uid) }), true; }
  let b = {};
  if (q.method !== 'GET') { if (!sameOrigin(q)) return json(r, 403, { error: 'Cross-site request blocked.' }), true;
    try { b = JSON.parse((await readBody(q)).toString('utf8') || '{}') || {}; } catch { return json(r, 400, { error: 'bad json' }), true; } }
  if (p === '/api/prerooms/layout') {   // prerooms-20261026b: per-user overlay layout (size, hidden), per room ('' = default). Only the caller's own row.
    const room = String(new URL(q.url, 'http://x').searchParams.get('room') || '').toUpperCase();
    if (room && (!/^PR-[0-9A-F]{10}$/.test(room) || !Q.mem.get(room, uid))) return json(r, 404, { error: 'not found' }), true;
    if (q.method === 'GET') { const x = db.prepare('SELECT data FROM preroom_layouts WHERE user_id = ? AND room = ?').get(uid, room) || db.prepare("SELECT data FROM preroom_layouts WHERE user_id = ? AND room = ''").get(uid); return json(r, 200, { ok: true, layout: x ? JSON.parse(x.data) : null }), true; }
    if (q.method === 'PUT') { const L = { size: Math.max(0, Math.min(3, Math.round(Number(b.size) || 0))), hidden: b.hidden === true };
      if (b.shell && typeof b.shell === 'object') { const wins = (Array.isArray(b.shell.wins) ? b.shell.wins : []).filter((w) => Array.isArray(w) && /^[a-z0-9_-]{1,24}$/.test(String(w[0]))).slice(0, 30).map((w) => [String(w[0]), txt(w[1], 600).replace(/url\(|expression|javascript:/gi, '')]);
        const btns = {}; for (const [k, v] of Object.entries(b.shell.btns || {}).slice(0, 10)) if (/^btnHdr[A-Za-z0-9]{1,24}$/.test(k)) btns[k] = v === true; L.shell = { wins, btns }; }
      if (b.x != null && b.y != null) { L.x = Math.max(0, Math.min(100, Number(b.x) || 0)); L.y = Math.max(0, Math.min(100, Number(b.y) || 0)); }
      const ins = db.prepare('INSERT INTO preroom_layouts (user_id, room, data, updated_ms) VALUES (?,?,?,?) ON CONFLICT(user_id, room) DO UPDATE SET data = excluded.data, updated_ms = excluded.updated_ms');
      ins.run(uid, room, JSON.stringify(L), Date.now()); if (room) ins.run(uid, '', JSON.stringify(L), Date.now()); return json(r, 200, { ok: true, layout: L }), true; }
    return json(r, 405, { error: 'method' }), true;
  }
  if (p === '/api/prerooms/voice-preview' && q.method === 'POST') {   // voicetype-20261029: short fixed sample of a voice key; signed-in + same-origin; 6/min per user, 60/day total
    const v = cleanVoice(b.voice); if (!v) return json(r, 400, { error: 'unknown voice' }), true;
    if (limited('vp:' + uid, 6)) return json(r, 429, { error: 'Too many previews, wait a minute.' }), true;
    const dd = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); if (VP.day !== dd) { VP.day = dd; VP.n = 0; } if (VP.n >= 60) return json(r, 429, { error: 'daily preview cap' }), true;
    const text = 'Hi, this is the ' + v + ' voice.'; const fp = await import('./fastpath.mjs'); if (fp.canSpend && !fp.canSpend(text.length)) return json(r, 429, { error: 'daily-cap' }), true;
    const o = await fp.fastTts(text, v); if (!o || !o.buf) return json(r, 502, { error: (o && o.error) || 'tts failed' }), true;
    VP.n++; if (fp.chargeTts) fp.chargeTts(text.length, 0); console.log(`[brtts] preview ${v} by ${uid} (${VP.n}/60 today)`);
    r.writeHead(200, { 'Content-Type': o.type || 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': o.buf.length }); r.end(o.buf); return true; }
  if (p === '/api/prerooms/card-defaults' && q.method === 'GET') return json(r, 200, { ok: true, defaults: DQ.all.all(uid).map((x) => ({ slot: x.slot, ...JSON.parse(x.data) })) }), true;   // own only
  if (p === '/api/prerooms/mine' && q.method === 'GET') return json(r, 200, { ok: true, rooms: Q.mine.all(uid).filter((x) => JSON.parse(x.data).status !== 'deleted').map((x) => { const d = JSON.parse(x.data); return { id: x.id, canDelete: x.creator === uid, status: d.status, type: typeOf(d.access, d.type).label, access: d.access, about: d.center.about, updated: x.updated_ms }; }) }), true;
  if (p === '/api/prerooms' && q.method === 'POST') {
    const access = b.access === 'external' ? 'external' : 'internal'; const t = typeOf(access, b.type);
    let meter; try { meter = await (await A()).preroomMeterStart(uid); } catch { meter = null; }
    if (!meter || !meter.id) return json(r, 503, { error: 'Meter unavailable' }), true;
    if (meter.phase === 'live' && meter.relay_room) return json(r, 409, { error: 'Your meter is already in live room ' + meter.relay_room + '. Close that room first.' }), true;
    const id = 'PR-' + crypto.randomBytes(5).toString('hex').toUpperCase();
    const d = { access, type: t.id, status: 'setup', meter: meter.id, code: crypto.randomBytes(9).toString('base64url'),
      center: { about: txt(b.about, 400) || t.about, goal: txt(b.goal, 300) || t.goal, topic: txt(b.topic, 280), sellerSeat: 0 }, cards: [] };   // c23: payer (creator) always leads
    d.cards.push(newCard('human', uid, 'A', b.myName || u.name, t));
    // c27: no bot card at creation; bots come only from Bring a bot
    const tm = Date.now(); if (access === 'internal') d.allJoinedMs = tm; Q.ins.run(id, uid, JSON.stringify(d), tm, tm); Q.addMem.run(id, uid, 'A');
    console.log(`[prerooms] ${id} created by user ${uid} (${access}/${t.id})`);
    return json(r, 201, view(Q.get.get(id), d, uid, 'A')), true;
  }
  // guestseat-20261026: guests watch the live room through this read-only proxy; their pass never maps to a relay token they can see
  const gm = /^\/api\/prerooms\/(PR-[0-9A-F]{10})\/live\/events$/.exec(p);
  if (gm && q.method === 'GET') { const row = Q.get.get(gm[1]); const mem = row && Q.mem.get(row.id, uid); if (!row || !mem) return json(r, 404, { error: 'not found' }), true;
    const d = JSON.parse(row.data); const g = d.live && (d.live.guests || []).find((x) => x.uid === uid);
    const pass = String(q.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!g || !pass || pass.length !== g.pass.length || !crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(g.pass))) return json(r, 401, { error: 'guest pass required' }), true;
    const seats = (d.live.sides[g.side] || []).filter(Boolean); const w = seats.find((x) => x.uid != null && x.uid !== row.creator) || seats[seats.length - 1] || seats[0];
    if (!w || !w.watch) return json(r, 409, { error: 'no live seat' }), true;
    const qs = new URL(q.url, 'http://x').searchParams; const after = Math.max(0, +qs.get('after') || 0), to = Math.min(Math.max(+qs.get('timeout') || 25, 0), 25);
    try { const rr = await fetch(`http://127.0.0.1:${+process.env.BOTRELAY_PORT || 3475}/api/botrelay/rooms/${encodeURIComponent(d.live.room)}/events?after=${after}&timeout=${to}`, { headers: { authorization: 'Bearer ' + w.watch }, signal: AbortSignal.timeout(30000) });
      const j = await rr.json(); if (j && typeof j === 'object') { j.watcher = true; j.guest = true; j.seat = -1; j.yourTurn = false; j.roster = rosterOut(d, uid); } return json(r, rr.status, j), true;
    } catch { return json(r, 502, { error: 'live room unavailable' }), true; } }
  const m = /^\/api\/prerooms\/(PR-[0-9A-F]{10})(?:\/(join|center|bots|close|delete|invites|cards\/(c[0-9a-f]{10})(\/ready|\/join)?))?$/.exec(p);
  if (!m) return json(r, 404, { error: 'not found' }), true;
  const row = Q.get.get(m[1]); if (!row) return json(r, 404, { error: 'not found' }), true;
  const d = JSON.parse(row.data); const mem = Q.mem.get(row.id, uid); const side = mem && mem.side; const t = typeOf(d.access, d.type);
  if (d.status === 'deleted') return json(r, 404, { error: 'not found' }), true;   // delroom-20261029: deleted rooms are gone for everyone
  if (m[2] === 'delete' && q.method === 'POST') {   // delroom-20261029 (Dan): creator only; stops meter (settles + relay meterstop) when safe; soft delete, row kept for audit
    if (!side || row.creator !== uid) return json(r, 403, { error: 'Only the person who set up this room can delete it.' }), true;
    let other = false; try { other = db.prepare("SELECT id, data FROM prerooms WHERE id != ? AND data LIKE ?").all(row.id, '%"meter":"' + String(d.meter || '').replace(/[^A-Za-z0-9-]/g, '') + '"%').some((x) => { const o = JSON.parse(x.data); return o.meter === d.meter && (o.status === 'live' || o.status === 'starting'); }); } catch {}
    if (d.meter && !other && d.status !== 'closed') { try { await (await A()).preroomMeterStop(uid, d.meter); } catch {} }
    d.prevStatus = d.status; d.status = 'deleted'; d.deletedMs = Date.now(); d.deletedBy = uid; Q.put.run(JSON.stringify(d), Date.now(), row.id);
    console.log(`[prerooms] ${row.id} deleted by creator ${uid}${d.live ? ' (relay ' + d.live.room + ')' : ''}${other ? ' meter kept (shared with a live room)' : ''}`);
    return json(r, 200, { ok: true, deleted: row.id }), true; }
  if (m[2] === 'join' && q.method === 'POST') {
    if (side) return json(r, 200, view(row, d, uid, side)), true;
    const c = String(b.code || ''); if (!c || c.length !== d.code.length || !crypto.timingSafeEqual(Buffer.from(c), Buffer.from(d.code))) return json(r, 404, { error: 'not found' }), true;
    if (d.status === 'closed') return json(r, 409, { error: 'This room has ended.' }), true;
    if (d.status === 'starting') return json(r, 409, { error: 'This room is opening right now. Try the link again in a few seconds.' }), true;
    const lateJoin = d.status === 'live';   // preroombatch1 #8: invite link on a live room seats the latecomer instead of refusing
    if (d.status !== 'setup' && !lateJoin) return json(r, 409, { error: 'This room is not open.' }), true;
    const ns = d.access === 'external' ? 'B' : 'A';
    if (d.access === 'external' && db.prepare("SELECT 1 FROM preroom_members WHERE preroom = ? AND side = 'B'").get(row.id)) return json(r, 409, { error: 'The other side has already joined.' }), true;
    { const hb = houseBot(u.email); if (hb && d.cards.some((c) => c.kind === 'bot' && lc(c.name) === lc(hb))) return json(r, 409, { error: hb + ' is already in this room as a bot card.' }), true; }   // cardfix-20261029: one card per person/bot
    if (lateJoin && b.consent !== true) return json(r, 428, { error: 'This room is being recorded (audio only). Tick the recording consent box to join.', consentRequired: true }), true;   // voiceroom-20261029 step zero
    Q.addMem.run(row.id, uid, ns); { const nc = newCard('human', uid, ns, b.myName || u.name, t); if (b.consent === true) { nc.consent = true; nc.consentMs = Date.now(); } d.cards.push(nc); }
    for (const n of (Array.isArray(b.bots) ? b.bots : []).slice(0, 3)) if (txt(n, 40) && !houseName(n) && !botPresent(d, n)) d.cards.push(newCard('bot', uid, ns, n, t, d));
    if (d.access === 'external' && !lateJoin) d.allJoinedMs = Date.now();
    { const nm = [u.name, b.myName, u.email].filter(Boolean).map((x) => String(x).toLowerCase()); const w = (d.invites || []).filter((x) => x.status === 'waiting' && x.side === ns);
      const hit = w.find((x) => nm.includes(String(x.label).toLowerCase())) || w.find((x) => x.bot && nm.includes(String(x.bot).toLowerCase())) /* invmatch-20261029: a house bot (Licorice) invited by email joins through her own account; the login lookup has no email, so match the invite's bot name to the account name */ || w.find((x) => !x.bot); if (hit) { hit.status = 'joined'; hit.joinedMs = Date.now(); } }
    /* noreset-20261029 (Dan): a new arrival no longer clears existing Ready */   // new participant: everyone re-confirms (not once live: the room is already running)
    if (lateJoin && d.live) { d.live.guests = d.live.guests || []; if (!d.live.guests.some((x) => x.uid === uid)) d.live.guests.push({ uid, name: txt(b.myName || u.name, 40) || 'Member', kind: 'human', side: ns, pass: 'brg_' + crypto.randomBytes(18).toString('base64url'), late: true }); }
    Q.put.run(JSON.stringify(d), Date.now(), row.id); console.log(`[prerooms] ${row.id} user ${uid} joined side ${ns}${lateJoin ? ' (late, room live)' : ''}`);
    return json(r, 200, { ...view(row, d, uid, ns), lateJoin }), true;
  }
  if (!side) return json(r, 404, { error: 'not found' }), true;   // non-members learn nothing (not even that it exists)
  if (!m[2] && q.method === 'GET') { if (d.status === 'setup') { let ch = fixBotInvites(d, uid, side, t); for (const c of d.cards) if (c.owner === uid && !c.edited) { const s = JSON.stringify(c); applyDef(c, d.type); if (JSON.stringify(c) !== s) ch = 1; } if (ch) Q.put.run(JSON.stringify(d), Date.now(), row.id); } return json(r, 200, view(row, d, uid, side)), true; }
  if (d.status !== 'setup' && m[2] !== 'close') return json(r, 409, { error: 'Room already ' + d.status, ...view(row, d, uid, side) }), true;
  if (m[2] === 'center' && q.method === 'PUT') {
    if (row.creator !== uid) return json(r, 403, { error: 'Only the room creator edits the center card.' }), true;
    if (b.type != null) { const nt = typeOf(d.access, b.type); if (nt.id !== d.type) { d.type = nt.id; for (const c of d.cards) { c.answers = (nt.prompts || []).map(() => ''); applyDef(c, nt.id); } } }
    for (const [f, n] of [['about', 400], ['goal', 300], ['topic', 280]]) if (b[f] != null) d.center[f] = txt(b[f], n);
    d.center.sellerSeat = 0;   // c23: payer leads; client value ignored
    for (const c of d.cards) c.ready = false;   // center changed: everyone re-confirms
    Q.put.run(JSON.stringify(d), Date.now(), row.id); return json(r, 200, view(row, d, uid, side)), true;
  }
  if (m[2] === 'invites' && q.method === 'POST') {   // record who was invited (labels only; nothing is sent from here)
    d.invites = d.invites || []; const ns = d.access === 'external' && side === 'A' ? 'B' : side; let n = 0; const dup = [], licQ = [];
    for (const l of (Array.isArray(b.labels) ? b.labels : [b.label]).slice(0, 20)) { const label = txt(l, 80); if (!label || d.invites.length >= 40) continue;
      if (d.invites.some((x) => x.status === 'waiting' && x.label.toLowerCase() === label.toLowerCase())) continue;
      { const hb = houseBot(label); if (hb) { if (botPresent(d, hb) || d.invites.some((x) => x.status === 'waiting' && x.bot === hb)) { dup.push(hb); continue; } { const inv = { label, side: ns, ms: Date.now(), status: 'waiting', by: uid, bot: hb }; d.invites.push(inv); if (hb === 'Licorice') licQ.push(inv); } n++; continue; } }   // cardfix-20261029: a house bot invite waits; the bot brings its own card (botjoin / its own account)   // yodacard-20261026: inviting Yoda/Ava/Finn by name or bot email = bot card joins
      const bc = d.cards.find((c) => c.owner === uid && c.kind === 'bot' && c.joined !== true && c.name && c.name.toLowerCase() === label.toLowerCase());
      if (bc) { bc.joined = true; /* noreset-20261029 */ d.invites.push({ label, side: bc.side, ms: Date.now(), status: 'joined', joinedMs: Date.now(), by: uid }); n++; continue; }   // c24: inviting your bot by name = it joins
      d.invites.push({ label, side: ns, ms: Date.now(), status: 'waiting', by: uid }); n++; }
    if (n) Q.put.run(JSON.stringify(d), Date.now(), row.id);
    if (n && (d.invites || []).some((x) => x.status === 'waiting' && x.bot === 'Yoda')) setTimeout(() => { yodaPickup(); }, 800);   // yodaauto
    for (const inv of licQ) licInvitePush(row, d, inv, u.name);   // yodaauto: no await
    return json(r, !n && dup.length ? 409 : 200, { ...view(row, d, uid, side), ...(dup.length ? { error: dup.join(', ') + ' is already in this room or already invited.' } : {}) }), true;
  }
  if (m[2] === 'bots' && q.method === 'POST') {
    if (d.cards.filter((c) => c.owner === uid && c.kind === 'bot').length >= 3) return json(r, 400, { error: 'Max 3 bots per person.' }), true;
    if (houseName(b.name)) return json(r, 409, { error: txt(b.name, 40) + ' is a house bot with its own card. Invite it instead; it joins by itself.' }), true;   // cardfix-20261029
    if (txt(b.name, 40) && botPresent(d, b.name)) return json(r, 409, { error: txt(b.name, 40) + ' is already in this room.' }), true;
    { const nb = newCard('bot', uid, side, b.name, t, d); if (txt(b.name, 40)) nb.name = txt(b.name, 40); nb.joined = true; /* noreset-20261029 */ d.cards.push(nb); } Q.put.run(JSON.stringify(d), Date.now(), row.id); return json(r, 201, view(row, d, uid, side)), true;
  }
  if (m[2] === 'close' && q.method === 'POST') {
    if (row.creator !== uid) return json(r, 403, { error: 'Only the room creator can close it.' }), true;
    try { await (await A()).preroomMeterStop(uid, d.meter); } catch {}
    d.status = 'closed'; Q.put.run(JSON.stringify(d), Date.now(), row.id); return json(r, 200, view(row, d, uid, side)), true;
  }
  if (m[3]) {
    const c = d.cards.find((x) => x.pid === m[3]);
    if (!c || c.owner !== uid) return json(r, 404, { error: 'not found' }), true;   // someone else's card: indistinguishable from missing
    if (!m[4] && q.method === 'PUT') { cleanCard(c, b); c.edited = true; saveDef(uid, c, d.type, b, !b.auto); c.ready = false; Q.put.run(JSON.stringify(d), Date.now(), row.id); return json(r, 200, view(row, d, uid, side)), true; }
    if (m[4] === '/join' && q.method === 'POST') { if (c.kind !== 'bot') return json(r, 400, { error: 'Only bot cards join this way.' }), true;   // c24: owner brings their bot into the room
      if (c.joined !== true) { c.joined = true; /* noreset-20261029 */ Q.put.run(JSON.stringify(d), Date.now(), row.id); } return json(r, 200, view(row, d, uid, side)), true; }
    if (m[4] && q.method === 'POST') { if (b.ready !== false) { const hc = c.kind === 'human' ? c : d.cards.find((x) => x.owner === uid && x.kind === 'human');   // voiceroom-20261029 step zero: no Ready without recording consent
        if (b.consent === true && hc && !hc.consent) { hc.consent = true; hc.consentMs = Date.now(); } if (b.consent === true && c.kind === 'bot' && !c.consent) { c.consent = 'owner'; c.consentMs = Date.now(); }
        if (!hc || !hc.consent) return json(r, 428, { error: 'Tick the recording consent box first (this room records audio).', consentRequired: true, ...view(row, d, uid, side) }), true;
        if (c.kind === 'bot' && !c.consent) { c.consent = 'owner'; c.consentMs = Date.now(); } }
      if (b.card) { cleanCard(c, b.card); c.edited = true; saveDef(uid, c, d.type, b.card, true); } c.ready = b.ready !== false; d.error = null; Q.put.run(JSON.stringify(d), Date.now(), row.id);
      await maybeGoLive(row, d); const d2 = JSON.parse(Q.get.get(row.id).data); return json(r, 200, view(row, d2, uid, side)), true; }
  }
  return json(r, 405, { error: 'method' }), true;
}
// voiceroom-20261029: shared handles for voiceroom.mjs (same DB connection, same file store)
export const __vr = { db, Q, FQ, FDIR, safeName, rosterOut, act };
