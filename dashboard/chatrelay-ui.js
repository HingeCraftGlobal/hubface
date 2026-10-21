/* chatrelay-20261020c (Dan approved): red "Talk to Yoda" mic in the ROOM CHAT panel header, beside its Auto fog (cloud) icon.
   c fixes: (1) a/b looked for a <label>Auto fog</label> (Properties > Behavior) that is not in the room DOM, so the button never mounted;
   now it mounts in section.rbbox[data-k=chat]. (2) sends the room owner key from this browser (localStorage hubface-room-ids) as
   x-owner-key, so the owner is recognized even when not signed in as the owner account. ON = host lines go only to the chat-relay queue. */
(function () {
  function roomId() { var m = /[#&?]room=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.hash + '&' + location.search); return m ? m[1].toUpperCase() : null; }
  function ownerKey(id) { try { var m = JSON.parse(localStorage.getItem('hubface-room-ids') || '{}'); for (var t in m) { if (m[t] && m[t].id === id && m[t].key) return m[t].key; } } catch (e) {} return ''; }
  var btn = null, st = { on: false, room: null };
  function paint() { if (!btn) return; btn.setAttribute('aria-pressed', st.on ? 'true' : 'false');
    btn.style.background = st.on ? '#d11' : 'rgba(255,255,255,.08)'; btn.style.color = st.on ? '#fff' : '#f55'; btn.style.borderColor = st.on ? '#f55' : '#a33';
    btn.title = st.on ? 'Talk to Yoda is ON: your lines go to Yoda via the laptop relay (text replies). Click to turn off.' : 'Talk to Yoda (chat relay) is off. Click to turn on.'; }
  function api(path, opt) { var h = { 'Content-Type': 'application/json' }, k = ownerKey(st.room || roomId()); if (k) h['x-owner-key'] = k;
    return fetch('/api/chatrelay/' + path, Object.assign({ credentials: 'same-origin', headers: h }, opt || {})).then(function (r) { return r.json(); }); }
  function load() { var id = roomId(); st.room = id; if (!btn) return; if (!id) { btn.style.display = 'none'; return; }
    api('state?room=' + id).then(function (j) { if (j && j.ok) { st.on = !!j.on; btn.style.display = 'inline-flex'; } else btn.style.display = 'none'; paint(); }).catch(function () {}); }
  function click(e) { e.preventDefault(); e.stopPropagation(); if (!st.room) return; var want = !st.on;
    api('toggle', { method: 'POST', body: JSON.stringify({ room: st.room, on: want }) }).then(function (j) { if (!j || !j.ok) { alert('Talk to Yoda: ' + ((j && j.error) || 'failed')); return; } st.on = !!j.on; paint();
      if (st.on) { var m = document.getElementById('rb_rcMic'); if (m && m.getAttribute('aria-pressed') !== 'true') m.click(); } }).catch(function () {}); }
  function mount() { if (btn && document.body.contains(btn)) return true;
    var sec = document.querySelector('section.rbbox[data-k=chat]'); if (!sec) return false;
    var hdr = sec.querySelector(':scope > header'); var fog = sec.querySelector(':scope > .fogbtn'); if (!hdr) return false;
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'crTalkYoda'; btn.setAttribute('aria-label', 'Talk to Yoda');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>';
    var left = fog ? (parseFloat(fog.style.left) || fog.offsetLeft || 0) - 24 : null;
    btn.style.cssText = 'position:absolute;top:9px;z-index:7;width:20px;height:20px;padding:0;align-items:center;justify-content:center;border:1px solid #a33;border-radius:50%;cursor:pointer;pointer-events:auto;display:none;' + (left != null && left > 0 ? 'left:' + left + 'px' : 'right:52px');
    btn.addEventListener('click', click, true); btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); }, true);
    sec.appendChild(btn); paint(); load(); return true; }
  setInterval(mount, 1500); mount();
  addEventListener('hashchange', load);
  window.__chatRelayUi = { build: 'chatrelay-20261020c', state: function () { return { mounted: !!(btn && document.body.contains(btn)), shown: !!(btn && btn.style.display !== 'none'), on: st.on, room: st.room, hasKey: !!ownerKey(st.room || roomId()) }; } };
})();
