/* testerfix-20261021d (Tester, Oct 21 2026): companion panel (.hfcp) kept above the room bar (#rbBar: Copy link / Exit room).
   While #rbBar is shown: .hfcp bottom = 8px above the bar's top and max-height capped to the space above it. Horizontal docking
   beside #hfMod (testerfix-c) is untouched; in narrow mode (below #hfMod) its max-height is capped to end above the bar too.
   Roll back: ROLLBACK-testerfixd.sh */
(function(){
  'use strict';if(window.__testerfixD)return;var S=window.__testerfixD={build:'testerfix-20261021d',runs:0};
  var st=document.createElement('style');st.id='tfd-css';
  st.textContent='html.tfd-bar body .hfcp{bottom:var(--tfd-bot)!important;max-height:var(--tfd-max)!important}'+
    'html.tfd-bar.tfc-mod.tfc-narrow body .hfcp{bottom:auto!important;max-height:min(var(--tfc-cpmax,50vh),var(--tfd-nmax))!important}';
  document.head.appendChild(st);
  function vis(e){if(!e||!e.isConnected)return false;var cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return false;var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}
  var last='';
  function run(){q=0;S.runs++;var H=document.documentElement,bar=document.getElementById('rbBar'),on=vis(bar),key='0';
    if(on){var t=Math.round(bar.getBoundingClientRect().top),ctop=parseFloat(getComputedStyle(H).getPropertyValue('--tfc-cptop'))||90;
      key=t+'|'+innerHeight+'|'+ctop;
      if(key!==last){H.style.setProperty('--tfd-bot',(innerHeight-t+8)+'px');H.style.setProperty('--tfd-max',Math.max(120,t-16)+'px');H.style.setProperty('--tfd-nmax',Math.max(120,t-8-ctop)+'px');}}
    if(key!==last){H.classList.toggle('tfd-bar',on);last=key;}}
  var q=0;function kick(){if(!q)q=requestAnimationFrame(run);}
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target;if(ms[i].type==='childList'||(t&&(t.id==='rbBar'||t===document.documentElement))){kick();return;}}})
    .observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
  addEventListener('resize',kick);kick();
})();
