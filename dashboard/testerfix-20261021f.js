/* testerfix-20261021f (Tester, Oct 21 2026). Client-side only.
   (a) Exit room: #hfMod (moderator.js "Moderator · in room") is hidden the moment html.rb-room is removed (it used to linger
       a few seconds over Properties until moderator.js's own check removed it); shown again on the next room entry.
   (b) Exit room keeps the Build Your Own mode: App.begin() (index.html) resets mode/type to null; if begin() is called for the
       same title as the room just left, the left room's mode/type (and vault path) are restored.
   Roll back: ROLLBACK-testerfixf.sh */
(function(){
  'use strict';if(window.__testerfixF)return;var S=window.__testerfixF={build:'testerfix-20261021f',hid:0,restored:0};
  var H=document.documentElement,last=null;
  var st=document.createElement('style');st.textContent='html.tff-out #hfMod{display:none!important}';document.head.appendChild(st);
  function R(){return window.__rb;}
  var was=H.classList.contains('rb-room');
  new MutationObserver(function(){var n=H.classList.contains('rb-room');if(n===was)return;was=n;
    if(!n){var m=document.getElementById('hfMod');H.classList.add('tff-out');if(m)S.hid++;
      try{var r=R().state.room;if(r.mode)last={title:String(r.title||'').trim(),mode:r.mode,type:r.type||null,path:r.path||null};}catch(_){}}
    else H.classList.remove('tff-out');}).observe(H,{attributes:true,attributeFilter:['class']});
  /* release the hide as soon as #hfMod no longer shows the in-room state (dashboard use), or after 8 s at most */
  var relT=0;function release(){H.classList.remove('tff-out');clearTimeout(relT);}
  new MutationObserver(function(){if(!H.classList.contains('tff-out'))return;var m=document.getElementById('hfMod');if(!m||!/in room/i.test(m.textContent||''))release();})
    .observe(document.body,{childList:true,subtree:true,characterData:true});
  new MutationObserver(function(){if(H.classList.contains('tff-out')){clearTimeout(relT);relT=setTimeout(release,8000);}}).observe(H,{attributes:true,attributeFilter:['class']});
  (function wrap(n){var X=R(),A=X&&X.App;if(!A||typeof A.begin!=='function'){if(n<40)setTimeout(function(){wrap(n+1);},250);return;}
    [A,X].forEach(function(o){if(typeof o.begin!=='function'||o.begin.__tff)return;var f=o.begin,g=function(){var res=f.apply(this,arguments);
      try{var r=R().state.room;if(last&&!r.mode&&String(r.title||'').trim()&&String(r.title).trim()===last.title){r.mode=last.mode;r.type=last.type;if(!r.path&&last.path)r.path=last.path;S.restored++;try{A.applyRoom();}catch(_){}}}catch(_){}
      return res;};g.__tff=1;o.begin=g;});})(0);
})();
