/* roomserver-20261018a: real multi-user presence + live A/V for HubFace dashboard rooms (rooms with an HF-… ID).
   WebSocket wss://hubface.org/api/room-live?room=<ID>: roster (name / signed-in username or guest name, host|guest, mic/cam),
   Room Chat relay, WebRTC signaling. Media: browser-to-browser mesh (soft cap 4 people), STUN only (no TURN yet).
   WebRTC approach ported from HingeHub usePeerRtc: perfect negotiation (polite side rolls back on glare), sendrecv video+audio
   transceivers, replaceTrack on mic/cam toggle, all remote tracks merged into one MediaStream per person.
   Wires: Live Roster, Room Chat, Mic/Camera buttons, "Live Video (everyone)". A Yoda (AI moderator) tile is always shown.
   Roll back: remove the <script src="room-live.js…"> tag.
   yodahear-20261018a: (1) "Yoda is listening" pill + tile badge from the server's {t:'listen'} state; (2) while the room is listening
   AND your mic is on, your OWN mic is transcribed in this browser (Web Speech API, Chrome/Edge) and each final phrase is sent as a
   room chat line marked source 'voice' (shown with a mic glyph); the room server forwards human lines to Yoda. Finn's wake listener
   is held (window.__micHold, the same hand-off the field-dictation helper uses) only while this transcription runs, and the room
   transcription yields to field dictation (__fieldMicActive). Lines heard while Yoda is speaking (+1.5 s) are dropped (echo guard).
   (3) The Yoda tile is a static image only: it never holds a <video> or a MediaStream (guarded on every paint).
   tiles-20261018a (Dan's A10): every participant gets their OWN floating panel (#ui > .rlPanel): Yoda's picture card, your own
   camera (replaces the #rbSelf tile while in a live room; initials when the camera is off) and one per remote person. Each panel
   drags by its body and resizes by its corner grip, independently; geometry is remembered per name in localStorage
   'hubface-rl-panels'. Panels appear on join, disappear on leave; new ones take the first free spot (right side first), else
   cascade. The 'Live Video (everyone)' widget entry is now a show/hide toggle for all panels (no shared tile box in live rooms).
   Signalling / WebRTC / TURN / chat / listening code is unchanged; only where tiles render changed.
   panelmin-20261018a: each panel has the dashboard's minimize toggle (.boxmin icon, same glyphs: inward arrows = minimize,
   four outward arrows = restore); minimized = the same 170x26 title strip as other widgets; remembered per name (min:1).
   panelmin-20261018b: the ROOM BAR (#rbBar) gets the same minimize toggle. Minimized = a small square (Finn's collapsed size,
   72x60) holding only the drag grip, the real Mic button (same element, same behaviour) and the restore toggle; the
   'Yoda is listening' pill hides with it. It tucks to the nearest free bottom spot unless you have dragged the square before
   (hcrb-bar-min); restore puts the full bar back exactly where it was (hcrb-bar stays the full bar's spot). State: hcrb-bar-col.
   stt-20261018a: speech-to-text for Yoda now uses AssemblyAI Universal-3.6 Pro Realtime. The room server mints a short-lived
   token over this room's WebSocket ({t:'stt-token'}; the API key never leaves the VPS); this browser streams 16 kHz PCM from the
   room's own mic track (AudioWorklet) straight to wss://streaming.assemblyai.com/v3/ws and sends every end_of_turn transcript as
   the same {t:'chat', source:'voice'} line as before (server merge / fast path / webhook unchanged). The session is closed
   (Terminate) whenever the mic is off, Yoda stops listening, the room is left or the tab is hidden > 60 s; open/close is reported
   ({t:'stt-session'}) for the server's daily cap. Browser speech (Web Speech) stays as the automatic fallback when no token can be
   minted (key not set, daily cap, errors) or AssemblyAI fails 3 times in 2 min. localStorage 'hubface-stt'='web' forces fallback. */
