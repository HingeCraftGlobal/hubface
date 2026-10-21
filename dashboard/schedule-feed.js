/* widgets-20261020a (Dan via Yoda, wiring only): SCHEDULE box shows the signed-in account's timed priorities
   (GET /api/account/priorities, meta "cat|text".due = "HH:MM"), earliest first, refreshed every 60 s.
   Signed out, or the server unreachable: the box keeps its sample rows and the "Sample" tag, exactly as before.
   Signed in with no timed items: one line saying so. Layout, styling and the box itself are unchanged. */
(function(){
  "use strict";
  function box(){var r=null;document.querySelectorAll('section.box header b').forEach(function(b){if(!r&&b.textContent.trim()==='SCHEDULE')r=b.closest('section.box');});return r;}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function fmt(hm){var h=+hm.slice(0,2),m=hm.slice(3);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}
  var orig=null;
  function render(list){var b=box();if(!b)return;var rows=b.querySelector('.rows'),tag=b.querySelector('header em.sample');if(!rows)return;
    if(orig===null)orig=rows.innerHTML;
    if(!list){rows.innerHTML=orig;if(tag)tag.hidden=false;b.removeAttribute('data-live');return;}
    rows.innerHTML=list.length?list.map(function(x){return '<div title="'+esc(x.cat)+'"><i>'+fmt(x.due)+'</i>'+esc(x.text)+'</div>';}).join(''):'<div><i>—</i>No timed priorities</div>';
    if(tag)tag.hidden=true;b.setAttribute('data-live','priorities');}
  function load(){fetch('/api/account/priorities',{credentials:'same-origin',cache:'no-store'}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(d){
    if(!d||!d.ok){render(null);return;}var items=d.items||{},meta=d.meta||{},out=[];
    Object.keys(items).forEach(function(c){(items[c]||[]).forEach(function(t){var m=meta[c+'|'+t];if(m&&/^\d\d:\d\d$/.test(m.due||''))out.push({cat:c,text:t,due:m.due});});});
    out.sort(function(a,b){return a.due<b.due?-1:a.due>b.due?1:0;});render(out);}).catch(function(){render(null);});}
  window.__scheduleFeed={reload:load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(load,1500);});else setTimeout(load,1500);
  setInterval(function(){if(!document.hidden)load();},60000);
  window.addEventListener('focus',load);
})();
