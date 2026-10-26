/* sidenote-20261022b (Dan, room page approved for this feature only): private Side Notes in HubFace rooms.
   - Open: click (no drag) a person's or bot's floating room panel (#ui > .rlPanel) -> small popover "Side note to NAME". No permanent icon.
     Dragging a panel still moves it; its minimize / resize / red X controls are untouched.
   - Compose (~280px, by the tapped seat): type, or ONE mic button = mute your room mic (App.setAV('mic',false)) + start dictation
     through the shared field-dictation path (__hfDictate, covered by sttfix-20261021e). Send = send + unmute (only if we muted it).
   - Delivery: the room server's existing TARGETED signal relay ({t:'signal',to:<peer id>}) forwards only to that one member and
     logs nothing; it allows data.type 'ice', so the note rides as {type:'ice', sn:{...}} with no candidate (room-live ignores it).
     Never broadcast, never in Room Chat, transcript or the session packet. No server change, no restart.
   - Recipient: ~240x120 card tucked at the recipient's own seat (top-right), two buttons: thumbs-up (closes card, sender gets a thumbs-up badge on
     their own tile, visible only to them) and [mic Reply] (opens reply compose to the original sender + mute/dictate in one press).
   - Bot recipients (Yoda panel, bot peers): kept on this screen only, saved to localStorage 'hf-sidenote-botctx-v1' and exposed as
     window.__hfSideNote.botNotes(); sender sees "Delivered privately". Not sent to any AI (no private bot channel exists yet).
   Roll back: remove the sidenote-20261022b script tag. */
