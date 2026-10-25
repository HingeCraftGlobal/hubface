/* testerfix-20261021e (Tester, Oct 21 2026). Client-side only.
   (1) Entering a room: every companion already invited for it (HF_roomBots: companion-f=Mara, companion-m=Theo) gets its panel
       opened (companion.js shows one panel at a time, so the first invited one).
   (2) Exiting a room: open companion panels (.hfcp) are closed with their own X (stops voice), so none stays over Properties.
   (3) Build Your Own: picking a mode (e.g. CHAT) or type in the Hub Rooms builder card entered the room at once, before the
       title field below the chips could be filled (App.pickMode: if(!App.inRoom)App.enter(), index.html, older than testerfix-a;
       testerfix-a only commits a typed title and never enters). Now, from that card, when the title is still empty the
       mode/type is only marked; the card shows an "Open room" button and focuses the title; Open room or Enter in the title
       opens the room with the title set. Voice/Yoda mode commands are unchanged. Roll back: ROLLBACK-testerfixe.sh */
(function(){
  'use strict';if(window.__testerfixE)return;var S=window.__testerfixE={build:'testerfix-20261021e',opened:0,closed:0,held:0,openedRoom:0};
  var H=document.documentElement,NM=['companion-f','companion-m'];
  function inRm(){return H.classList.contains('rb-room');}
  function R(){return window.__rb;}
  /* (1)/(2) */
  function onEnter(){setTimeout(function(){try{if(!inRm()||typeof window.HF_roomBots!=='function')return;var l=window.HF_roomBots();
    var want=NM.filter(function(id){return l.indexOf(id)>=0;})[0];if(!want||document.querySelector('.hfcp[data-bot="'+want+'"]'))return;
    window.__hfCompanion.open(want);S.opened++;}catch(_){}},400);}
  function onExit(){[].forEach.call(document.querySelectorAll('.hfcp'),function(p){var x=p.querySelector('button.x');if(x)x.click();if(p.isConnected)p.remove();S.closed++;});}
  var was=inRm();new MutationObserver(function(){var n=inRm();if(n!==was){was=n;if(n)onEnter();else onExit();}}).observe(H,{attributes:true,attributeFilter:['class']});
  if(was)onEnter();
  /* (3) */
  var pend=null,fromCard=false;
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.hrbuild [data-a="mode"],.hrbuild [data-a="type"]');fromCard=!!b;if(b)setTimeout(function(){fromCard=false;},0);},true);
  function card(){return document.querySelector('.hrbuild');}
  function decorate(){var c=card();if(!c||!pend)return;var X=R();if(X&&X.inRoom&&X.inRoom()){pend=null;return;}
    var hint=c.querySelector('.hrhint');if(hint&&!c.querySelector('[data-tfe="open"]')){var d=document.createElement('div');d.className='hrbtns';
      d.innerHTML='<button type="button" class="hropen" data-tfe="open">Open room</button>';hint.textContent='Type a room title, then Open room (or press Enter).';hint.parentNode.insertBefore(d,hint.nextSibling);}
    var t=c.querySelector('.hrbt');if(t&&document.activeElement!==t&&!t.__tfeF){t.__tfeF=1;try{t.focus();}catch(_){}}}
  function go(){var X=R();if(!pend||!X)return;var c=card(),t=c&&c.querySelector('.hrbt'),v=t?t.value.trim():'';
    if(!v){if(t){t.focus();t.style.outline='2px solid #ff8a8a';}return;}
    var r=X.state.room;r.title=v;var p=pend;pend=null;S.openedRoom++;orig.call(X,p.m,p.t);}
  var orig=null;
  (function wrap(n){var X=R();if(!X||typeof X.pickMode!=='function'){if(n<40)setTimeout(function(){wrap(n+1);},250);return;}
    orig=X.pickMode;X.pickMode=function(m,t){var X2=R(),r=X2.state.room;
      if(fromCard&&!(X2.inRoom&&X2.inRoom())&&!String(r.title||'').trim()){r.mode=m;r.type=t||null;pend={m:m,t:t||null};S.held++;setTimeout(decorate,0);return (m||'').toUpperCase();}
      return orig.apply(this,arguments);};})(0);
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-tfe="open"]')){e.preventDefault();e.stopPropagation();go();}},true);
  document.addEventListener('keydown',function(e){if(pend&&e.key==='Enter'&&e.target.matches&&e.target.matches('.hrbuild .hrbt')){e.preventDefault();go();}},true);
  new MutationObserver(function(){if(pend)decorate();}).observe(document.body,{childList:true,subtree:true});
})();
