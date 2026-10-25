/* widgetfix-20261021b (Dan): own red X (.wfx) on every open dashboard square (section.box[data-float]) and widget window (.wbx.open),
   independent of each widget's own .boxclose/.wx (which some layouts/modes hide). Click = that widget's own close; the 8 picker
   widgets also go back to the Widget Picker (widgetfix-20261021a). Bots/calls untouched. Room page (html.rb-room): nothing. No mic code. Roll back: /opt/hubface/backups/widgetfix-20261021b/ROLLBACK.sh */
(function(){
  if(window.__widgetFixB)return;window.__widgetFixB='widgetfix-20261021b';
  var SKIP={yoda:1,call:1};
  function room(){return document.documentElement.classList.contains('rb-room');}
  function boxes(){return [].slice.call(document.querySelectorAll('#ui > section.box[data-float]:not(.closed), #ui > .wbx.open'));}
  function own(b){return b.matches('.wbx')?b.querySelector(':scope > .whead > .wx'):b.querySelector(':scope > .boxclose, :scope > header .boxclose, :scope > .wdx');}
  function run(){if(room())return;boxes().forEach(function(b){var id=b.getAttribute('data-float')||b.getAttribute('data-w')||'';if(SKIP[id]||b.dataset.bot||!b.offsetWidth)return;
    if(b.querySelector(':scope > .wfx'))return;if(getComputedStyle(b).position==='static')b.style.position='relative';
    var x=document.createElement('span');x.className='wfx';x.setAttribute('role','button');x.title='Close \u2014 back to the Widget Picker';x.setAttribute('aria-label',x.title);x.textContent='\u2715';
    x.addEventListener('pointerdown',function(e){e.stopPropagation();},true);
    x.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();var c=own(b);if(c)c.click();else if(b.matches('.wbx'))b.classList.remove('open');else b.classList.add('closed');});
    b.appendChild(x);});}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},80);}
  function css(){if(document.getElementById('wfx-css'))return;var s=document.createElement('style');s.id='wfx-css';
    s.textContent='html:not(.rb-room) #ui .wfx{position:absolute!important;top:6px!important;right:6px!important;width:22px!important;height:22px!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:50%!important;background:#e5383b!important;color:#fff!important;font:700 13px/1 system-ui,sans-serif!important;opacity:1!important;visibility:visible!important;z-index:2147483600!important;cursor:pointer!important;pointer-events:auto!important;box-shadow:0 1px 4px rgba(0,0,0,.5)!important;filter:none!important;transform:none!important}'+
      'html:not(.rb-room) #ui > section.box:has(> .wfx) > .boxclose,html:not(.rb-room) #ui > .wbx:has(> .wfx) > .whead > .wx{visibility:hidden!important}';
    document.head.appendChild(s);}
  /* room page: do nothing. Only undo our own main-page additions if the page switches into a room. */
  function clean(){if(!room())return;[].forEach.call(document.querySelectorAll('#ui .wfx,#ui .wcret'),function(x){x.remove();});}
  new MutationObserver(function(){if(room())clean();}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});run();setInterval(run,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
