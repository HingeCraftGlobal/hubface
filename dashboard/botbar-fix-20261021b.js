/* botbar-fix.js botbarfix-20261021a — bot bar expand/collapse button: far top-right + "Collapse the bot bar" when expanded, "Expand" when collapsed.
   Cause: the botbar-20261021a corner rule only matched "#ui > section.ava:not(.vbcol):not(.collapsed)", so a bar that is not a direct #ui child
   (floated/adopted) or still carries .collapsed kept the folded corner spot (left:53px); and the label was only refreshed inside its own click handler,
   so expanding by face click / voice / other code left "Expand the bot bar". */
(function(){
  var st=document.createElement('style');
  st.textContent='#vbBar:not(.vbcol) > .vbmin, section.ava:not(.vbcol) > .vbmin{left:auto!important;right:6px!important;top:6px!important;bottom:auto!important}'+
    '#vbBar:not(.vbcol) > .fogbtn, section.ava:not(.vbcol) > .fogbtn{left:auto!important;right:28px!important;top:6px!important;bottom:auto!important}';
  document.head.appendChild(st);
  function lab(bar){var b=bar.querySelector(':scope > .vbmin');if(!b)return;var c=bar.classList.contains('vbcol');var t=c?'Expand':'Collapse the bot bar';
    if(b.title!==t&&!(b.getAttribute('data-i18n-title')===t&&!document.documentElement.classList.contains('rb-room'))){   /* botbarfix-20261021b: accept the i18n-translated title (was an endless title fight that froze the page in fr/fil/hi) */b.title=t;b.setAttribute('aria-label',t);b.setAttribute('aria-pressed',c?'true':'false');}
    if(!c&&bar.classList.contains('collapsed')&&bar.id==='vbBar')bar.classList.remove('collapsed');}
  var seen=new WeakSet();
  function scan(){document.querySelectorAll('#vbBar, section.ava').forEach(function(bar){lab(bar);if(seen.has(bar))return;seen.add(bar);
    new MutationObserver(function(){lab(bar);}).observe(bar,{attributes:true,attributeFilter:['class']});
    var b=bar.querySelector(':scope > .vbmin');if(b)new MutationObserver(function(){lab(bar);}).observe(b,{attributes:true,attributeFilter:['title']});});}
  function start(){scan();setInterval(scan,2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.__botbarFix='botbarfix-20261021b';
})();