(function () {
  'use strict';
  if (window.__roomLive) return;
  var RB = window.__rb, App = RB && RB.App, W = RB && RB.W; if (!App || !W) { console.warn('[room-live] room builder not found'); return; }
  var BUILD = 'botmute-20261021a+floppy-photo-20261025a+livedot-20261018a+names-20261019+autochat-20261019a+botname-20261019a+floor-20261019a+voicefix-20261019a', YODA_IMG = 'assets/yoda.jpg', GN = 'hubface-guest-name';
  var RI = function () { return window.__roomId; };
  var ws = null, cur = null, self = null, peers = new Map(), chat = [], ice = [{ urls: 'stun:stun.l.google.com:19302' }], tries = 0, iceT = null, retryT = null, softCap = 4, status = 'idle', lastErr = '';
  var yoda = { speaking: false, quietAt: 0 }, listen = { on: false, until: 0 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function live() { return !!(ws && ws.readyState === 1 && self); }
  /* hfyoda-20261019: real names - account displayName, then ?name= on the invite link, then a saved name, then ask once */
  var meName = null, meP = (function () { try { return fetch('/api/account/me', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { var a = j && j.authenticated && j.account; meName = a && (a.displayName || a.real_name || a.username) || null; }).catch(function () {}); } catch (_) { return Promise.resolve(); } })();
  function guestName() { if (meName) return String(meName).slice(0, 40); var n = ''; try { n = new URLSearchParams(location.search).get('name') || new URLSearchParams(location.hash.replace(/^#[^?]*\?/, '')).get('name') || ''; } catch (_) {} try { if (!n) n = localStorage.getItem(GN) || ''; } catch (_) {} if (/^Guest \d{4}$/.test(n)) n = ''; if (!n) { try { n = (window.prompt('Your name for this room:', '') || '').trim(); } catch (_) {} } if (!n) n = 'Guest ' + (1000 + Math.floor(Math.random() * 9000)); n = n.slice(0, 40); try { localStorage.setItem(GN, n); } catch (_) {} return n; }
  function send(o) { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(o)); } catch (_) {} }
  function localTrack(kind) { var s = App.state.stream; if (!s) return null; var t = s.getTracks().filter(function (x) { return x.kind === kind && x.readyState === 'live'; })[0]; return t || null; }
  function myState() { return { t: 'state', mic: !!App.state.mic, cam: !!App.state.cam, photo: window.__hfMyPhoto || null }; }   /* floppy-photo-20261025a: photo */

  /* ---------- connection ---------- */
  function wantRoom() { var r = RI(); return App.inRoom && r && r.id() ? r.id() : null; }
  function tick() { var w = wantRoom(); if (w !== cur) { disconnect(); if (w) connect(w); } }
  function connect(id) {
    cur = id; status = 'connecting'; paintAll();
    var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room-live?room=' + encodeURIComponent(id);
    try { ws = new WebSocket(url); } catch (e) { lastErr = String(e); return retry(); }
    var me = ws;
    ws.onopen = function () { if (ws !== me) return; tries = 0; Promise.race([meP, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () { if (ws !== me) return; send({ t: 'join', name: guestName(), ownerKey: App.state.room.roomKey || null, mic: !!App.state.mic, cam: !!App.state.cam, photo: window.__hfMyPhoto || null }); }); };
    ws.onmessage = function (e) { if (ws !== me) return; var m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
    ws.onclose = function (e) { if (ws !== me) return; ws = null; self = null; dropPeers(); status = cur ? 'reconnecting' : 'idle'; paintAll(); if (cur) retry(e && e.code); };
  }
  function retry(code) { clearTimeout(retryT); tries++; if (tries > 8) { status = 'offline'; lastErr = 'Could not reach the room server.'; paintAll(); return; } var id = cur; retryT = setTimeout(function () { if (cur === id && !ws) connect(id); }, Math.min(15000, 800 * Math.pow(2, tries - 1))); }
  function disconnect() { clearTimeout(retryT); clearInterval(iceT); tries = 0; var w = ws; ws = null; self = null; cur = null; chat = []; listen = { on: false, until: 0 }; paintListen(); if (w) { try { w.send(JSON.stringify({ t: 'leave' })); } catch (_) {} try { w.close(1000); } catch (_) {} } dropPeers(); status = 'idle'; paintAll(); }
  addEventListener('pagehide', function () { if (ws) { try { ws.send(JSON.stringify({ t: 'leave' })); ws.close(1000); } catch (_) {} } });

  function onMsg(m) {
    if (m.t === 'welcome') {
      self = m.self; status = 'live'; softCap = m.softCap || 4; if (Array.isArray(m.ice) && m.ice.length) ice = m.ice;
      clearInterval(iceT); iceT = setInterval(function () { send({ t: 'ice' }); }, 45 * 60000);   // turn-20261018a: TURN creds live 1 h; refresh at 45 min
      chat = (m.chat || []).slice(); replayChat(); setListen(m.listen);
      (m.peers || []).forEach(function (p) { var e = addPeer(p); ensurePc(e, true); });   // newcomer offers to everyone already here
      if ((m.peers || []).length) openVideo();
      send(myState()); paintAll(); autoChat(); return;
    }
    if (m.t === 'peer-join') { addPeer(m.peer); openVideo(); paintAll(); try { App.toast(m.peer.name + ' joined the room'); } catch (_) {} return; }
    if (m.t === 'peer-leave') { var e = peers.get(m.id); if (e) { closePeer(e); peers.delete(m.id); } paintAll(); try { App.toast((m.name || 'Someone') + ' left the room'); } catch (_) {} return; }
    if (m.t === 'peer-state') { var p = peers.get(m.peer.id); if (p) { var camWas = p.info.cam; p.info = m.peer; if (camWas !== p.info.cam) paintTiles(); else bindTiles(); paintRoster(); } return; }
    if (m.t === 'ice') { if (Array.isArray(m.ice) && m.ice.length) { ice = m.ice; peers.forEach(function (e) { if (e.pc) try { e.pc.setConfiguration(rtcConfig()); } catch (_) {} }); } return; }
    if (m.t === 'signal') { var q = peers.get(m.from); if (q) onSignal(q, m.data); return; }
    if (m.t === 'chat') { chat.push(m); if (chat.length > 100) chat.shift(); printChat(m); try { chatUnread(m); } catch (_) {} return; }
    if (m.t === 'yoda-say') { botSaid(m.text); onYodaSay(m); return; }
    if (m.t === 'listen') { setListen(m); return; }
    if (m.t === 'stt-token') { aaiToken(m); return; }
    if (m.t === 'stt-stop') { aaiServerStop(m); return; }
    if (m.t === 'error') { lastErr = m.msg || m.code; try { App.toast(lastErr); } catch (_) {} paintRoster(); return; }
  }

  /* ---------- WebRTC (mesh, perfect negotiation) ---------- */
  /* turn-20261018a: STUN + turn:turn.hubface.org:3478 (udp, tcp) + turns:5349 with short-lived creds from the room server.
     localStorage 'hubface-ice-relay' = '1' forces relay-only (iceTransportPolicy 'relay') for testing. */
  function rtcConfig() { var c = { iceServers: ice }; try { if (localStorage.getItem('hubface-ice-relay') === '1') c.iceTransportPolicy = 'relay'; } catch (_) {} return c; }
  function addPeer(info) { var e = peers.get(info.id); if (e) { e.info = info; return e; } e = { id: info.id, info: info, pc: null, stream: new MediaStream(), makingOffer: false, ignoreOffer: false, polite: false, audio: null, conn: 'new' }; peers.set(info.id, e); return e; }
  function syncTracks(e) {
    if (!e.pc) return; e.pc.getTransceivers().forEach(function (t) {
      var kind = t.receiver && t.receiver.track && t.receiver.track.kind; if (!kind || t.stopped || t.currentDirection === 'stopped') return;
      var want = localTrack(kind); if (t.sender.track !== want) t.sender.replaceTrack(want).catch(function () {});
      if (t.direction !== 'sendrecv') try { t.direction = 'sendrecv'; } catch (_) {}
    });
  }
  function ensurePc(e, initiator) {
    if (e.pc) return e.pc;
    e.polite = !!(self && self.id > e.id);
    var pc = e.pc = new RTCPeerConnection(rtcConfig());
    if (initiator) { pc.addTransceiver('video', { direction: 'sendrecv' }); pc.addTransceiver('audio', { direction: 'sendrecv' }); syncTracks(e); }
    pc.onicecandidate = function (ev) { if (ev.candidate) send({ t: 'signal', to: e.id, data: { type: 'ice', candidate: ev.candidate.toJSON() } }); };
    pc.onnegotiationneeded = function () { makeOffer(e); };
    pc.onconnectionstatechange = function () { e.conn = pc.connectionState; paintRoster(); if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (_) {} } };
    pc.ontrack = function (ev) {
      var t = ev.track; if (!e.stream.getTracks().some(function (x) { return x.id === t.id; })) e.stream.addTrack(t);
      t.onunmute = function () { bindTiles(); bindAudio(e); }; t.onended = function () { try { e.stream.removeTrack(t); } catch (_) {} bindTiles(); };
      bindAudio(e); bindTiles();
    };
    return pc;
  }
  function makeOffer(e) {
    var pc = e.pc; if (!pc || e.makingOffer) return;
    e.makingOffer = true;
    pc.setLocalDescription().then(function () { send({ t: 'signal', to: e.id, data: { type: 'offer', sdp: pc.localDescription && pc.localDescription.toJSON() } }); })
      .catch(function (err) { console.warn('[room-live] offer', err); }).then(function () { e.makingOffer = false; });
  }
  function onSignal(e, d) {
    var pc = ensurePc(e, false);
    if (d.type === 'offer' || d.type === 'answer') {
      var desc = d.sdp; if (!desc || !desc.type) return;
      var collision = desc.type === 'offer' && (e.makingOffer || pc.signalingState !== 'stable');
      e.ignoreOffer = !e.polite && collision; if (e.ignoreOffer) return;
      (collision ? pc.setLocalDescription({ type: 'rollback' }).catch(function () {}) : Promise.resolve())
        .then(function () { return pc.setRemoteDescription(desc); })
        .then(function () { if (desc.type !== 'offer') return; syncTracks(e); return pc.setLocalDescription().then(function () { send({ t: 'signal', to: e.id, data: { type: 'answer', sdp: pc.localDescription.toJSON() } }); }); })
        .catch(function (err) { console.warn('[room-live] sdp', err); });
    } else if (d.type === 'ice' && d.candidate) {
      pc.addIceCandidate(d.candidate).catch(function (err) { if (!e.ignoreOffer) console.warn('[room-live] ice', err); });
    }
  }
  function closePeer(e) { try { e.pc && e.pc.close(); } catch (_) {} e.pc = null; if (e.audio) { try { e.audio.srcObject = null; e.audio.remove(); } catch (_) {} e.audio = null; } }
  function dropPeers() { peers.forEach(closePeer); peers.clear(); }
  function audioBox() { var b = document.getElementById('rlAudio'); if (!b) { b = document.createElement('div'); b.id = 'rlAudio'; b.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden'; document.body.appendChild(b); } return b; }
  function bindAudio(e) {
    var at = e.stream.getAudioTracks(); if (!at.length) return;
    if (!e.audio) { e.audio = document.createElement('audio'); e.audio.autoplay = true; e.audio.setAttribute('playsinline', ''); e.audio.dataset.pid = e.id; audioBox().appendChild(e.audio); }
    var s = e.audio.srcObject; if (!s || s.getAudioTracks()[0] !== at[0]) e.audio.srcObject = new MediaStream(at);
    var p = e.audio.play(); if (p && p.catch) p.catch(function () { needGesture = true; });
  }
  var needGesture = false;
  ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function () { if (!needGesture) return; needGesture = false; peers.forEach(function (e) { if (e.audio) e.audio.play().catch(function () {}); }); }, true); });

  /* ---------- UI ---------- */
  function css() {
    if (document.getElementById('rl-css')) return; var s = document.createElement('style'); s.id = 'rl-css';
    s.textContent = '.rlTiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}.rlTile [hidden]{display:none!important}.rlTile{position:relative;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18)}' +
      '.rlTile video{width:100%;height:100%;object-fit:cover;display:block;background:#000}.rlTile .rlOff{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;opacity:.8;text-align:center;padding:6px}' +
      '.rlTile .rlAv{width:46%;max-width:90px;aspect-ratio:1;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.5)}.rlTile .rlIni{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font:700 20px/1 Montserrat,sans-serif;background:rgba(0,156,253,.35);border:2px solid rgba(255,255,255,.4)}' +
      '.rlTile .rlNm{position:absolute;left:6px;bottom:5px;right:6px;font-size:10.5px;font-weight:600;text-shadow:0 1px 3px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.rlTile.yoda{background:radial-gradient(circle at 50% 40%,rgba(0,156,253,.25),rgba(0,0,0,.45))}.rlTile.yoda .rlAv{width:40%;max-width:76px;filter:saturate(.9)}.rlTile.yoda.speaking .rlAv{animation:rlTalk .7s ease-in-out infinite alternate;border-color:#38c6ff}.rlTile.yoda .rlAI{left:6px;right:auto;background:rgba(0,156,253,.55)}.rlTile.yoda.listening{border-color:rgba(74,222,128,.7)}' +
      '@keyframes rlTalk{from{box-shadow:0 0 0 3px rgba(56,198,255,.3),0 0 10px rgba(56,198,255,.35)}to{box-shadow:0 0 0 6px rgba(56,198,255,.5),0 0 26px rgba(56,198,255,.75)}}' +
      '#rlListen{position:fixed;left:50%;bottom:170px;transform:translateX(-50%);z-index:99990;display:none;align-items:center;gap:7px;padding:4px 11px;border-radius:14px;background:rgba(10,30,20,.86);border:1px solid rgba(74,222,128,.7);color:#d1fae5;font:600 12px/1.25 Montserrat,system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:min(92vw,560px);white-space:nowrap}#rlListen.on{display:flex}#rlListen .b{font-weight:500;opacity:.92;overflow:hidden;text-overflow:ellipsis}#rlListen.warn{border-color:rgba(251,146,60,.85);background:rgba(40,22,8,.9);color:#ffedd5}#rlListen.warn i{background:#fb923c;box-shadow:0 0 8px #fb923c}#rlListen i{flex:none;width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80}#rlListen.hear i{animation:rlHear .5s ease-in-out infinite alternate}@keyframes rlHear{to{opacity:.3;transform:scale(1.5)}}.rlTile .rlSt{position:absolute;right:6px;top:5px;font-size:10px;padding:1px 6px;border-radius:9px;background:rgba(0,0,0,.45)}' +
      '#ui > .rlPanel{position:absolute;aspect-ratio:auto;width:168px;height:126px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.3);box-shadow:0 6px 20px rgba(0,0,0,.45);cursor:grab;touch-action:none;z-index:30;color:#fff;font-family:Montserrat,system-ui,sans-serif;user-select:none;-webkit-user-select:none}' +
      '#ui > .rlPanel,#ui > .rlPanel *{pointer-events:auto!important}#ui > .rlPanel .rlIn,#ui > .rlPanel .rlIn *{pointer-events:none!important}#ui > .rlPanel.dragging{cursor:grabbing}' +
      '#ui > .rlPanel .rlIn{position:absolute;inset:0}#ui > .rlPanel .rlNm{right:auto;max-width:calc(100% - 24px);background:rgba(0,0,0,.55);padding:1px 6px;border-radius:5px;font-size:9.5px}' +
      '#ui > .rlPanel[data-self]{border-color:var(--hub-blue,#2fa8ff)}#ui > .rlPanel[data-self] video{transform:scaleX(-1)}#ui > .rlPanel[data-self].talking{box-shadow:0 0 0 2px #34d399,0 0 18px rgba(52,211,153,.6)}' +
      '#ui > .rlPanel.yoda{background:radial-gradient(circle at 50% 40%,rgba(0,156,253,.25),rgba(0,0,0,.55))}#ui > .rlPanel.yoda.listening{border-color:rgba(74,222,128,.7)}#ui > .rlPanel.yoda .rlAv{width:auto;height:58%;max-width:none;max-height:120px}' +
      '#ui > .rlPanel .rlGrip{position:absolute;right:0;bottom:0;width:14px;height:14px;z-index:7;cursor:nwse-resize;border-radius:0 0 7px 0;background:linear-gradient(135deg,transparent 55%,rgba(255,255,255,.55) 56%,rgba(255,255,255,.55) 62%,transparent 63%,transparent 72%,rgba(255,255,255,.55) 73%,rgba(255,255,255,.55) 79%,transparent 80%)}' +
      '#ui > .rlPanel > .rlMin{left:auto;right:5px;top:5px;z-index:8;color:#fff}#ui > .rlPanel .rlSt{right:24px}#ui > .rlPanel .rlMin .ic{width:13px;height:13px;display:block}' +
      '#ui > .rlPanel.collapsed{width:170px!important;height:26px!important;border-radius:7px}#ui > .rlPanel.collapsed .rlIn > :not(.rlNm),#ui > .rlPanel.collapsed > .rlGrip{display:none!important}' +
      '#ui > .rlPanel.collapsed .rlNm{left:9px;top:6px;bottom:auto;max-width:128px;background:none;padding:0;font-size:8.6px;line-height:12px}#ui > .rlPanel.collapsed > .rlMin{top:6.5px}' +
      '#ui #rbBar > .rbmin{position:static;flex:none;width:14px;height:14px;margin:0 2px 0 4px;display:grid;place-items:center;color:#e6edff;opacity:.8}#ui #rbBar > .rbmin:hover{opacity:1}#ui #rbBar > .rbmin .ic{width:12px;height:12px;display:block}' +
      '#ui #rbBar.rbcol{display:block!important;width:72px!important;height:60px!important;min-width:0!important;max-width:none!important;padding:0!important;gap:0!important;border-radius:12px!important}' +
      '#ui #rbBar.rbcol > :not(.rbgrip):not(#rb_avMic):not(.rbmin){display:none!important}#ui #rbBar.rbcol > .rbgrip{position:absolute;left:6px;top:5px;width:15px;height:15px;margin:0;opacity:.75}' +
      '#ui #rbBar.rbcol > .rbmin{position:absolute;right:6px;top:6px;margin:0}#ui #rbBar.rbcol > #rb_avMic{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);height:34px;min-width:44px;padding:2px 4px}#ui #rbBar.rbcol > #rb_avMic span{font-size:8px;white-space:nowrap}' +
      'html.rbbar-col #rlListen{display:none!important}' +
      'html:not(.rb-room) #ui > .rlPanel,html.rlHide #ui > .rlPanel{display:none!important}html.rl-panels #ui > #rbSelf{display:none!important}' +
      '.rlRos .rlRow{display:flex;align-items:center;gap:7px;padding:4px 2px}.rlRos img{width:22px;height:22px;border-radius:50%;object-fit:cover}.rlRos .rlDot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(0,156,253,.3);font-size:10px;font-weight:700}' +
      '.rlRos .rlTag{font-size:9px;padding:0 5px;border-radius:7px;background:rgba(255,255,255,.14);margin-left:2px}.rlRos .rlEnd{margin-left:auto;font-size:11px;white-space:nowrap}';
    s.textContent += '/* livedot-20261018a: LIVE / OFF badge on Yoda\'s tile + panel (driven by the .listening / .speaking classes) */.rlTile.yoda .rlLive{position:absolute;left:6px;right:auto;top:24px;z-index:6;display:flex;align-items:center;gap:4px;padding:1px 6px 1px 5px;border-radius:9px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.22);font:700 9px/1.3 Montserrat,system-ui,sans-serif;letter-spacing:.08em;color:#cbd5e1;pointer-events:none}.rlTile.yoda .rlLive i{width:7px;height:7px;border-radius:50%;background:#6b7280;flex:none}.rlTile.yoda .rlLive b.on{display:none}.rlTile.yoda.listening .rlLive{color:#bbf7d0;border-color:rgba(74,222,128,.75);background:rgba(6,40,20,.72)}.rlTile.yoda.listening .rlLive b.on{display:inline}.rlTile.yoda.listening .rlLive b.off{display:none}.rlTile.yoda.listening .rlLive i{background:#4ade80;box-shadow:0 0 6px #4ade80,0 0 12px rgba(74,222,128,.7);animation:rlLiveP 1.6s ease-in-out infinite}.rlTile.yoda.listening.speaking .rlLive i{background:#86efac;animation-duration:.55s}.rlTile.yoda.listening.speaking .rlLive{box-shadow:0 0 10px rgba(74,222,128,.55)}@keyframes rlLiveP{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.55}}#ui > .rlPanel.yoda.collapsed .rlIn > .rlLive{display:flex!important;top:6px;left:auto;right:24px;padding:0 5px;font-size:7.5px}@media (prefers-reduced-motion:reduce){.rlTile.yoda .rlLive i{animation:none!important}}/* livedot-20261018a chatmin: minimized Room Chat folds to a small draggable square (four-arrow restore, unread badge) */#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava){width:58px!important;height:58px!important;border-radius:12px!important;overflow:visible!important}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > header,#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > .fogbtn,#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > .boxclose{display:none!important}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > .boxmin{left:auto!important;right:3px!important;top:3px!important}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava)::before{content:\'\\1F4AC\';position:absolute;left:0;right:0;top:15px;text-align:center;font-size:20px;line-height:1;pointer-events:none}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava)::after{content:\'Chat\';position:absolute;left:0;right:0;bottom:5px;text-align:center;font:700 7.5px/1 Montserrat,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.85;pointer-events:none}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > .fhandle{display:block!important;position:absolute!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:auto!important;height:auto!important;border-radius:12px!important;pointer-events:auto!important}#ui > section.rbbox[data-k=chat] > .rlUnread{display:none}#ui#ui > section.floatbox.rbbox[data-k=chat].collapsed:not(.ava) > .rlUnread[data-n]{display:block!important;position:absolute;left:-6px;top:-6px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#ef4444;color:#fff;font:700 9.5px/16px Montserrat,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px rgba(0,0,0,.5);pointer-events:none;z-index:9}';
    document.head.appendChild(s);
  }
  var origTiles = App.renderTiles, origRoster = App.renderRoster;
  function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase() || '?'; }
  /* yodahear-20261018a: the Yoda tile is a STATIC picture card (no <video>, no srcObject, ever); glow ring while /say audio plays */
  function yodaTile() { return '<div class="rlTile yoda' + (yoda.speaking ? ' speaking' : '') + (listen.on ? ' listening' : '') + '" data-yoda="1" data-static="1"><div class="rlOff"><img class="rlAv" src="' + YODA_IMG + '" alt="Yoda (AI moderator, picture)" draggable="false"></div>' +
    '<span class="rlSt rlAI">Yoda \u00b7 AI CEO \u00b7 voice only</span>' + bmBtn('yoda', 'Yoda') + '<span class="rlLive" title="Yoda is listening in this room" aria-hidden="true"><i></i><b class="on">LIVE</b><b class="off">OFF</b></span><span class="rlNm">Yoda (AI moderator)' + (listen.on ? ' \u00b7 listening' : '') + '</span></div>'; }
  function guardYoda() { document.querySelectorAll('.rlTile.yoda').forEach(function (t) { t.querySelectorAll('video,audio,canvas,iframe').forEach(function (v) { try { v.srcObject = null; } catch (_) {} v.remove(); console.warn('[room-live] removed media element from the Yoda tile'); }); }); }
  App.renderTiles = function (b) {
    if (!wantRoom()) return origTiles.call(App, b);
    css(); b.innerHTML = '<p class="muted">Everyone in this room has their own video panel. Drag a panel to move it; drag its corner to resize it.</p><div class="row"><button type="button" class="rlTog">' + (pv.hidden ? 'Show' : 'Hide') + ' all video panels</button></div>';
    var t = b.querySelector('.rlTog'); if (t) t.onclick = function () { setPanelsHidden(!pv.hidden); };
  };
  function bindTiles() {
    guardYoda();
    document.querySelectorAll('.rlTile[data-pid]:not(.yoda)').forEach(function (t) {
      var e = peers.get(t.dataset.pid); if (!e) return; var v = t.querySelector('video'), off = t.querySelector('.rlOff');
      var vt = e.stream.getVideoTracks().filter(function (x) { return x.readyState === 'live'; });
      if (v) { if (vt.length) { if (!v.srcObject || v.srcObject.getVideoTracks()[0] !== vt[0]) { v.srcObject = new MediaStream(vt); v.play().catch(function () {}); } if (off) off.hidden = true; } else if (off) off.hidden = false; }
      var st = t.querySelector('.rlSt'); if (st) st.textContent = e.info.mic ? '\ud83c\udf99' : '\ud83d\udd07';
    });
    var sp = document.querySelector('#ui > .rlPanel[data-self]');
    if (sp) { var sv = sp.querySelector('video'), ss = App.state.stream; if (sv && ss && sv.srcObject !== ss) { sv.muted = true; sv.srcObject = ss; sv.play().catch(function () {}); }
      var sst = sp.querySelector('.rlSt'); if (sst) sst.textContent = App.state.mic ? '\ud83c\udf99' : '\ud83d\udd07'; }
  }

  /* ---------- tiles-20261018a: one floating panel per participant ---------- */
  var PK = 'hubface-rl-panels', SW = 1024, SH = 576, pv = { hidden: false, map: new Map(), n: 0 };
  function stg() { var s = document.getElementById('stage'), w = s && s.getBoundingClientRect().width; return (w && w / SW) || 1; }
  function uiEl() { return document.getElementById('ui'); }
  function pLoad() { try { return JSON.parse(localStorage.getItem(PK) || '{}') || {}; } catch (_) { return {}; } }
  function pSave(key, el) { var m = pLoad(); delete m[key]; m[key] = { x: el.offsetLeft, y: el.offsetTop, w: Math.round(parseFloat(el.style.width) || el.offsetWidth), h: Math.round(parseFloat(el.style.height) || el.offsetHeight) }; if (el.classList.contains('collapsed')) m[key].min = 1; var ks = Object.keys(m); while (ks.length > 60) delete m[ks.shift()]; try { localStorage.setItem(PK, JSON.stringify(m)); } catch (_) {} }
  function pFront(el) { var z = 30; document.querySelectorAll('#ui > section.floatbox, #ui > .rlPanel').forEach(function (o) { if (o !== el) z = Math.max(z, +o.style.zIndex || 0); }); if ((+el.style.zIndex || 0) <= z) el.style.zIndex = z + 1; }
  function clampN(v, a, b) { return Math.round(Math.max(a, Math.min(b, v))); }
  function pRects(skip) { var o = []; pv.map.forEach(function (p) { if (p.el !== skip) o.push({ x: p.el.offsetLeft, y: p.el.offsetTop, w: p.el.offsetWidth, h: p.el.offsetHeight }); }); return o; }
  function pPlace(w, h) {   // first free spot, right column first (top to bottom), then the next column to the left; else cascade
    var A = null; try { A = App.freeArea(); } catch (_) {} if (!A) A = { x0: 8, y0: 50, x1: SW - 8, y1: SH - 8, obs: [] };
    var obs = (A.obs || []).concat(pRects()), hit = function (a, b) { return a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6 && a.y < b.y + b.h + 6 && b.y < a.y + a.h + 6; };
    for (var x = A.x1 - w; x >= A.x0; x -= 8) for (var y = A.y0; y + h <= A.y1; y += 8) { var r = { x: x, y: y }; r.w = w; r.h = h; if (!obs.some(function (o) { return hit(r, o); })) return r; }
    var n = pv.n % 8; return { x: SW - w - 16 - n * 26, y: 56 + n * 26 };
  }
  function pMake(id, skey, cls, attrs) {
    var ui = uiEl(); if (!ui) return null;
    var el = document.createElement('div'); el.className = 'rlPanel rlTile' + (cls ? ' ' + cls : ''); el.setAttribute('data-pk', id);
    Object.keys(attrs || {}).forEach(function (a) { el.setAttribute(a, attrs[a]); });
    el.title = 'Drag to move \u00b7 drag the corner to resize';
    el.innerHTML = '<div class="rlIn"></div><span class="ctl boxmin rlMin" role="button"></span><span class="rlGrip" role="button" title="Resize (drag the corner)" aria-label="Resize"></span>';
    var P = pLoad()[skey], w = P && P.w >= 96 ? Math.min(640, P.w) : 168, h = P && P.h >= 72 ? Math.min(480, P.h) : 126, r = null;
    if (P && isFinite(P.x) && isFinite(P.y)) { r = { x: P.x, y: P.y }; if (pRects().some(function (o) { return Math.abs(o.x - P.x) < 4 && Math.abs(o.y - P.y) < 4; })) r = null; }
    if (!r) r = pPlace(w, h);
    el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = clampN(r.x, 0, SW - w) + 'px'; el.style.top = clampN(r.y, 0, SH - h) + 'px';
    if (P && P.min) el.classList.add('collapsed');
    ui.appendChild(el); pv.n++; pFront(el);
    var mb = el.querySelector('.rlMin'); minPaint(el);
    mb.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    mb.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); el.classList.toggle('collapsed'); minPaint(el); pSave(el._skey || skey, el); });
    mb.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); });
    var g = el.querySelector('.rlGrip'), d = null, rz = null;
    el.addEventListener('pointerdown', function (e) { if (e.button !== 0 || e.target === g) return; e.stopPropagation(); e.preventDefault(); pFront(el); d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: el.offsetLeft, y: el.offsetTop, k: stg() }; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch (_) {} });
    el.addEventListener('pointermove', function (e) { if (!d || e.pointerId !== d.id) return; el.style.left = clampN(d.x + (e.clientX - d.sx) / d.k, 0, SW - el.offsetWidth) + 'px'; el.style.top = clampN(d.y + (e.clientY - d.sy) / d.k, 0, SH - el.offsetHeight) + 'px'; });
    var end = function (e) { if (!d || e.pointerId !== d.id) return; d = null; el.classList.remove('dragging'); pSave(el._skey || skey, el); try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { el.addEventListener(ev, end); });
    g.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); pFront(el); rz = { id: e.pointerId, sx: e.clientX, sy: e.clientY, w: el.offsetWidth, h: el.offsetHeight, k: stg() }; try { g.setPointerCapture(e.pointerId); } catch (_) {} });
    g.addEventListener('pointermove', function (e) { if (!rz || e.pointerId !== rz.id) return; el.style.width = clampN(rz.w + (e.clientX - rz.sx) / rz.k, 96, Math.min(640, SW - el.offsetLeft)) + 'px'; el.style.height = clampN(rz.h + (e.clientY - rz.sy) / rz.k, 72, Math.min(480, SH - el.offsetTop)) + 'px'; });
    var gend = function (e) { if (!rz || e.pointerId !== rz.id) return; rz = null; pSave(el._skey || skey, el); try { g.releasePointerCapture(e.pointerId); } catch (_) {} };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { g.addEventListener(ev, gend); });
    ['dblclick', 'click', 'contextmenu'].forEach(function (ev) { el.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    return el;
  }
  /* panelmin-20261018a: same glyphs as the dashboard boxmin (copied from a live widget's icon when one is on screen) */
  var MIN_IN = 'M4 9h5V4M9 9 3.5 3.5M20 9h-5V4M15 9l5.5-5.5M4 15h5v5M9 15l-5.5 5.5M20 15h-5v5M15 15l5.5 5.5', MIN_OUT4 = 'M9 4H4v5M4 4l5.5 5.5M15 4h5v5M20 4l-5.5 5.5M9 20H4v-5M4 20l5.5-5.5M15 20h5v-5M20 20l-5.5-5.5', minHTML = null;
  function minIcon(c) { if (!minHTML) { var src = null; document.querySelectorAll('#ui > section.box:not(.collapsed) > .boxmin').forEach(function (b) { var q = b.querySelector('path'); if (!src && q && q.getAttribute('d') === MIN_IN) src = b.innerHTML; }); minHTML = src || '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + MIN_IN + '"/></svg>'; } return c ? minHTML.replace(MIN_IN, MIN_OUT4) : minHTML; }
  function minPaint(el) { var b = el.querySelector('.rlMin'); if (!b) return; var c = el.classList.contains('collapsed'), h = minIcon(c), t = c ? 'Expand' : 'Minimize'; if (b.innerHTML !== h) b.innerHTML = h; b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', c ? 'true' : 'false'); }
  var MIC = '\ud83c\udf99', MUTE = '\ud83d\udd07';
  function camOff(n) { return '<div class="rlOff"><div><div class="rlIni">' + esc(initials(n)) + '</div><div style="margin-top:6px">Camera off</div></div></div>'; }
  function yodaInner() { return '<div class="rlOff"><img class="rlAv" src="' + YODA_IMG + '" alt="Yoda (AI moderator, picture)" draggable="false"></div><span class="rlSt rlAI">Yoda \u00b7 AI CEO \u00b7 voice only</span>' + bmBtn('yoda', 'Yoda') + '<span class="rlLive" title="Yoda is listening in this room" aria-hidden="true"><i></i><b class="on">LIVE</b><b class="off">OFF</b></span><span class="rlNm">Yoda (AI moderator)' + (listen.on ? ' \u00b7 listening' : '') + '</span>'; }
  function selfName() { return (self && self.name) || guestName(); }
  function selfCam() { return !!(App.state.cam && localTrack('video')); }
  function selfInner() { var n = selfName(); return (selfCam() ? '<video autoplay playsinline muted></video>' : camOff(n)) + '<span class="rlSt">' + (App.state.mic ? MIC : MUTE) + '</span><span class="rlNm">' + esc(n) + ' (you)</span>'; }
  function peerInner(e) { var i = e.info; return (i.cam ? '<video autoplay playsinline muted></video>' : '') + camOff(i.name).replace('<div class="rlOff">', '<div class="rlOff"' + (i.cam ? ' hidden' : '') + '>') + '<span class="rlSt">' + (i.mic ? MIC : MUTE) + '</span><span class="rlNm">' + esc(i.name) + (i.role === 'host' ? ' \u00b7 host' : '') + '</span>' + (peerIsBot(i) ? bmBtn(peerBotKey(e), i.name).replace('<span ', '<span data-nm="' + esc(i.name) + '" ') : ''); }
  function nameKey(n) { return 'n:' + String(n || '').trim().toLowerCase(); }
  function syncPanels() {
    var on = !!wantRoom() && !!uiEl(), de = document.documentElement;
    de.classList.toggle('rl-panels', on); de.classList.toggle('rlHide', on && pv.hidden);
    if (!on) { if (pv.map.size) { pv.map.forEach(function (p) { p.el.remove(); }); pv.map.clear(); } pv.n = 0; return; }
    css();
    var want = [{ id: 'yoda', skey: '__yoda', cls: 'yoda', attrs: { 'data-yoda': '1', 'data-static': '1' }, sig: 'y|' + listen.on + '|' + bmMuted('yoda'), inner: yodaInner },
      { id: 'self', skey: '__self', cls: '', attrs: { 'data-self': '1' }, sig: 's|' + selfCam() + '|' + selfName(), inner: selfInner }];
    peers.forEach(function (e) { var i = e.info; want.push({ id: 'p:' + e.id, skey: nameKey(i.name), cls: '', attrs: { 'data-pid': e.id }, sig: 'p|' + !!i.cam + '|' + i.name + '|' + i.role + '|' + (peerIsBot(i) && bmMuted(peerBotKey(e))), inner: function () { return peerInner(e); } }); });
    var keep = {};
    want.forEach(function (w) {
      keep[w.id] = 1; var p = pv.map.get(w.id);
      if (!p) { var el = pMake(w.id, w.skey, w.cls, w.attrs); if (!el) return; p = { el: el, sig: '' }; pv.map.set(w.id, p); }
      p.el._skey = w.skey;
      if (p.sig !== w.sig) { p.el.querySelector('.rlIn').innerHTML = w.inner(); p.sig = w.sig; }
      if (w.id === 'yoda') { p.el.classList.toggle('speaking', yoda.speaking); p.el.classList.toggle('listening', listen.on); }
    });
    pv.map.forEach(function (p, id) { if (!keep[id]) { try { p.el.querySelectorAll('video').forEach(function (v) { v.srcObject = null; }); } catch (_) {} p.el.remove(); pv.map.delete(id); } });
    bindTiles();
  }
  function setPanelsHidden(h) { pv.hidden = !!h; syncPanels(); try { App.paintList(); } catch (_) {} try { if (App.wins && App.wins.video) App.rerender('video'); } catch (_) {} try { App.toast(pv.hidden ? 'Video panels hidden. Click \u201cLive Video (everyone)\u201d to show them.' : 'Everyone\u2019s video panels are shown.'); } catch (_) {} }
  setInterval(function () { try { syncPanels(); } catch (e) { console.warn('[room-live] panels', e); } }, 1000);
  setInterval(function () { var sp = pv.map.get('self'), rs = document.getElementById('rbSelf'); if (sp) sp.el.classList.toggle('talking', !!(rs && rs.classList.contains('talking'))); }, 200);
  /* the 'Live Video (everyone)' entry: in a live room it shows / hides every participant panel instead of opening a shared tile box */
  var origOpen = App.open, origClose = App.close;
  App.open = function (k) { if (k === 'video' && wantRoom()) { if (App.wins && App.wins.video) origClose.call(App, 'video'); if (pv.hidden) setPanelsHidden(false); else syncPanels(); return null; } return origOpen.apply(App, arguments); };
  App.close = function (k) { if (k === 'video' && wantRoom()) { var had = origClose.apply(App, arguments), was = !pv.hidden; if (was) setPanelsHidden(true); return had || was; } return origClose.apply(App, arguments); };
  document.addEventListener('click', function (e) { var it = e.target && e.target.closest && e.target.closest('.rbwl .rbit[data-k="video"]'); if (!it || !wantRoom()) return; e.stopPropagation(); e.preventDefault(); setPanelsHidden(!pv.hidden); try { App.rerender('picker'); } catch (_) {} }, true);
  var origPL = App.paintList; if (typeof origPL === 'function') App.paintList = function () { var r = origPL.apply(this, arguments); try { var it = document.querySelector('.rbwl .rbit[data-k="video"]'); if (it && wantRoom()) { it.classList.toggle('on', !pv.hidden); it.title = (pv.hidden ? 'Show' : 'Hide') + ' everyone\u2019s video panels'; } } catch (_) {} return r; };
  function rosterRow(img, name, tags, end) { return '<div class="rlRow">' + img + '<span>' + esc(name) + '</span>' + tags.map(function (x) { return '<span class="rlTag">' + esc(x) + '</span>'; }).join('') + '<span class="rlEnd">' + end + '</span></div>'; }
  var connLabel = { 'new': 'connecting', connecting: 'connecting', connected: 'live', disconnected: 'reconnecting', failed: 'no connection', closed: '' };
  App.renderRoster = function (b) {
    if (!wantRoom()) return origRoster.call(App, b);
    css(); var s = App.state, h = '<div class="rlRos">';
    h += rosterRow('<img src="' + YODA_IMG + '" alt="">', 'Yoda \u00b7 AI CEO', ['AI CEO'], (yoda.speaking ? 'speaking ' : '') + bmBtn('yoda', 'Yoda'));
    Object.keys(bmSeen).forEach(function (k) { if (k !== 'yoda') h += rosterRow('<span class="rlDot">\ud83e\udd16</span>', bmSeen[k] || k, ['bot'], bmBtn(k, bmSeen[k])); });   // botmute-20261021a
    var meName = self ? self.name : guestName(), meRole = self ? self.role : (App.state.room.roomKey ? 'host' : 'guest');
    h += rosterRow('<span class="rlDot">' + esc(initials(meName)) + '</span>', meName + ' (you)', [meRole].concat(self && self.user ? ['signed in'] : []), (s.mic ? '\ud83c\udf99' : '\ud83d\udd07') + (s.cam ? ' \ud83d\udcf7' : ''));
    peers.forEach(function (e) { var i = e.info; h += rosterRow('<span class="rlDot">' + esc(initials(i.name)) + '</span>', i.name, [i.role].concat(i.user ? ['signed in'] : []), (i.mic ? '\ud83c\udf99' : '\ud83d\udd07') + (i.cam ? ' \ud83d\udcf7' : '') + (connLabel[e.conn] ? ' \u00b7 ' + connLabel[e.conn] : '') + (peerIsBot(i) ? ' ' + bmBtn(peerBotKey(e), i.name) : '')); });
    h += '</div>';
    if (!(self && self.user)) h += '<div class="row"><input id="rl_nm" placeholder="Your name in this room" maxlength="40" style="flex:1" value="' + esc(guestName()) + '"><button id="rl_nmS">Save</button></div>';
    h += '<p class="muted">' + (status === 'live' ? 'Live roster \u00b7 ' + (peers.size + 1) + ' in room ' + esc(cur) + (peers.size + 1 > softCap ? ' \u00b7 video works best with up to ' + softCap + ' people' : '') : status === 'offline' ? 'Room server unreachable.' : 'Connecting to the room server\u2026') + '</p>';
    b.innerHTML = h;
    var bt = b.querySelector('#rl_nmS'); if (bt) bt.onclick = function () { var v = (b.querySelector('#rl_nm').value || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!v) return; try { localStorage.setItem(GN, v); } catch (_) {} if (self) self.name = v; send({ t: 'state', mic: !!App.state.mic, cam: !!App.state.cam, name: v }); paintRoster(); try { App.toast('Name saved'); } catch (_) {} };
  };
  function paintRoster() { try { if (App.wins && App.wins.roster) App.rerender('roster'); } catch (_) {} }
  function paintTiles() { try { syncPanels(); } catch (e) { console.warn('[room-live] panels', e); } try { if (App.wins && App.wins.video) App.rerender('video'); } catch (_) {} }
  function paintAll() { paintRoster(); paintTiles(); }
  function openVideo() { try { if (wantRoom() && pv.hidden) setPanelsHidden(false); } catch (_) {} }   // tiles-20261018a: un-hide the panels (no shared box)

  /* chat: send through the room server when live; lines print when the server relays them (same order for everyone) */
  var origChat = App.chatLine;
  App.chatLine = function (id, text, me, noPush) {
    if (id === 'roomChat' && me && !noPush && live()) { send({ t: 'chat', text: String(text), cid: String(Date.now()) }); return; }
    return origChat.apply(App, arguments);
  };
  function chatText(m) { var mine = self && m.from && m.from.id === self.id, g = m.src === 'voice' ? '\ud83c\udf99 ' : ''; return { mine: mine, text: mine ? g + m.text : ((m.from && m.from.name) || 'Someone') + ': ' + g + m.text }; }
  function printChat(m) { var c = chatText(m); origChat.call(App, 'roomChat', c.text, c.mine, true); try { botPic(m); } catch (_) {} }
  /* botname-20261019a: bot / Yoda lines carry their own picture (from.img, a same-site assets/ path) */
  function botPic(m) { var f = m && m.from; if (!f || (f.role !== 'bot' && f.role !== 'yoda')) return; var src = /^assets\/[\w.-]+$/.test(f.img || '') ? f.img : (f.role === 'yoda' ? YODA_IMG : ''); var box = document.getElementById('rb_roomChat'); if (!box || !src) return; var d = box.firstChild; if (!d || d.querySelector('img.rlBotPic')) return; var i = document.createElement('img'); i.className = 'rlBotPic'; i.src = src; i.alt = f.name || 'bot'; i.draggable = false; i.style.cssText = 'width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px'; d.insertBefore(i, d.firstChild); d.classList.add('bot'); }
  function replayChat() { var c = document.getElementById('rb_roomChat'); if (!c) return; c.innerHTML = ''; chat.forEach(printChat); }
  if (W.chat && typeof W.chat.render === 'function' && !W.chat.render.__rl) { var cr = W.chat.render; W.chat.render = function (b) { var r = cr.apply(this, arguments); if (wantRoom() && chat.length) setTimeout(replayChat, 0); return r; }; W.chat.render.__rl = 1; }

  /* sharescreen-20261020a (Dan approved): room bar "Share screen" button. getDisplayMedia -> replaceTrack on each peer's
     existing video sender (via localTrack/syncTracks, no renegotiation); camera restored on stop or browser "Stop sharing". */
  var shareTrack = null;
  var _lt = localTrack; localTrack = function (kind) { if (kind === 'video' && shareTrack && shareTrack.readyState === 'live') return shareTrack; return _lt(kind); };
  function shareLabel() { var b = document.getElementById('rb_wid'); if (!b) return; var L = shareTrack ? 'Stop sharing' : 'Share screen'; var s = b.querySelector('span'); if (s) s.textContent = L; else b.textContent = L; b.title = L; b.setAttribute('aria-label', L); b.classList.toggle('on', !!shareTrack); }
  function shareStop() { var t = shareTrack; shareTrack = null; if (t) try { t.onended = null; t.stop(); } catch (_) {} peers.forEach(syncTracks); shareLabel(); }
  function shareStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { try { App.toast('Screen sharing isn\u2019t supported in this browser.'); } catch (_) {} return; }
    navigator.mediaDevices.getDisplayMedia({ video: true }).then(function (st) {
      var t = st.getVideoTracks()[0]; if (!t) return; shareTrack = t; t.onended = shareStop;
      var n = 0; peers.forEach(function (e) { if (e.pc) { syncTracks(e); n++; } });
      if (!n) try { App.toast('Sharing your screen. Others will see it when they join.'); } catch (_) {}
      shareLabel();
    }).catch(function (err) { if (err && err.name !== 'NotAllowedError') try { App.toast('Screen share failed: ' + (err.message || err.name)); } catch (_) {} });
  }
  document.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest && ev.target.closest('#rb_wid'); if (!b) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (shareTrack) shareStop(); else shareStart(); }, true);
  if (typeof App.paintAV === 'function' && !App.paintAV.__ss) { var _pav = App.paintAV; App.paintAV = function () { var r = _pav.apply(this, arguments); try { shareLabel(); } catch (_) {} return r; }; App.paintAV.__ss = 1; }
  setTimeout(shareLabel, 0);

  /* mic / camera: replaceTrack on every peer, then tell the room */
  var origSet = App.setAV;
  App.setAV = function () { var r = origSet.apply(App, arguments); return Promise.resolve(r).then(function (v) { if (self) { self.mic = !!App.state.mic; self.cam = !!App.state.cam; } peers.forEach(syncTracks); send(myState()); paintRoster(); try { syncPanels(); } catch (_) {} return v; }); };

  /* phase 2 hook (yoda-say): filled in by the phase-2 build */
  /* phase 2: Yoda speaks in every browser. Server TTS clip (one xAI call per /say) -> <audio>; else speechSynthesis; queued. */
  var yq = [], yBusy = false, yPending = null, yLog = [];
  function onYodaSay(m) { if (window.__roomLiveYoda) return window.__roomLiveYoda(m, setYodaSpeaking); var it = { text: String(m.text || '').slice(0, 600), audio: m.audio || null, at: m.at, mode: '', played: false, who: bmKey(m.who || 'yoda'), name: m.name || 'Yoda' }; bmSeen[it.who] = it.name; yLog.push(it); if (yLog.length > 20) yLog.shift(); yq.push(it); openVideo(); yNext(); }
  function yDone(it) { if (it._done) return; it._done = true; if (yCur === it) yCur = null; if (it.who === 'yoda') setYodaSpeaking(false); yBusy = false; setTimeout(yNext, 250); }
  /* botmute-20261021a (Dan): per-bot mute, LOCAL to this screen only (nothing sent to the server; the server transcript and
     Room Chat text are untouched). Bots: (a) server-voiced bots, every queued line tagged with m.who ('yoda'|'ava'|'finn'|guest id);
     (b) bots that join as room members (email-invited / bridge): peer is a bot when role is bot/yoda, the name is a known bot
     (Yoda, Ava, Finn, Brain, Grok), the name says "bot", or the account is a bot address (@hingecraft-global.ai). People never get it.
     Muted: queue lines still print + advance but play no audio; current audio stops now; a bot peer's WebRTC audio is muted.
     Saved per room in localStorage 'hubface-botmute:<ROOM>'. Separate from bot-quiet.js. */
  var yCur = null, bmSeen = {}, BMK = 'hubface-botmute:', BOTNAMES = /^(yoda|ava|finn|brain|grok)\b/i;
  function bmKey(w) { return String(w || 'yoda').trim().toLowerCase().slice(0, 40); }
  function peerIsBot(i) { if (!i) return false; var n = String(i.name || ''), u = String(i.user || i.email || ''); return i.role === 'bot' || i.role === 'yoda' || !!i.bot || BOTNAMES.test(n) || /\bbot\b/i.test(n) || /@hingecraft-global\.ai$/i.test(u) || /@hingecraft-global\.ai$/i.test(n); }
  function peerBotKey(e) { var n = bmKey(e.info.name).split(/[\s\u00b7(]/)[0]; return /^(yoda|ava|finn)$/.test(n) ? n : 'peer:' + bmKey(e.info.name); }
  function bmLoad() { try { return JSON.parse(localStorage.getItem(BMK + (cur || '')) || '{}') || {}; } catch (_) { return {}; } }
  function bmMuted(w) { return !!bmLoad()[bmKey(w)]; }
  function bmPeers() { peers.forEach(function (e) { if (e.audio) { var m = peerIsBot(e.info) && bmMuted(peerBotKey(e)); if (e.audio.muted !== m) e.audio.muted = m; } }); }
  function bmSet(w, on) { var k = bmKey(w), m = bmLoad(); if (on) m[k] = 1; else delete m[k]; try { localStorage.setItem(BMK + (cur || ''), JSON.stringify(m)); } catch (_) {}
    if (on) { var it = yCur; if (it && bmKey(it.who) === k) { try { if (it._a) { it._a.onended = null; it._a.onerror = null; it._a.pause(); } } catch (_) {} try { if (it.mode === 'speech' && window.speechSynthesis) speechSynthesis.cancel(); } catch (_) {} if (yPending && yPending === it._a) yPending = null; it.mode = 'muted'; clearTimeout(it._guard); yDone(it); } }
    bmPeers(); bmPaint(); try { App.toast((bmSeen[k] || k.replace(/^peer:/, '')) + (on ? ' muted on your screen' : ' unmuted on your screen')); } catch (_) {} }
  function bmBtn(w, name) { var k = bmKey(w), m = bmMuted(k), t = (m ? 'Unmute ' : 'Mute ') + (name || k) + ' (only on your screen)';
    return '<span class="rlBotMute' + (m ? ' muted' : '') + '" role="button" tabindex="0" data-bot="' + esc(k) + '" aria-pressed="' + m + '" title="' + esc(t) + '" aria-label="' + esc(t) + '"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/>' + (m ? '<line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>') + '</svg></span>'; }
  function bmPaint() { document.querySelectorAll('.rlBotMute[data-bot]').forEach(function (b) { var k = b.getAttribute('data-bot'), w = document.createElement('div'); w.innerHTML = bmBtn(k, bmSeen[k] || b.getAttribute('data-nm')); var n = w.firstChild; if (b.getAttribute('data-nm')) n.setAttribute('data-nm', b.getAttribute('data-nm')); if (b.outerHTML !== n.outerHTML) b.replaceWith(n); }); paintRoster(); }
  setInterval(function () { try { bmPeers(); } catch (_) {} }, 1000);
  document.addEventListener('pointerdown', function (e) { if (e.target && e.target.closest && e.target.closest('.rlBotMute')) e.stopPropagation(); }, true);
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('.rlBotMute[data-bot]'); if (!b) return; e.stopPropagation(); e.preventDefault(); var k = b.getAttribute('data-bot'); bmSet(k, !bmMuted(k)); }, true);
  document.addEventListener('keydown', function (e) { var b = e.target && e.target.closest && e.target.closest('.rlBotMute[data-bot]'); if (!b || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); var k = b.getAttribute('data-bot'); bmSet(k, !bmMuted(k)); }, true);
  function yNext() {
    if (yBusy || !yq.length) return;
    /* floor-20261019a: one speaker at a time. Yoda / Ava / Finn already share this single queue (never overlap); a bot also
       waits while YOU are talking (your tile's talking ring), up to 4 s, then speaks anyway so nothing gets lost. */
    var hd = yq[0]; if (!hd.floorAt) hd.floorAt = Date.now(); var rs = document.getElementById('rbSelf'); if (rs && rs.classList.contains('talking') && Date.now() - hd.floorAt < 4000) { setTimeout(yNext, 300); return; }
    var it = yq.shift(); yBusy = true; yCur = it;
    if (bmMuted(it.who)) { it.mode = 'muted'; yDone(it); return; }   // botmute-20261021a: text already in chat/transcript; skip audio, queue moves on
    if (it.who === 'yoda') setYodaSpeaking(true);
    var guard = setTimeout(function () { yDone(it); }, Math.min(60000, 4000 + it.text.length * 90)); it._guard = guard;
    var fin = function () { clearTimeout(guard); yDone(it); };
    if (it.audio) {
      var a = new Audio(it.audio); it._a = a; a.onended = fin; a.onerror = function () { clearTimeout(guard); if (it._done) return; yBusy = false; yCur = null; it.audio = null; it._a = null; yq.unshift(it); yNext(); };
      var pr = a.play(); it.mode = 'tts';
      if (pr && pr.then) pr.then(function () { it.played = true; }).catch(function () { it.mode = 'blocked'; yPending = a; try { App.toast(it.name + ': ' + it.text.slice(0, 80) + ' (click to hear)'); } catch (_) {} });
      return;
    }
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try { var u = new SpeechSynthesisUtterance(it.text); u.rate = it.who === 'yoda' ? 0.92 : 1; u.pitch = it.who === 'yoda' ? 0.8 : (it.who === 'ava' ? 1.15 : 1); var v = speechSynthesis.getVoices().filter(function (x) { return /^en/i.test(x.lang); })[0]; if (v) u.voice = v;
        u.onstart = function () { it.played = true; }; u.onend = fin; u.onerror = fin; it.mode = 'speech'; speechSynthesis.speak(u); return; } catch (_) {}
    }
    it.mode = 'text'; try { App.toast(it.name + ': ' + it.text.slice(0, 120)); } catch (_) {}
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function () { if (!yPending) return; var a = yPending; yPending = null; a.currentTime = 0; a.play().catch(function () {}); }, true); });

  /* livedot-20261018a chatmin: unread count on the minimized Room Chat square; restoring clears it and puts the cursor in the message box */
  var cu = { n: 0, box: null };
  function chatBox() { return document.querySelector('#ui > section.rbbox[data-k="chat"]'); }
  function chatBadge(b) { var u = b.querySelector(':scope > .rlUnread'); if (!u) { u = document.createElement('span'); u.className = 'rlUnread'; u.setAttribute('aria-live', 'polite'); b.appendChild(u); } if (cu.n > 0) { u.setAttribute('data-n', cu.n); u.textContent = cu.n > 99 ? '99+' : String(cu.n); u.title = cu.n + ' unread'; } else { u.removeAttribute('data-n'); u.textContent = ''; } }
  function chatWatch() { var b = chatBox(); if (!b || b === cu.box) return; cu.box = b; chatBadge(b); var was = b.classList.contains('collapsed');
    new MutationObserver(function () { var c = b.classList.contains('collapsed'); if (was && !c) { cu.n = 0; chatBadge(b); setTimeout(function () { var i = document.getElementById('rb_rcIn'); if (i && b.contains(i) && !b.classList.contains('collapsed')) try { i.focus({ preventScroll: true }); } catch (_) {} }, 60); } was = c; }).observe(b, { attributes: true, attributeFilter: ['class'] }); }
  function chatUnread(m) { var b = chatBox(); if (!b) return; chatWatch(); if (!b.classList.contains('collapsed') || b.classList.contains('closed')) return; var c = chatText(m); if (c.mine) return; cu.n++; chatBadge(b); }
  setInterval(function () { try { chatWatch(); } catch (_) {} }, 1500);
  function setYodaSpeaking(on) { if (yoda.speaking && !on) yoda.quietAt = Date.now(); yoda.speaking = !!on; document.querySelectorAll('.rlTile.yoda').forEach(function (t) { t.classList.toggle('speaking', yoda.speaking); }); paintRoster(); }

  /* ---------- yodahear-20261018a/b: listening state + speech-to-text of MY mic ----------
     b: visible status (pill above the room bar: "Yoda hears you" / "speech off: <reason>"), status reported to the room server
     (journal: [roomserver] stt …) so failures are never silent, auto-restart on every onend while listening + mic on, and a
     cross-tab hand-off: Chrome runs ONE speech recogniser per browser (a new start aborts the one in any other tab), so the
     room tab broadcasts a hold on BroadcastChannel 'hubface-mic' and every other HubFace tab pauses Finn's wake listener. */
  function setListen(st) { st = st || {}; var was = listen.on; listen = { on: !!st.on, until: +st.until || 0 }; if (was !== listen.on) { paintTiles(); try { App.toast(listen.on ? 'Yoda is listening to this room (chat' + (stt.sup ? ' and your mic' : '') + ')' : 'Yoda stopped listening'); } catch (_) {} } sttTick(); paintListen(); }
  var SRc = window.SpeechRecognition || window.webkitSpeechRecognition;
  var stt = { sup: !!SRc, r: null, running: false, audio: false, held: false, blockedUntil: 0, blockWhy: '', fails: 0, aborts: [], sent: 0, dropped: 0, last: '', lastAt: 0, soundAt: 0, lastErr: '', reason: '', starts: 0, finHung: false };
  /* voicefix-20261019a (Dan, Oct 19): the room chat's mic button drives THIS room speech-to-text (AssemblyAI, browser speech fallback)
     instead of separate field dictation: every finished utterance (end of turn / ~1 s pause) is sent as its own line and the field is
     cleared, so nothing piles up and no Send press is needed. Echo guard: finals dropped while any bot is playing (+1.2 s) and finals
     whose words mostly match a recent bot line (Yoda / Ava / Finn heard through the speakers). */
  var chatMic = { on: false, btn: null, el: null, ownMic: false, ph: '' }, botLines = [];
  var vfWords = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2; }); };
  function botSaid(t) { t = String(t || '').trim(); if (!t) return; botLines.push({ t: t, at: Date.now() }); if (botLines.length > 8) botLines.shift(); }
  function echoOfBot(t, now) { now = now || Date.now(); var A = vfWords(t); if (A.length < 3) return false; return botLines.some(function (b) { if (now - b.at > 90000) return false; var B = {}; vfWords(b.t).forEach(function (w) { B[w] = 1; }); var n = 0; A.forEach(function (w) { if (B[w]) n++; }); return n / A.length > 0.6; }); }
  function setField(el, v) { var W = (el.ownerDocument && el.ownerDocument.defaultView) || window, proto = el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype, d = Object.getOwnPropertyDescriptor(proto, 'value'); if (d && d.set) d.set.call(el, v); else el.value = v; el.dispatchEvent(new W.Event('input', { bubbles: true })); }
  function chatMicUi(on) { var b = chatMic.btn, el = chatMic.el; if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (b.__vfT == null) b.__vfT = b.title || ''; b.title = on ? 'Talking to the room: each sentence sends when you pause. Click to stop' : b.__vfT; } if (el) { try { if (on) { chatMic.ph = el.placeholder || ''; el.placeholder = 'Talking to the room\u2026 each sentence sends when you pause'; } else el.placeholder = chatMic.ph; } catch (_) {} } }
  function chatMicSet(on, btn, el) {
    if (on) { if (chatMic.on) chatMicSet(false); chatMic = { on: true, btn: btn || null, el: el || null, ownMic: false, ph: '' }; if (el && el.value) { var v = String(el.value).trim(); if (v) send({ t: 'chat', text: v.slice(0, 1000), cid: 'c' + Date.now() }); setField(el, ''); }
      if (!App.state.mic) { chatMic.ownMic = true; try { Promise.resolve(App.setAV('mic', true)).then(sttTick, sttTick); } catch (_) {} } chatMicUi(true); try { console.log('[room-live] voicefix chat mic -> room speech-to-text on'); } catch (_) {} }
    else { if (!chatMic.on) return; chatMicUi(false); var own = chatMic.ownMic; chatMic = { on: false, btn: null, el: null, ownMic: false, ph: '' }; if (own && App.state.mic) { try { App.setAV('mic', false); } catch (_) {} } }
    sttTick(); paintListen(); }
  function isRoomChatField(el) { if (!el || !el.closest || !wantRoom()) return false; var id = (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('placeholder') || ''); return /rb_rc|chat|message/i.test(id) || !!el.closest('[id*="chat" i],[class*="chat" i],[id^="rb_rc"]'); }
  setInterval(function () { if (chatMic.on && (!wantRoom() || (chatMic.btn && !chatMic.btn.isConnected))) chatMicSet(false); }, 1000);

  function finInCall() { try { var v = window.__voice; return !!(v && v.inCall && v.inCall()); } catch (_) { return false; } }
  function whyOff() {   // '' = should run
    if (!listen.on && !chatMic.on) return 'Yoda is not listening';
    if (!live() || !wantRoom()) return 'not connected to the room';
    if (!stt.sup && eng() !== 'aai') return 'voice needs Chrome or Edge (typed chat still works)';
    if (!App.state.mic) return 'your mic is off';
    if (!localTrack('audio')) return 'no live microphone track';
    if (window.__fieldMicActive && !chatMic.on) return 'paused while you dictate into a field';   // voicefix-20261019a: the chat mic now IS the room mic, so it never pauses it
    if (hiddenLong()) return 'paused while this tab is hidden';
    if (finInCall() && (stt.held || stt.finYield)) { stt.finYield = true; return 'paused while Finn\u2019s call mic is on'; } stt.finYield = false;
    if (Date.now() < stt.blockedUntil) return stt.blockWhy || 'retrying shortly';
    return '';
  }
  function sttWanted() { stt.reason = whyOff(); return !stt.reason; }
  var bc = null; try { bc = new BroadcastChannel('hubface-mic'); } catch (_) {}
  var tabId = Math.random().toString(36).slice(2), otherHold = 0;
  if (bc) bc.onmessage = function (e) { var d = e && e.data; if (!d || d.from === tabId) return; if (d.t === 'hold') { otherHold = Date.now(); if (!stt.held) { window.__micHold = true; try { var VL = window.VoiceLayer; if (VL && VL.pause && VL.state && VL.state() !== 'off') VL.pause(); } catch (_) {} try { var v = window.__voice; if (v && v.inCall && v.inCall() && v.hangUp) v.hangUp(); } catch (_) {} } } else if (d.t === 'release') otherHold = 0; };
  setInterval(function () { if (otherHold && Date.now() - otherHold > 4000 && !stt.held) { otherHold = 0; if (!window.__fieldMicActive) { window.__micHold = false; try { if (window.__wakeword && window.__wakeword.tick) window.__wakeword.tick(); } catch (_) {} } } else if (otherHold && !stt.held) window.__micHold = true; if (stt.held && !stt.soft && bc) try { bc.postMessage({ t: 'hold', from: tabId }); } catch (_) {} }, 1000);
  function sttHold(on, soft) {   // same hand-off as micfix-20261018a __hfDictate: wake engine pauses while window.__micHold is set; Fin call mic yields once
    // micfix2-20261019a: soft = AssemblyAI engine. It streams the room's WebRTC mic track, not a SpeechRecognition, so it only pauses the wake
    // listener here; no cross-tab hold and no Fin hang-up (those turned Finn's mic and other tabs' mics off by themselves).
    if (on && soft) { window.__micHold = true; window.__roomSttHold = true; if (!stt.held) { stt.held = true; stt.soft = true; try { var VLs = window.VoiceLayer; if (VLs) { if (VLs.barge) VLs.barge(false); if (VLs.pause && VLs.state && VLs.state() !== 'off') VLs.pause(); } } catch (_) {} } return; }
    if (on && stt.held && stt.soft) { stt.held = false; }   // browser speech after a soft hold: take the full hold below
    if (on) { stt.soft = false; window.__micHold = true; window.__roomSttHold = true; if (!stt.held) { stt.held = true; try { if (bc) bc.postMessage({ t: 'hold', from: tabId }); } catch (_) {} try { var VL = window.VoiceLayer; if (VL) { if (VL.barge) VL.barge(false); if (VL.pause && VL.state && VL.state() !== 'off') VL.pause(); } } catch (_) {} if (finInCall()) { try { window.__voice.hangUp(); } catch (_) {} } } return; }
    if (!stt.held) return; stt.held = false; stt.soft = false; window.__roomSttHold = false; try { if (bc) bc.postMessage({ t: 'release', from: tabId }); } catch (_) {}
    setTimeout(function () { if (stt.held || window.__fieldMicActive || otherHold) return; window.__micHold = false; try { if (window.__wakeword && window.__wakeword.tick) window.__wakeword.tick(); } catch (_) {} }, 300);
  }
  function block(ms, why) { stt.blockedUntil = Date.now() + ms; stt.blockWhy = why; }
  function sttStart() {
    if (stt.r) return; sttHold(true);
    var r; try { r = new SRc(); } catch (e) { stt.sup = false; sttHold(false); paintListen(); return; }
    stt.r = r; stt.starts++; r.continuous = true; r.interimResults = false; r.maxAlternatives = 1;
    try { r.lang = (window.__i18n && window.__i18n.speechLang && window.__i18n.speechLang()) || document.documentElement.lang || navigator.language || 'en-US'; } catch (_) { r.lang = 'en-US'; }
    r.onstart = function () { if (stt.r !== r) return; stt.running = true; paintListen(); };
    r.onaudiostart = function () { if (stt.r !== r) return; stt.audio = true; stt.fails = 0; paintListen(); };
    r.onsoundstart = function () { if (stt.r === r) { stt.soundAt = Date.now(); paintListen(); } };
    r.onspeechstart = function () { if (stt.r === r) { stt.soundAt = Date.now(); paintListen(); } };
    r.onresult = function (ev) {
      if (stt.r !== r) return;
      for (var i = ev.resultIndex; i < ev.results.length; i++) { var x = ev.results[i]; if (!x.isFinal) continue; sttFinal(String(x[0] && x[0].transcript || '')); }
    };
    r.onerror = function (ev) { if (stt.r !== r) return; var e = ev && ev.error || 'error'; stt.lastErr = e;
      if (e === 'not-allowed' || e === 'service-not-allowed') { block(5 * 60000, 'microphone blocked for hubface.org (lock icon \u2192 Microphone \u2192 Allow)'); try { App.toast('Voice to Yoda is blocked: allow the microphone for hubface.org. Typed chat still reaches Yoda.'); } catch (_) {} }
      else if (e === 'audio-capture') block(15000, 'no microphone found by the browser');
      else if (e === 'network') { stt.fails++; block(Math.min(30000, 2000 * stt.fails), 'speech service unreachable (network)'); }
      else if (e === 'aborted') { var now = Date.now(); stt.aborts = stt.aborts.filter(function (t) { return now - t < 30000; }); stt.aborts.push(now); if (stt.aborts.length >= 4) block(3000, 'another tab or app is using speech recognition'); }
      else if (e !== 'no-speech') stt.fails++;
      report(); };
    r.onend = function () { if (stt.r !== r) return; stt.r = null; stt.running = false; stt.audio = false; paintListen();
      if (stt.fails > 5) { block(30000, 'speech recognition keeps failing (' + stt.lastErr + ')'); stt.fails = 0; }
      setTimeout(sttTick, 150); };   // auto-restart while listening + mic on (Chrome ends sessions every ~60 s and after silence)
    try { r.start(); } catch (e) { stt.r = null; stt.fails++; stt.lastErr = 'start: ' + (e && e.name || e); setTimeout(sttTick, 600); }
  }
  function sttStop() { var r = stt.r; stt.r = null; stt.running = false; stt.audio = false; if (r) { try { r.onend = null; r.abort(); } catch (_) {} } sttHold(false); paintListen(); }
  function sttFinal(t) {
    t = t.replace(/\s+/g, ' ').trim(); if (!t) return;
    if (yoda.speaking || Date.now() - yoda.quietAt < 1200) { stt.dropped++; stt.lastDrop = 'Yoda was speaking'; paintListen(); return; }   // echo guard: Yoda's own voice from the speakers
    if (echoOfBot(t)) { stt.dropped++; stt.lastDrop = 'matched a bot line'; paintListen(); return; }   // voicefix-20261019a
    if (!App.state.mic || (!listen.on && !chatMic.on)) { stt.dropped++; return; }
    stt.last = t; stt.lastAt = Date.now(); stt.sent++; send({ t: 'chat', text: t.slice(0, 1000), cid: 'v' + Date.now(), source: 'voice' }); paintListen();
    if (chatMic.on && chatMic.el) { try { setField(chatMic.el, ''); } catch (_) {} }
  }

  /* ---------- stt-20261018a: AssemblyAI streaming engine (browser speech = fallback) ---------- */
  var aai = { ws: null, pending: false, reqAt: 0, tokT: 0, open: false, ctx: null, src: null, node: null, track: null, fails: [], until: 0, why: '', turns: 0, model: '', lastTurnAt: 0, opened: 0 };
  var hidAt = 0; document.addEventListener('visibilitychange', function () { hidAt = document.hidden ? Date.now() : 0; if (!document.hidden) setTimeout(sttTick, 0); });
  function hiddenLong() { return !!(document.hidden && hidAt && Date.now() - hidAt > 60000); }
  function eng() { try { if (localStorage.getItem('hubface-stt') === 'web') return 'web'; } catch (_) {} return Date.now() < aai.until ? 'web' : 'aai'; }
  function aaiFallback(why, ms) { aai.why = why; aai.until = Date.now() + ms; console.warn('[room-live] AssemblyAI not used (' + why + '); browser speech is the fallback'); }
  function aaiFail(why) { var now = Date.now(); stt.lastErr = 'aai: ' + why; aai.fails = aai.fails.filter(function (t) { return now - t < 120000; }); aai.fails.push(now); if (aai.fails.length >= 3) { aai.fails = []; aaiFallback(why, 5 * 60000); } setTimeout(sttTick, 400); }
  function aaiStart() {
    if (aai.ws || aai.pending) return; var now = Date.now(); if (now - aai.reqAt < 2500) return;
    sttHold(true, true); aai.pending = true; aai.reqAt = now; send({ t: 'stt-token' });
    clearTimeout(aai.tokT); aai.tokT = setTimeout(function () { if (!aai.pending) return; aai.pending = false; aaiFail('token timeout'); }, 7000);
  }
  function aaiToken(m) {
    if (!aai.pending) return; aai.pending = false; clearTimeout(aai.tokT);
    if (!m.ok) { var w = m.why || 'no token'; aaiFallback(w, w === 'not-configured' ? 10 * 60000 : w === 'daily-cap' ? 30 * 60000 : w === 'rate' ? 4000 : 60000); if (w === 'daily-cap') try { App.toast('Daily AssemblyAI limit reached: using browser speech'); } catch (_) {} sttTick(); return; }
    if (!sttWanted() || eng() !== 'aai') return;
    var P = m.params || {}, q = []; Object.keys(P).forEach(function (k) { q.push(encodeURIComponent(k) + '=' + encodeURIComponent(P[k])); }); q.push('token=' + encodeURIComponent(m.token));
    aai.model = P.speech_model || ''; var w2; try { w2 = new WebSocket((m.url || 'wss://streaming.assemblyai.com/v3/ws') + '?' + q.join('&')); } catch (e) { return aaiFail('ws ' + (e && e.message)); }
    w2.binaryType = 'arraybuffer'; aai.ws = w2; aai.open = false;
    w2.onmessage = function (ev) { if (aai.ws !== w2) return; var d; try { d = JSON.parse(ev.data); } catch (_) { return; }
      if (d.type === 'Begin') { aai.open = true; aai.opened = Date.now(); aai.fails = []; stt.running = true; stt.audio = true; stt.starts++; stt.lastErr = ''; aaiAudio(); send({ t: 'stt-session', state: 'open' }); paintListen(); report(); return; }
      if (d.type === 'Turn') { var tx = String(d.transcript || ''); if (tx) stt.soundAt = Date.now(); if (d.end_of_turn && tx.trim()) { aai.turns++; aai.lastTurnAt = Date.now(); sttFinal(tx); } else paintListen(); return; }
      if (d.error) stt.lastErr = 'aai: ' + String(d.error).slice(0, 80); };
    w2.onclose = function (ev) { if (aai.ws !== w2) return; var was = aai.open; aaiTeardown(); if (was) send({ t: 'stt-session', state: 'close', why: 'closed ' + ev.code }); stt.lastErr = 'aai closed ' + ev.code + (ev.reason ? ' ' + String(ev.reason).slice(0, 60) : ''); if (sttWanted()) aaiFail('closed ' + ev.code); paintListen(); report(); };
    w2.onerror = function () {};
  }
  /* 16 kHz mono PCM16 in 100 ms chunks (box-filter downsample from the context rate) */
  var PCM_SRC = "class P extends AudioWorkletProcessor{constructor(){super();this.r=sampleRate/16000;this.a=0;this.s=0;this.n=0;this.b=new Int16Array(1600);this.i=0;}" +
    "process(inp){var c=inp[0]&&inp[0][0];if(!c)return true;for(var k=0;k<c.length;k++){this.s+=c[k];this.n++;this.a+=1;if(this.a>=this.r){this.a-=this.r;var v=this.s/this.n;this.s=0;this.n=0;v=v>1?1:v<-1?-1:v;this.b[this.i++]=v<0?v*32768:v*32767;" +
    "if(this.i===this.b.length){this.port.postMessage(this.b.buffer,[this.b.buffer]);this.b=new Int16Array(1600);this.i=0;}}}return true;}}registerProcessor('hf-pcm16',P);";
  var pcmUrl = null;
  function aaiAudio() {
    aaiTeardownAudio(); var tr = localTrack('audio'); if (!tr) return; aai.track = tr;
    var AC = window.AudioContext || window.webkitAudioContext, ctx; try { ctx = new AC(); } catch (e) { return aaiFail('audio ' + (e && e.message)); }
    aai.ctx = ctx; if (!pcmUrl) pcmUrl = URL.createObjectURL(new Blob([PCM_SRC], { type: 'application/javascript' }));
    ctx.audioWorklet.addModule(pcmUrl).then(function () {
      if (aai.ctx !== ctx) return; var src = ctx.createMediaStreamSource(new MediaStream([tr])), node = new AudioWorkletNode(ctx, 'hf-pcm16'); aai.src = src; aai.node = node;
      node.port.onmessage = function (e) { var w = aai.ws; if (w && aai.open && w.readyState === 1) { try { w.send(e.data); } catch (_) {} } };
      src.connect(node); node.connect(ctx.destination); if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    }).catch(function (e) { aaiStop('worklet'); aaiFail('worklet ' + (e && e.message)); });
  }
  function aaiTeardownAudio() { try { if (aai.node) { aai.node.port.onmessage = null; aai.node.disconnect(); } } catch (_) {} try { if (aai.src) aai.src.disconnect(); } catch (_) {} try { if (aai.ctx) aai.ctx.close(); } catch (_) {} aai.node = aai.src = aai.ctx = null; aai.track = null; }
  function aaiTeardown() { aai.ws = null; aai.open = false; stt.running = false; stt.audio = false; aaiTeardownAudio(); }
  function aaiStop(why) {
    aai.pending = false; clearTimeout(aai.tokT); var w = aai.ws, was = aai.open; aaiTeardown();
    if (w) { w.onclose = null; w.onmessage = null; try { if (w.readyState === 1) { w.send(JSON.stringify({ type: 'Terminate' })); setTimeout(function () { try { w.close(1000); } catch (_) {} }, 1500); } else w.close(1000); } catch (_) {} }
    if (was) send({ t: 'stt-session', state: 'close', why: String(why || 'stop').slice(0, 40) });
  }
  function aaiCheck() { if (!aai.open) return; if (localTrack('audio') !== aai.track) aaiAudio(); else if (aai.ctx && aai.ctx.state === 'suspended') aai.ctx.resume().catch(function () {}); }
  ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function () { if (aai.ctx && aai.ctx.state === 'suspended') aai.ctx.resume().catch(function () {}); }, true); });
  function aaiServerStop(m) { aaiFallback((m && m.why) || 'stopped', 30 * 60000); aaiStop('server ' + ((m && m.why) || '')); try { App.toast('AssemblyAI paused (' + ((m && m.why) || 'server') + '): using browser speech'); } catch (_) {} sttTick(); }
  function engLabel() { return aai.open ? ' \u00b7 AssemblyAI' : stt.audio ? ' \u00b7 browser speech' : ''; }
  function sttTick() { var w = sttWanted(), e = eng();
    if (w && e === 'aai') { if (stt.r) sttStop(); aaiStart(); aaiCheck(); }
    else if (w) { if (aai.ws || aai.pending) aaiStop('fallback'); if (!stt.r) sttStart(); }
    else { if (aai.ws || aai.pending || aai.ctx) aaiStop(stt.reason || 'off'); if (stt.r || stt.held) sttStop(); }
    paintListen(); report(); }
  var lastRep = '', lastRepAt = 0;
  function sttStatus() { if (!listen.on) return 'off'; if (stt.reason) return 'off: ' + stt.reason; if (stt.audio) return 'on'; if (stt.running || stt.r) return 'starting'; return 'starting'; }
  function report() { if (!live()) return; var st = sttStatus() + (listen.on && stt.audio ? (aai.open ? ' [AssemblyAI ' + aai.model + ']' : ' [browser speech' + (aai.why ? ', AssemblyAI ' + aai.why : '') + ']') : '') + (stt.lastErr && stt.lastErr !== 'no-speech' ? ' [last error ' + stt.lastErr + ']' : ''); var now = Date.now(); if (st === lastRep && now - lastRepAt < 120000) return; if (now - lastRepAt < 1500 && st.indexOf('starting') === 0) return; lastRep = st; lastRepAt = now; send({ t: 'stt', status: st.slice(0, 160), sent: stt.sent, dropped: stt.dropped, starts: stt.starts }); }
  function paintListen() {
    var el = document.getElementById('rlListen'); var on = listen.on && !!wantRoom() && live();
    if (!el) { if (!on) return; css(); el = document.createElement('div'); el.id = 'rlListen'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.innerHTML = '<i></i><span class="a"></span><span class="b"></span>'; document.body.appendChild(el); }
    el.classList.toggle('on', on);
    var hears = on && stt.audio && !stt.reason, heard = hears && Date.now() - stt.soundAt < 1500;
    el.classList.toggle('hear', heard); el.classList.toggle('warn', on && !!stt.reason && stt.reason !== 'your mic is off');
    el.querySelector('.a').textContent = 'Yoda is listening';
    el.querySelector('.b').textContent = !on ? '' : hears ? (stt.lastAt && Date.now() - stt.lastAt < 4000 ? '\ud83c\udf99 sent: \u201c' + stt.last.slice(0, 40) + (stt.last.length > 40 ? '\u2026' : '') + '\u201d' : '\ud83c\udf99 Yoda hears you' + engLabel()) : stt.reason ? (stt.reason === 'your mic is off' ? '\u00b7 chat only (mic off)' : '\ud83c\udf99 speech off: ' + stt.reason) : '\ud83c\udf99 starting\u2026';
    place(el);
    document.querySelectorAll('.rlTile.yoda').forEach(function (t) { t.classList.toggle('listening', listen.on); });
  }
  function place(el) {   // sit just above the room bar (bottom centre); never over the top bar / HUB FACE logo
    var bar = document.getElementById('rbBar'), r = bar && bar.getBoundingClientRect();
    if (r && r.width) { el.style.top = 'auto'; el.style.bottom = Math.max(8, Math.round(innerHeight - r.top + 8)) + 'px'; el.style.left = Math.round(r.left + r.width / 2) + 'px'; }
    else { el.style.top = 'auto'; el.style.bottom = '170px'; el.style.left = '50%'; }
  }
  setInterval(function () { sttTick(); if (stt.held) window.__micHold = true; if (listen.on && listen.until && Date.now() > listen.until) setListen({ on: false }); }, 1000);

  /* ---------- panelmin-20261018b: room bar minimize ---------- */
  var BK = { col: 'hcrb-bar-col', min: 'hcrb-bar-min', pos: 'hcrb-bar' }, barExp = null, barDown = null;
  function barEl() { return document.getElementById('rbBar'); }
  function barCol() { var b = barEl(); return !!(b && b.classList.contains('rbcol')); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function barSpot(bar) {   // nearest bottom corner side, first spot that covers nothing
    var st = document.getElementById('stage'); if (!st) return { x: 8, y: SH - 68 };
    var k = stg(), sr = st.getBoundingClientRect(), W = bar.offsetWidth || 72, H = bar.offsetHeight || 60, cx = barExp && isFinite(barExp.cx) ? barExp.cx : SW / 2, obs = [];
    document.querySelectorAll('#vbBar, #wdIcon, #ui > aside.panel, #ui > .rlPanel, #ui > section.floatbox, #brDock, #brIcon, #btnFs, #rlListen').forEach(function (e) {
      if (e === bar) return; var cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return; var r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      obs.push({ x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }); });
    var left = cx < SW / 2, hit = function (a, b) { return a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4; };
    for (var y = SH - H - 8; y >= SH * 0.4; y -= 8) for (var i = 0; i <= SW - W - 16; i += 8) { var r = { x: left ? 8 + i : SW - W - 8 - i, y: y, w: W, h: H }; if (!obs.some(function (o) { return hit(r, o); })) return r; }
    return { x: left ? 8 : SW - W - 8, y: SH - H - 8 };
  }
  function barPut(bar, x, y) { bar.style.left = clampN(x, 0, SW - bar.offsetWidth) + 'px'; bar.style.top = clampN(y, 0, SH - bar.offsetHeight) + 'px'; bar.style.bottom = 'auto'; bar.style.transform = 'none'; }
  function barPaint() { var bar = barEl(), b = bar && bar.querySelector(':scope > .rbmin'); if (!b) return; var c = barCol(), h = minIcon(c), t = c ? 'Expand the room bar' : 'Minimize the room bar'; if (b.innerHTML !== h) b.innerHTML = h; b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', c ? 'true' : 'false'); document.documentElement.classList.toggle('rbbar-col', c); }
  function barSet(c) {
    var bar = barEl(); if (!bar) return; c = !!c;
    if (c && !barCol()) {
      var st = document.getElementById('stage'), k = stg(), sr = st ? st.getBoundingClientRect() : { left: 0 }, br = bar.getBoundingClientRect();
      barExp = { left: bar.style.left, top: bar.style.top, bottom: bar.style.bottom, transform: bar.style.transform, cx: (br.left + br.width / 2 - sr.left) / k };
      bar.classList.add('rbcol'); var m = lsGet(BK.min); var r = m && isFinite(m.x) && isFinite(m.y) ? m : barSpot(bar); barPut(bar, r.x, r.y);
    } else if (!c && barCol()) {
      bar.classList.remove('rbcol');
      if (barExp) { bar.style.left = barExp.left; bar.style.top = barExp.top; bar.style.bottom = barExp.bottom; bar.style.transform = barExp.transform; }
      else { bar.style.left = ''; bar.style.top = ''; bar.style.bottom = ''; bar.style.transform = ''; try { App.placeBar(); } catch (_) {} }
      barExp = null;
    }
    lsSet(BK.col, c ? 1 : null); barPaint(); try { paintListen(); } catch (_) {}
  }
  (function barInit() {
    var bar = barEl(); if (!bar || bar.querySelector(':scope > .rbmin')) return;
    css();
    var b = document.createElement('span'); b.className = 'ctl rbmin'; b.setAttribute('role', 'button'); bar.appendChild(b);
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    b.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); });
    b.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); barSet(!barCol()); });
    /* minimized: a click on the grip that doesn't move restores; a drag remembers the square's own spot and keeps hcrb-bar = full bar */
    bar.addEventListener('pointerdown', function (e) { barDown = { x: e.clientX, y: e.clientY, grip: !!(e.target.closest && e.target.closest('.rbgrip')), pos: localStorage.getItem(BK.pos) }; }, true);
    bar.addEventListener('pointerup', function (e) { var d = barDown; barDown = null; if (!d || !barCol()) return; var mv = Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
      setTimeout(function () { try { if (d.pos == null) localStorage.removeItem(BK.pos); else localStorage.setItem(BK.pos, d.pos); } catch (_) {}
        if (mv > 4) lsSet(BK.min, { x: bar.offsetLeft, y: bar.offsetTop }); else if (d.grip) barSet(false); }, 0); });
    var pb = App.placeBar; if (typeof pb === 'function') App.placeBar = function () { var was = barCol(); if (was) { var e = barExp || { left: '', top: '', bottom: '', transform: '' }; bar.classList.remove('rbcol'); bar.style.left = e.left; bar.style.top = e.top; bar.style.bottom = e.bottom; bar.style.transform = e.transform; barExp = null; } var r = pb.apply(this, arguments); if (was) requestAnimationFrame(function () { requestAnimationFrame(function () { barSet(true); }); }); return r; };
    if (lsGet(BK.col)) { requestAnimationFrame(function () { requestAnimationFrame(function () { barSet(true); }); }); }
    barPaint();
  })();

  /* autochat-20261019a: every live HF room has an AI (Yoda tile is always present), so Room Chat opens on its own when you
     start or join the room (once per room per page; if you close it afterwards it stays closed). Un-minimizes it too. */
  var acDone = null;
  function autoChat() { var r = cur; if (!r || acDone === r) return; acDone = r; try { var el = App.open('chat'); if (el && el.classList) { if (el.classList.contains('collapsed')) { var mb = el.querySelector(':scope > .boxmin'); if (mb) mb.click(); else el.classList.remove('collapsed'); } } setTimeout(replayChat, 0); App.rerender && App.rerender('picker'); } catch (e) { console.warn('[room-live] autochat', e); } }
  setInterval(tick, 1000); tick();
  (function () { var st = document.createElement('style'); st.textContent = '.rlBotMute{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.35);cursor:pointer;vertical-align:middle;box-sizing:border-box}.rlBotMute:hover{background:rgba(30,34,46,.9)}.rlBotMute.muted{color:#ff8a8a;border-color:rgba(255,120,120,.6)}#ui > .rlPanel .rlBotMute{position:absolute;right:6px;top:26px;z-index:8}'; (document.head || document.documentElement).appendChild(st); })();
  window.__roomLive = { sendState: function () { send(myState()); }, botMute: { isMuted: bmMuted, set: bmSet, seen: function () { return Object.assign({}, bmSeen); }, peerIsBot: peerIsBot, build: 'botmute-20261021a' }, _setListen: setListen, build: BUILD, chatMic: function (btn, el) { if (!isRoomChatField(el)) return false; chatMicSet(!(chatMic.on && chatMic.btn === btn), btn, el); return true; }, chatMicOn: function () { return chatMic.on; }, _vf: { echoOfBot: echoOfBot, botSaid: botSaid, isRoomChatField: isRoomChatField }, state: function () {
    var out = { status: status, room: cur, self: self, softCap: softCap, chat: chat.length, err: lastErr, peers: [] };
    peers.forEach(function (e) { out.peers.push({ id: e.id, photo: e.info.photo || null, name: e.info.name, role: e.info.role, mic: e.info.mic, cam: e.info.cam, conn: e.pc ? e.pc.connectionState : 'none', ice: e.pc ? e.pc.iceConnectionState : 'none', tracks: e.stream.getTracks().map(function (t) { return t.kind + ':' + t.readyState + (t.muted ? ':muted' : ''); }) }); });
    return out; }, iceServers: function () { return ice.map(function (x) { return { urls: x.urls, user: !!x.username }; }); }, pairs: function () { var out = []; peers.forEach(function (e) { if (!e.pc) return; out.push(e.pc.getStats().then(function (st) { var sel = null, c = {}; st.forEach(function (r) { if (r.type === 'transport' && r.selectedCandidatePairId) sel = r.selectedCandidatePairId; if (r.type === 'local-candidate' || r.type === 'remote-candidate') c[r.id] = r; }); var pr = sel && st.get(sel); if (!pr) st.forEach(function (r) { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pr = r; }); var L = pr && c[pr.localCandidateId], R = pr && c[pr.remoteCandidateId]; return { peer: e.info.name, local: L && (L.candidateType + '/' + L.protocol + (L.relayProtocol ? '/relay-' + L.relayProtocol : '') + ' ' + L.address), remote: R && (R.candidateType + '/' + R.protocol + ' ' + R.address), types: [].concat(Object.values(c).map(function (x) { return (x.type === 'local-candidate' ? 'L:' : 'R:') + x.candidateType; })).filter(function (v, i, a) { return a.indexOf(v) === i; }) }; })); }); return Promise.all(out); }, setYodaSpeaking: setYodaSpeaking, yodaLog: function () { return yLog.map(function (x) { return { text: x.text, audio: !!x.audio, mode: x.mode, played: x.played }; }); }, yodaSpeaking: function () { return yoda.speaking; }, chatLog: function () { return chat.slice(); }, listening: function () { return { on: listen.on, until: listen.until, status: sttStatus(), stt: { supported: stt.sup, running: stt.running, audio: stt.audio, held: stt.held, reason: stt.reason, sent: stt.sent, dropped: stt.dropped, last: stt.last, err: stt.lastErr || '', starts: stt.starts, otherTabHold: !!otherHold }, engine: aai.open ? 'assemblyai' : stt.audio ? 'webspeech' : 'none', aai: { open: aai.open, pending: aai.pending, model: aai.model, turns: aai.turns, why: aai.why, fallbackUntil: aai.until, lastTurnAt: aai.lastTurnAt } }; }, _sttFinal: sttFinal, barCol: barCol, setBarCol: barSet, guardYoda: guardYoda, panels: function () { var o = []; pv.map.forEach(function (p, id) { var el = p.el; o.push({ id: id, name: (el.querySelector('.rlNm') || {}).textContent || '', x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, video: !!el.querySelector('video'), min: el.classList.contains('collapsed'), shown: getComputedStyle(el).display !== 'none' }); }); return { hidden: pv.hidden, list: o }; }, setPanelsHidden: setPanelsHidden };
})();
