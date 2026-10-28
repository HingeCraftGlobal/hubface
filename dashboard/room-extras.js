/* invitebot-20261021a: Invite bot picker (Ava / Finn / Moderator). Each bot joins and leaves on its own; Yoda only via Add Yoda. */
(function(){
  window.HF_INVITABLE_BOTS = window.HF_INVITABLE_BOTS || [{id:'ava',name:'Ava',ai:'ava'},{id:'finn',name:'Finn',ai:'yoda'},{id:'moderator',name:'Moderator',soon:true},{id:'companion-f',name:'Support companion (female)',soon:true},{id:'companion-m',name:'Support companion (male)',soon:true}];
  var KB='hubface-room-bots';
  function rid(){try{var m=/[?&#](?:room|r)=([^&#]+)/.exec(location.href);if(m)return m[1];var RL=window.__roomLive;if(RL&&RL.roomId)return typeof RL.roomId==='function'?RL.roomId():RL.roomId;}catch(_){}return '_';}
  function ld(){try{return JSON.parse(localStorage.getItem(KB)||'{}')||{};}catch(_){return {};}}
  function list(){var a=ld()[rid()];return Array.isArray(a)?a:[];}
  function save(a){var m=ld();m[rid()]=a;try{localStorage.setItem(KB,JSON.stringify(m));}catch(_){}}
  function bot(id){return window.HF_INVITABLE_BOTS.filter(function(b){return b.id===id;})[0];}
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  window.__hfBotOn=function(){return inRm()&&list().some(function(id){var b=bot(id);return b&&b.ai;});};
  function curAi(){var r=document.querySelector('.dd-row[data-ai][aria-selected="true"]');return r?r.getAttribute('data-ai'):'yoda';}
  function pickAi(ai){if(curAi()===ai)return;var r=document.querySelector('.dd-row[data-ai="'+ai+'"]');if(r)r.click();}
  function toast(t){var e=document.createElement('div');e.textContent=t;e.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#222;color:#fff;padding:8px 14px;border-radius:10px;z-index:100000;font:14px system-ui';document.body.appendChild(e);setTimeout(function(){e.remove();},2200);}
  function modTile(on){var t=document.getElementById('rxModTile');if(!on){if(t)t.remove();return;}if(t)return;var ui=document.getElementById('ui')||document.body;t=document.createElement('div');t.id='rxModTile';t.setAttribute('data-bot','moderator');t.style.cssText='position:absolute;right:12px;top:80px;width:150px;padding:10px;border-radius:12px;background:#2b2f3a;color:#fff;font:13px system-ui;z-index:50;text-align:center;opacity:.9';t.innerHTML='<b>Moderator</b><br><small>coming soon \u00b7 text-only</small>';ui.appendChild(t);}
  function soonTile(id,on,top){var tid='rxSoon_'+id,t=document.getElementById(tid);if(!on){if(t)t.remove();return;}if(t)return;var bb=bot(id);var ui=document.getElementById('ui')||document.body;t=document.createElement('div');t.id=tid;t.setAttribute('data-bot',id);t.style.cssText='position:absolute;right:12px;top:'+top+'px;width:150px;padding:10px;border-radius:12px;background:#3a2f38;color:#fff;font:13px system-ui;z-index:50;text-align:center;opacity:.9';t.innerHTML='<b>'+(bb?bb.name:id)+'</b><br><small>coming soon \u00b7 text-only</small>';ui.appendChild(t);}
  function apply(){var a=list();modTile(inRm()&&a.indexOf('moderator')>=0);soonTile('companion-f',inRm()&&a.indexOf('companion-f')>=0,150);soonTile('companion-m',inRm()&&a.indexOf('companion-m')>=0,220);}
  function invite(id){var b=bot(id);if(!b)return;var a=list();if(a.indexOf(id)<0){a.push(id);save(a);}
    if(b.ai){try{window.__finStopped=false;pickAi(b.ai);setTimeout(function(){try{var V=window.__voice;if(V&&!V.inCall()&&V.armCall)V.armCall();}catch(_){}},300);}catch(_){}}
    apply();toast(b.name+(b.soon?' added (coming soon, text-only)':' joined the room'));
    try{if(typeof window.HF_onBotInvite==='function')window.HF_onBotInvite(id);}catch(_){}
    try{dispatchEvent(new CustomEvent('hf:bot-invite',{detail:{id:id}}));}catch(_){}}
  function remove(id){var b=bot(id);var a=list().filter(function(x){return x!==id;});save(a);
    if(b&&b.ai&&curAi()===b.ai){var other=a.map(bot).filter(function(x){return x&&x.ai;})[0];
      if(other)pickAi(other.ai);else{try{var V=window.__voice;if(V&&V.inCall())V.hangUp();}catch(_){}}}
    apply();if(b)toast(b.name+' left the room');
    try{if(typeof window.HF_onBotRemove==='function')window.HF_onBotRemove(id);}catch(_){}
    try{dispatchEvent(new CustomEvent('hf:bot-remove',{detail:{id:id}}));}catch(_){}}
  window.HF_inviteBot=invite;window.HF_removeBot=remove;window.HF_roomBots=list;
  window.__hfBotPicker=function(anchor){var p=document.getElementById('rxBotPick');if(p){p.remove();return;}
    p=document.createElement('div');p.id='rxBotPick';var r=anchor.getBoundingClientRect();
    p.style.cssText='position:fixed;left:'+Math.round(r.left)+'px;bottom:'+Math.round(innerHeight-r.top+6)+'px;background:#1e2230;color:#fff;border-radius:12px;padding:8px;z-index:100001;font:14px system-ui;min-width:190px;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    var a=list();p.innerHTML='<b style="display:block;margin:2px 4px 6px">Invite bot</b>'+window.HF_INVITABLE_BOTS.map(function(b){var on=a.indexOf(b.id)>=0;return '<button type="button" data-id="'+b.id+'" style="display:flex;justify-content:space-between;width:100%;margin:2px 0;padding:6px 8px;border:0;border-radius:8px;background:#2d3345;color:#fff;cursor:pointer"><span>'+b.name+(b.soon?' <small style="opacity:.6">(coming soon)</small>':'')+'</span><span>'+(on?'Remove':'Invite')+'</span></button>';}).join('');
    ['pointerdown','keydown','dblclick'].forEach(function(ev){p.addEventListener(ev,function(e){e.stopPropagation();});});
    p.addEventListener('click',function(e){e.stopPropagation();var t=e.target.closest('button[data-id]');if(!t)return;var id=t.getAttribute('data-id');if(list().indexOf(id)>=0)remove(id);else invite(id);p.remove();});
    document.body.appendChild(p);setTimeout(function(){addEventListener('click',function c(e){if(!p.contains(e.target)&&e.target!==anchor){p.remove();removeEventListener('click',c,true);}},true);},0);};
  setInterval(apply,1000);
})();
/* roomextras-20261021c (Dan approved by voice, Oct 20 10:38-10:46pm ET). Room-only add-ons, loaded after room-live.js / room-timer.js:
   1 movable left widget bar (drag grip, mouse+touch, kept on screen) + any room box without a drag handle gets one
   2 widget bar <-> Widget picker: picker click ADDS to bar (never opens); slide a bar row sideways = back to picker;
     slide a picker row (or its hide icon) = Hidden (N) section; all per-browser (localStorage)
   3 Save room in the room bar: name prompt -> existing App.saveRoom (account sync via /api/account/saved-rooms) + extras
     (bar, hidden, timer length, panel/media positions); Saved list reopens it
   4 raise hand on every video tile (own tile toggles); peers see it only once the room server relays 'hand' (see report)
   5 Yoda optional: not in the room unless Add Yoda is pressed (client hides tile, ignores listen/yoda-say)
   6 lighter room-chat mic icon (CSS only) */
(function () {
  var App = (window.__rb && window.__rb.App) || null;   // App lives inside the room builder script; exposed as window.__rb.App
  function hi() { try { return window.__i18n && window.__i18n.lang() === 'hi'; } catch (_) { return false; } }
  function T(en, h) { return hi() ? h : en; }
  function inRoom() { return !!document.getElementById('rbBar'); }
  function realRoom() { var A = window.__rb && window.__rb.App; return !!(A && A.inRoom && A.state && A.state.room && A.state.room.mode && document.documentElement.classList.contains('rb-room') && document.getElementById('rbBar')); } /* finnfix-20261021a: Finn hang-up only in a real room (rbBar is built hidden on every page) */

  function toast(t) { try { App.toast(t); } catch (_) {} }
  function LS(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } }
  function LSs(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stageScale() { var s = document.getElementById('stage'), w = s && s.getBoundingClientRect().width; return (w && w / 1024) || 1; }

  var css = document.createElement('style');
  css.textContent =
    '.rxGrip{pointer-events:auto!important;height:10px;margin:-2px 0 4px;border-radius:5px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 3px,transparent 3px 6px);cursor:grab;touch-action:none;opacity:.6}.rxGrip:hover{opacity:1}' +
    'html:not(.rb-room) .rxGrip{display:none}' +
    '.rbwl .rbit.rxSlide,.rxPk .rxRow.rxSlide{transition:none}.rbwl .rbit,.rxPk .rxRow{touch-action:pan-y}' +
    '.rbwl .rbit .rxX{float:right;opacity:.45;font-size:11px;padding:0 3px;cursor:pointer}.rbwl .rbit .rxX:hover{opacity:1}' +
    '.rxPk .rxRow{display:flex;align-items:center;gap:6px;width:100%;margin:2px 0;padding:5px 7px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:inherit;font:inherit;text-align:left;cursor:pointer;user-select:none}' +
    '.rxPk .rxRow.in{border-color:rgba(110,200,140,.6)}.rxPk .rxRow em{margin-left:auto;font-style:normal;font-size:11px;opacity:.8}.rxPk .rxRow .rxH{opacity:.5;padding:0 4px}.rxPk .rxRow .rxH:hover{opacity:1}' +
    '.rxPk details{margin-top:8px;opacity:.9}.rxPk summary{cursor:pointer}' +
    '#rbBar .rxBtn{margin-left:4px}' +
    '#rxPop{position:fixed;z-index:2147483000;left:50%;top:80px;transform:translateX(-50%);pointer-events:auto;width:260px;max-height:60vh;overflow:auto;background:rgba(18,22,30,.96);color:#e8eef8;border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px;font:13px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.45)}' +
    '#rxPop input{width:100%;box-sizing:border-box;padding:6px;border-radius:7px;border:1px solid #475569;background:#1e293b;color:#fff;font:13px system-ui}#rxPop button{margin-top:6px;padding:5px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.25);background:#223;color:#fff;cursor:pointer;font:12px system-ui}#rxPop .go{background:#2a6df4;border-color:#2a6df4}#rxPop .sv{display:block;width:100%;text-align:left}' +
    '.rxHand{position:absolute;left:4px;top:4px;z-index:5;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;opacity:.5;background:rgba(0,0,0,.35);cursor:default;user-select:none}' +
    '.rxHand.mine{cursor:pointer}.rxHand.up{width:34px;height:34px;font-size:22px;opacity:1;background:rgba(255,196,60,.9)}' +
    '.rxHand.pulse{animation:rxPulse 1.1s ease-out 1}@keyframes rxPulse{0%{box-shadow:0 0 0 0 rgba(255,196,60,.75)}100%{box-shadow:0 0 0 14px rgba(255,196,60,0)}}' +
    'html.rxNoYoda #ui > .rlPanel[data-yoda],html.rxNoBot.rb-room #vbBar{display:none!important}#rlListen{display:none!important}' +
    '#rb_rcMic{font-size:9px!important;width:16px!important;height:16px!important;opacity:.7;min-width:0!important;padding:0!important;background:transparent!important;border:1px solid rgba(255,255,255,.18)!important;box-shadow:none!important;filter:grayscale(.35);line-height:1!important}';
  document.head.appendChild(css);

  /* ---------- 1 movable widget bar + handle for any room box ---------- */
  var PPOS = 'hubface-rb-panelpos', panelOrig = null;
  function leftPanel() { return document.querySelector('#ui > aside.panel:not(.props)'); }
  function wirePanel() {
    var P = leftPanel(); if (!P || P.querySelector(':scope > .rxGrip')) return;
    var g = document.createElement('div'); g.className = 'rxGrip'; g.title = T('Drag to move the widget bar', 'विजेट बार हिलाने के लिए खींचें');
    g.style.setProperty('pointer-events', 'auto', 'important'); g.style.setProperty('position', 'relative', 'important'); g.style.setProperty('z-index', '5', 'important'); P.insertBefore(g, P.firstChild); var d = null;
    g.addEventListener('pointerdown', function (e) { if (!inRoom()) return; e.preventDefault(); e.stopPropagation(); if (!panelOrig) panelOrig = { l: P.style.left, t: P.style.top }; d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: P.offsetLeft, y: P.offsetTop, s: stageScale() }; try { g.setPointerCapture(e.pointerId); } catch (_) {} });
    g.addEventListener('pointermove', function (e) { if (!d || e.pointerId !== d.id) return; placePanel(d.x + (e.clientX - d.sx) / d.s, d.y + (e.clientY - d.sy) / d.s); });
    function up(e) { if (!d || e.pointerId !== d.id) return; d = null; LSs(PPOS, { x: P.offsetLeft, y: P.offsetTop }); }
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  }
  function placePanel(x, y) { var P = leftPanel(); if (!P) return; var w = P.offsetWidth || 168; P.style.left = Math.round(Math.max(0, Math.min(1024 - Math.min(w, 60), x))) + 'px'; P.style.top = Math.round(Math.max(0, Math.min(576 - 30, y))) + 'px'; }
  var roomWas = false;
  function roomEdge() {
    var r = inRoom(); if (r === roomWas) return; roomWas = r; var P = leftPanel();
    if (r) { var p = LS(PPOS, null); if (P && p && isFinite(p.x)) { if (!panelOrig) panelOrig = { l: P.style.left, t: P.style.top }; placePanel(p.x, p.y); } yodaEnter(); }
    else { if (P && panelOrig) { P.style.left = panelOrig.l; P.style.top = panelOrig.t; } panelOrig = null; closePop(); }
  }
  function adoptAll() { try { document.querySelectorAll('#ui > section.box, #ui > section.rbbox').forEach(function (el) { if (!el.querySelector(':scope > .fhandle') && window.__float) window.__float.adopt(el); }); } catch (_) {} }

  /* ---------- 2 bar <-> picker ---------- */
  var KB = 'hubface-rb-bar', KH = 'hubface-rb-pickhidden';
  function bar() { return LS(KB, null); }             // null = never customised: everything listed (old behaviour)
  function hidden() { return LS(KH, []); }
  function catalog() {   // [{k,title}] from the stock picker render (all W widgets) + Photos/Videos
    var out = [], seen = {}; try { var tmp = document.createElement('div'); RP.call(App, tmp); tmp.querySelectorAll('button[data-k]').forEach(function (b) { var k = b.getAttribute('data-k'); if (seen[k]) return; seen[k] = 1; out.push({ k: k, title: b.textContent.replace(/^\u2713\s*/, '').trim() }); }); } catch (_) {}
    out.push({ k: '__media', title: 'Photos/Videos' }); return out;
  }
  function inBar(k, b) { b = b === undefined ? bar() : b; return k === 'invite' || k === '__more' || !b || b.indexOf(k) >= 0; }
  function ensureBar() { var b = bar(); if (b) return b; b = ['invite']; try { b = b.concat(App.recommend() || []); } catch (_) {} b = b.filter(function (k, i) { return b.indexOf(k) === i; }); LSs(KB, b); return b; }
  function addToBar(k) { var b = ensureBar(); if (b.indexOf(k) < 0) b.push(k); LSs(KB, b); LSs(KH, hidden().filter(function (x) { return x !== k; })); repaint(); }
  function removeFromBar(k) { if (k === 'invite' || k === '__more') return; var b = ensureBar().filter(function (x) { return x !== k; }); LSs(KB, b); repaint(); toast(T('Removed from bar (still in Widget picker)', 'बार से हटाया (विजेट पिकर में अब भी है)')); }
  function hide(k) { var h = hidden(); if (h.indexOf(k) < 0) h.push(k); LSs(KH, h); repaint(); }
  function unhide(k) { LSs(KH, hidden().filter(function (x) { return x !== k; })); repaint(); }
  function repaint() { try { App.paintList(); } catch (_) {} try { if (App.wins && App.wins.picker) App.rerender('picker'); } catch (_) {} }
  // swipe helper: horizontal drag > 60px on a row fires cb; suppresses the click that follows
  function swipe(root, sel, cb) {
    var d = null, eat = 0;
    window.addEventListener('pointerdown', function (e) { if (!root.isConnected) return; var r = e.target.closest && e.target.closest(sel); if (!r || !root.contains(r)) return; d = { r: r, id: e.pointerId, x: e.clientX, y: e.clientY, on: false }; }, true);
    window.addEventListener('pointermove', function (e) { if (!d || e.pointerId !== d.id) return; var dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) { d.on = true; d.r.classList.add('rxSlide'); try { d.r.setPointerCapture(e.pointerId); } catch (_) {} } else return; } d.r.style.transform = 'translateX(' + dx + 'px)'; d.r.style.opacity = String(Math.max(.25, 1 - Math.abs(dx) / 160)); }, true);
    function end(e) { if (!d || e.pointerId !== d.id) return; var r = d.r, on = d.on, dx = e.clientX - d.x; d = null; r.style.transform = ''; r.style.opacity = ''; r.classList.remove('rxSlide'); if (on) { eat = Date.now(); if (Math.abs(dx) > 60) cb(r.getAttribute('data-k')); } }
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
    window.addEventListener('click', function (e) { if (Date.now() - eat < 400 && root.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  var PL = null, RP = null, wired = false;
  function wireBarPicker() {
    if (!(typeof App !== "undefined" && App) || !App.paintList || !App.renderPicker) return;
    if (!PL) {
      PL = App.paintList; RP = App.renderPicker;
      App.paintList = function () {
        var r = PL.apply(this, arguments);
        try { var L = document.querySelector('.rbwl'), b = bar(); if (L) L.querySelectorAll('.rbit[data-k]').forEach(function (it) { var k = it.getAttribute('data-k'); if (!inBar(k, b)) { it.remove(); return; } if (k !== 'invite' && k !== '__more' && !it.querySelector('.rxX')) { var x = document.createElement('span'); x.className = 'rxX'; x.textContent = '\u2715'; x.title = T('Remove from bar', 'बार से हटाएँ'); it.appendChild(x); } }); } catch (_) {}
        return r;
      };
      App.renderPicker = function (box) {
        var b = bar(), h = hidden(), cat = catalog(), vis = cat.filter(function (o) { return h.indexOf(o.k) < 0; }), hid = cat.filter(function (o) { return h.indexOf(o.k) >= 0; });
        function row(o, isH) { var ib = inBar(o.k, b); return '<div class="rxRow' + (ib ? ' in' : '') + '" role="button" data-k="' + esc(o.k) + '"' + (isH ? ' data-h="1"' : '') + '><span>' + esc(o.title) + '</span><em>' + (isH ? T('Unhide', 'दिखाएँ') : ib ? T('\u2713 In bar', '\u2713 बार में') : T('+ Add to bar', '+ बार में जोड़ें')) + '</em>' + (isH ? '' : '<span class="rxH" title="' + T('Hide from list', 'सूची से छिपाएँ') + '">\u2298</span>') + '</div>'; }
        box.innerHTML = '<div class="rxPk"><p class="muted">' + T('Select to add to the widget bar. Slide sideways to hide.', 'विजेट बार में जोड़ने के लिए चुनें। छिपाने के लिए बगल में खिसकाएँ।') + '</p>' + vis.map(function (o) { return row(o, false); }).join('') +
          (hid.length ? '<details><summary>' + T('Hidden', 'छिपे हुए') + ' (' + hid.length + ')</summary>' + hid.map(function (o) { return row(o, true); }).join('') + '</details>' : '') + '</div>';
        var pk = box.querySelector('.rxPk');
        pk.addEventListener('click', function (e) {
          var r = e.target.closest('.rxRow'); if (!r) return; e.stopPropagation(); var k = r.getAttribute('data-k');
          if (e.target.closest('.rxH')) { hide(k); return; }
          if (r.getAttribute('data-h')) { unhide(k); return; }
          if (inBar(k)) { toast(T('Already in bar', 'पहले से बार में है')); return; }
          addToBar(k); toast(T('Added to bar', 'बार में जोड़ा गया'));
        });
        swipe(pk, '.rxRow:not([data-h])', hide);
      };
    }
    var L = document.querySelector('.rbwl');
    if (L && !L.__rx) { L.__rx = 1; swipe(L, '.rbit[data-k]:not([data-k="invite"]):not([data-k="__more"])', removeFromBar);
      window.addEventListener('click', function (e) { var x = e.target.closest && e.target.closest('.rbwl .rxX'); if (!x) return; e.stopPropagation(); e.preventDefault(); var it = x.closest('.rbit'); if (it) removeFromBar(it.getAttribute('data-k')); }, true); }
  }

  /* ---------- 3 save / reopen ---------- */
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function rid() { try { return window.__roomLive.state().room || ''; } catch (_) { return ''; } }
  function extras() {
    var o = { bar: bar(), hidden: hidden() }, P = leftPanel(); if (P) o.panel = { x: P.offsetLeft, y: P.offsetTop };
    try { var st = window.__roomTimer && window.__roomTimer.state(); if (st && st.tokens) o.steps = st.tokens; } catch (_) {}
    var m = document.querySelector('#ui > .wbx[data-w="media"]'); if (m && m.offsetParent) o.media = { x: m.offsetLeft, y: m.offsetTop, w: m.offsetWidth, h: m.offsetHeight };
    o.tiles = LS('hubface-rl-panels', {}); o.yoda = yodaPicked(); return o;
  }
  function doSave(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 100); if (!name) { toast(T('Type a name first', 'पहले नाम लिखें')); return; }
    try {
      App.state.room.title = name; var ex = extras(); if (ex.steps && App.state.timer) App.state.timer.len = ex.steps * 15 * 60;
      var r = App.saveRoom('private'); if (!r) { toast(T('Could not save this room', 'यह रूम सहेजा नहीं जा सका')); return; }
      var all = LS('hcrb-saved', []), id = App.state.room.savedId, e = all.find(function (o) { return o.id === id; });
      if (e) { e.rx = ex; LSs('hcrb-saved', all); try { document.dispatchEvent(new CustomEvent('rb-saved', { detail: { vault: 'private', msg: r } })); } catch (_) {} }
      closePop(); toast(T('Saved: ', 'सहेजा गया: ') + name);
    } catch (err) { toast(T('Could not save this room', 'यह रूम सहेजा नहीं जा सका')); }
  }
  function doOpen(id) {
    var o = LS('hcrb-saved', []).find(function (x) { return x.id === id; }); if (!o) return; closePop();
    var x = o.rx || {}; if (x.bar) LSs(KB, x.bar); if (x.hidden) LSs(KH, x.hidden); if (x.panel) LSs(PPOS, x.panel); if (x.tiles) { var t = LS('hubface-rl-panels', {}); for (var k in x.tiles) t[k] = x.tiles[k]; LSs('hubface-rl-panels', t); }
    try { App.openSaved(id); } catch (_) {}
    setTimeout(function () {
      if (x.panel) placePanel(x.panel.x, x.panel.y);
      if (typeof x.yoda === 'boolean') setYoda(x.yoda, true);
      try { if (x.media && window.__widgets) { window.__widgets.open('media'); setTimeout(function () { var m = document.querySelector('#ui > .wbx[data-w="media"]'); if (m) { m.style.left = x.media.x + 'px'; m.style.top = x.media.y + 'px'; m.style.width = x.media.w + 'px'; m.style.height = x.media.h + 'px'; } }, 300); } } catch (_) {}
      try { if (x.steps && window.__roomTimer) window.__roomTimer.preset(x.steps); } catch (_) {}
      repaint(); toast(T('Opened: ', 'खोला गया: ') + o.title);
    }, 900);
  }
  function showSave() {
    closePop(); pop = document.createElement('div'); pop.id = 'rxPop';
    var cur = ''; try { cur = App.state.room.title || ''; } catch (_) {}
    pop.innerHTML = '<b>' + T('Save room', 'रूम सहेजें') + '</b><div style="opacity:.75;margin:4px 0 6px">' + T('Saves widgets, positions, sizes and timer length.', 'विजेट, स्थान, आकार और टाइमर की अवधि सहेजता है।') + '</div><input type="text" maxlength="100" class="nm" placeholder="' + T('Room name', 'रूम का नाम') + '" value="' + esc(cur) + '"><button type="button" class="go">' + T('Save', 'सहेजें') + '</button> <button type="button" class="cx">' + T('Cancel', 'रद्द करें') + '</button>';
    document.body.appendChild(pop); var i = pop.querySelector('.nm'); i.focus(); i.select();
    ['pointerdown', 'keydown', 'click', 'dblclick'].forEach(function (ev) { pop.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSave(i.value); if (e.key === 'Escape') closePop(); });
    pop.querySelector('.go').onclick = function () { doSave(i.value); }; pop.querySelector('.cx').onclick = closePop;
  }
  function showSaved() {
    closePop(); pop = document.createElement('div'); pop.id = 'rxPop'; var a = []; try { a = App.savedRooms() || []; } catch (_) {}
    pop.innerHTML = '<b>' + T('Saved rooms', 'सहेजे गए रूम') + '</b>' + (a.length ? a.map(function (o) { return '<button type="button" class="sv" data-id="' + esc(o.id) + '"><b>' + esc(o.title) + '</b><br><small>' + esc(new Date(o.savedAt).toLocaleString()) + '</small></button>'; }).join('') : '<div style="opacity:.7;margin-top:6px">' + T('No saved rooms yet', 'अभी कोई सहेजा गया रूम नहीं') + '</div>') + '<button type="button" class="cx">' + T('Close', 'बंद करें') + '</button>';
    document.body.appendChild(pop);
    ['pointerdown', 'keydown', 'click', 'dblclick'].forEach(function (ev) { pop.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    pop.addEventListener('click', function (e) { var b = e.target.closest('.sv'); if (b) doOpen(b.getAttribute('data-id')); else if (e.target.closest('.cx')) closePop(); });
  }

  /* ---------- 5 Yoda optional ---------- */
  var KY = 'hubface-yoda-picked', lastListen = null, yodaBtn = null;
  function prYoda() { try { var v = window.__prView; return !!(v && v.status !== 'closed' && (v.roster || []).some(function (x) { return x.kind === 'bot' && /^yoda/i.test(x.name || ''); })); } catch (_) { return false; } } /* yodaface-20261026: Yoda bot card joined in the pre-room -> Yoda tile shows by default */
  function srvYoda() { try { var S = window.__hfServerSeats; return !!(S && S.room && S.room === rid() && (S.bots || []).indexOf('yoda') >= 0); } catch (_) { return false; } } /* yodacard1-20261027: Yoda seated on the server -> card always shows, no Add Yoda click */
  function yodaPicked() { if (srvYoda()) return true; var m = LS(KY, {}), k = rid() || '_'; if (k in m && m[k] === false && !prYoda()) return false; return !!m[k] || prYoda(); }
  function setYoda(on, quiet) {
    var m = LS(KY, {}); m[rid() || '_'] = !!on; LSs(KY, m); document.documentElement.classList.toggle('rxNoYoda', !on);
    try { var RL = window.__roomLive; if (RL && RL._setListen) RL._setListen(on ? (lastListen || { on: false }) : { on: false }); } catch (_) {}
    if (!on && realRoom() && !window.__hfBotOn()) { try { if (window.__voice && window.__voice.inCall()) window.__voice.hangUp(); } catch (_) {} }
    paintBar(); if (!quiet) toast(on ? T('Yoda accepted \u00b7 Ava joined the room', 'योडा ने स्वीकार किया \u00b7 Ava रूम में आ गईं') : T('Ava (Yoda) left the room', 'Ava (योडा) ने रूम छोड़ा'));
  }
  function yodaEnter() { setTimeout(function () { setYoda(yodaPicked(), true); }, 400); }

  /* ---------- 4 raise hand ---------- */
  var myHand = false, handAt = 0, peerHands = {}, roomWs = null;
  function sendHand() {
    try { if (roomWs && roomWs.readyState === 1) roomWs.send(JSON.stringify({ t: 'state', mic: !!App.state.mic, cam: !!App.state.cam, hand: myHand })); } catch (_) {}
  }
  function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function paintHands() {
    document.querySelectorAll('#ui > .rlPanel').forEach(function (t) {
      if (t.hasAttribute('data-yoda')) return; var mine = t.hasAttribute('data-self'), pid = t.getAttribute('data-pid');
      var up = mine ? myHand : !!(pid && peerHands[pid]); var h = t.querySelector(':scope > .rxHand');
      if (!h) { h = document.createElement('span'); h.className = 'rxHand' + (mine ? ' mine' : ''); h.setAttribute('role', mine ? 'button' : 'img');
        if (mine) { h.addEventListener('pointerdown', function (e) { e.stopPropagation(); }); h.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); myHand = !myHand; handAt = Date.now(); sendHand(); paintHands(); if (myHand) pulse(h); }); }
        t.appendChild(h); }
      var was = h.classList.contains('up'); h.classList.toggle('up', up); h.textContent = up ? '\ud83d\udd90\ufe0f' : '\u270b';
      h.title = mine ? (up ? T('Lower your hand', 'हाथ नीचे करें') : T('Raise your hand', 'हाथ उठाएँ')) : (up ? T('Hand raised', 'हाथ उठा है') : '');
      if (up && !was && !mine) pulse(h); if (!up) h.classList.remove('pulse');
    });
  }
  setInterval(function () { document.querySelectorAll('#ui > .rlPanel .rxHand.up').forEach(pulse); }, 10000);

  /* room websocket tap: remember the room socket; read peer hand + listen/yoda-say (dropped while Yoda is not picked) */
  try {
    var WP = WebSocket.prototype, dS = WP.send, dOM = Object.getOwnPropertyDescriptor(WP, 'onmessage');
    WP.send = function (x) { try { if (typeof x === 'string' && x.indexOf('"t":"join"') >= 0) roomWs = this; } catch (_) {} return dS.apply(this, arguments); };
    if (dOM && dOM.set) Object.defineProperty(WP, 'onmessage', { configurable: true, enumerable: dOM.enumerable, get: function () { return dOM.get.call(this); }, set: function (f) {
      var ws = this; if (typeof f !== 'function') return dOM.set.call(this, f);
      dOM.set.call(this, function (ev) {
        if (ws === roomWs && typeof ev.data === 'string' && ev.data.charAt(0) === '{') { try { var m = JSON.parse(ev.data);
          if (m.t === 'peer-state' && m.peer && 'hand' in m.peer) { peerHands[m.peer.id] = !!m.peer.hand; setTimeout(paintHands, 0); }
          if (m.t === 'peer-leave') delete peerHands[m.id]; /* raisehand-20261025a: late joiners + joins carry hand */ if (m.t === 'welcome') { peerHands = {}; myHand = false; (m.peers || []).forEach(function (p) { if (p && p.hand) peerHands[p.id] = true; }); setTimeout(paintHands, 0); } if (m.t === 'peer-join' && m.peer) { peerHands[m.peer.id] = !!m.peer.hand; setTimeout(paintHands, 0); } if (m.t === 'peer-leave') setTimeout(paintHands, 0);
          if (m.t === 'welcome' && m.listen) lastListen = m.listen;
          if (m.t === 'listen') { lastListen = m; if (!yodaPicked()) return; }
          if (m.t === 'yoda-say' && !yodaPicked()) return;
          if (m.t === 'chat' && m.from && m.from.bot && !yodaPicked()) return;
          if (m.t === 'welcome' && !yodaPicked()) setTimeout(function () { setYoda(false, true); }, 50);
        } catch (_) {} }
        return f.apply(this, arguments);
      }); } });
  } catch (_) {}

  /* ---------- room bar buttons ---------- */
  function paintBar() {
    var B = document.getElementById('rbBar'); if (!B) return; var x = document.getElementById('rb_exit');
    if (!document.getElementById('rx_save')) {
      [['rx_save', showSave], ['rx_saved', showSaved], ['rx_yoda', function () { window.__hfBotPicker(this); }], ['rx_addyoda', function () { setYoda(!yodaPicked()); }]].forEach(function (p) { var b = document.createElement('button'); b.type = 'button'; b.id = p[0]; b.className = 'rxBtn'; b.onclick = p[1]; if (x) B.insertBefore(b, x); else B.appendChild(b); });
    }
    var s = document.getElementById('rx_save'), v = document.getElementById('rx_saved'), y = document.getElementById('rx_yoda');
    s.textContent = '\ud83d\udcbe ' + T('Save room', 'रूम सहेजें'); v.textContent = T('Saved rooms', 'सहेजे गए रूम'); y.textContent = '\ud83e\udd16 ' + T('Invite bot', 'बॉट आमंत्रित करें'); var ay = document.getElementById('rx_addyoda'); if (!ay) { ay = document.createElement('button'); ay.type = 'button'; ay.id = 'rx_addyoda'; ay.className = 'rxBtn'; ay.onclick = function () { setYoda(!yodaPicked()); }; y.parentNode.insertBefore(ay, y.nextSibling); } ay.textContent = yodaPicked() ? T('Remove Yoda', 'योडा हटाएँ') : T('Add Yoda', 'योडा जोड़ें');
  }

  setInterval(function () {
    roomEdge(); wireBarPicker();
    if (!inRoom()) return;
    if (!bar()) { ensureBar(); repaint(); }
    wirePanel(); adoptAll(); paintBar(); paintHands();
    var yp = yodaPicked(); document.documentElement.classList.toggle('rxNoYoda', !yp);
    document.documentElement.classList.toggle('rxNoBot', !window.__hfBotOn()); if (!yp && realRoom() && !window.__hfBotOn()) { try { var V = window.__voice; if (V && V.inCall && V.inCall()) V.hangUp(); } catch (_) {} }
  }, 700);
  addEventListener('hinge:lang', function () { paintBar(); repaint(); });
})();

/* timergate-20261021: chat dictate mic 30x30 */
(function(){var st=document.createElement('style');st.textContent='#rbLayer #rb_rcDict.rcdict-mic,#ui #rb_rcDict.rcdict-mic,#rb_rcDict.rcdict-mic{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;max-width:30px!important;max-height:30px!important;padding:0!important;flex:0 0 30px!important;box-sizing:border-box!important}';document.head.appendChild(st);})();

/* timergate-20261021e: dictate mic renders 30x30 even inside scaled widget windows */
(function(){function fix(){var b=document.getElementById('rb_rcDict');if(!b)return;var w=b.offsetWidth||1,r=b.getBoundingClientRect().width||w,k=r/w;if(!isFinite(k)||k<=0)k=1;var px=(30/k).toFixed(2)+'px';
['width','height','min-width','min-height','max-width','max-height'].forEach(function(p){b.style.setProperty(p,px,'important')});b.style.setProperty('padding','0','important');b.style.setProperty('flex','0 0 '+px,'important');
var sv=b.querySelector('svg');if(sv){var s=(16/k).toFixed(2)+'px';sv.style.setProperty('width',s,'important');sv.style.setProperty('height',s,'important')}}
setInterval(fix,500);})();
