/* yodaseats-20261026a (Dan, voice c85ecff9, Oct 26 2026): server-side bot seats for every joiner.
   Reads /api/yoda-rooms/seats/<room> and seats/unseats bots through the existing picker (HF_inviteBot/HF_removeBot).
   Owner's own Invite-bot clicks are also written to the server (others' clicks stay local; server answers 403).
   ys2: seat 'yoda' = press Add Yoda once per page load (room-extras drops Yoda/bot replies unless Add Yoda is on).
   Never touches the timer, Start session or Bot Room. Roll back: remove this script tag from index.html. */
(function(){
  var last={}, busy=false, quiet=false, yodaWant='', yodaDone={};
  /* ys4: Add Yoda for rooms seated with 'yoda' (once per room per page; retried until it sticks) */
  setInterval(function(){var id=rid();if(!id||yodaWant!==id||!inRm())return;
    try{var k='hubface-yoda-picked',m=JSON.parse(localStorage.getItem(k)||'{}')||{};m[id]=true;localStorage.setItem(k,JSON.stringify(m));}catch(_){}
    document.documentElement.classList.remove('rxNoYoda'); /* yodacard1: no hidden-button click */},1000);
  function rid(){var m=/[?&#](?:room|r)=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/.exec(location.href);return m?m[1]:'';}
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  function sync(){
    var id=rid(); if(window.__hfServerSeats&&window.__hfServerSeats.room!==id)window.__hfServerSeats=null; if(!id||busy||!inRm())return; busy=true; /* yodacard1: seats read even before the bot picker is ready */
    fetch('/api/yoda-rooms/seats/'+id,{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(!j||!Array.isArray(j.bots)||rid()!==id)return;
      var prev=last[id]||[], cur=(window.HF_roomBots&&window.HF_roomBots())||[];
      quiet=true;
      try{
        j.bots.forEach(function(b){if(b==='yoda'){yodaWant=id;return;}if(typeof window.HF_inviteBot==='function'&&prev.indexOf(b)<0&&cur.indexOf(b)<0)window.HF_inviteBot(b);});
        prev.forEach(function(b){if(b==='yoda')return;if(j.bots.indexOf(b)<0&&cur.indexOf(b)>=0&&window.HF_removeBot)window.HF_removeBot(b);});
      }finally{quiet=false;}
      last[id]=j.bots.slice(); window.__hfServerSeats={room:id,bots:j.bots.slice()}; if(j.bots.indexOf('yoda')>=0)document.documentElement.classList.remove('rxNoYoda'); /* yodacard1 */
      document.documentElement.setAttribute('data-server-seats',j.bots.join(','));
    }).catch(function(){}).then(function(){busy=false;});
  }
  function push(kind,e){
    if(quiet)return; var id=rid(),b=e&&e.detail&&e.detail.id; if(!id||!b)return;
    var o={}; o[kind]=[b];
    fetch('/api/yoda-rooms/seats/'+id,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)})
      .then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&Array.isArray(j.bots))last[id]=j.bots.slice();}).catch(function(){});
  }

  /* ys3: visible seat tiles for Ava/Finn (same style as the Moderator tile in room-extras.js) */
  /* ys5: 'avadan' (Ava Dan, avadan@hingecraft-global.ai) = seat + tile only; no voice, no AI behaviour */
  try{var IB=window.HF_INVITABLE_BOTS;if(IB&&!IB.some(function(b){return b.id==='avadan';}))IB.push({id:'avadan',name:'Ava Dan',seatOnly:true});}catch(_){}
  /* ys6: seat tiles look like participant panels (photo, name tag) and can be dragged (mouse+touch); position kept per browser */
  var TL={ava:{n:'Ava',img:'assets/ava.png',top:290},finn:{n:'Finn',img:'assets/yoda-finn.jpg',top:360},avadan:{n:'Ava Dan',img:'assets/avadan_256.jpg',top:430}};
  var PK='hubface-ys-tiles';function pl(){try{return JSON.parse(localStorage.getItem(PK)||'{}')||{};}catch(_){return {};}}
  function drag(t,b){t.addEventListener('pointerdown',function(e){if(e.button>0)return;e.preventDefault();e.stopPropagation();var p=t.parentNode.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=t.offsetLeft,oy=t.offsetTop,sc=(p.width/(t.parentNode.offsetWidth||p.width))||1;
    t.style.cursor='grabbing';try{t.setPointerCapture(e.pointerId);}catch(_){}
    function mv(ev){var x=ox+(ev.clientX-sx)/sc,y=oy+(ev.clientY-sy)/sc,W=t.parentNode.offsetWidth,H=t.parentNode.offsetHeight;x=Math.max(0,Math.min(W-t.offsetWidth,x));y=Math.max(0,Math.min(H-t.offsetHeight,y));t.style.left=Math.round(x)+'px';t.style.top=Math.round(y)+'px';t.style.right='auto';}
    function up(){t.style.cursor='grab';t.removeEventListener('pointermove',mv);t.removeEventListener('pointerup',up);t.removeEventListener('pointercancel',up);var m=pl();m[b]={x:t.offsetLeft,y:t.offsetTop};try{localStorage.setItem(PK,JSON.stringify(m));}catch(_){}}
    t.addEventListener('pointermove',mv);t.addEventListener('pointerup',up);t.addEventListener('pointercancel',up);});}
  function tiles(){var S=window.__hfServerSeats,on=inRm()&&S&&S.room===rid(),cur=(window.HF_roomBots&&window.HF_roomBots())||[];
    Object.keys(TL).forEach(function(b){var id='ysTile_'+b,t=document.getElementById(id),show=on&&(S.bots.indexOf(b)>=0||cur.indexOf(b)>=0);
      if(!show){if(t)t.remove();return;}if(t)return;var ui=document.getElementById('ui')||document.body;t=document.createElement('div');t.id=id;t.setAttribute('data-bot',b);
      var sv=pl()[b];t.style.cssText='position:absolute;'+(sv?'left:'+sv.x+'px;top:'+sv.y+'px;':'right:12px;top:'+TL[b].top+'px;')+'width:168px;height:126px;border-radius:10px;overflow:hidden;background:#000 url('+TL[b].img+') center/cover no-repeat;border:2px solid rgba(255,255,255,.3);box-shadow:0 6px 20px rgba(0,0,0,.4);color:#fff;font:12px system-ui;z-index:50;cursor:grab;touch-action:none;user-select:none;pointer-events:auto';
      t.innerHTML='<span style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:5px;font-size:9.5px;pointer-events:none">'+TL[b].n+' \u00b7 bot</span>';t.style.setProperty('pointer-events','auto','important');ui.appendChild(t);drag(t,b);});}
  setInterval(tiles,1000);
  addEventListener('hf:bot-invite',function(e){push('add',e);});
  addEventListener('hf:bot-remove',function(e){push('remove',e);});
  addEventListener('hashchange',function(){setTimeout(sync,800);});
  setInterval(sync,5000); setTimeout(sync,1500);
})();
/* roster2: box lives inside #rbLayer (room view only), room ID from #room= hash only */
/* roster1-20261026 (Dan approved, voice 3de05dfe 11:07 PM ET): server roster of people joined (GET /api/rooms/<ID>/roster), shown as name tags
   under the bot tiles and fed into the Live Roster widget. Roll back: delete this block (backup yodaseats-20261026a.js.bak-roster1). */