(function(){'use strict';
  if(window.__hfSideNote)return;
  var TAG='sidenote-20261022b',BK='hf-sidenote-botctx-v1',MAX=280;
  var sockets=[],NW=window.WebSocket;
  /* capture room-live sockets (read-only listener + send) */
  if(NW&&!NW.__sn){var W=function(u,p){var w=p===undefined?new NW(u):new NW(u,p);try{if(/\/api\/room-live/.test(String(u))){sockets.push(w);w.addEventListener('message',onWs);}}catch(_){}return w;};
    W.prototype=NW.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){W[k]=NW[k];});W.__sn=1;window.WebSocket=W;}
  function ws(){for(var i=sockets.length-1;i>=0;i--)if(sockets[i].readyState===1)return sockets[i];return null;}
  function RL(){return window.__roomLive;} function App(){return window.__rb&&window.__rb.App;}
  function inRoom(){return document.documentElement.classList.contains('rb-room');}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function st(){try{return RL().state();}catch(_){return{peers:[]};}}
  function peerById(id){var p=st().peers.filter(function(x){return String(x.id)===String(id);})[0];return p||null;}
  function myName(){var s=st();return (s.self&&s.self.name)||'Someone';}
  function isBotPeer(p){try{return RL().botMute.peerIsBot(p);}catch(_){return false;}}
  function panelOf(pid){return document.querySelector('#ui > .rlPanel[data-pid="'+String(pid).replace(/"/g,'')+'"]');}
  function selfPanel(){return document.querySelector('#ui > .rlPanel[data-self]');}
  function targetOf(el){if(el.hasAttribute('data-self'))return null;
    if(el.hasAttribute('data-yoda'))return{bot:true,id:'yoda',name:'Yoda (Moderator)',el:el};
    var pid=el.getAttribute('data-pid');if(pid){var p=peerById(pid);var nm=(p&&p.name)||((el.querySelector('.rlNm')||{}).textContent)||'Guest';return{bot:!!(p&&isBotPeer(p)),id:pid,name:nm,el:el};}
    var nm2=((el.querySelector('.rlNm')||{}).textContent||'').trim();return nm2?{bot:true,id:'bot:'+nm2,name:nm2,el:el}:null;}
  function css(){if(document.getElementById('sn-css'))return;var s=document.createElement('style');s.id='sn-css';s.textContent=
    '.snPop,.snCmp,.snCard{position:fixed;z-index:2147483000;font:13px/1.35 "Segoe UI",Montserrat,Arial,sans-serif;color:#fff;background:rgba(12,22,60,.95);border:1.5px solid #6fa0ff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.6);box-sizing:border-box;pointer-events:auto!important}'+
    '.snCard{width:300px;max-width:calc(100vw - 32px);padding:8px 10px}.snCard .snHd{gap:8px}'+
    '.snPop{border-radius:10px;padding:4px}.snPop button{all:unset;display:block;padding:7px 12px;border-radius:7px;cursor:pointer;white-space:nowrap}.snPop button:hover{background:rgba(61,123,255,.35)}'+
    '.snCmp{width:280px;padding:10px}.snHd{display:flex;justify-content:space-between;align-items:center;color:#a9c4ff;font-size:12px;margin-bottom:6px}.snX{cursor:pointer;color:#ccd;padding:0 4px;font-size:14px}'+
    '.snCmp textarea{width:100%;height:58px;resize:none;box-sizing:border-box;border:1px solid #445;border-radius:10px;padding:7px;background:rgba(0,0,0,.35);color:#fff;font:inherit;outline:none}'+
    '.snRow{display:flex;gap:8px;align-items:center;margin-top:7px}.snB{all:unset;cursor:pointer;border:1px solid #5a86ff;border-radius:16px;padding:4px 11px;background:rgba(61,123,255,.2);font-size:13px}'+
    '.snB.snSend{margin-left:auto;background:#3d7bff}.snB.snMic.on{background:#d33;border-color:#ff6b6b;box-shadow:0 0 0 4px rgba(255,80,80,.4)}.snLs{color:#ff8a8a;font-size:11px;margin-left:4px}'+
    '.snCard{width:240px;height:120px;padding:9px 12px;display:flex;flex-direction:column}.snCard .snTx{flex:1;overflow:auto;font-size:14px;margin:4px 0;word-wrap:break-word}'+
    '.snCard.snS-r::before,.snCard.snS-l::before,.snCard.snS-b::before,.snCard.snS-t::before{content:"";position:absolute;width:12px;height:12px;background:rgba(12,22,60,.95);border:1.5px solid #6fa0ff;box-sizing:border-box;transform:rotate(45deg)}'+
    '.snCard.snS-r::before{left:-7px;top:var(--snp,12px);border-top:0;border-right:0}.snCard.snS-l::before{right:-7px;top:var(--snp,12px);border-bottom:0;border-left:0}'+
    '.snCard.snS-b::before{top:-7px;left:var(--snp,12px);border-right:0;border-bottom:0}.snCard.snS-t::before{bottom:-7px;left:var(--snp,12px);border-left:0;border-top:0}'+
    '.snBadge{position:absolute;top:4px;left:6px;z-index:9;background:rgba(20,120,60,.9);border-radius:10px;padding:1px 7px;font-size:13px;pointer-events:none}'+
    '.snMuted{position:fixed;z-index:2147483000;background:rgba(200,40,40,.88);border-radius:10px;padding:3px 9px;font:12px "Segoe UI",Arial;color:#fff;pointer-events:none}';
    document.head.appendChild(s);}
  function place(box,r,mode){var W=innerWidth,H=innerHeight,w=box.offsetWidth,h=box.offsetHeight,x,y;
    if(mode==='card'){var st=Object.keys(cards).length;x=16;y=H-h-96-st*(h+10);}else if(mode==='pop'){x=r.x;y=r.y;}else{x=r.left;y=r.bottom+8;if(y+h>H-8)y=r.top-h-8;}
    box.style.left=Math.max(6,Math.min(W-w-6,x))+'px';box.style.top=Math.max(6,Math.min(H-h-6,y))+'px';}
  function toast(t){try{App().toast(t);}catch(_){}}
  /* ---------- open: click without drag ---------- */
  var down=null,pop=null,cmp=null,mic={ours:false,badge:null};
  function ignoreTarget(t){var pn=t.closest&&t.closest('#ui > .rlPanel');if(pn){for(var n=t;n&&n!==pn;n=n.parentNode){if(n.nodeType!==1)continue;if(n.onclick||/mute|spk|speak|vol|mic|cam|ctl|ctrl|btn|icon|toggle|rlBot/i.test(String(n.className&&n.className.baseVal!==undefined?n.className.baseVal:n.className))||n.tagName==='svg'||n.tagName==='SVG')return true;try{if(getComputedStyle(n).cursor==='pointer')return true;}catch(_){}}}return !!(t.closest&&t.closest('.rlMin,.rlGrip,button,[role=button],a,input,textarea,select,.rx,.rlX,[data-x],[class*="close"]'));}
  document.addEventListener('pointerdown',function(e){var el=e.target.closest&&e.target.closest('#ui > .rlPanel');down=el?{el:el,x:e.clientX,y:e.clientY,t:Date.now()}:null;if(pop&&!(e.target.closest&&e.target.closest('.snPop')))closePop();},true);
  document.addEventListener('pointerup',function(e){var d=down;down=null;if(!d||!inRoom()||e.button!==0)return;
    if(Math.abs(e.clientX-d.x)>5||Math.abs(e.clientY-d.y)>5||Date.now()-d.t>700)return;if(ignoreTarget(e.target))return;try{var rc=d.el.getBoundingClientRect();if(e.clientY-rc.top<56&&rc.right-e.clientX<70)return;}catch(_){}
    var tg=targetOf(d.el);if(!tg)return;setTimeout(function(){openPop(tg,e.clientX,e.clientY);},0);},true);
  function closePop(){if(pop){pop.remove();pop=null;}}
  function openPop(tg,x,y){closePop();css();pop=document.createElement('div');pop.className='snPop';pop.setAttribute('data-sn','pop');
    pop.innerHTML='<button type="button" data-a="sn">\ud83d\udd12 Side note to '+esc(tg.name)+'</button>';document.body.appendChild(pop);place(pop,{x:x+4,y:y+4},'pop');
    pop.querySelector('[data-a=sn]').addEventListener('click',function(ev){ev.stopPropagation();closePop();openCompose(tg,null,false);});}
  /* ---------- compose ---------- */
  function muteRoomMic(){var A=App();if(!A)return;if(A.state&&A.state.mic){mic.ours=true;try{A.setAV('mic',false);}catch(_){}showMuted(true);}}
  function restoreMic(){var A=App();showMuted(false);if(mic.ours){mic.ours=false;try{A&&A.setAV('mic',true);}catch(_){}}}
  function showMuted(on){if(mic.badge){mic.badge.remove();mic.badge=null;}if(!on)return;var sp=selfPanel();if(!sp)return;var r=sp.getBoundingClientRect();mic.badge=document.createElement('div');mic.badge.className='snMuted';mic.badge.setAttribute('data-sn','muted');mic.badge.textContent='\ud83d\udd07 Room mic muted';document.body.appendChild(mic.badge);mic.badge.style.left=(r.left+8)+'px';mic.badge.style.top=(r.top+8)+'px';}
  function dict(){return window.__hfDictate;}
  function stopDict(){try{var D=dict();if(D&&D.active())D.stop();}catch(_){}}
  function closeCompose(restore){if(!cmp)return;stopDict();cmp.remove();cmp=null;if(restore)restoreMic();}
  function openCompose(tg,replyTo,autoMic){closeCompose(true);css();cmp=document.createElement('div');cmp.className='snCmp';cmp.setAttribute('data-sn','compose');
    cmp.innerHTML='<div class="snHd"><span>\ud83d\udd12 '+(replyTo?'Reply to ':'Side note to ')+esc(tg.name)+'</span><span class="snX" data-a="x" title="Close">\u2715</span></div>'+
      '<textarea maxlength="'+MAX+'" placeholder="Private note \u2014 only '+esc(tg.name)+' sees it"></textarea>'+
      '<div class="snRow"><button type="button" class="snB snMic" data-a="mic" title="Mutes your room mic and dictates the note">\ud83c\udfa4</button><span class="snLs" hidden>\u25cf Listening\u2026</span><button type="button" class="snB snSend" data-a="send">Send</button></div>';
    document.body.appendChild(cmp);var r=(tg.el&&document.contains(tg.el)?tg.el:(selfPanel()||document.body)).getBoundingClientRect();place(cmp,r,'cmp');
    var ta=cmp.querySelector('textarea');ta.__fmic=1;/* keep ONE mic: opt out of the global field-mic helper */var mb=cmp.querySelector('[data-a=mic]'),ls=cmp.querySelector('.snLs');
    var poll=setInterval(function(){if(!cmp){clearInterval(poll);return;}var on=!!(dict()&&dict().active());mb.classList.toggle('on',on);ls.hidden=!on;},250);
    function micPress(){var D=dict(),on=!!(D&&D.active());if(on){stopDict();return;}muteRoomMic();if(D){try{D.toggle(mb,ta);}catch(_){} }else toast('Voice typing is not available here.');}
    mb.addEventListener('click',function(e){e.stopPropagation();micPress();});
    cmp.querySelector('[data-a=x]').addEventListener('click',function(e){e.stopPropagation();closeCompose(true);});
    cmp.querySelector('[data-a=send]').addEventListener('click',function(e){e.stopPropagation();stopDict();setTimeout(function(){var txt=String(ta.value||'').trim().slice(0,MAX);if(!txt){restoreMic();closeCompose(false);return;}
      var ok=deliver(tg,txt,replyTo);closeCompose(false);restoreMic();toast(ok?(tg.bot?'Side note delivered privately to '+tg.name:'Side note sent privately to '+tg.name):'Side note not sent \u2014 '+tg.name+' is not connected.');},120);});
    ta.addEventListener('keydown',function(e){if(e.key==='Escape'){closeCompose(true);}e.stopPropagation();});
    if(autoMic)setTimeout(micPress,30);else setTimeout(function(){try{ta.focus();}catch(_){}},30);}
  function nid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
  function deliver(tg,txt,replyTo){if(tg.bot){var a=[];try{a=JSON.parse(localStorage.getItem(BK)||'[]')||[];}catch(_){}a.push({to:tg.name,text:txt,at:Date.now(),room:(st().room||'')});a=a.slice(-50);try{localStorage.setItem(BK,JSON.stringify(a));}catch(_){}return true;}
    var w=ws();if(!w||!peerById(tg.id))return false;
    try{w.send(JSON.stringify({t:'signal',to:tg.id,data:{type:'ice',sn:{k:'note',id:nid(),text:txt,from:myName().slice(0,40),re:replyTo||null}}}));return true;}catch(_){return false;}}
  /* ---------- receive ---------- */
  function onWs(e){var m;try{m=JSON.parse(e.data);}catch(_){return;}if(!m||m.t!=='signal'||!m.data||!m.data.sn)return;var sn=m.data.sn;
    if(sn.k==='rt'){try{window.__roomTimer&&window.__roomTimer.sync(sn.start,sn.end);}catch(_){}return;}
    if(sn.k==='note')showCard(m.from,sn);else if(sn.k==='ack')gotAck(m.from,sn);}
  var cards={};
  function showCard(from,sn){css();var p=peerById(from),nm=String((p&&p.name)||sn.from||'Someone').slice(0,40),txt=String(sn.text||'').slice(0,MAX);
    var c=document.createElement('div');c.className='snCard';c.setAttribute('data-sn','card');c.setAttribute('data-from',from);
    c.innerHTML='<div class="snHd" style="margin:0"><span>\ud83d\udd12 Side note \u00b7 private \u00b7 from '+esc(nm)+'</span><span class="snX" data-a="x" title="Dismiss">\u00d7</span></div><div class="snTx"></div>'+
      '<div class="snRow" style="margin:0"><button type="button" class="snB" data-a="up" title="Thumbs up">\ud83d\udc4d</button><button type="button" class="snB" data-a="reply" title="Reply privately (mutes your room mic and dictates)">\ud83c\udfa4 Reply</button></div>';
    c.querySelector('.snTx').textContent=txt;document.body.appendChild(c);
    var stack=Object.keys(cards).length;c.__from=from;c.__stk=stack;cards[sn.id]=c;anchorAll();
    c.querySelector('[data-a=x]').addEventListener('click',function(ev){ev.stopPropagation();c.remove();delete cards[sn.id];anchorAll();});
    c.querySelector('[data-a=up]').addEventListener('click',function(ev){ev.stopPropagation();var w=ws();try{w&&w.send(JSON.stringify({t:'signal',to:from,data:{type:'ice',sn:{k:'ack',id:sn.id,from:myName().slice(0,40)}}}));}catch(_){}c.remove();delete cards[sn.id];});
    c.querySelector('[data-a=reply]').addEventListener('click',function(ev){ev.stopPropagation();c.remove();delete cards[sn.id];openCompose({bot:false,id:from,name:nm,el:panelOf(from)},sn.id,true);});}

  /* sidenote-anchor-20261025 (Dan, Oct 25): placement only. Each received card sits against the SENDER's tile (right/left/below/above,
     whichever side has room), a small pointer touches the tile; same-sender cards stack along that edge; recomputed on resize and
     every 300ms while cards are open (tiles move). Sender tile not found -> old bottom-left corner. Rollback: /root/hubface-backups/sidenote-anchor-20261025/ */
  function anchorOne(c,k){var t=panelOf(c.__from),W=innerWidth,H=innerHeight,w=c.offsetWidth,h=c.offsetHeight,G=3,M=6,r=null;
    if(t){r=t.getBoundingClientRect();if(!(r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<W&&r.top<H))r=null;}
    c.classList.remove('snS-r','snS-l','snS-b','snS-t');
    if(!r){var x0=16,y0=H-h-96-c.__stk*(h+10);c.style.left=Math.max(M,Math.min(W-w-M,x0))+'px';c.style.top=Math.max(M,Math.min(H-h-M,y0))+'px';c.removeAttribute('data-side');return;}
    var side=(W-r.right>=w+G+M)?'r':(r.left>=w+G+M)?'l':(H-r.bottom>=h+G+M)?'b':(r.top>=h+G+M)?'t':'r',x,y,off=k*(side==='r'||side==='l'?h+6:w+6);
    if(side==='r'){x=r.right+G;y=r.top+off;}else if(side==='l'){x=r.left-G-w;y=r.top+off;}else if(side==='b'){y=r.bottom+G;x=r.left+off;}else{y=r.top-G-h;x=r.left+off;}
    x=Math.max(M,Math.min(W-w-M,x));y=Math.max(M,Math.min(H-h-M,y));c.style.left=x+'px';c.style.top=y+'px';c.classList.add('snS-'+side);c.setAttribute('data-side',side);
    /* pointer position along the edge, aimed at the tile's middle, kept inside the card */
    var pv=(side==='r'||side==='l')?Math.max(10,Math.min(h-18,(Math.max(r.top,y)+Math.min(r.bottom,y+h))/2-y-6)):Math.max(10,Math.min(w-18,(Math.max(r.left,x)+Math.min(r.right,x+w))/2-x-6));c.style.setProperty('--snp',pv+'px');}
  function anchorAll(){var per={};Object.keys(cards).forEach(function(id){var c=cards[id];if(!document.contains(c)){delete cards[id];return;}var k=per[c.__from]=(per[c.__from]==null?0:per[c.__from]+1);try{anchorOne(c,k);}catch(_){}});}
  addEventListener('resize',anchorAll);setInterval(function(){if(Object.keys(cards).length)anchorAll();},300);
  function gotAck(from,sn){var p=peerById(from),nm=String((p&&p.name)||sn.from||'Someone').slice(0,40),sp=selfPanel();css();
    if(sp){var b=document.createElement('div');b.className='snBadge';b.setAttribute('data-sn','ack');b.title=nm+' gave your side note a thumbs-up';b.textContent='\ud83d\udc4d '+nm;sp.appendChild(b);setTimeout(function(){b.remove();},12000);}
    toast(nm+' \ud83d\udc4d your side note');}
  addEventListener('keydown',function(e){if(e.key==='Escape'){closePop();}});
  /* avsync: share the room session timer with every participant so mic+camera unlock for all */
  var rtSent=0,rtEnd=0;setInterval(function(){try{var rt=window.__roomTimer,stt=rt&&rt.state&&rt.state();if(!stt||!stt.end||stt.end<=Date.now())return;var w=ws();if(!w)return;var now=Date.now();if(stt.end===rtEnd&&now-rtSent<5000)return;rtEnd=stt.end;rtSent=now;(st().peers||[]).forEach(function(pp){if(!pp||pp.id==null)return;try{w.send(JSON.stringify({t:'signal',to:pp.id,data:{type:'ice',sn:{k:'rt',start:stt.start,end:stt.end}}}));}catch(_){}});}catch(_){}},1000);
  window.__hfSideNote={build:TAG,botNotes:function(){try{return JSON.parse(localStorage.getItem(BK)||'[]');}catch(_){return[];}},sockets:function(){return sockets.length;}};
})();
