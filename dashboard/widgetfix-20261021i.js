/* widgetfix-20261021i (Dan 9:35 PM, flashfix-20261021a): = 20261021h minus the forced 12px/nowrap on picker <b> labels (fought the labelfit loop) and no redundant data-wf-set writes. */
/* widgetfix-20261021h (Dan, xplain-20261021h): = 20261021g + a distinct line icon per added left-column widget; replaces widgetfix-20261021f/g (same + keeps the native column order, scrolls the column, icons on added items). Main Dashboard Builder only (nothing on html.rb-room).
   (1) '+ Add to bar' (.wfeadd) is a real button: press = dash-row toRow(name)+save. The whole press sequence (pointer/mouse/touch down+up+click)
       is swallowed at window capture, INCLUDING the trailing click after the row has already moved into the bar (that click used to fall
       through to the tile and open the widget). Nothing opens.
   (2) widgetcats drill-down: its extra X (.wcx) is hidden; the '< Widget Picker' back button and the box's own close stay.
   (3) 'The bar' = the left Widgets list (as on the room page). '+ Add to bar' on a picker widget also adds it to the left list (state hf-wff-bar-v1);
       the plain X on a left-list item (.wfdx from 20261021d) closes the widget, removes the item from the left list and re-lists it in the
       Widget Picker with '+ Add to bar'. '\u2713 In bar' only shows on rows that are really in the left list; bot rows (AI Assistant) get no label.
   Roll back: /opt/hubface/backups/flashfix-20261021a/ROLLBACK.sh */
