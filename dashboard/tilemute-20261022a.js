/* tilemute-20261022a (Dan named this button): the speaker/mic icon (.rlSt) at the top right of a room tile is a real toggle.
   Remote tile: mutes/unmutes YOUR playback of that participant (local only). Your own tile: toggles your mic.
   Window capture-phase guard so Side Note never opens from this icon. Rollback: /opt/hubface/backups/tilemute-20261022a/ROLLBACK.sh */
(function(){'use strict';if(window.__hfTileMute)return;
  var muted={};
  function App(){return window.__rb&&window.__rb.App;}
  function icon(t){return t&&t.closest&&t.closest('#ui > .rlPanel .rlSt, .rlTile .rlSt');}
  function pidOf(ic){var p=ic.closest('[data-pid]');return p?p.getAttribute('data-pid'):null;}
  function isSelf(ic){return !!ic.closest('[data-self]');}
  function audios(pid){var q=String(pid).replace(/"/g,'');return document.querySelectorAll('#rlAudio audio[data-pid="'+q+'"]');}
  function apply(pid){var m=!!muted[pid];audios(pid).forEach(function(a){a.muted=m;});}
  function paint(){document.querySelectorAll('#ui > .rlPanel .rlSt, .rlTile .rlSt').forEach(function(ic){
    ic.style.cursor='pointer';ic.style.pointerEvents='auto';ic.style.zIndex='9';
    if(isSelf(ic)){ic.title='Click to turn your mic on/off';ic.classList.remove('tmOff');return;}
    var pid=pidOf(ic);if(!pid)return;var m=!!muted[pid];ic.classList.toggle('tmOff',m);ic.title=m?'Muted for you - click to hear':'Click to mute for you';});
    Object.keys(muted).forEach(apply);}
  var st=document.createElement('style');st.textContent='.rlSt.tmOff{outline:2px solid #ff5a5a;background:rgba(160,20,20,.75)!important}';
  (document.head||document.documentElement).appendChild(st);
  function block(e){if(!icon(e.target))return;e.stopPropagation();e.stopImmediatePropagation();}
  ['pointerdown','mousedown','pointerup','mouseup','dblclick'].forEach(function(t){window.addEventListener(t,block,true);});
  window.addEventListener('click',function(e){var ic=icon(e.target);if(!ic)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();
    if(isSelf(ic)){try{var a=App();a.setAV('mic',!a.state.mic);}catch(_){}return;}
    var pid=pidOf(ic);if(!pid)return;muted[pid]=!muted[pid];apply(pid);paint();
    try{App().toast((muted[pid]?'Muted for you: ':'Unmuted: ')+((ic.parentNode.querySelector('.rlNm')||{}).textContent||'participant'));}catch(_){}},true);
  setInterval(paint,500);
  window.__hfTileMute={build:'tilemute-20261022a',muted:muted};
})();
