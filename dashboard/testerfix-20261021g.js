/* testerfix-20261021g (Tester, Oct 21 2026). Client-side only.
   (a) Exit room (#rb_exit click, Hub Rooms [data-a=rbexit] click, or html.rb-room removed): every bot panel is hidden at once -
       agent-panel bars (.hfap: Professor/Moderator/...), companion panels (.hfcp, closed with their X), #hfMod - then the open
       agent panel is closed via HF_agentPanel.close(). Hide lifts on the next room entry or when a panel is opened afterwards.
   (b) Restored Build Your Own mode (testerfix-f) now behaves like a CHAT click minus auto-enter: App mode/type are set (testerfix-f)
       and Enter in the title or the card's "Open room" button opens the room through App.pickMode (the same path as the click).
   Roll back: ROLLBACK-testerfixg.sh */
(function(){
  'use strict';if(window.__testerfixG)return;var S=window.__testerfixG={build:'testerfix-20261021g',hidden:0,opened:0};
  var H=document.documentElement;function R(){return window.__rb;}function inR(){var X=R();return !!(X&&X.inRoom&&X.inRoom());}
  var st=document.createElement('style');st.textContent='html.tfg-out .hfap,html.tfg-out .hfcp,html.tfg-out #hfMod{display:none!important}';document.head.appendChild(st);
  function hideAll(){if(!H.classList.contains('rb-room')&&!inR()&&!document.getElementById('rbBar'))return;H.classList.add('tfg-out');S.hidden++;
    setTimeout(function(){try{[].forEach.call(document.querySelectorAll('.hfcp'),function(p){var x=p.querySelector('button.x');if(x)x.click();});}catch(_){}
      try{var c=window.HF_agentPanel&&window.HF_agentPanel.current();if(c)window.HF_agentPanel.close();}catch(_){}},0);}
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#rb_exit,[data-a="rbexit"]'))hideAll();},true);
  var was=H.classList.contains('rb-room');
  new MutationObserver(function(){var n=H.classList.contains('rb-room');if(n===was)return;was=n;if(n)H.classList.remove('tfg-out');else{H.classList.add('tfg-out');hideAll();}}).observe(H,{attributes:true,attributeFilter:['class']});
  /* a panel opened by the user after exit shows again (wait 1.5 s so the closing panels don't count) */
  var armAt=0;new MutationObserver(function(ms){if(!H.classList.contains('tfg-out'))return;if(!armAt)armAt=Date.now()+1500;if(Date.now()<armAt)return;
    for(var i=0;i<ms.length;i++)for(var j=0;j<ms[i].addedNodes.length;j++){var a=ms[i].addedNodes[j];if(a.nodeType===1&&a.matches&&a.matches('.hfap,.hfcp,#hfMod')){H.classList.remove('tfg-out');armAt=0;return;}}})
    .observe(document.body,{childList:true});
  document.addEventListener('pointerdown',function(e){if(H.classList.contains('tfg-out')&&e.target.closest&&e.target.closest('#aiDd,.hfModTile,.hfcpTile,.build[data-bot]')){H.classList.remove('tfg-out');armAt=0;}},true);
  /* (b) */
  function card(){return document.querySelector('.hrbuild');}
  function ready(){var X=R();if(!X||inR())return false;var r=X.state.room,c=card(),t=c&&c.querySelector('.hrbt');return !!(r.mode&&t&&t.value.trim());}
  function openNow(){var X=R(),r=X.state.room,c=card(),t=c.querySelector('.hrbt');r.title=t.value.trim();S.opened++;X.pickMode(r.mode,r.type||null);}
  document.addEventListener('keydown',function(e){if(e.defaultPrevented||e.key!=='Enter'||!(e.target.matches&&e.target.matches('.hrbuild .hrbt')))return;if(!ready())return;e.preventDefault();openNow();},false);
  function decorate(){var c=card(),X=R();if(!c||!X||inR()||!X.state.room.mode)return;if(c.querySelector('[data-tfe="open"],[data-tfg="open"]'))return;
    var hint=c.querySelector('.hrhint');if(!hint)return;var d=document.createElement('div');d.className='hrbtns';d.innerHTML='<button type="button" class="hropen" data-tfg="open">Open room</button>';hint.parentNode.insertBefore(d,hint.nextSibling);}
  document.addEventListener('click',function(e){if(!(e.target.closest&&e.target.closest('[data-tfg="open"]')))return;e.preventDefault();e.stopPropagation();
    var c=card(),t=c&&c.querySelector('.hrbt');if(!ready()){if(t){t.focus();t.style.outline='2px solid #ff8a8a';}return;}openNow();},true);
  new MutationObserver(function(){try{decorate();}catch(_){}}).observe(document.body,{childList:true,subtree:true});
})();
