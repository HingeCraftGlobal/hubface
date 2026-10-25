/* panelx-20261024 (Dan): close X for HubFace, in the free area right under the Properties panel. Only shown when HubFace runs inside
   Brain OS (#hfView iframe): click posts {type:'hubface-close'} to the parent, which hides the HubFace pane. Opened directly: no X.
   Writes position only when it changes. Roll back: /root/hubface-backups/panelx-20261024/ROLLBACK.sh */
(function(){"use strict";if(window.__panelX)return;window.__panelX='panelx-20261024';
  var inFrame=false;try{inFrame=window.parent&&window.parent!==window;}catch(e){inFrame=true;}
  var X='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var x=null;
  function pos(){var u=document.getElementById('ui');if(!u)return false;
    if(!x){x=document.createElement('span');x.className='ctl x hfclosex';x.setAttribute('role','button');x.tabIndex=0;x.title='Close HubFace';x.setAttribute('aria-label','Close HubFace');x.innerHTML=X;
      var go=function(e){e.stopPropagation();e.preventDefault();if(inFrame){try{window.parent.postMessage({type:'hubface-close'},'*');}catch(er){}}else{try{window.close();}catch(er){}}};
      x.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();});x.addEventListener('click',go);
      x.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')go(e);});u.appendChild(x);}
    var st=u.getBoundingClientRect().width/1024,kk=1;/*same-look-20261025: Brain OS shows the 1024x576 stage at ~1.15x; a bigger window (dock shortcut) scaled the panels up to 1.75x. Shrink the two panels so they look the same size on screen everywhere.*/[].forEach.call(u.querySelectorAll(':scope > aside.panel'),function(q){var pr=q.classList.contains('props'),o=pr?'top right':'top left',k2=1,v=k2<1?String(k2):'';if(q.style.scale!==v)q.style.scale=v;if(q.style.transformOrigin!==(k2<1?o:''))q.style.transformOrigin=k2<1?o:'';});
    var pr=document.querySelector('#ui > aside.panel.props'),room=document.documentElement.classList.contains('rb-room'),hid=room||!pr||pr.classList.contains('collapsed')||!pr.offsetWidth||getComputedStyle(pr).visibility==='hidden',d=hid?'none':'';/*x-hides-when-tucked 20261025: X follows the Properties box; tucked/collapsed upward = X hidden*/if(x.style.display!==d)x.style.display=d;if(hid)return true;
    var l=Math.max(0,u.offsetWidth-28)+'px',t='8px';/*upper-right corner (Dan, Oct 24 11:48pm)*/
    if(x.style.left!==l)x.style.left=l;if(x.style.top!==t)x.style.top=t;return true;}
  function init(){if(!pos()){setTimeout(init,400);return;}setInterval(pos,300);addEventListener('resize',pos);
    new MutationObserver(pos).observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();
