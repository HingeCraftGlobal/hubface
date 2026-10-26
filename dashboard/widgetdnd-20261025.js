/* widgetdnd-20261025 (Dan, Oct 25): THE ONE OWNER of drag-and-drop in the Dashboard Builder "Widgets" list. See WIDGETS-DND-README.md.
   Root cause of the repeated breakage: several scripts each listened to pointerdown on the same rows. dash-row.js grabbed every CLOSED
   square widget row (.witem.boxitem.boxoff: Weather, Hub Rooms, Priorities, News Briefing, Home Status ...) in the capture phase and stopped
   the event, so the reorder code (widgetorder-20261018) never saw it; which rows were stuck depended on which widgets happened to be closed.
   Now: one window-level, capture-phase, delegated handler. ANY element matching ROW inside the panel is draggable automatically
   (no per-widget lists, survives re-renders). Drop inside the panel = reorder (saved through window.__wOrder: a list of names; unknown/new
   widgets append automatically). Drop outside the panel on a closed widget = open it (the old dash-row drag-out). Plain click unchanged.
   Other scripts must NOT add pointer handlers to these rows; dash-row.js and widgetorder's dash sortable stand down when __widgetDnd is set. */
(function(){'use strict';
  if(window.__widgetDnd)return;
  var PANEL='#ui > aside.panel:not(.props)',ROW=PANEL+' > .witem';
  window.__widgetDnd={version:'widgetdnd-20261025',row:ROW};
  function room(){return document.documentElement.classList.contains('rb-room');}
  function nameOf(it){var s=it.querySelector('span');return s?s.textContent.trim().replace(/\d+$/,'').trim():'';}
  function rows(P){return [].filter.call(P.children,function(x){return x.matches&&x.matches(ROW)&&x.offsetHeight>0;}).sort(function(a,b){return a.getBoundingClientRect().top-b.getBoundingClientRect().top;});}
  var D=null,sup=0;
  function begin(){var el=D.el,P=D.P,r=el.getBoundingClientRect();D.on=true;D.sc=(r.height/(el.offsetHeight||1))||1;D.others=rows(P).filter(function(x){return x!==el;});
    el.classList.add('wsdrag');document.documentElement.classList.add('wsdragging');D.ind=document.createElement('div');D.ind.className='wsind';P.appendChild(D.ind);}
  function slot(y){var o=D.others;for(var i=0;i<o.length;i++){var r=o[i].getBoundingClientRect();if(y<r.top+r.height/2)return i;}return o.length;}
  function inside(P,x,y){var r=P.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
  function move(x,y){var el=D.el,P=D.P,sc=D.sc,pr=P.getBoundingClientRect();el.style.transform='translate('+((x-D.x0)/sc)+'px,'+((y-D.y0)/sc)+'px)';
    var inP=inside(P,x,y);D.ind.style.display=inP?'':'none';D.ix=slot(y);var o=D.others;if(!o.length)return;
    var ref=o[Math.min(D.ix,o.length-1)],r=ref.getBoundingClientRect(),top=(D.ix<o.length?r.top-1.5*sc:r.bottom+1.5*sc)-pr.top;
    D.ind.style.left=((r.left-pr.left)/sc)+'px';D.ind.style.width=ref.offsetWidth+'px';D.ind.style.top=(top/sc+P.scrollTop-1)+'px';}
  function end(e,commit){var d=D;D=null;document.documentElement.classList.remove('wsdragging');if(!d||!d.on)return;
    d.el.classList.remove('wsdrag');d.el.style.transform='';if(d.ind)d.ind.remove();sup=Date.now()+400;if(!commit)return;
    if(!inside(d.P,e.clientX,e.clientY)){if(d.el.classList.contains('boxoff')){sup=0;try{d.el.click();}catch(_){}}return;}
    var o=d.others.slice();o.splice(d.ix,0,d.el);var vis=o.map(nameOf),W=window.__wOrder;if(!W)return;
    var all=[].filter.call(d.P.children,function(x){return x.matches&&x.matches(ROW);}).map(nameOf);
    var full=W.apply('dash',all),on={};vis.forEach(function(k){on[k]=1;});var i=0;full=full.map(function(k){return on[k]?vis[i++]:k;});
    W.set('dash',full);setTimeout(function(){try{var L=window.__layoutSave;if(L&&L.saveNow&&W.mode&&W.mode()==='account'&&(!L.isDirty||L.isDirty()))L.saveNow(true);}catch(_){}},1500);/* autosave like dragsave-20261025 */try{window.dispatchEvent(new CustomEvent('hf:widget-order',{detail:{order:full}}));}catch(_){}}
  window.addEventListener('pointerdown',function(e){if(D||room()||(e.pointerType==='mouse'&&e.button!==0))return;
    var el=e.target&&e.target.closest&&e.target.closest(ROW);if(!el)return;
    if(e.target.closest('button,input,select,textarea,.boxclose,.wx,[data-nodrag]')&&e.target!==el)return;
    e.stopPropagation();D={el:el,P:el.parentNode,x0:e.clientX,y0:e.clientY,pid:e.pointerId,on:false,touch:e.pointerType==='touch'};
    if(D.touch)D.hold=setTimeout(function(){if(D&&!D.on)begin();},300);},true);
  window.addEventListener('pointermove',function(e){if(!D||e.pointerId!==D.pid)return;
    if(!D.on){var dist=Math.hypot(e.clientX-D.x0,e.clientY-D.y0);if(D.touch){if(dist>8){clearTimeout(D.hold);D=null;}return;}if(dist<5)return;begin();}
    e.preventDefault();move(e.clientX,e.clientY);},true);
  window.addEventListener('pointerup',function(e){if(D&&e.pointerId===D.pid)end(e,true);},true);
  window.addEventListener('pointercancel',function(e){if(D)end(e,false);},true);
  window.addEventListener('keydown',function(e){if(D&&D.on&&e.key==='Escape'){e.stopPropagation();end(e,false);}},true);
  window.addEventListener('click',function(e){if(Date.now()<sup&&e.target.closest&&e.target.closest(PANEL)){e.stopPropagation();e.preventDefault();sup=0;}},true);
  window.addEventListener('touchmove',function(e){if(D&&D.on)e.preventDefault();},{passive:false,capture:true});
})();
