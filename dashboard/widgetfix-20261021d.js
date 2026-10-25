/* widgetfix-20261021d (Dan, xplain-20261021c): main Dashboard Builder only (nothing on html.rb-room). Copies the room look:
   (1) faint plain X (.wfdx) on every left-sidebar widget item (not AI Assistant / Calls); click = that widget's own close (if open).
   (2) Widget Picker rows: '+ Add to bar' on picker items, '\u2713 In bar' on rows already in the bar (labels only; the row click still adds/opens).
   No mic code, no Finn bar. Roll back: /opt/hubface/backups/xplain-20261021c/ROLLBACK.sh */
(function(){
  if(window.__widgetFixD)return;window.__widgetFixD='widgetfix-20261021d';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function slug(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function square(name){var n=slug(name);if(n==='widget-picker')n='other';
    return [].filter.call(document.querySelectorAll('#ui > section.box[data-float]'),function(s){var h=s.querySelector(':scope > header > b');return s.getAttribute('data-float')===n||(h&&slug(h.textContent)===n);})[0];}
  function win(name){var n=slug(name);return [].filter.call(document.querySelectorAll('#ui > .wbx'),function(w){return slug(w.getAttribute('aria-label'))===n||(n==='youtube'&&w.getAttribute('data-w')==='ent')||(n==='photos-videos'&&w.getAttribute('data-w')==='media');})[0];}
  function closeItem(it){var s=it.querySelector('span'),name=s?s.textContent.trim():'';
    if(it.classList.contains('boxitem')){var q=square(name);if(q&&!q.classList.contains('closed')&&!it.classList.contains('boxoff')){var c=q.querySelector(':scope > .boxclose');if(c)c.click();}}
    else{var w=win(name);if(w&&w.classList.contains('open')){var c2=w.querySelector(':scope > .whead > .wx');if(c2)c2.click();}}}
  function hitX(e){if(room())return null;var xs=document.querySelectorAll('#ui .wfdx');for(var i=0;i<xs.length;i++){var r=xs[i].getBoundingClientRect();if(r.width&&e.clientX>=r.left-2&&e.clientX<=r.right+2&&e.clientY>=r.top-2&&e.clientY<=r.bottom+2)return xs[i];}return null;}
  ['pointerdown','mousedown','pointerup','mouseup'].forEach(function(t){document.addEventListener(t,function(e){if(hitX(e)){e.stopPropagation();e.preventDefault();}},true);});
  document.addEventListener('click',function(e){var x=hitX(e);if(!x)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();closeItem(x.parentNode);},true);
  function run(){if(room()){[].forEach.call(document.querySelectorAll('.wfdx'),function(x){x.remove();});return;}
    [].forEach.call(document.querySelectorAll('#ui > aside.panel:not(.props) > .witem'),function(it){if(it.classList.contains('ai')||it.classList.contains('callitem'))return;
      if(it.querySelector(':scope > .wfdx'))return;var s=it.querySelector('span'),n=s?s.textContent.trim():'widget';
      var x=document.createElement('span');x.className='wfdx';x.setAttribute('role','button');x.title='Close '+n;x.setAttribute('aria-label',x.title);x.textContent='\u2715';it.appendChild(x);});}
  function css(){if(document.getElementById('wfd-css'))return;var s=document.createElement('style');s.id='wfd-css';
    var P='html:not(.rb-room) #ui > section.box[data-float="other"] .blist > ';
    s.textContent=
      'html:not(.rb-room) #ui .wfdx{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:19px;height:18px;display:flex;align-items:center;justify-content:center;background:transparent;color:#fff;border-radius:4px;opacity:.45;font-size:11px;line-height:1;cursor:pointer;z-index:5}'+
      'html:not(.rb-room) #ui .wfdx:hover{opacity:.9}'+
      P+'.build.dwother::after{content:"+ Add to bar";margin-left:auto;padding-left:8px;font-size:11px;color:#fff;opacity:.8;white-space:nowrap}'+
      P+'.build[data-bot]::after,'+P+'.build:not(.dwother):not(.bnew):not(.dwdiv):not(.dwhead):not([data-bot])::after{content:"\\2713  In bar";margin-left:auto;padding-left:8px;font-size:11px;color:#fff;opacity:.8;white-space:nowrap}';
    document.head.appendChild(s);}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},80);}
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true});run();setInterval(run,2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
