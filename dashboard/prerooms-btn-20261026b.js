/* prerooms-btn-20261026b (Dan, Oct 26 2026; Brain OS #134). Replaces prerooms-btn-20261026a.
   Hub Rooms "Bot rooms" -> enters the REAL HubFace room shell (App.begin + App.enter: top bar, widgets, chat, his video tile,
   bottom bar) and layers the pre-room cards on top as a resizable overlay (iframe /botroom/prerooms-overlay-20261026a.html).
   Bot rooms are per-minute billed (botmeter), so the fixed-session timer box (#rtBox: Choose time / Start session) is hidden
   for bot rooms only (html.br-botroom); normal rooms are untouched. All Ready -> overlay dissolves, live bot table opens as a
   panel inside the same room (no page change). Exit room -> closes the pre-room / live room and stops the meter.
   Join links: /interface/#prjoin=<PR-ID>&code=<code>. Roll back: swap the script tag back to prerooms-btn-20261026a.js. */
(function(){
  var SIZES=[{w:44},{w:58},{w:74},{w:94}],size=+(localStorage.getItem('prOvSize')||1),D=document;
  var css=D.createElement('style');css.textContent='html.br-botroom #rtBox{display:none!important}'+
   '#prWrap{position:absolute;z-index:100;box-sizing:border-box;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid rgba(0,156,253,.6);box-shadow:0 20px 60px rgba(0,0,0,.55);background:rgba(8,14,28,.35);backdrop-filter:blur(2px);transition:opacity .8s,transform .8s}'+
   '#prWrap.gone{opacity:0;transform:translateX(-50%) scale(.96);pointer-events:none}'+
   '#prBar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(10,18,36,.92);color:#e8eefc;font:600 13px system-ui,sans-serif}#prBar .sp{flex:1}#prBar button{font:inherit;color:#e8eefc;background:#1a2540;border:1px solid #2b3a5c;border-radius:7px;padding:3px 10px;cursor:pointer}'+
   '#prClock{font:600 12px ui-monospace,monospace;color:#fbbf24}#prFrame{flex:1;border:0;background:transparent;width:100%}'+
   '#prLive{position:fixed;left:0;top:0;right:0;bottom:0;width:100vw;height:100vh;z-index:99000;border:0;border-radius:0;overflow:hidden;background:#0b1220;box-shadow:0 20px 60px rgba(0,0,0,.55);display:flex;flex-direction:column}'+
   '#prLive iframe{flex:1;border:0;width:100%}';
  D.head.appendChild(css);
  var st={cur:null,clock0:null,skew:0,live:null},clockT=null;
  function RB(){return window.__rb;}
  function host(){return D.getElementById('ui')||D.body;}
  function place(el,L,T,W,H){var st=D.getElementById('stage'),hu=host();if(hu.id!=='ui'||!st){el.style.position='fixed';el.style.left=L+'px';el.style.top=T+'px';el.style.width=W+'px';if(H!=null)el.style.height=H+'px';return;}
    var sr=st.getBoundingClientRect(),sc=(sr.width/(st.offsetWidth||sr.width))||1,ur=hu.getBoundingClientRect();el.style.position='absolute';el.style.left=Math.round((L-ur.left)/sc)+'px';el.style.top=Math.round((T-ur.top)/sc)+'px';el.style.width=Math.round(W/sc)+'px';if(H!=null){el.style.height=Math.round(H/sc)+'px';el.style.maxHeight=Math.round(H/sc)+'px';}}
  function applySize(){var w=D.getElementById('prWrap');if(!w)return;if(w.parentElement!==host())host().appendChild(w);var s=SIZES[size],vw=D.documentElement.clientWidth||innerWidth,vh=D.documentElement.clientHeight||innerHeight;
    var W=Math.round(Math.min(vw*s.w/100,vw-16)),top=Math.max(56,Math.min(84,vh*.12)),bar=D.getElementById('rbBar'),bot=vh-10;
    if(bar&&bar.offsetParent){var r=bar.getBoundingClientRect();if(r.height&&r.top>top+80)bot=Math.min(bot,r.top-8);}
    var H=Math.max(140,Math.round(bot-top));w.style.transform='none';place(w,Math.round((vw-W)/2),Math.round(top),W,w.__hid?null:H);if(w.__hid){w.style.height='auto';}try{localStorage.setItem('prOvSize',size);}catch(e){}}
  addEventListener('resize',applySize);
  function fmt(s){s=Math.max(0,s|0);var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0');}
  function tick(){var c=D.getElementById('prClock'),l=D.getElementById('prLiveClock'),t=st.clock0?fmt((Date.now()+st.skew-st.clock0)/1000):null;
    var txt=st.cur?(t?'Room clock '+t:'Room clock starts when all sides join'):'';if(c)c.textContent=txt;if(l)l.textContent=t?'Room clock '+t:'';}
  /* invite: while a bot room is open, the Invite People widget's link (window.__roomId.link) is the pre-room join link, so invitees land on their own cards. Sending only happens when Dan presses Send in that widget. */
  function prLink(){var v=st.cur;return v&&v.joinCode&&v.status==='setup'?location.origin+'/interface/#prjoin='+v.id+'&code='+v.joinCode:null;}
  function hookInvite(){var RI=window.__roomId;if(!RI||RI.__prHooked)return;var ol=RI.link,oe=RI.ensure;RI.link=function(){return (window.__prActive&&prLink())||ol.apply(this,arguments);};
    RI.ensure=function(){if(window.__prActive&&prLink())return Promise.resolve(RI.link());return oe.apply(this,arguments);};RI.__prHooked=true;}
  var lastLink=null;function liftInv(){var x=D.getElementById('rb_invC'),s=x&&x.closest('.rbbox'),m=0;if(!s)return;m=98000;var w1=D.getElementById('prWrap');if(w1&&w1.style.display!=='none')D.querySelectorAll('#ui > *').forEach(function(o){if(o!==s&&o!==w1&&o.id!=='rbBar'&&(+o.style.zIndex||0)>=98000)o.style.zIndex=97990;});
    var w=D.getElementById('prWrap');if(w&&w.parentElement&&w.parentElement.id==='ui'&&(+w.style.zIndex||0)!==m+1)w.style.zIndex=m+1;if(s.parentElement&&s.parentElement.id==='ui'&&(+s.style.zIndex||0)!==m+2)s.style.zIndex=m+2;
    s._rfUser=true;if(s.style.getPropertyPriority('height')==='important'){var hh=Math.max(110,s.offsetHeight);s.style.removeProperty('height');s.style.height=hh+'px';}
    if(!window.__prDragging&&s.offsetWidth&&(s.offsetWidth<170||s.offsetHeight<100)){s.style.width=Math.max(180,s.offsetWidth)+'px';s.style.height=Math.max(110,s.offsetHeight)+'px';}
    var inp=s.querySelector('input'),l=prLink(),rid=s.querySelector('.rbRid');if(inp){var want=l||'Open the pre-room first: the join link (room ID + code) appears here';if(inp.value!==want)inp.value=want;}if(rid&&st.cur&&st.cur.id)rid.textContent='';patchPicker();}
  function dropInv(){var s=D.querySelector('.rbbox.prLifted');if(!s||!s.__prHome)return;s.setAttribute('style',s.__prCss);s.classList.remove('prLifted');try{s.__prHome.insertBefore(s,s.__prNext&&s.__prNext.parentNode===s.__prHome?s.__prNext:null);}catch(e){}}
  function prLine(){var v=st.cur;return v&&v.joinCode?'Room ID: '+v.id+'   Join code: '+v.joinCode:'';}
  function patchPicker(){var B=D.getElementById('ipBody'),P=D.getElementById('ipPanel'),l=prLink();if(!B||!l||!P||getComputedStyle(P).display==='none')return;if(B.value.indexOf(l)>=0&&B.value.indexOf('Join code:')<0)B.value=B.value.replace(l,l+'\n'+prLine());}
  function hookPicker(){var IP=window.__invitePicker;if(!IP||IP.__prHooked)return;var oo=IP.open;IP.open=function(l,t){if(window.__prActive){if(!prLink()){if(window.__prShow)window.__prShow();if(window.__prToast)window.__prToast('No open pre-room yet: fill in the card and press Open pre-room, then invite.',true);return;}var r=oo.call(this,function(){return prLink()||(typeof l==='function'?l():l);},t);setTimeout(patchPicker,60);setTimeout(patchPicker,400);return r;}return oo.apply(this,arguments);};IP.__prHooked=1;}
  setInterval(hookPicker,800);
  D.addEventListener('click',function(e){if(!window.__prActive)return;var t=e.target&&e.target.closest&&e.target.closest('#rb_invC');if(t&&!prLink()){e.stopImmediatePropagation();e.preventDefault();if(window.__prShow)window.__prShow();if(window.__prToast)window.__prToast('No open pre-room yet: fill in the card and press Open pre-room, then copy the link.',true);}},true);
  D.addEventListener('pointerdown',function(e){if(window.__prActive&&e.target.closest&&e.target.closest('.rbbox')&&e.target.closest('.rbbox').querySelector('#rb_invC'))liftInv();},true);setInterval(function(){if(window.__prActive)liftInv();},1000);
  function openInvite(){try{hookInvite();var A=RB()&&RB().App;if(!A)return;if(wantInv&&A.open){A.open('invite');wantInv=false;}if(!A.wins||!A.wins.invite)return;liftInv();var l=prLink();if(l!==lastLink){lastLink=l;if(A.rerender)A.rerender('invite');}}catch(e){}}
  window.prShell={
    state:function(v){window.__prView=v;chip(v);if(v&&v.id&&v.id!==layoutRoom)loadLayout(v.id);st.cur=v;if(window.__prActive)openInvite();if(v&&v.clockStartMs){st.clock0=v.clockStartMs;st.skew=(v.serverNow||Date.now())-Date.now();}else if(v)st.clock0=null;tick();},
    closed:function(){window.__prView=null;st.cur=null;st.clock0=null;tick();},
    live:function(v){window.__prView=v;st.cur=v;st.live=v.live;try{if(v&&v.id)localStorage.setItem('hf-last-live-preroom',v.id);}catch(e){}var w=D.getElementById('prWrap');if(w){w.classList.add('gone');setTimeout(function(){w.remove();},900);}openLive(v);}
  };
  function openLive(v){var s=v.live.seats[0];var p=D.getElementById('prLive');if(p)p.remove();p=D.createElement('div');p.id='prLive';
    p.innerHTML='<div id="prBar"><span>Live bot room '+String(v.live.room).replace(/[^A-Z0-9-]/gi,'')+'</span><span id="prLiveClock" style="font:600 12px ui-monospace,monospace;color:#34d399"></span><span class="sp"></span><button id="prLiveExit" style="background:#7f1d1d;border-color:#b91c1c">Exit room</button><button id="prLiveMin">_</button></div>';
    var f=D.createElement('iframe');f.allow='microphone; camera; autoplay';f.src='/botroom/?live='+encodeURIComponent(v.live.room)+'&embed=1'+(s?'#w='+encodeURIComponent(s.watch):(v.live.guest&&v.live.guest.pass?'#g='+encodeURIComponent(v.live.guest.pass)+'&pr='+encodeURIComponent(v.id):''));p.appendChild(f);D.body.appendChild(p);
    D.getElementById('prLiveExit').onclick=function(){var R=RB();try{if(R&&R.App&&R.App.inRoom)R.App.exit();}catch(e){}if(D.getElementById('prLive')){hardClose();cleanup();}};
    D.getElementById('prLiveMin').onclick=function(){var mn=f.style.display==='none';f.style.display=mn?'':'none';p.style.height=mn?'':'auto';p.style.bottom=mn?'':'auto';};tick();}
  function overlay(q){if(D.getElementById('prWrap'))return;var w=D.createElement('div');w.id='prWrap';
    w.innerHTML='<div id="prBar"><span>Bot room · Pre-room</span><span id="prClock"></span><span id="prChip" style="display:none;font:600 12px ui-monospace,monospace;color:#7dd3fc;border:1px solid #38bdf8;border-radius:999px;padding:2px 8px;margin-left:8px">Room <b id="prChipId"></b> <button id="prCpId" style="font-size:11px;padding:1px 6px">Copy</button> <button id="prCpLink" style="font-size:11px;padding:1px 6px">Copy invite link</button></span><span class="sp"></span><button id="prSm" title="Smaller">−</button><button id="prBg" title="Bigger">+</button><button id="prHide" title="Hide cards (room stays open)">Hide</button></div>';
    var f=D.createElement('iframe');f.id='prFrame';f.allow='camera; microphone; autoplay';f.setAttribute('allowtransparency','true');f.src='/botroom/prerooms-overlay-20261026a.html?embed=1&v=yodacard-cardctl-20261029'+(q||'');w.appendChild(f);host().appendChild(w);applySize();
    D.getElementById('prSm').onclick=function(){if(size>0){size--;applySize();}};D.getElementById('prBg').onclick=function(){if(size<SIZES.length-1){size++;applySize();}};
    D.getElementById('prHide').onclick=function(){setHidden(f.style.display!=='none');};
    if(!clockT)clockT=setInterval(function(){tick();applySize();},1000);}
  function hubBox(close){var sq=D.querySelector('#ui > section.box[data-float="hub-rooms"]');if(!sq)return;if(close){if(!sq.classList.contains('closed')){sq.classList.add('closed');sq.__prClosed=1;}}else if(sq.__prClosed){sq.classList.remove('closed');sq.__prClosed=0;}}
  function cleanup(){hubBox(false);dropInv();var w=D.getElementById('prWrap');if(w)w.remove();var l=D.getElementById('prLive');if(l)l.remove();D.documentElement.classList.remove('br-botroom');window.__prActive=false;st={cur:null,clock0:null,skew:0,live:null};}
  function closeServer(){var v=st.cur;if(!v||!v.id||!v.isCreator||v.status==='closed')return;try{fetch('/api/prerooms/'+v.id+'/close',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:'{}'});}catch(e){}}
  function hardClose(){var v0=st.cur||window.__prView;if(v0&&v0.status==='live'){try{if(v0.id)localStorage.setItem('hf-last-live-preroom',v0.id);}catch(e){}return;}/* rosterreenter-20261029: leaving a LIVE pre-room only closes it on this screen; room, other people and meter keep running so the host can re-enter */try{var v=st.cur||window.__prView;if(v&&v.id&&v.status!=='closed'){fetch('/api/prerooms/'+v.id+'/close',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:'{}'}).catch(function(){});}}catch(e){}
    try{fetch('/api/account/botmeter/status',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(m){if(m&&m.id&&m.state!=='ended')return fetch('/api/account/botmeter/stop',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({id:m.id,reason:'owner_closed'})});}).catch(function(){});}catch(e){}}
  function hasPR(){return window.__prActive||D.getElementById('prLive')||D.getElementById('prWrap');}
  function hookExit(){var R=RB();if(!R||!R.App||R.App.__prHooked)return;var A=R.App,old=A.exit;A.exit=function(){if(hasPR()){hardClose();cleanup();}return old.apply(this,arguments);};R.exit=A.exit;A.__prHooked=true;}
  function openPR(q){var R=RB();hookExit();
    if(R&&R.App){try{if(!R.App.inRoom){R.begin({title:'Bot room',desc:'Per-minute bot room',src:'Bot rooms'});R.enter();}}catch(e){console.warn('[prerooms] enter',e);}
      D.documentElement.classList.add('br-botroom');window.__prActive=true;/* camoptin-20261027: no auto camera on guest/pre-room entry; user turns it on */}
    hubBox(true);overlay(q);wantInv=false;loadLayout('',true);}
  function setHidden(h){var w=D.getElementById('prWrap'),f=D.getElementById('prFrame'),b=D.getElementById('prHide');if(!w||!f)return;f.style.display=h?'none':'';w.__hid=h;w.style.height=h?'auto':'';if(b)b.textContent=h?'Show cards':'Hide';applySize();}
  var layoutRoom=null,wantInv=false;
  function snapShell(){var A=RB()&&RB().App,o={wins:[],btns:{}};if(A&&A.wins)Object.keys(A.wins).forEach(function(k){var el=A.wins[k];if(!el)return;o.wins.push([k,el.classList.contains('prLifted')?(el.__prCss||''):el.style.cssText]);});
    D.querySelectorAll('[id^="btnHdr"]').forEach(function(x){if(x.offsetParent)o.btns[x.id]=x.classList.contains('on');});return o;}
  function applyShell(S){var A=RB()&&RB().App;if(!A||!S||!Array.isArray(S.wins))return false;dropInv();var keep={};S.wins.forEach(function(w){keep[w[0]]=1;});
    Object.keys(A.wins||{}).forEach(function(k){if(!keep[k]&&k!=='video')try{A.close(k);}catch(e){}});
    S.wins.forEach(function(w){try{if(!A.wins[w[0]])A.open(w[0]);var el=A.wins[w[0]];if(el&&w[1]){el.style.cssText=w[1].replace(/position:\s*fixed;?|transform:[^;]*;?/g,'');if(w[0]==='invite'){if(parseFloat(el.style.width)<180)el.style.width='180px';if(parseFloat(el.style.height)<110)el.style.height='110px';}el._rfUser=true;}}catch(e){}});
    function bt(){Object.keys(S.btns||{}).forEach(function(id){var x=D.getElementById(id);if(x&&x.offsetParent&&x.classList.contains('on')!==!!S.btns[id])x.click();});}bt();setTimeout(bt,1500);
    function geo(){S.wins.forEach(function(w){var el=A.wins[w[0]];if(!el||!w[1])return;var t=D.createElement('div');t.style.cssText=w[1];['left','top','width','height'].forEach(function(p){var v=t.style[p];if(w[0]==='invite'){if(p==='width'&&parseFloat(v)<180)v='180px';if(p==='height'&&parseFloat(v)<110)v='110px';}if(v&&el.style[p]!==v)el.style.setProperty(p,v);});el._rfUser=true;});}
    [300,900,2000,4000].forEach(function(ms){setTimeout(function(){geo();try{A.save();}catch(e){}},ms);});
    try{A.save();}catch(e){}return true;}
  function loadLayout(room,first){layoutRoom=room;fetch('/api/prerooms/layout'+(room?'?room='+room:''),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){var L=j&&j.layout;
    if(first){var had=L&&L.shell&&applyShell(L.shell);wantInv=!had||L.shell.wins.some(function(w){return w[0]==='invite';});if(window.__prActive)openInvite();}
    if(!L)return;size=Math.max(1,Math.min(SIZES.length-1,L.size|0));applySize();setHidden(false);}).catch(function(){if(first){wantInv=true;openInvite();}});}
  function saveLayout(){var w=D.getElementById('prWrap');if(!w)return;var room=st.cur&&st.cur.id||'';fetch('/api/prerooms/layout'+(room?'?room='+room:''),{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({size:size,hidden:!!w.__hid,shell:snapShell()})}).catch(function(){});}
  window.__prSaveLayout=saveLayout;
  D.addEventListener('click',function(e){if(!window.__prActive)return;var b=e.target&&e.target.closest&&e.target.closest('button');if(b&&/^\s*Save( room)?\s*$/i.test(b.textContent||''))saveLayout();},true);
  function cp(t){try{navigator.clipboard.writeText(t);}catch(x){}}
  function chip(v){var c=D.getElementById('prChip');if(!c)return;if(!v||!v.id){c.style.display='none';return;}c.style.display='none';D.getElementById('prChipId').textContent=v.id;D.getElementById('prCpId').onclick=function(){cp(v.id);};var l=D.getElementById('prCpLink'),u=v.joinCode&&v.status==='setup'?location.origin+'/interface/#prjoin='+v.id+'&code='+v.joinCode:null;l.style.display=u?'':'none';l.onclick=function(){cp(u);};}
  function recInv(labels){var v=st.cur;if(!window.__prActive||!v||!v.id||v.status!=='setup'||!labels.length)return;fetch('/api/prerooms/'+v.id+'/invites',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({labels:labels})}).catch(function(){});}
  (function(){var of=window.fetch;if(!of||of.__prWrapped)return;var nf=function(u,o){var p=of.apply(this,arguments);try{if(window.__prActive&&String(u).indexOf('/api/invite/email')>=0&&o&&o.body){var to=(JSON.parse(o.body).to)||[];p.then(function(r){if(!r.ok)return;r.clone().json().then(function(j){var ok=Array.isArray(j&&j.results)?j.results.filter(function(x){return x&&x.ok;}).map(function(x){return String(x.email);}):to.map(String);recInv(ok);}).catch(function(){recInv(to.map(String));});}).catch(function(){});}}catch(x){}return p;};nf.__prWrapped=1;window.fetch=nf;})();
  D.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('#rb_invC,#prCpLink');if(t)recInv(['Invite link (copied)']);},true);
  /* preroombatch1 #7: latecomer (joined a live room by invite link) -> bottom-bar Bot room button glows + "live" badge; pressing it enters the live table */
  (function(){var c=D.createElement('style');c.textContent='@keyframes prLateGlow{0%,100%{box-shadow:0 0 4px 1px rgba(52,211,153,.5)}50%{box-shadow:0 0 16px 5px rgba(52,211,153,.95)}}#rx_botroom.prLate{position:relative;animation:prLateGlow 1.6s ease-in-out infinite;border-color:#34d399!important}#rx_botroom .prLiveBadge{position:absolute;top:-7px;right:-7px;background:#dc2626;color:#fff;font:700 9px/1 system-ui;padding:2px 5px;border-radius:999px;letter-spacing:.04em;pointer-events:none}';D.head.appendChild(c);
    function fw(){var f=D.getElementById('prFrame');try{return f&&f.contentWindow&&f.contentWindow.prCards?f.contentWindow:null;}catch(e){return null;}}
    function isLate(){var w=fw();try{return !!(window.__prActive&&w&&((w.prCards.late&&w.prCards.late())||(w.prCards.canEnter&&w.prCards.canEnter())));}catch(e){return false;}}
    setInterval(function(){var b=D.getElementById('rx_botroom');if(!b)return;var on=isLate(),g=b.querySelector('.prLiveBadge');b.classList.toggle('prLate',on);if(on&&!g){g=D.createElement('span');g.className='prLiveBadge';g.textContent='LIVE';b.appendChild(g);}else if(!on&&g)g.remove();},500);
    D.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#rx_botroom');if(!b||!isLate())return;e.preventDefault();e.stopImmediatePropagation();try{fw().prCards.enterLive();}catch(x){}},true);})();
  window.__prOpen=openPR;
  window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data)return;if(e.data.brClose){var l=D.getElementById('prLive');if(l){var f=l.querySelector('iframe');if(f)f.style.display='none';l.style.height='auto';l.style.bottom='auto';}}});
  function isBR(b){return b&&b.classList&&b.classList.contains('hrnew')&&/^\s*Bot rooms?\s*$/i.test(b.textContent||'');}
  D.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('button');if(!isBR(b))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();var lv=window.__prLiveId&&window.__prLiveId();if(lv&&window.__prReenter){window.__prReenter(lv);return;}openPR();},true);
  setInterval(function(){D.querySelectorAll('.hrnewcol button.hrnew').forEach(function(b){if(isBR(b)&&b.textContent!=='Bot rooms')b.textContent='Bot rooms';});},800);
  function fromHash(){var h=new URLSearchParams(location.hash.slice(1)),id=h.get('prjoin'),c=h.get('code');
    if(h.get('prbot')==='1'){history.replaceState(null,'',location.pathname+location.search);var k=0,jv=setInterval(function(){if(RB()||++k>40){clearInterval(jv);openPR();}},250);return;}
    if(!id||!c)return;
    history.replaceState(null,'',location.pathname+location.search);var n=0,iv=setInterval(function(){if(RB()||++n>40){clearInterval(iv);openPR('&join='+encodeURIComponent(id)+'#code='+encodeURIComponent(c));}},250);}
  fromHash();window.addEventListener('hashchange',fromHash);

  /* c12: own drag/resize for Invite window (pointer capture, scale-aware, rAF, commit on up) */
  (function(){var G=null,raf=0;
    function invBox(t,e){var s=t&&t.closest&&t.closest('.rbbox');if(s&&s.querySelector('#rb_invC'))return s;if(!e)return null;var x=D.getElementById('rb_invC');s=x&&x.closest('.rbbox');if(!s||!s.offsetParent)return null;var r=s.getBoundingClientRect();if(e.clientX>=r.left-6&&e.clientX<=r.right+6&&e.clientY>=r.top&&e.clientY<=r.bottom+6&&(e.clientX>r.right-10||e.clientX<r.left+10||e.clientY>r.bottom-10||!t.closest||!t.closest('.rbbox,#prWrap,#rbBar')))return s;return null;}
    function zone(s,e){var r=s.getBoundingClientRect(),E=10,x=e.clientX-r.left,y=e.clientY-r.top,z='';if(e.target.closest&&e.target.closest('.cgrip'))return 'se';if(y>r.height-E)z+='s';if(x>r.width-E)z+='e';else if(x<E)z+='w';if(z)return z;
      if(y<40&&!e.target.closest('button,input,textarea,select,a,[contenteditable]'))return 'm';return '';}
    D.addEventListener('pointermove',function(e){if(G)return;var s=invBox(e.target,e);if(!s)return;var z=zone(s,e);s.style.cursor=z==='m'?'grab':z==='s'?'ns-resize':z==='e'||z==='w'?'ew-resize':z==='se'?'nwse-resize':z==='sw'?'nesw-resize':'';},true);
    D.addEventListener('pointerdown',function(e){if(e.button!==0)return;var s=invBox(e.target,e);if(!s)return;var z=zone(s,e);if(!z)return;
      e.preventDefault();e.stopImmediatePropagation();var r=s.getBoundingClientRect(),k=r.width/(s.offsetWidth||r.width)||1;
      G={s:s,z:z,k:k,x:e.clientX,y:e.clientY,l:s.offsetLeft,t:s.offsetTop,w:s.offsetWidth,h:s.offsetHeight,id:e.pointerId};window.__prDragging=1;
      try{s.setPointerCapture(e.pointerId);}catch(_){}s.style.cursor=z==='m'?'grabbing':s.style.cursor;D.body.style.userSelect='none';},true);
    function apply(cx,cy){if(!G)return;var dx=(cx-G.x)/G.k,dy=(cy-G.y)/G.k,s=G.s,z=G.z,l=G.l,t=G.t,w=G.w,h=G.h;
      if(z==='m'){l+=dx;t+=dy;}else{if(z.indexOf('e')>=0)w=Math.max(180,G.w+dx);if(z.indexOf('w')>=0){w=Math.max(180,G.w-dx);l=G.l+(G.w-w);}if(z.indexOf('s')>=0)h=Math.max(110,G.h+dy);}
      s.style.left=Math.round(l)+'px';s.style.top=Math.round(t)+'px';s.style.width=Math.round(w)+'px';s.style.height=Math.round(h)+'px';s.style.right='auto';s.style.bottom='auto';s.style.transform='none';}
    D.addEventListener('pointermove',function(e){if(!G||e.pointerId!==G.id)return;e.preventDefault();e.stopImmediatePropagation();var cx=e.clientX,cy=e.clientY;G.cx=cx;G.cy=cy;if(!raf)raf=requestAnimationFrame(function(){raf=0;if(G)apply(G.cx,G.cy);});},true);
    function end(e){if(!G||e.pointerId!==G.id)return;e.stopImmediatePropagation();if(raf){cancelAnimationFrame(raf);raf=0;}apply(e.clientX,e.clientY);try{G.s.releasePointerCapture(G.id);}catch(_){}G.s.style.cursor='';D.body.style.userSelect='';G.s._rfUser=true;G=null;window.__prDragging=0;}
    D.addEventListener('pointerup',end,true);D.addEventListener('pointercancel',end,true);
    D.addEventListener('mousedown',function(e){if(invBox(e.target)&&window.__prDragging)e.stopImmediatePropagation();},true);
    var css=D.createElement('style');css.textContent='#rbBar #rb_rid{display:none!important}#prChip,#prCpId,#prCpLink,#rb_invC,.rbRid{display:none!important}#prWrap,#prWrap *,#prFrame{pointer-events:auto!important}#ui section.rbbox:has(#rb_invC){min-width:180px!important;min-height:110px!important;box-sizing:border-box;overflow:hidden}#ui section.rbbox:has(#rb_invC) > *:not(.boxresize){min-width:0}#ui section.rbbox:has(#rb_invC) .rbbd{overflow:auto;min-height:0}#ui section.rbbox:has(#rb_invC) input{width:100%;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:inherit}#ui section.rbbox:has(#rb_invC) button{font-size:inherit;padding:3px 9px;min-height:0}';D.head.appendChild(css);
  })();

  /* c16: overlay bar buttons work even when another layer (self-video tile) covers them; toast diagnostics; auto-resume open pre-room */
  (function(){
    function toast(t,bad){var x=D.getElementById('prToast');if(!x){x=D.createElement('div');x.id='prToast';x.style.cssText='position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:2147483600;background:#0f172a;color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;padding:6px 12px;font:600 12px system-ui;pointer-events:none';D.body.appendChild(x);}x.style.borderColor=bad?'#f87171':'#38bdf8';x.textContent=t;x.style.display='';clearTimeout(x.__t);x.__t=setTimeout(function(){x.style.display='none';},3500);try{console.log('[prerooms] '+t);}catch(e){}}
    window.__prToast=toast;
    function frameStatus(){var f=D.getElementById('prFrame');if(!f)return 'cards page missing (no frame)';try{var w=f.contentWindow;if(!w||!w.document||w.document.readyState!=='complete')return 'cards page still loading';if(!w.prCards)return 'cards page failed to load (script error)';var c=w.prCards.current();return c&&c.id?'cards page loaded · '+c.id:'cards page loaded (no pre-room open yet)';}catch(e){return 'cards page error: '+e.message;}}
    function showCards(){if(size<1)size=1;setHidden(false);applySize();var s=frameStatus();toast(s,/fail|error|missing/.test(s));}
    window.__prShow=showCards;
    function hit(x,y){var r=null;['prHide','prBg','prSm'].some(function(id){var b=D.getElementById(id);if(!b||!b.offsetParent)return false;var q=b.getBoundingClientRect();if(x>=q.left&&x<=q.right&&y>=q.top&&y<=q.bottom){r=b;return true;}return false;});return r;}
    var pressed=null;
    D.addEventListener('pointerdown',function(e){if(!window.__prActive)return;var b=hit(e.clientX,e.clientY);pressed=b;if(b&&e.target!==b){e.stopImmediatePropagation();e.preventDefault();}},true);
    D.addEventListener('click',function(e){if(!window.__prActive)return;var b=hit(e.clientX,e.clientY)||(e.target&&e.target.closest&&e.target.closest('#prHide,#prBg,#prSm'));if(!b)return;e.stopImmediatePropagation();e.preventDefault();
      if(b.id==='prHide'){var w=D.getElementById('prWrap');if(w&&w.__hid)showCards();else{setHidden(true);toast('Cards hidden · press Show cards to bring them back');}}
      else if(b.id==='prBg'){if(size<SIZES.length-1){size++;applySize();}}else{if(size>1){size--;applySize();}}},true);
    var tried=0;setInterval(function(){if(!window.__prActive||tried>8)return;var f=D.getElementById('prFrame');var w=f&&f.contentWindow;if(!w||!w.prCards||!w.document||w.document.readyState!=='complete')return;tried++;if(w.prCards.current()||tried!==2)return;
      if(/prjoin=/.test(location.hash))return;
      fetch('/api/prerooms/mine',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){var o=(j.rooms||[]).filter(function(x){return x.status==='setup'||x.status==='live';}).sort(function(a,b){return b.updated-a.updated;})[0];if(o&&!w.prCards.current()){w.prCards.open(o.id);toast('Reopened your open pre-room '+o.id);}}).catch(function(){});},1500);
  })();
  /* reenter2-20261029 (Dan, Oct 29 2026): while the viewer holds a seat/guest pass in a LIVE pre-room, the room-bar "Bot room" button and the Hub Rooms "Bot rooms" button re-enter that live room instead of falling through to the base HF- room (botroombtn-20261025a opens /botroom/?inv=1&room=<current HF room>). Exit still only closes this screen. Roll back: .bak-*-reenter2 */
  (function(){var KEY='hf-last-live-preroom',liveId=null,busy=0;
    function poll(){if(D.hidden&&liveId!==null)return;fetch('/api/prerooms/mine',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;var L=(j.rooms||[]).filter(function(x){return x&&x.status==='live';}),k=null;try{k=localStorage.getItem(KEY);}catch(e){}
      var o=L.filter(function(x){return x.id===k;})[0]||L.sort(function(a,b){return (b.updated||b.updated_ms||0)-(a.updated||a.updated_ms||0);})[0];liveId=o?o.id:null;}).catch(function(){});}
    poll();setInterval(poll,8000);
    function fw(){var f=D.getElementById('prFrame');try{return f&&f.contentWindow&&f.contentWindow.prCards?f.contentWindow:null;}catch(e){return null;}}
    function showLive(){var l=D.getElementById('prLive');if(!l)return false;var f=l.querySelector('iframe');if(f)f.style.display='';l.style.height='';l.style.bottom='';return true;}
    function reenter(id){if(!id||busy)return;if(showLive())return;busy=1;setTimeout(function(){busy=0;},15000);
      if(!(window.__prActive&&fw()))openPR();var n=0,opened=false,t=setInterval(function(){n++;if(n>60||D.getElementById('prLive')){clearInterval(t);busy=0;return;}var w=fw();
        try{if(!w||!w.document||w.document.readyState!=='complete')return;var c=w.prCards.current&&w.prCards.current();if(!c||c.id!==id){if(!opened){opened=true;w.prCards.open(id);}return;}
          if(c.live&&w.prCards.enterLive()){clearInterval(t);busy=0;}}catch(e){}},250);}
    window.__prReenter=reenter;window.__prLiveId=function(){return liveId;};
    D.addEventListener('pointerdown',function(e){if(e.target&&e.target.closest&&e.target.closest('#rx_botroom,.hrnewcol button.hrnew'))poll();},true);
    D.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#rx_botroom');if(!b||!liveId)return;e.preventDefault();e.stopImmediatePropagation();reenter(liveId);},true);
  })();
})();
