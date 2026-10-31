/* backprefix-20261030m (Dan voice, Oct 30 2026 7:06-7:08 AM ET).
   1) Back to pre-room (botroom #backBtn now posts brPreroom -> prback back()): hide the live room's own top strip (#prLive #prBar)
      while its frame is hidden for the pre-room; it re-shows when the frame shows again (glowing Bot room button -> reenter showLive).
   2) Remove the room-bar Full screen button (#rnFs, roomnotes-20261029a) that opened a black full screen of #rbLayer.
   3) Room-bar minimize (.rbmin) pinned to the bar's top-right corner, beside Exit room; same toggle.
   Roll back: remove this script tag from dashboard index.html. */
(function(){var D=document;if(window.__bpf30m)return;window.__bpf30m=1;
var st=D.createElement('style');st.textContent='#rnFs{display:none!important}#prLive > #prBar{display:none!important}html.bpf-live .hfa-entry{display:none!important}'+
 '#ui #rbBar:not(.rbcol) > .rbmin{position:absolute!important;top:-7px;right:-7px;margin:0!important;width:16px;height:16px;border-radius:999px;background:rgba(9,20,48,.95);border:1px solid rgba(86,150,255,.55);z-index:2;cursor:pointer}';
D.head.appendChild(st);
var armed=false;
window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||!e.data.brPreroom)return;armed=true;sync();});
function sync(){var b=D.getElementById('rnFs');if(b){b.remove();}/* fsfix-20261030q: no exitFullscreen here */
 var l=D.getElementById('prLive');if(!l){armed=false;return;}var bar=l.querySelector('#prBar'),f=l.querySelector('iframe');if(!bar||!f)return;
 var hid=f.style.display==='none';if(armed&&hid){if(bar.style.display!=='none')bar.style.display='none';}
 else{if(bar.style.display==='none')bar.style.display='';if(!hid)armed=false;}}
setInterval(sync,250);
/* backprefix-20261030n: account chip .hfa-entry hidden while the live room frame is showing */
setInterval(function(){var l=D.getElementById('prLive'),f=l&&l.querySelector('iframe');D.documentElement.classList.toggle('bpf-live',!!(f&&f.style.display!=='none'));},250);
/* backprefix-20261030n: room X (br-xexit) -> exactly the strip's Exit room handler (#prLiveExit onclick, kept in DOM while hidden) */
window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||!e.data.brExitRoom)return;var x=D.getElementById('prLiveExit');if(x)x.click();});})();
