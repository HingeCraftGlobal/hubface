/* botrow-20261021c: (1) Auto fog + Collapse follow Hang up with the same 5px gap, centred on the round buttons, every bot panel (home + rooms).
   (2) Home dashboard only: red X on the bot bar's upper right sends the bot back to the AI Assistant picker (same idea as botsclose in rooms:
   HF_removeBot for any invited bots, closes agent panel bars, hides the bar). Persists (localStorage hf-homebar-off) until a bot is picked again. */
(function(){if(window.__hfBotRow&&window.__hfBotRow.build==='botrow-20261021d')return;var G=3,K='hf-homebar-off',H=document.documentElement;
 function inRm(){return H.classList.contains('rb-room');}
 function fix(){[].forEach.call(document.querySelectorAll('#ui > section.ava'),function(s){if(!s.offsetParent)return;
  var a=s.querySelector('.abtns'),f=s.querySelector(':scope > .fogbtn'),m=s.querySelector(':scope > .vbmin');if(!a)return;
  var is=[].filter.call(a.children,function(e){return e.offsetWidth;});if(!is.length)return;var last=is[is.length-1];
  var sr=s.getBoundingClientRect(),lr=last.getBoundingClientRect(),sc=sr.width/(s.offsetWidth||sr.width)||1;
  var x=(lr.right-sr.left)/sc-s.clientLeft+G,cy=(lr.top+lr.height/2-sr.top)/sc-s.clientTop;
  [f,m].forEach(function(e){if(!e||!e.offsetWidth)return;var l=Math.round(x)+'px',t=Math.round(cy-e.offsetHeight/2)+'px';
   if(e.style.left!==l)e.style.setProperty('left',l,'important');if(e.style.top!==t)e.style.setProperty('top',t,'important');e.style.setProperty('right','auto','important');x+=e.offsetWidth+G;});});}
 function off(v){try{v?localStorage.setItem(K,'1'):localStorage.removeItem(K);}catch(_){}H.classList.toggle('hf-homebar-off',!!v);}
 try{if(localStorage.getItem(K)==='1')H.classList.add('hf-homebar-off');}catch(_){}
 var btn=document.createElement('button');btn.id='hfHomeBotX';btn.type='button';btn.textContent='\u2715';btn.title='Close bot (back to AI Assistant picker)';btn.setAttribute('aria-label',btn.title);
 ['pointerdown','mousedown','dblclick'].forEach(function(ev){btn.addEventListener(ev,function(e){e.stopPropagation();});});
 btn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();
  try{var b=document.getElementById('vbBar'),end=document.getElementById('vbEnd');if(b&&end&&/listening|speaking|thinking/.test(b.getAttribute('data-state')||''))end.click();}catch(_){}
  try{(window.HF_roomBots?HF_roomBots().slice():[]).forEach(function(id){try{HF_removeBot(id);}catch(_){}});}catch(_){}
  /* botrow-20261021d: Finn's X no longer closes the separate bot panels (botsep-20261021a) */
  off(true);paint();var w=document.getElementById('witAi'),dd=document.getElementById('aiDd');if(w&&dd&&!dd.classList.contains('open'))setTimeout(function(){w.click();},30);});
 document.addEventListener('click',function(e){var r=e.target.closest&&e.target.closest('#aiDd .dd-row.yes, #aiDd [data-ai]');if(r&&H.classList.contains('hf-homebar-off')){off(false);setTimeout(paint,50);}},true);
 function paint(){if(!btn.parentNode&&document.body)document.body.appendChild(btn);var b=document.getElementById('vbBar');
  var on=!inRm()&&!H.classList.contains('hf-homebar-off')&&b&&b.offsetParent;btn.classList.toggle('on',!!on);
  if(on){var r=b.getBoundingClientRect();btn.style.left=Math.round(Math.min(innerWidth-30,r.right-14))+'px';btn.style.top=Math.round(Math.max(4,r.top-12))+'px';}}
 function tick(){fix();paint();}
 window.__hfBotRow={build:'botrow-20261021d',fix:fix,paint:paint,reopen:function(){off(false);paint();}};setInterval(tick,600);addEventListener('resize',tick);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();})();
