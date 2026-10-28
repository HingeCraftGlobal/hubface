/* openspot-20261027a (Dan, Oct 27 2026): every dashboard widget opened by a click (left Widgets list row or Widget Picker tile) opens in ONE spot:
   left edge just right of the Widgets panel, top level with the first widget row. Already-open widgets are never moved; saved layouts applied
   by layout-save are not touched (only opens within 1.5 s of a real click count). If another widget already sits exactly there, step 24px.
   Runs once per open (plus one re-check 450 ms later in case an older placer moved it); never writes row tops. Main dashboard only.
   Roll back: remove the openspot-20261027a script tag from index.html. */
(function(){
  'use strict';if(window.__openSpot)return;window.__openSpot='openspot-20261027a';
  var CLICK='#ui > aside.panel:not(.props) > .witem, #ui .blist > .build, #ui .wfeadd',SKIP={yoda:1};
  var userT=0;
  function room(){return document.documentElement.classList.contains('rb-room');}
  function mark(e){try{if(e.isTrusted&&!room()&&e.target.closest&&e.target.closest(CLICK)&&!e.target.closest('.wfdx'))userT=Date.now();}catch(_){}}
  ['pointerdown','mousedown','click'].forEach(function(t){window.addEventListener(t,mark,true);});
  function ui(){return document.getElementById('ui');}
  function P(){return document.querySelector('#ui > aside.panel:not(.props)');}
  function spot(){var u=ui(),p=P();if(!u||!p)return null;var ur=u.getBoundingClientRect(),k=(ur.width/u.clientWidth)||1,pr=p.getBoundingClientRect();
    var r0=[].filter.call(p.querySelectorAll(':scope > .witem'),function(r){return r.offsetHeight>0;}).map(function(r){return r.getBoundingClientRect().top;}).sort(function(a,b){return a-b;})[0];
    return {x:Math.round((pr.right-ur.left)/k+6),y:Math.round(((r0!=null?r0:pr.top)-ur.top)/k),k:k,ur:ur};}
  function isOpen(el){return el.classList.contains('wbx')?el.classList.contains('open'):!el.classList.contains('closed');}
  function put(el){var s=spot();if(!s||!isOpen(el))return;var x=s.x,y=s.y,n=0;
    var others=[].filter.call(document.querySelectorAll('#ui > section.box.floatbox:not(.closed), #ui > section.call:not(.closed), #ui > .wbx.open'),function(o){return o!==el&&o.offsetWidth;});
    while(n<8&&others.some(function(o){var r=o.getBoundingClientRect();return Math.abs((r.left-s.ur.left)/s.k-x)<3&&Math.abs((r.top-s.ur.top)/s.k-y)<3;})){x+=24;y+=24;n++;}
    var id=el.getAttribute('data-float'),F=window.__float;
    if(id&&F&&F.move)F.move(id,x,y);else{el.style.left=x+'px';el.style.top=y+'px';}
    el.__osAt={x:x,y:y};}
  function want(el){if(!el||el.parentNode!==ui()||room())return false;if(Date.now()-userT>1500)return false;
    if(el.matches('section.call'))return true;if(el.matches('section.box[data-float]'))return !SKIP[el.getAttribute('data-float')];return el.matches('.wbx');}
  function opened(el){if(el.__osT)return;el.__osT=1;setTimeout(function(){el.__osT=0;try{put(el);}catch(_){}
      setTimeout(function(){try{var a=el.__osAt;if(!a||!isOpen(el))return;var l=parseFloat(el.style.left),t=parseFloat(el.style.top);if(Math.abs(l-a.x)>1||Math.abs(t-a.y)>1)put(el);}catch(_){}},450);},180);}
  function init(){var u=ui();if(!u){setTimeout(init,400);return;}
    new MutationObserver(function(ms){ms.forEach(function(m){var el=m.target;
      if(m.type==='attributes'){if(!want(el))return;var was=(m.oldValue||'').split(/\s+/);var wasOpen=el.classList.contains('wbx')?was.indexOf('open')>=0:was.indexOf('closed')<0;if(!wasOpen&&isOpen(el))opened(el);}
      else [].forEach.call(m.addedNodes,function(n){if(n.nodeType===1&&want(n)&&isOpen(n))opened(n);});});})
      .observe(u,{childList:true,attributes:true,attributeOldValue:true,attributeFilter:['class'],subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
