/* prerooms-btn-20261026a (Dan, voice Oct 26 2026; Brain OS #133): Hub Rooms "Bot rooms" button opens the pre-room cards directly
   (no room build/exit first). Intercepts the existing Hub Rooms "Bot Room" button (capture phase) and relabels it "Bot rooms".
   Roll back: remove the script tag in index.html. */
(function(){
  function openPR(){if(document.getElementById('prOverlay'))return;var f=document.createElement('iframe');f.id='prOverlay';f.src='/botroom/prerooms.html?embed=1';
    f.setAttribute('allow','microphone; camera; autoplay; fullscreen');f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483646;background:#0b1220';document.body.appendChild(f);}
  window.__prOpen=openPR;
  window.addEventListener('message',function(e){if(e.origin===location.origin&&e.data&&e.data.prClose){var o=document.getElementById('prOverlay');if(o)o.remove();}});
  function isBR(b){return b&&b.classList&&b.classList.contains('hrnew')&&/^\s*Bot rooms?\s*$/i.test(b.textContent||'');}
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('button');if(!isBR(b))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openPR();},true);
  setInterval(function(){document.querySelectorAll('.hrnewcol button.hrnew').forEach(function(b){if(isBR(b)&&b.textContent!=='Bot rooms')b.textContent='Bot rooms';});},800);
})();
