/* frontfix-20261024a (Dan: Home Status / News / Photos could not be grabbed): floatboxes raised only among themselves (z ~10-30)
   while widget windows (.wbx, window.__floatZ from 60) and the Briefing (#hfBrief, z 41) always sat above them, so a floatbox
   header under a widget could never be grabbed. One shared stack: pressing anywhere on a box/widget/briefing brings it to the front.
   Main dashboard only (not html.rb-room). Roll back: remove the script tag + restore index.html.bak-20261024-dragfix. */
(function(){
  if(window.__frontFix)return;window.__frontFix=1;
  var SEL='#ui > section.floatbox, #ui > .wbx, #hfBrief',CAP=4000;
  function room(){return document.documentElement.classList.contains('rb-room');}
  function all(){return [].slice.call(document.querySelectorAll(SEL));}
  function zi(el){return +el.style.zIndex||parseInt(getComputedStyle(el).zIndex,10)||0;}
  function front(el){var els=all(),m=0;els.forEach(function(o){if(o!==el){var z=zi(o);if(z<CAP)m=Math.max(m,z);}});
    if(m+1>=CAP){els.filter(function(o){return zi(o)<CAP;}).sort(function(a,b){return zi(a)-zi(b);}).forEach(function(o,i){o.style.zIndex=20+i;});m=20+els.length;}
    if(zi(el)<=m){el.style.zIndex=m+1;}window.__floatZ=Math.max(window.__floatZ||60,zi(el));}
  function hit(e){if(room())return null;var t=e.target;return t&&t.closest?t.closest(SEL):null;}
  function pair(el){var nb=document.querySelector('#ui > section[data-float="news-briefing"]'),br=document.getElementById('hfBrief');
    if(nb&&br&&(el===nb||el===br)&&!nb.classList.contains('closed')){front(nb);front(br);}else front(el);}
  function on(e){var el=hit(e);if(!el||el.classList.contains('collapsed')||el.classList.contains('min'))return;pair(el);setTimeout(function(){pair(el);},0);}
  window.addEventListener('pointerdown',on,true);
  window.__frontFix={front:front};
})();