(function(){
  function rid(){var m=/[?&#](?:room|r)=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.hash);return m?m[1].toUpperCase():'';}
  function inRm(){return document.documentElement.classList.contains('rb-room')&&(function(){try{var st=window.__roomLive&&window.__roomLive.state();return !!(st&&st.status==='live'&&st.self);}catch(_){return false;}})();} /* roster8: joined live room only, never the pre-room/landing screen */
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var busy=false;
  function box(){var b=document.getElementById('hfRosterPeople');if(!b){var ui=document.getElementById('rbLayer');if(!ui)return null;b=document.createElement('div');b.id='hfRosterPeople';
    b.style.cssText='position:absolute;right:12px;top:570px;width:168px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font:11px system-ui;z-index:50;pointer-events:none';ui.appendChild(b);}return b;}
  function draw(){var R=window.__hfRoster,on=inRm()&&R&&R.room===rid();var b=document.getElementById('hfRosterPeople');
    if(!on){if(b)b.remove();return;}
    b=box();if(!b)return;var BN={yoda:'Yoda',ava:'Ava',finn:'Finn',avadan:'Ava Dan'},bl=(R.bots||[]);b.innerHTML='<div style="opacity:.7;font-size:9px;letter-spacing:1px;margin-bottom:3px">SEATED ('+(R.people.length+bl.length)+')</div>'+R.people.map(function(p){return '<div>\ud83d\udc64 '+esc(p.name)+' \u00b7 '+esc(p.role)+'</div>';}).join('')+bl.map(function(x){return '<div>\ud83e\udd16 '+esc(BN[x]||x)+' \u00b7 bot</div>';}).join('');
    try{if(typeof App!=='undefined'&&App.wins&&App.wins.roster)App.rerender('roster');}catch(_){}}
  function poll(){var id=rid();if(!id||!inRm()||busy){if(!inRm()||!id){window.__hfRoster=null;draw();}return;}busy=true;
    fetch('/api/rooms/'+id+'/roster',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){busy=false;
      if(j&&Array.isArray(j.people)){window.__hfRoster={room:id,people:j.people,bots:j.bots||[]};}else window.__hfRoster=null;draw();}).catch(function(){busy=false;});}
  function hook(){if(typeof App==='undefined'||!App.renderRoster||App.renderRoster.__r1)return;var orig=App.renderRoster;
    App.renderRoster=function(b){orig(b);var R=window.__hfRoster;if(!R||R.room!==rid())return;var w=b.querySelector('.wlist');if(!w)return;
      w.innerHTML=R.people.map(function(p){return '<div>\ud83d\udc64 '+esc(p.name)+' ('+esc(p.role)+') '+(p.mic?'\ud83c\udf99':'\ud83d\udd07')+(p.cam?' \ud83d\udcf7':'')+'</div>';}).join('')+(R.bots||[]).map(function(x){return '<div>\ud83e\udd16 '+esc(x)+' (bot)</div>';}).join('');
      var n=b.querySelector('p.muted');if(n)n.textContent='Live from the room server.';};App.renderRoster.__r1=1;}
  setInterval(function(){hook();poll();},5000);setTimeout(function(){hook();poll();},1500);
  addEventListener('hashchange',function(){setTimeout(poll,800);});
})();
/* roomclear-20261026 (Dan, voice 3de05dfe ~11:14 PM ET): the Yoda chat panel (App.history / #rb_yc) and the local Live Roster list were page-global,
   so switching rooms in the same tab carried the old room's lines. Clear them when the room ID changes. Roll back: delete this block (backup .bak-roster2). */
(function(){var last=null;function rid(){var m=/[?&#](?:room|r)=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.href);return m?m[1].toUpperCase():'';}
  function chk(){var id=rid();if(last===null){last=id;return;}if(id===last)return;last=id;
    try{if(typeof App!=='undefined'){if(Array.isArray(App.history))App.history.length=0;if(App.state&&Array.isArray(App.state.members))App.state.members.length=0;}}catch(_){}
    try{var c=document.getElementById('rb_yc');if(c)c.innerHTML='';}catch(_){}
    window.__hfRoster=null;}
  addEventListener('hashchange',chk);setInterval(chk,2000);chk();})();
/* roster6-20261026 (Dan, voice 3de05dfe 11:22-11:24 PM ET): (a) name normalizer: signed-in account username (R2 D2) replaces the real-name "Dan"
   in room-view labels (not chat text, not inputs) and becomes the saved room name; (b) one participant tile per person from the server roster
   (168x126, "R2 D2 · host · here"), local "You" fallback when the roster is unavailable. Roll back: delete this block (backup .bak-roster6). */
(function(){
  var UN=null,RN=null;
  function rid(){var m=/[#&?]room=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.hash);return m?m[1].toUpperCase():'';}
  function inRm(){return document.documentElement.classList.contains('rb-room')&&!!rid()&&(function(){try{var st=window.__roomLive&&window.__roomLive.state();return !!(st&&st.status==='live'&&st.self);}catch(_){return false;}})();}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  fetch('/api/account/me',{credentials:'include'}).then(function(r){return r.ok?r.json():null;}).then(function(j){var a=j&&j.authenticated&&j.account;if(!a||!a.username)return;
    UN=String(a.username);RN=a.realName?String(a.realName):null;try{localStorage.setItem('hubface-guest-name',UN);}catch(_){}}).catch(function(){});
  var SKIP={rb_roomChat:1,rb_yc:1};
  function fixNames(){if(!UN||!RN||RN===UN||!inRm())return;var ui=document.getElementById('ui');if(!ui)return;var re=new RegExp('\\b'+RN.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g');
    var w=document.createTreeWalker(ui,NodeFilter.SHOW_TEXT,{acceptNode:function(n){for(var e=n.parentNode;e&&e!==ui;e=e.parentNode){if(SKIP[e.id]||e.tagName==='SCRIPT'||e.tagName==='STYLE'||e.tagName==='TEXTAREA'||e.isContentEditable||(e.classList&&(e.classList.contains('chat')||e.classList.contains('m'))))return NodeFilter.FILTER_REJECT;}return re.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;}}),n,L=[];
    while((n=w.nextNode()))L.push(n);L.forEach(function(t){re.lastIndex=0;t.nodeValue=t.nodeValue.replace(re,UN);});}
  function people(){var R=window.__hfRoster;if(R&&R.room===rid()&&Array.isArray(R.people)&&R.people.length)return R.people.map(function(p){return {id:p.id,name:p.name,role:p.role,here:true};});
    var s=null;try{s=window.__roomLive&&window.__roomLive.state();}catch(_){}var me=s&&s.self;return [{id:'me',name:(me&&me.name)||UN||'You',role:(me&&me.role)||'you',here:!!me}];}
  function tiles(){var on=inRm(),L=on?people():[],keep={};var layer=document.getElementById('rbLayer');
    L.forEach(function(p,i){var id='ysPerson_'+String(p.id).replace(/[^a-z0-9-]/gi,'');keep[id]=1;var t=document.getElementById(id);
      if(!t){if(!layer)return;t=document.createElement('div');t.id=id;t.className='ysPerson';t.style.cssText='position:absolute;right:190px;width:168px;height:126px;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#123,#246);border:2px solid #2fa8ff;box-shadow:0 6px 20px rgba(0,0,0,.4);color:#fff;font:12px system-ui;z-index:50;pointer-events:none';layer.appendChild(t);}
      t.style.top=(290+i*136)+'px';var ini=String(p.name).split(/\s+/).map(function(x){return x.charAt(0);}).join('').slice(0,3).toUpperCase();
      var h='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;opacity:.85">'+esc(ini)+'</div><span style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:5px;font-size:9.5px">'+esc(p.name)+' \u00b7 '+esc(p.role)+(p.here?' \u00b7 here':'')+'</span>'+(p.here?'<span style="position:absolute;right:6px;top:6px;width:9px;height:9px;border-radius:50%;background:#3ddc84;box-shadow:0 0 6px #3ddc84"></span>':'');
      if(t.__h!==h){t.innerHTML=h;t.__h=h;}});
    Array.prototype.forEach.call(document.querySelectorAll('.ysPerson'),function(t){if(!keep[t.id])t.remove();});}
  /* roster7: human participant tiles removed (Dan 11:28 PM ET: duplicate of his video tile); clear any left over */
  setInterval(function(){try{fixNames();}catch(_){}try{Array.prototype.forEach.call(document.querySelectorAll('.ysPerson'),function(t){t.remove();});}catch(_){}},1500);
})();
