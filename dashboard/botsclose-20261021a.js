/* botsclose-20261021a (Dan, voice Oct 21 ~12:16pm ET): one "Close all bots" X in HubFace rooms.
   - Shown in any room (html.rb-room) whenever the room has 1+ bots (generic: every id in HF_roomBots(), any current/future bot).
   - Click: calls each bot's own HF_removeBot(id) (same save path as removing one by one: hubface-room-bots localStorage, hf:bot-remove event),
     so every bot returns to the AI assistant / Invite bot picker as un-selected and stays gone after reload. Also closes an open agent panel bar.
   - Does not touch per-bot mute, botbarfix/botbarx expand, or Bots quiet. Roll back: remove this script tag (ROLLBACK-botsclose.sh). */
(function(){
  'use strict';
  if(window.__hfBotsClose)return;
  var st=document.createElement('style');
  st.textContent='#hfBotsCloseAll{position:fixed;z-index:100002;width:26px;height:26px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:#b3261e;color:#fff;font:bold 15px/24px system-ui;text-align:center;padding:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);display:none}#hfBotsCloseAll:hover{background:#d93025}html.rb-room #hfBotsCloseAll.on{display:block}';
  (document.head||document.documentElement).appendChild(st);
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  function bots(){try{return typeof window.HF_roomBots==='function'?window.HF_roomBots().slice():[];}catch(_){return [];}}
  function bars(){return [].filter.call(document.querySelectorAll('#vbBar, section.ava, .hfap-bar, [id^="hfap"]:not(#hfapPop), [data-bot]'),function(e){if(e.id==='hfBotsCloseAll'||e.closest('#aiDd,#rxBotPick,.blist'))return false;var r=e.getBoundingClientRect();return r.width>20&&r.height>20;});}
  var btn=document.createElement('button');btn.id='hfBotsCloseAll';btn.type='button';btn.textContent='\u2715';btn.title='Close all bots';btn.setAttribute('aria-label','Close all bots');
  ['pointerdown','mousedown','dblclick'].forEach(function(ev){btn.addEventListener(ev,function(e){e.stopPropagation();});});
  btn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();
    bots().forEach(function(id){try{window.HF_removeBot(id);}catch(err){console.warn('[botsclose]',id,err);}});
    try{if(window.HF_agentPanel&&window.HF_agentPanel.close)window.HF_agentPanel.close();}catch(_){}
    paint();});
  function place(){var b=bars(),r=null;b.forEach(function(e){var q=e.getBoundingClientRect();if(!r||q.top<r.top)r=q;});
    var x,y;if(r){x=Math.min(innerWidth-34,r.right-13);y=Math.max(6,r.top-32);}else{x=innerWidth-44;y=innerHeight-140;}
    btn.style.left=Math.round(x)+'px';btn.style.top=Math.round(y)+'px';}
  function paint(){if(!btn.parentNode&&document.body)document.body.appendChild(btn);var on=inRm()&&bots().length>=1;btn.classList.toggle('on',on);if(on)place();}
  setInterval(paint,500);addEventListener('resize',paint);addEventListener('hf:bot-invite',function(){setTimeout(paint,50);});addEventListener('hf:bot-remove',function(){setTimeout(paint,50);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);else paint();
  window.__hfBotsClose={build:'botsclose-20261021a',count:function(){return bots().length;}};
})();
