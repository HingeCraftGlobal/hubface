/* testerfix-20261021j (Tester, Oct 21 2026). Replaces the rolled-back testerfix-i.
   (1) First Enter opens: a window-capture keydown (runs before testerfix-e/g/h) on a real Enter (e.key==='Enter', !isComposing,
       !repeat, isTrusted) in the Build Your Own title reads the LIVE trimmed value of that field, sets state.room.title and opens
       via __rb.pickMode once (one-shot flag). A real click on Open room does the same with the title in its own card.
   (2) No opening while typing: App.enter() is refused while the Build Your Own title is focused or was typed in during the last
       1.5 s, unless (1) is the caller. Refused calls are logged with stack in window.__testerfixJ.blocked (for Tester).
   No keyup path. Roll back: ROLLBACK-testerfixj.sh */
(function(){
  'use strict';if(window.__testerfixJ)return;var S=window.__testerfixJ={build:'testerfix-20261021j',opened:0,skipped:0,blocked:[]};
  var allow=false,busy=false,lastType=0;
  function R(){return window.__rb;}function inR(){var X=R();return !!(X&&X.inRoom&&X.inRoom());}
  function isT(el){return !!(el&&el.matches&&el.matches('.hrbuild .hrbt'));}
  function typing(){return isT(document.activeElement)||Date.now()-lastType<1500;}
  document.addEventListener('input',function(e){if(isT(e.target))lastType=Date.now();},true);
  (function wrap(n){var X=R(),A=X&&X.App;if(!A||typeof A.enter!=='function'){if(n<60)setTimeout(function(){wrap(n+1);},250);return;}
    if(A.enter.__tfj)return;var f=A.enter,g=function(){if(!A.inRoom&&!allow&&typing()){var st='';try{st=(new Error().stack||'').split('\n').slice(2,6).join(' | ');}catch(_){}
      S.blocked.push({at:Date.now(),stack:st});if(S.blocked.length>20)S.blocked.shift();return;}return f.apply(this,arguments);};g.__tfj=1;A.enter=g;})(0);
  function open(t){if(busy)return false;var X=R();if(!X||!X.state||inR()||!t)return false;var r=X.state.room,v=String(t.value||'').trim();
    if(!v||!r||!r.mode){S.skipped++;return false;}
    busy=true;allow=true;try{r.title=v;t.style.outline='';S.opened++;X.pickMode(r.mode,r.type||null);}finally{allow=false;setTimeout(function(){busy=false;},800);}
    return true;}
  window.addEventListener('keydown',function(e){if(e.key!=='Enter'||e.isComposing||e.repeat||!e.isTrusted||!isT(e.target))return;
    if(open(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('click',function(e){if(!e.isTrusted)return;var b=e.target.closest&&e.target.closest('[data-tfe="open"],[data-tfg="open"]');if(!b)return;
    var c=b.closest('.hrbuild'),t=c&&c.querySelector('.hrbt');lastType=0;if(open(t)){e.preventDefault();e.stopImmediatePropagation();}},true);
})();