(function(){
  if(window.__widgetFixF)return;window.__widgetFixF='widgetfix-20261021i';
  function room(){return document.documentElement.classList.contains('rb-room');}
  var PK='#ui > section.box[data-float="other"] .blist';
  function btn(e){if(room())return null;var t=e.target;return t&&t.closest?t.closest(PK+' > .build > .wfeadd'):null;}
  var until=0,box=null;
  function inPicker(e){var l=document.querySelector(PK);return l&&e.target&&l.contains(e.target);}
  function eat(e){e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();}

  var OPENING=0;
  function rowHit(e){if(room()||OPENING)return null;var t=e.target;if(!t||!t.closest)return null;var l=document.querySelector(PK);if(!l||!l.contains(t))return null;
    if(t.closest('.wfeadd,.bnew,.wcback,input,textarea'))return null;return t.closest('.build');}
  ['pointerdown','mousedown','touchstart','pointerup','mouseup','touchend','click','dblclick'].forEach(function(ty){window.addEventListener(ty,function(e){if(btn(e))return;var r=rowHit(e);if(r&&!r.classList.contains('dwdiv'))eat(e);},{capture:true,passive:false});});
  function act(b){var t=b.parentNode,n=t&&t.querySelector(':scope > b, :scope > .wfnm'),R=window.__dashRow;if(!n||!R||!t.classList.contains('dwother'))return;
    var nm=n.textContent.trim();if(t.classList.contains('wfrow')){setHidden(nm,false);return;}
    try{R.toRow(nm);if(R.save)R.save();}catch(err){}setAdded(nm,true);}
  var K='hf-wff-bar-v1';
  function st(){try{var o=JSON.parse(localStorage.getItem(K)||'{}');return {hidden:o.hidden||[],added:o.added||[]};}catch(e){return {hidden:[],added:[]};}}
  function put(o){try{localStorage.setItem(K,JSON.stringify(o));}catch(e){}soon();}
  function tog(a,n,on){var i=a.indexOf(n);if(on&&i<0)a.push(n);if(!on&&i>=0)a.splice(i,1);}
  function setHidden(n,on){var o=st();tog(o.hidden,n,on);put(o);}
  function setAdded(n,on){var o=st();tog(o.added,n,on);put(o);}
  function low(x){return String(x||'').trim().toLowerCase();}

  var IC={
    'fitness':'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    'pet vault':'<circle cx="7" cy="9" r="1.6"/><circle cx="11" cy="6.5" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="18.5" cy="9.5" r="1.6"/><path d="M12.5 11c-2.6 0-5 3.2-5 5.4 0 1.6 1.3 2.3 2.6 2.1 1-.2 1.6-.6 2.4-.6s1.4.4 2.4.6c1.3.2 2.6-.5 2.6-2.1 0-2.2-2.4-5.4-5-5.4z"/>',
    'family vault':'<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><circle cx="12" cy="12.5" r="1.8"/><path d="M8.8 20v-1.6c0-1.6 1.4-2.8 3.2-2.8s3.2 1.2 3.2 2.8V20"/>',
    'lab':'<path d="M9.5 3.5h5M10.5 3.5v6L5 18.5c-.6 1 .1 2 1.2 2h11.6c1.1 0 1.8-1 1.2-2l-5.5-9v-6"/><path d="M7.5 14.5h9"/>',
    'career':'<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.8c0-.7.5-1.3 1.2-1.3h3.6c.7 0 1.2.6 1.2 1.3v1.7M3.5 12.5h17M11 12.5v1.5h2v-1.5"/>',
    'my recipe book':'<path d="M7.5 14.5c-2.2-.3-3.8-2-3.8-4 0-2.2 1.9-4 4.2-4 .5 0 1 .1 1.4.2C10 5.4 11 4.5 12 4.5s2 .9 2.7 2.2c.4-.1.9-.2 1.4-.2 2.3 0 4.2 1.8 4.2 4 0 2-1.6 3.7-3.8 4"/><path d="M7.5 13v6.5h9V13M7.5 16.5h9"/>',
    'life canvas board':'<path d="M12 3.5v2M5.5 5.5h13v9h-13z"/><path d="M8 14.5 6 20.5M16 14.5l2 6M12 14.5v4"/><path d="M8 11.5l2.5-2.5 2 2 1.5-1.5 2 2"/>',
    'business':'<path d="M4.5 20.5h15M6 20.5V8.5h5v12M11 20.5V4.5h7v16"/><path d="M8 11h1M8 14h1M8 17h1M13.5 7.5h2M13.5 10.5h2M13.5 13.5h2M13.5 16.5h2"/>'};
  var FALL='<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>';
  function icon(n){return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'+(IC[low(n)]||FALL)+'</svg>';}
  function tileByName(n){var l=document.querySelector(PK);return l&&[].filter.call(l.querySelectorAll(':scope > .build:not(.wfghost):not(.wfrow)'),function(t){var b=t.querySelector(':scope > b');return b&&low(b.textContent)===low(n);})[0];}
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
  function bar(){if(room())return;var p=document.querySelector('#ui > aside.panel:not(.props)'),l=document.querySelector(PK);if(!p)return;var o=st();var rowN=[];try{rowN=window.__dashRow.state().row||[];}catch(e){}rowN.forEach(function(n){if(o.added.indexOf(n)<0)o.added.push(n);});
    var items=[].slice.call(p.querySelectorAll(':scope > .witem'));
    items.forEach(function(it){if(it.classList.contains('wfadd'))return;var n=itemName(it);if(!n||n==='Widget Picker'||it.classList.contains('ai')||it.classList.contains('callitem'))return;
      var h=o.hidden.indexOf(n)>=0;if(h!==it.classList.contains('wfhid'))it.classList.toggle('wfhid',h);});
    /* added picker widgets as left-list items, before the Widget Picker item */
    var wp=items.filter(function(it){return itemName(it)==='Widget Picker';})[0];
    [].forEach.call(p.querySelectorAll(':scope > .witem.wfadd'),function(it){if(o.added.indexOf(it.dataset.wff)<0)it.remove();});
    o.added.forEach(function(n){if(p.querySelector(':scope > .witem.wfadd[data-wff="'+n.replace(/"/g,'')+'"]'))return;
      var it=document.createElement('div');it.className='witem wfadd';it.dataset.wff=n;it.setAttribute('role','button');it.title='Open '+n;
      it.innerHTML=icon(n)+'<span></span>';it.querySelector('span').textContent=n;
      it.addEventListener('click',function(e){if(e.target.closest('.wfdx'))return;var t=tileByName(n);if(t){if(t.classList.contains('dwother')){try{window.__dashRow.toRow(n);}catch(er){}t=tileByName(n);}if(t){OPENING=1;try{t.click();}finally{OPENING=0;}}}});
      var x=document.createElement('span');x.className='wfdx';x.setAttribute('role','button');x.title='Remove '+n+' from the bar';x.textContent='\u2715';it.appendChild(x);
      if(wp)p.insertBefore(it,wp);else p.appendChild(it);});
    if(wp&&wp.parentNode===p&&p.lastElementChild!==wp){var last=[].slice.call(p.children).filter(function(c){return c.classList.contains('witem');}).pop();if(last!==wp)p.insertBefore(wp,last.nextSibling);}
    /* keep the NATIVE order: remember the top each item had before we touched it (re-read if the page moves it), sort by that */
    var all=[].slice.call(p.querySelectorAll(':scope > .witem'));
    all.forEach(function(it){var t=parseFloat(it.style.top);if(!isNaN(t)&&it.style.top!==it.dataset.wfSet)it.dataset.wfNat=t;});
    var wpNat=wp&&parseFloat(wp.dataset.wfNat);
    all.forEach(function(it,i){if(it.classList.contains('wfadd'))it.dataset.wfNat=(isNaN(wpNat)?9999:wpNat)-0.5+o.added.indexOf(it.dataset.wff)*0.001;});
    var vis=all.filter(function(it){return !it.classList.contains('wfhid');}).sort(function(a,b){return (parseFloat(a.dataset.wfNat)||0)-(parseFloat(b.dataset.wfNat)||0);});
    if(wp&&vis.indexOf(wp)>=0){vis.splice(vis.indexOf(wp),1);vis.push(wp);}
    var nats=all.map(function(it){return parseFloat(it.dataset.wfNat);}).filter(function(v){return v>0&&!isNaN(v);});var y0=nats.length?Math.min.apply(null,nats):62,step=25;
    vis.forEach(function(it,i){var v=(y0+i*step)+'px';if(it.dataset.wfSet!==v)it.dataset.wfSet=v;if(it.style.top!==v)it.style.setProperty('top',v,'important');});
    /* fit: grow to content but never past the screen bottom; scroll inside */
    var need=y0+vis.length*step+16,r=p.getBoundingClientRect(),k=(p.offsetHeight&&r.height/p.offsetHeight)||1,maxh=Math.max(120,(innerHeight-r.top-10)/k);
    p.style.setProperty('min-height',Math.min(need,maxh)+'px','important');p.style.setProperty('max-height',maxh+'px','important');p.style.setProperty('overflow-y',need>maxh?'auto':'','important');
    /* picker: hidden built-ins re-listed with + Add to bar */
    if(l){var div=l.querySelector(':scope > .dwdiv');
      [].forEach.call(l.querySelectorAll(':scope > .wfrow'),function(r){if(o.hidden.indexOf(r.dataset.wff)<0)r.remove();});
      o.hidden.forEach(function(n){if(l.querySelector(':scope > .wfrow[data-wff="'+n.replace(/"/g,'')+'"]'))return;
        var r=document.createElement('div');r.className='build bsm dwother wfrow';r.dataset.wff=n;r.innerHTML='<span class="wfnm"></span>';r.querySelector('.wfnm').textContent=n;
        if(div&&div.nextSibling)l.insertBefore(r,div.nextSibling);else l.appendChild(r);});
      [].forEach.call(l.querySelectorAll(':scope > .build'),function(t){var b=t.querySelector(':scope > b, :scope > .wfnm'),n=b?b.textContent.trim():'';
        var inb=t.classList.contains('wfghost')||!t.dataset.bot&&!t.classList.contains('dwother')&&o.added.indexOf(n)>=0;if(inb!==t.classList.contains('wfin'))t.classList.toggle('wfin',inb);});}
    /* ONE flat picker list like the room: hide the top (row/bot) section, ghost rows '\u2713 In bar' in place, stable order via CSS order */
    if(l){var CAT=['family vault','life canvas board','fitness','pet vault','my recipe book','business','lab','career'];
      var sideOrder=items.filter(function(it){return !it.classList.contains('wfadd');}).map(function(it){return low(itemName(it));});
      [].forEach.call(l.querySelectorAll(':scope > .build'),function(t){if(t.classList.contains('wfghost'))return;var top=!t.classList.contains('dwother')&&!t.classList.contains('bnew')&&!t.classList.contains('dwdiv')&&!t.classList.contains('dwhead');
        if(top!==t.classList.contains('wfplaced'))t.classList.toggle('wfplaced',top);});
      var biN=items.filter(function(it){return !it.classList.contains('wfadd')&&!it.classList.contains('wfhid')&&itemName(it)&&itemName(it)!=='Widget Picker';}).map(itemName);
      var want=rowN.concat(biN.filter(function(n){return rowN.indexOf(n)<0;}));
      [].forEach.call(l.querySelectorAll(':scope > .wfghost'),function(g){if(want.indexOf(g.dataset.wff)<0)g.remove();});
      want.forEach(function(n){if(l.querySelector(':scope > .wfghost[data-wff="'+n.replace(/"/g,'')+'"]'))return;
        var g=document.createElement('div');g.className='build bsm wfghost wfin';g.dataset.wff=n;g.setAttribute('role','button');g.title='Open '+n;g.innerHTML='<span class="wfnm"></span>';g.querySelector('.wfnm').textContent=n;
        l.appendChild(g);});
      [].forEach.call(l.querySelectorAll(':scope > .build:not(.bnew):not(.dwdiv):not(.dwhead):not([data-bot])'),function(c){if(!c.querySelector(':scope > .wfsl')){var z=document.createElement('span');z.className='wfsl';z.setAttribute('aria-hidden','true');z.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>';c.appendChild(z);}});
      [].forEach.call(l.children,function(c){var v;if(c.classList.contains('dwhead'))v=-3;else if(c.classList.contains('dwdiv'))v=-2;else if(c.classList.contains('bnew'))v=-1;
        else{var b=c.querySelector(':scope > b, :scope > .wfnm'),n=low(b?b.textContent:''),k=CAT.indexOf(n),si=sideOrder.indexOf(n);v=si>=0?si+1:(k>=0?100+k:200);}
        if(c.style.order!==String(v))c.style.order=v;});}
}
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
  function css(){if(document.getElementById('wfg-css'))return;var s=document.createElement('style');s.id='wfg-css';
    var P='html:not(.rb-room) '+PK+' > .build.dwother';var RR='html:not(.rb-room) body #ui#ui > section.box[data-float="other"] .blist.blist > .build.build';
    s.textContent=P+'::after{content:none!important}'+P+' > .wfeadd{margin-left:auto;padding:2px 6px;font-size:11px;color:#fff;opacity:.8;white-space:nowrap;cursor:pointer!important;pointer-events:auto!important;position:relative;z-index:3;border-radius:4px;background:transparent;touch-action:manipulation}'+P+' > .wfeadd:hover{opacity:1;background:rgba(255,255,255,.12)}'+
      'html:not(.rb-room) '+PK+' > .build:not(.dwdiv) > .wfnm{font-size:12px!important;font-weight:400!important;text-transform:none!important;letter-spacing:normal!important;font-variant:normal!important;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto}html:not(.rb-room) '+PK+' > .build.bnew,html:not(.rb-room) '+PK+' > .build.bnew > b{opacity:1!important;color:#fff!important;filter:none!important}html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build:not(.bnew):not(.dwdiv):not(.dwhead){background:rgba(255,255,255,.06)!important;background-image:none!important;border:1px solid rgba(255,255,255,.16)!important;opacity:1!important;box-shadow:none!important;color:#fff!important;display:flex;align-items:center}html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build.wfin,html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build.wfghost{background:rgba(255,255,255,.12)!important}html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build::after{order:98}html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build > .wfeadd{order:98}html:not(.rb-room) body #ui#ui > section.box[data-float=\"other\"] .blist.blist > .build.build > .wfsl{order:99;margin-left:8px;opacity:.55;display:inline-flex;pointer-events:none}html:not(.rb-room) #ui .wcpanel .wcx{display:none!important}html:not(.rb-room) '+PK+' > .build.wfplaced{display:none!important}'+
      'html:not(.rb-room) #ui > aside.panel > .witem.wfhid{display:none!important}html:not(.rb-room) #ui > aside.panel > .witem > .wfdx{pointer-events:auto!important}'+
      'html:not(.rb-room) '+PK+' > .build:not(.dwother):not(.wfin)::after{content:none!important}'+
      'html:not(.rb-room) '+PK+' > .build.wfin:not(.dwother)::after{content:"\\2713  In bar"!important}';
    document.head.appendChild(s);}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},60);}
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});run();setInterval(soon,700);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
