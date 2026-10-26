/* dashrow-20261021b (Dan): FIRST RUN = every widget off. On a browser that has not seen this build (no localStorage
   hf-widgets-firstrun-v2), every dashboard square (Weather, Schedule, Home Status, Priorities, News Briefing, Other, Hub Rooms ...) is
   closed with its own X, open widget windows (YouTube, Email, ...) are closed, all row tiles go to Other widgets, and the Widgets
   sidebar is shown with an OTHER WIDGETS label; click or drag an item out of it to bring that widget back. The first-run state is
   written into the committed snapshot (hinge-committed-v1) so a reload keeps it; after that the visitor's own saved state wins.
   Bot bars, Calls and the scene background are not touched. Runs once per browser (Dan included). Nothing is pushed to the server; the previous local values are kept in
   hf-dash-row-v1-pre-firstrun / hinge-box-closed-pre-firstrun.
   dashrow-20261021a: Dashboard Builder widget row (#ui .blist) works like the room widget list.
   Row tiles get an X (moves to Other widgets, never deletes). Other widgets section holds the rest; click one to bring it back.
   Drag (pointer events) between row and Other, both ways, and to reorder. Save stores the arrangement as Dan's default
   (localStorage hf-dash-row-v1); unsaved changes show a hint and revert to the saved default on reload.
   Bot tiles (data-bot / hidden) and ai-rows.js are left alone. New custom widgets ("+ Name your own widget") land in the row. */
