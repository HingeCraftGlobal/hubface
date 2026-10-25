/* widgetfix-20261021f (Dan, xplain-20261021f): replaces widgetfix-20261021e. Main Dashboard Builder only (nothing on html.rb-room).
   (1) '+ Add to bar' (.wfeadd) is a real button: press = dash-row toRow(name)+save. The whole press sequence (pointer/mouse/touch down+up+click)
       is swallowed at window capture, INCLUDING the trailing click after the row has already moved into the bar (that click used to fall
       through to the tile and open the widget). Nothing opens.
   (2) widgetcats drill-down: its extra X (.wcx) is hidden; the '< Widget Picker' back button and the box's own close stay.
   (3) 'The bar' = the left Widgets list (as on the room page). '+ Add to bar' on a picker widget also adds it to the left list (state hf-wff-bar-v1);
       the plain X on a left-list item (.wfdx from 20261021d) closes the widget, removes the item from the left list and re-lists it in the
       Widget Picker with '+ Add to bar'. '\u2713 In bar' only shows on rows that are really in the left list; bot rows (AI Assistant) get no label.
   Roll back: /opt/hubface/backups/xplain-20261021f/ROLLBACK.sh */
(function(){
  if(window.__widgetFixF)return;window.__widgetFixF='widgetfix-20261021f';
  function room(){return document.documentElement.classList.contains('rb-room');}
  var PK='#ui > section.box[data-float="other"] .blist';
  function btn(e){if(room())return null;var t=e.target;return t&&t.closest?t.closest(PK+' > .build > .wfeadd'):null;}
  var until=0,box=null;
  function inPicker(e){var l=document.querySelector(PK);return l&&e.target&&l.contains(e.target);}
  function eat(e){e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();}
  function act(b){var t=b.parentNode,n=t&&t.querySelector(':scope > b'),R=window.__dashRow;if(!n||!R||!t.classList.contains('dwother'))return;
    var nm=n.textContent.trim();if(t.classList.contains('wfrow')){setHidden(nm,false);return;}
    try{R.toRow(nm);if(R.save)R.save();}catch(err){}setAdded(nm,true);}
  var K='hf-wff-bar-v1';
  function st(){try{var o=JSON.parse(localStorage.getItem(K)||'{}');return {hidden:o.hidden||[],added:o.added||[]};}catch(e){return {hidden:[],added:[]};}}
  function put(o){try{localStorage.setItem(K,JSON.stringify(o));}catch(e){}soon();}
  function tog(a,n,on){var i=a.indexOf(n);if(on&&i<0)a.push(n);if(!on&&i>=0)a.splice(i,1);}
  function setHidden(n,on){var o=st();tog(o.hidden,n,on);put(o);}
  function setAdded(n,on){var o=st();tog(o.added,n,on);put(o);}
  function low(x){return String(x||'').trim().toLowerCase();}
  function tileByName(n){var l=document.querySelector(PK);return l&&[].filter.call(l.querySelectorAll(':scope > .build'),function(t){var b=t.querySelector(':scope > b');return b&&low(b.textContent)===low(n);})[0];}
  function itemName(it){var s=it.querySelector(':scope > span:not(.wfdx)');return s?s.textContent.trim():'';}
  /* left-list X: close + remove from the bar + back to the picker */
  function xHit(e){if(room())return null;var t=e.target,x=t&&t.closest?t.closest('#ui > aside.panel:not(.props) > .witem > .wfdx'):null;if(x)return x;
    if(e.clientX==null&&e.changedTouches&&e.changedTouches[0])e={clientX:e.changedTouches[0].clientX,clientY:e.changedTouches[0].clientY};
    var xs=document.querySelectorAll('#ui > aside.panel:not(.props) > .witem > .wfdx');for(var i=0;i<xs.length;i++){var r=xs[i].getBoundingClientRect();if(r.width&&e.clientX>=r.left-3&&e.clientX<=r.right+3&&e.clientY>=r.top-3&&e.clientY<=r.bottom+3)return xs[i];}return null;}
  ['pointerdown','mousedown','touchstart','pointerup','mouseup','touchend'].forEach(function(t){window.addEventListener(t,function(e){if(xHit(e))eat(e);},{capture:true,passive:false});});
  window.addEventListener('click',function(e){var x=xHit(e);if(!x)return;eat(e);var it=x.parentNode,n=it.classList.contains('wfadd')?it.dataset.wff:itemName(it);if(!n)return;
    try{var A=window.__dashRow;}catch(er){}
    if(it.classList.contains('wfadd')){var tl=tileByName(n),wx=null;try{var w=[].filter.call(document.querySelectorAll('#ui > .wbx.open'),function(w){var tt=w.querySelector('.wtitle');return tt&&low(tt.textContent)===low(n);})[0];if(w)wx=w.querySelector(':scope > .whead > .wx');}catch(er){}
      if(wx)wx.click();setAdded(n,false);try{if(A){A.toOther(n);if(A.save)A.save();}}catch(er){}return;}
    closeBuiltin(it,n);setHidden(n,true);},true);
  function closeBuiltin(it,n){var nn=low(n).replace(/[^a-z0-9]+/g,'-');if(nn==='widget-picker')nn='other';
    var q=[].filter.call(document.querySelectorAll('#ui > section.box[data-float]'),function(s){var h=s.querySelector(':scope > header > b');return s.getAttribute('data-float')===nn||(h&&low(h.textContent).replace(/[^a-z0-9]+/g,'-')===nn);})[0];
    if(q&&!q.classList.contains('closed')){var c=q.querySelector(':scope > .boxclose');if(c)c.click();return;}
    var w=[].filter.call(document.querySelectorAll('#ui > .wbx.open'),function(w){var a=low(w.getAttribute('aria-label')).replace(/[^a-z0-9]+/g,'-');return a===nn||(nn==='youtube'&&w.dataset.w==='ent')||(nn==='photos-videos'&&w.dataset.w==='media');})[0];
    if(w){var c2=w.querySelector(':scope > .whead > .wx');if(c2)c2.click();}}
  function bar(){if(room())return;var p=document.querySelector('#ui > aside.panel:not(.props)'),l=document.querySelector(PK);if(!p)return;var o=st();
    var items=[].slice.call(p.querySelectorAll(':scope > .witem'));
    items.forEach(function(it){if(it.classList.contains('wfadd'))return;var n=itemName(it);if(!n||n==='Widget Picker'||it.classList.contains('ai')||it.classList.contains('callitem'))return;
      var h=o.hidden.indexOf(n)>=0;if(h!==it.classList.contains('wfhid'))it.classList.toggle('wfhid',h);});
    /* added picker widgets as left-list items, before the Widget Picker item */
    var wp=items.filter(function(it){return itemName(it)==='Widget Picker';})[0];
    [].forEach.call(p.querySelectorAll(':scope > .witem.wfadd'),function(it){if(o.added.indexOf(it.dataset.wff)<0)it.remove();});
    o.added.forEach(function(n){if(p.querySelector(':scope > .witem.wfadd[data-wff="'+n.replace(/"/g,'')+'"]'))return;
      var it=document.createElement('div');it.className='witem wfadd';it.dataset.wff=n;it.setAttribute('role','button');it.title='Open '+n;
      it.innerHTML='<span></span>';it.querySelector('span').textContent=n;
      it.addEventListener('click',function(e){if(e.target.closest('.wfdx'))return;var t=tileByName(n);if(t){if(t.classList.contains('dwother')){try{window.__dashRow.toRow(n);}catch(er){}t=tileByName(n);}if(t)t.click();}});
      var x=document.createElement('span');x.className='wfdx';x.setAttribute('role','button');x.title='Remove '+n+' from the bar';x.textContent='\u2715';it.appendChild(x);
      if(wp)p.insertBefore(it,wp);else p.appendChild(it);});
    /* restack absolute tops so hidden items leave no gap */
    var vis=[].filter.call(p.querySelectorAll(':scope > .witem'),function(it){return !it.classList.contains('wfhid');});
    var tops=items.map(function(it){return parseFloat(it.style.top)||0;}).filter(function(v){return v>0;});var y0=tops.length?Math.min.apply(null,tops):62,step=25;
    vis.forEach(function(it,i){var v=(y0+i*step)+'px';if(it.style.top!==v)it.style.setProperty('top',v,'important');});
    var need=y0+vis.length*step+16;if(p.offsetHeight&&p.offsetHeight<need)p.style.setProperty('min-height',need+'px','important');
    /* picker: hidden built-ins re-listed with + Add to bar */
    if(l){var div=l.querySelector(':scope > .dwdiv');
      [].forEach.call(l.querySelectorAll(':scope > .wfrow'),function(r){if(o.hidden.indexOf(r.dataset.wff)<0)r.remove();});
      o.hidden.forEach(function(n){if(l.querySelector(':scope > .wfrow[data-wff="'+n.replace(/"/g,'')+'"]'))return;
        var r=document.createElement('div');r.className='build bsm dwother wfrow';r.dataset.wff=n;r.innerHTML='<b></b>';r.querySelector('b').textContent=n;
        if(div&&div.nextSibling)l.insertBefore(r,div.nextSibling);else l.appendChild(r);});
      [].forEach.call(l.querySelectorAll(':scope > .build'),function(t){var b=t.querySelector(':scope > b'),n=b?b.textContent.trim():'';
        var inb=!t.dataset.bot&&!t.classList.contains('dwother')&&o.added.indexOf(n)>=0;if(inb!==t.classList.contains('wfin'))t.classList.toggle('wfin',inb);});}}
  ['pointerdown','mousedown','touchstart'].forEach(function(t){window.addEventListener(t,function(e){if(btn(e)){eat(e);until=Date.now()+1500;}},{capture:true,passive:false});});
  ['pointerup','mouseup','touchend'].forEach(function(t){window.addEventListener(t,function(e){var b=btn(e);
    if(b){eat(e);if(Date.now()<until&&!b._done){b._done=1;act(b);}until=Date.now()+700;return;}
    if(Date.now()<until&&inPicker(e))eat(e);},{capture:true,passive:false});});
  window.addEventListener('click',function(e){var b=btn(e);if(b){eat(e);if(!b._done){b._done=1;act(b);}until=Date.now()+400;return;}
    if(Date.now()<until&&inPicker(e))eat(e);},true);
  window.addEventListener('dblclick',function(e){if(Date.now()<until&&inPicker(e))eat(e);},true);
  function run(){if(room())return;try{bar();}catch(e){}var l=document.querySelector(PK);if(!l)return;
    [].forEach.call(l.querySelectorAll(':scope > .build'),function(t){var a=t.querySelector(':scope > .wfeadd'),o=t.classList.contains('dwother');
      if(o&&!a){a=document.createElement('span');a.className='wfeadd';a.setAttribute('role','button');a.textContent='+ Add to bar';a.title='Add to bar';t.appendChild(a);}
      else if(!o&&a)a.remove();});}
  function css(){if(document.getElementById('wff-css'))return;var s=document.createElement('style');s.id='wff-css';
    var P='html:not(.rb-room) '+PK+' > .build.dwother';
    s.textContent=P+'::after{content:none!important}'+P+' > .wfeadd{margin-left:auto;padding:2px 6px;font-size:11px;color:#fff;opacity:.8;white-space:nowrap;cursor:pointer!important;pointer-events:auto!important;position:relative;z-index:3;border-radius:4px;background:transparent;touch-action:manipulation}'+P+' > .wfeadd:hover{opacity:1;background:rgba(255,255,255,.12)}'+
      'html:not(.rb-room) #ui .wcpanel .wcx{display:none!important}'+
      'html:not(.rb-room) #ui > aside.panel > .witem.wfhid{display:none!important}html:not(.rb-room) #ui > aside.panel > .witem > .wfdx{pointer-events:auto!important}'+
      'html:not(.rb-room) '+PK+' > .build:not(.dwother):not(.wfin)::after{content:none!important}'+
      'html:not(.rb-room) '+PK+' > .build.wfin:not(.dwother)::after{content:"\\2713  In bar"!important}';
    document.head.appendChild(s);}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},60);}
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});run();setInterval(soon,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
