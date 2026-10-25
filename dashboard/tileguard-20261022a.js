/* tileguard-20261022a (Dan named this): the round speaker button (.rlBotMute) on room tiles toggles local mute and never opens Side Note.
   Presses on or within 14px of it are stopped in window capture phase (Side Note listens on pointerdown/up) and routed to the button.
   Muted = red diagonal slash over the speaker. Hides the small status icon left of the minimize arrows (#ui > .rlPanel .rlSt) per Dan.
   Rollback /opt/hubface/backups/tileguard-20261022a/ROLLBACK.sh */
(function(){'use strict';if(window.__hfTileGuard)return;
 var s=document.createElement('style');s.textContent='#ui > .rlPanel .rlSt{display:none!important}'+
  '#ui > .rlPanel .rlBotMute{z-index:20!important;pointer-events:auto!important;cursor:pointer}'+
  '#ui > .rlPanel .rlBotMute::after{content:"";position:absolute;inset:-8px}'+
  '.rlBotMute.muted::before{content:"";position:absolute;left:50%;top:50%;width:130%;height:2.5px;background:#ff2a2a;border-radius:2px;transform:translate(-50%,-50%) rotate(-45deg);box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none;z-index:2}';
 (document.head||document.documentElement).appendChild(s);
 setInterval(function(){document.querySelectorAll('.rlBotMute').forEach(function(b){if(getComputedStyle(b).position==='static')b.style.position='relative';});},500);
 var last=0;
 function hit(e){var t=e.target,b=t&&t.closest&&t.closest('.rlBotMute');if(b)return {b:b,direct:true};
  var pn=t&&t.closest&&t.closest('#ui > .rlPanel');if(!pn)return null;var bs=pn.querySelectorAll('.rlBotMute');
  for(var i=0;i<bs.length;i++){var r=bs[i].getBoundingClientRect();if(e.clientX>=r.left-14&&e.clientX<=r.right+14&&e.clientY>=r.top-14&&e.clientY<=r.bottom+14)return {b:bs[i],direct:false};}return null;}
 function block(e){if(!hit(e))return;last=Date.now();e.stopPropagation();e.stopImmediatePropagation();}
 ['pointerdown','mousedown','pointerup','mouseup','dblclick'].forEach(function(t){window.addEventListener(t,block,true);});
 window.addEventListener('click',function(e){var h=hit(e);if(!h)return;last=Date.now();if(h.direct)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();try{h.b.click();}catch(_){}},true);
 setInterval(function(){if(Date.now()-last<1000)document.querySelectorAll('.snPop').forEach(function(p){p.remove();});},100);
 window.__hfTileGuard={build:'tileguard-20261022a'};})();