(function(){
  'use strict';
  if(window.__dashRow)return;
  var KEY='hf-dash-row-v1';
  var DEF_ROW=['Family Vault','Life Canvas Board','Fitness','Pet Vault'];
  var list=null,head=null,div=null,hint=null,saved=null,state=null,busy=false,drag=null,suppress=0;
  function low(s){return String(s||'').trim().toLowerCase();}
  function nameOf(t){var b=t.querySelector(':scope > b');return b?b.textContent.trim():'';}
  function managed(){return [].filter.call(list.children,function(t){return t.classList.contains('build')&&!t.classList.contains('bnew')&&!t.classList.contains('editing')&&!t.dataset.bot&&!t.classList.contains('dwhead')&&!t.classList.contains('dwdiv')&&nameOf(t);});}
  function load(){try{var s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Array.isArray(s.row)&&Array.isArray(s.other))return s;}catch(e){}return null;}
  function names(){return managed().map(nameOf);}
  function initial(){var all=names(),s=saved;var row=[],other=[];
    if(s){s.row.forEach(function(n){if(all.some(function(a){return low(a)===low(n);}))row.push(n);});s.other.forEach(function(n){if(all.some(function(a){return low(a)===low(n);}))other.push(n);});}
    else{DEF_ROW.forEach(function(n){if(all.some(function(a){return low(a)===low(n);}))row.push(n);});}
    all.forEach(function(n){if(!has(row,n)&&!has(other,n)){var custom=managed().some(function(t){return nameOf(t)===n&&t.classList.contains('bcustom');});(s?(custom?row:other):(custom?row:other)).push(n);}});
    return {row:row,other:other};}
  function has(a,n){return a.some(function(x){return low(x)===low(n);});}
  function rm(a,n){for(var i=a.length-1;i>=0;i--)if(low(a[i])===low(n))a.splice(i,1);}
  function same(a,b){return JSON.stringify({r:a.row.map(low),o:a.other.map(low)})===JSON.stringify({r:b.row.map(low),o:b.other.map(low)});}
  function dirty(){var base=saved||{row:DEF_ROW.slice(),other:[]};var b2=initialFrom(base);return !same(state,b2);}
  function initialFrom(base){var keep=saved;saved=base;var r=initial();saved=keep;return r;}
  function ensureUi(){
    if(!head||!head.isConnected){head=document.createElement('div');head.className='build bspan dwhead';
      head.innerHTML='<span class="dwlbl">YOUR ROW</span><span class="dwhint">unsaved changes</span><button type="button" class="dwsave" title="Save this arrangement as your default">Save</button>';
      list.insertBefore(head,list.firstChild);
      head.querySelector('.dwsave').addEventListener('click',function(e){e.stopPropagation();save();});}
    if(!div||!div.isConnected){div=document.createElement('div');div.className='build bspan dwdiv';div.innerHTML='<span>OTHER WIDGETS</span><em>click or drag to add</em>';list.appendChild(div);}
    hint=head.querySelector('.dwhint');}
  function apply(){
    if(!list||busy)return;busy=true;try{
      ensureUi();var tiles=managed(),by={};tiles.forEach(function(t){by[low(nameOf(t))]=t;});
      tiles.forEach(function(t){var n=nameOf(t);if(!has(state.row,n)&&!has(state.other,n))(t.classList.contains('bcustom')?state.row:state.other).push(n);});
      state.row=state.row.filter(function(n){return by[low(n)];});state.other=state.other.filter(function(n){return by[low(n)];});
      var plus=list.querySelector(':scope > .bnew');
      /* order: head, row tiles, (bot tiles untouched), +, divider, other tiles */
      var ref=head.nextSibling;
      state.row.forEach(function(n){var t=by[low(n)];t.classList.remove('dwother');xbtn(t);if(ref!==t)list.insertBefore(t,ref);ref=t.nextSibling;});
      if(plus&&div.previousSibling!==plus&&plus.nextSibling!==div)list.insertBefore(div,plus.nextSibling);
      var ref2=div.nextSibling;
      state.other.forEach(function(n){var t=by[low(n)];t.classList.add('dwother');xbtn(t);if(ref2!==t)list.insertBefore(t,ref2);ref2=t.nextSibling;});
      div.classList.toggle('dwempty',!state.other.length);
      hint.style.visibility=dirty()?'visible':'hidden';
    }finally{busy=false;}}
  function xbtn(t){var x=t.querySelector(':scope > .dwx');if(!x){x=document.createElement('span');x.className='dwx';x.setAttribute('role','button');x.textContent='\u00d7';t.appendChild(x);}
    var o=t.classList.contains('dwother');x.title=o?'':'Move to Other widgets';x.setAttribute('aria-label',x.title||'');}
  function toRow(n,beforeName){rm(state.row,n);rm(state.other,n);var i=beforeName?state.row.findIndex(function(x){return low(x)===low(beforeName);}):-1;if(i<0)state.row.push(n);else state.row.splice(i,0,n);apply();}
  function toOther(n,beforeName){rm(state.row,n);rm(state.other,n);var i=beforeName?state.other.findIndex(function(x){return low(x)===low(beforeName);}):-1;if(i<0)state.other.push(n);else state.other.splice(i,0,n);apply();}
  function save(){saved={row:state.row.slice(),other:state.other.slice()};try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(e){}
    try{if(window.__userdataSync&&window.__userdataSync.push)window.__userdataSync.push(KEY);}catch(e){}
    apply();var b=head.querySelector('.dwsave');b.textContent='Saved \u2713';b.classList.add('ok');clearTimeout(b._t);b._t=setTimeout(function(){b.textContent='Save';b.classList.remove('ok');},1600);}
  /* click: X -> Other; Other tile -> row (capture, so the tile doesn't open) */
  function onClick(e){
    if(Date.now()<suppress){e.stopPropagation();e.preventDefault();return;}
    var x=e.target.closest&&e.target.closest('.dwx');var t=e.target.closest&&e.target.closest('.build');
    if(x&&t&&!t.classList.contains('dwother')){e.stopPropagation();e.preventDefault();toOther(nameOf(t));return;}
    if(t&&t.classList.contains('dwother')&&!e.target.closest('.bdel')){e.stopPropagation();e.preventDefault();toRow(nameOf(t));}}
  /* drag */
  function onDown(e){if(e.button!==0)return;var t=e.target.closest&&e.target.closest('.build');if(!t||managed().indexOf(t)<0||e.target.closest('.dwx,.bdel,input'))return;
    drag={t:t,x:e.clientX,y:e.clientY,on:false,id:e.pointerId};}
  function onMove(e){if(!drag||e.pointerId!==drag.id)return;
    if(!drag.on){if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)<6)return;drag.on=true;drag.t.classList.add('dwdrag');
      var r=drag.t.getBoundingClientRect();var g=drag.t.cloneNode(true);g.className='dwghost';g.style.cssText='position:fixed;z-index:2147483000;pointer-events:none;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';drag.g=g;drag.ox=e.clientX-r.left;drag.oy=e.clientY-r.top;document.body.appendChild(g);}
    e.preventDefault();drag.g.style.left=(e.clientX-drag.ox)+'px';drag.g.style.top=(e.clientY-drag.oy)+'px';
    [].forEach.call(list.querySelectorAll('.dwover'),function(n){n.classList.remove('dwover');});var tg=target(e);if(tg.el)tg.el.classList.add('dwover');}
  function target(e){var el=document.elementFromPoint(e.clientX,e.clientY),t=el&&el.closest&&el.closest('#ui .blist .build');
    var dr=div.getBoundingClientRect(),zoneOther=e.clientY>=dr.top;
    if(t===div||t===head)t=null;if(t&&managed().indexOf(t)<0)t=null;if(t===drag.t)t=null;
    if(t)zoneOther=t.classList.contains('dwother');
    var lr=list.getBoundingClientRect();var inside=e.clientX>=lr.left-30&&e.clientX<=lr.right+30&&e.clientY>=lr.top-30&&e.clientY<=lr.bottom+30;
    return {el:t,other:zoneOther,inside:inside};}
  function onUp(e){if(!drag||e.pointerId!==drag.id)return;var d=drag;drag=null;if(!d.on)return;
    d.t.classList.remove('dwdrag');if(d.g)d.g.remove();[].forEach.call(list.querySelectorAll('.dwover'),function(n){n.classList.remove('dwover');});
    suppress=Date.now()+350;var tg=(drag={t:d.t},target(e));drag=null;if(!tg.inside)return;
    var n=nameOf(d.t),b=tg.el?nameOf(tg.el):null;if(tg.other)toOther(n,b);else toRow(n,b);}
  function css(){var s=document.createElement('style');s.id='dashrow-css';s.textContent=[
    '#ui .blist .dwhead{display:flex!important;flex-direction:row!important;justify-content:flex-start!important;align-items:center;gap:4px;height:18px!important;border:0!important;background:none!important;cursor:default!important;padding:0 2px!important}',
    '#ui .blist .dwhead .dwlbl,#ui .blist .dwdiv span{font-size:7.5px;font-weight:700;letter-spacing:.08em;opacity:.8}',
    '#ui .blist .dwhead .dwhint{flex:1;font-size:7px;font-style:italic;color:#ffd27a;opacity:.85;visibility:hidden;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#ui .blist .dwsave{font:700 7.5px system-ui;color:#fff;background:rgba(var(--hub-blue-rgb,79,209,255),.35);border:1px solid rgba(var(--hub-blue-rgb,79,209,255),.85);border-radius:5px;padding:1px 6px;cursor:pointer;pointer-events:auto!important}',
    '#ui .blist .dwsave.ok{background:#16a34a;border-color:#16a34a}',
    '#ui .blist .dwdiv{display:flex!important;flex-direction:row!important;justify-content:flex-start!important;align-items:center;gap:5px;height:16px!important;margin-top:4px;border:0!important;border-top:1px solid rgba(255,255,255,.22)!important;border-radius:0!important;background:none!important;cursor:default!important;padding:2px 2px 0!important}',
    '#ui .blist .dwdiv em{font-size:6.8px;font-style:normal;opacity:.55}#ui .blist .dwdiv.dwempty em:after{content:" (empty)"}',
    '#ui .blist .build.dwother{opacity:.62;border-style:dashed!important}#ui .blist .build.dwother:hover{opacity:1}',
    '#ui .blist .dwx{position:absolute;right:1px;top:50%;margin-top:-6px;width:12px;height:12px;line-height:11px;text-align:center;font-size:10px;color:#fff;border-radius:6px;cursor:pointer;opacity:.55;pointer-events:auto!important}',
    '#ui .blist .dwx:hover{opacity:1;background:rgba(255,90,90,.6)}#ui .blist .dwother .dwx{display:none}',
    '#ui .blist .bcustom .bdel{right:13px}',
    '#ui .blist .build.dwdrag{opacity:.3}#ui .blist .build.dwover{outline:1px solid var(--hub-blue-hi,#7fdcff);outline-offset:1px}',
    '.dwghost{opacity:.85;display:flex;align-items:center;justify-content:center;font:600 10px system-ui;color:#fff;background:rgba(20,40,64,.9);border:1px solid #4fd1ff;border-radius:7px}',
    '#ui .blist .build:not(.bnew):not(.dwhead):not(.dwdiv){touch-action:none}'].join('\n');document.head.appendChild(s);}
  function init(){list=document.querySelector('#ui .blist');if(!list||!window.__customWidgets){setTimeout(init,400);return;}
    css();saved=load();state=initial();apply();
    list.addEventListener('click',onClick,true);list.addEventListener('pointerdown',onDown,true);
    window.addEventListener('pointermove',onMove,{passive:false});window.addEventListener('pointerup',onUp);window.addEventListener('pointercancel',onUp);
    new MutationObserver(function(){if(!busy&&!drag)apply();}).observe(list,{childList:true});
    window.__dashRow={state:function(){return JSON.parse(JSON.stringify(state));},saved:function(){return saved;},save:save,toRow:toRow,toOther:toOther,dirty:dirty,build:'dashrow-20261021b'};
    firstRun();}

  /* ---------- dashrow-20261021b first run ---------- */
  var FR='hf-widgets-firstrun-v2',SKIPF={yoda:1,call:1};
  function squares(){return [].filter.call(document.querySelectorAll('#ui > section.box[data-float]'),function(sq){var id=sq.getAttribute('data-float');return !SKIPF[id]&&!/^box\d+$/.test(id)&&sq.querySelector(':scope > .boxclose');});}
  function commit(keys){try{var c=JSON.parse(localStorage.getItem('hinge-committed-v1')||'null');if(!c||!c.v)return;keys.forEach(function(k){var v=localStorage.getItem(k);if(v===null)delete c.v[k];else c.v[k]=v;});c.t=Date.now();localStorage.setItem('hinge-committed-v1',JSON.stringify(c));}catch(e){}}
  function allOff(){
    try{var pb=localStorage.getItem('hinge-box-closed');if(pb!==null&&localStorage.getItem('hinge-box-closed-pre-firstrun')===null)localStorage.setItem('hinge-box-closed-pre-firstrun',pb);}catch(e){}
    squares().forEach(function(sq){if(!sq.classList.contains('closed')){var x=sq.querySelector(':scope > .boxclose');try{x.click();}catch(e){}if(!sq.classList.contains('closed'))sq.classList.add('closed');}});
    [].forEach.call(document.querySelectorAll('#ui > .wbx'),function(b){if(b.getAttribute('data-w')==='ent'&&!b.classList.contains('open'))return;try{if(b._wapi&&b._wapi.close)b._wapi.close();}catch(e){}});
    if(list&&state){state.other=state.row.concat(state.other);state.row=[];saved={row:[],other:state.other.slice()};try{var pv=localStorage.getItem(KEY);if(pv!==null&&localStorage.getItem(KEY+'-pre-firstrun')===null)localStorage.setItem(KEY+'-pre-firstrun',pv);localStorage.setItem(KEY,JSON.stringify(saved));}catch(e){}apply();}
    try{if(window.__panelTuck)window.__panelTuck.set('widgets',false);}catch(e){}}
  function firstRun(){sidebar();var done=null;try{done=localStorage.getItem(FR);}catch(e){}if(done)return;
    setTimeout(function(){allOff();setTimeout(function(){commit(['hinge-box-closed','hinge-panel-tucked']);try{localStorage.setItem(FR,String(Date.now()));}catch(e){}
      try{window.dispatchEvent(new CustomEvent('hf:widgets-firstrun',{detail:{}}));}catch(e){}},500);},1200);}
  /* Widgets sidebar: label + drag out (click already brings a closed square back) */
  function sidebar(){var P=document.querySelector('#ui > aside.panel:not(.props)');if(!P||P._wfr)return;P._wfr=1;
    var l=document.createElement('div');l.className='wfrlbl';l.innerHTML='OTHER WIDGETS<em>click or drag to add</em>';P.appendChild(l);
    var st2=document.createElement('style');st2.textContent='#ui > aside.panel > .wfrlbl{position:absolute;left:73px;top:10px;font:700 6.5px/8.5px system-ui;letter-spacing:.08em;opacity:.75;pointer-events:none;white-space:nowrap}#ui > aside.panel > .wfrlbl em{display:block;font-style:normal;font-weight:400;opacity:.8;letter-spacing:0}#ui .panel .witem.boxoff{opacity:.62;border-style:dashed}#ui .panel .witem.boxoff:hover{opacity:1}.wfrghost{position:fixed;z-index:2147483000;pointer-events:none;padding:4px 10px;font:600 11px system-ui;color:#fff;background:rgba(20,40,64,.92);border:1px solid #4fd1ff;border-radius:7px}';document.head.appendChild(st2);
    var d=null,sup=0;
    P.addEventListener('pointerdown',function(e){if(window.__widgetDnd||e.button!==0)return;var it=e.target.closest&&e.target.closest('.witem.boxitem.boxoff');if(!it)return;e.stopPropagation();d={it:it,x:e.clientX,y:e.clientY,id:e.pointerId,on:false};},true);
    window.addEventListener('pointermove',function(e){if(!d||e.pointerId!==d.id)return;if(!d.on){if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)<6)return;d.on=true;d.g=document.createElement('div');d.g.className='wfrghost';d.g.textContent=d.it.textContent.trim();document.body.appendChild(d.g);}
      d.g.style.left=(e.clientX+8)+'px';d.g.style.top=(e.clientY+8)+'px';},{passive:true});
    window.addEventListener('pointerup',function(e){if(!d||e.pointerId!==d.id)return;var dd=d;d=null;if(!dd.on)return;dd.g.remove();sup=Date.now()+350;
      var pr=P.getBoundingClientRect();if(e.clientX>=pr.left&&e.clientX<=pr.right&&e.clientY>=pr.top&&e.clientY<=pr.bottom)return;
      sup=0;dd.it.click();});
    P.addEventListener('click',function(e){if(Date.now()<sup){e.stopPropagation();e.preventDefault();}},true);}
  window.__widgetsFirstRun={key:FR,allOff:allOff,squares:function(){return squares().map(function(s){return [s.getAttribute('data-float'),s.classList.contains('closed')];});}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
