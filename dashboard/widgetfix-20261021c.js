/* widgetfix-20261021c (Dan): main Dashboard Builder only (does nothing on the room page, html.rb-room).
   (a) hide the duplicate WIDGET PICKER title at the top of the builder box (the list label stays);
   (b) red X on placed bot rows (Support companions, Moderator ...): hides that row (localStorage hf-wfc-botoff); the bots stay in the AI Assistant dropdown;
   (c) red X on ACTIVE items of the left Dashboard Widgets sidebar: turns that widget off (its own close). Dimmed items get none. AI Assistant / Calls untouched.
   No mic code. Roll back: /opt/hubface/backups/widgetfix-20261021c/ROLLBACK.sh */
(function(){
  if(window.__widgetFixC)return;window.__widgetFixC='widgetfix-20261021c';
  var K='hf-wfc-botoff';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function off(){try{return JSON.parse(localStorage.getItem(K)||'[]')||[];}catch(e){return [];}}
  function slug(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function X(title,fn){var x=document.createElement('span');x.className='wfcx';x.setAttribute('role','button');x.title=title;x.setAttribute('aria-label',title);x.textContent='\u2715';
        x._fn=fn;return x;}
  function hitX(e){if(room())return null;var xs=document.querySelectorAll('.wfcx');for(var i=0;i<xs.length;i++){var r=xs[i].getBoundingClientRect();if(r.width&&e.clientX>=r.left-2&&e.clientX<=r.right+2&&e.clientY>=r.top-2&&e.clientY<=r.bottom+2)return xs[i];}return null;}
  ['pointerdown','mousedown','pointerup','mouseup'].forEach(function(t){document.addEventListener(t,function(e){if(hitX(e)){e.stopPropagation();e.preventDefault();}},true);});
  document.addEventListener('click',function(e){var x=hitX(e);if(!x)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();x._fn();},true);
  function square(name){var n=slug(name);if(n==='widget-picker')n='other';
    return [].filter.call(document.querySelectorAll('#ui > section.box[data-float]'),function(s){var h=s.querySelector(':scope > header > b');return s.getAttribute('data-float')===n||(h&&slug(h.textContent)===n);})[0];}
  function win(name){var n=slug(name);return [].filter.call(document.querySelectorAll('#ui > .wbx'),function(w){return slug(w.getAttribute('aria-label'))===n||(n==='youtube'&&w.getAttribute('data-w')==='ent')||(n==='photos-videos'&&w.getAttribute('data-w')==='media');})[0];}
  function run(){if(room()){[].forEach.call(document.querySelectorAll('.wfcx'),function(x){x.remove();});return;}
    var l=document.querySelector('#ui .blist'),o=off();
    if(l)[].forEach.call(l.querySelectorAll(':scope > .build[data-bot]'),function(t){var id=t.getAttribute('data-bot');t.classList.toggle('wfc-off',o.indexOf(id)>=0);
      if(!t.querySelector(':scope > .wfcx'))t.appendChild(X('Remove from the row (still in AI Assistant)',function(){var a=off();if(a.indexOf(id)<0)a.push(id);try{localStorage.setItem(K,JSON.stringify(a));}catch(e){}t.classList.add('wfc-off');}));});
    [].forEach.call(document.querySelectorAll('#ui > aside.panel:not(.props) > .witem'),function(it){if(it.classList.contains('ai')||it.classList.contains('callitem'))return;
      var s=it.querySelector('span'),name=s?s.textContent.trim():'',x=it.querySelector(':scope > .wfcx'),on=false,close=null;
      if(it.classList.contains('boxitem')){var q=square(name);on=!it.classList.contains('boxoff')&&q&&!q.classList.contains('closed');close=q&&function(){var c=q.querySelector(':scope > .boxclose');if(c)c.click();};}
      else{var w=win(name);on=!!(w&&w.classList.contains('open'));close=w&&function(){var c=w.querySelector(':scope > .whead > .wx');if(c)c.click();};}
      if(on&&close&&!x)it.appendChild(X('Turn '+name+' off',function(){close();setTimeout(run,60);}));else if(!on&&x)x.remove();});}
  function css(){if(document.getElementById('wfc-css'))return;var s=document.createElement('style');s.id='wfc-css';
    s.textContent='html:not(.rb-room) #ui > section.box[data-float="other"] > header > b,html:not(.rb-room) #ui > section.box[data-float="other"] > header > .pen{visibility:hidden!important}'+
      'html:not(.rb-room) #ui .blist > .build[data-bot].wfc-off{display:none!important}'+
      'html:not(.rb-room) #ui .blist > .build[data-bot]{position:relative!important;padding-right:26px!important}'+
      'html:not(.rb-room) #ui > aside.panel > .witem{position:relative!important}'+
      'html:not(.rb-room) .wfcx{position:absolute!important;right:4px!important;top:50%!important;transform:translateY(-50%)!important;width:18px!important;height:18px!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:50%!important;background:#e5383b!important;color:#fff!important;font:700 11px/1 system-ui,sans-serif!important;opacity:1!important;visibility:visible!important;z-index:50!important;cursor:pointer!important;pointer-events:auto!important}';
    document.head.appendChild(s);}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},80);}
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});run();setInterval(run,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
