/* builderwidgets-20261021b (Dan): outside rooms, (1) re-flow Widgets rows compactly like the room list, (2) widgets opened from the sidebar
   land in the clear area right of the Widgets panel (like room windows), expanded, never on top of the sidebar.
   Roll back: /opt/hubface/backups/builderwidgets-20261021b/ROLLBACK.sh */
(function(){
  if(window.__builderWidgetsB)return;window.__builderWidgetsB='builderwidgets-20261021b';
  var TOP=62,STEP=25,CLR_X=178,CLR_Y=82;
  function room(){return document.documentElement.classList.contains('rb-room');}
  function P(){return document.querySelector('#ui > aside.panel:not(.props)');}
  function flow(){var p=P();if(!p||room()||p.classList.contains('collapsed'))return;
    if(!p.querySelector(':scope > .bwhd')){var h=document.createElement('div');h.className='bwhd';h.textContent='Dashboard widgets';p.appendChild(h);}
    var it=[].filter.call(p.children,function(c){return c.classList.contains('witem')&&getComputedStyle(c).display!=='none';});
    it.sort(function(a,b){return (a._bwo||parseFloat(a.style.top)||0)-(b._bwo||parseFloat(b.style.top)||0);});
    it.forEach(function(c,i){if(!c._bwo)c._bwo=parseFloat(c.style.top)||(i+1)*1000;var v=(TOP+i*STEP)+'px';if(c.style.getPropertyValue('top')!==v)c.style.setProperty('top',v,'important');});}
  function rectUI(e){var u=document.getElementById('ui'),ur=u.getBoundingClientRect(),k=ur.width/u.clientWidth||1,r=e.getBoundingClientRect();return {l:(r.left-ur.left)/k,t:(r.top-ur.top)/k,r:(r.right-ur.left)/k,b:(r.bottom-ur.top)/k};}
  function hit(a,b){return a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;}
  function store(k,id,v){try{var o=JSON.parse(localStorage.getItem(k)||'{}')||{};if(v===undefined)delete o[id];else o[id]=v;localStorage.setItem(k,JSON.stringify(o));}catch(e){}}
  function place(s){var p=P();if(!p||room())return;var id=s.getAttribute('data-float');if(!id||id==='yoda'||id==='call')return;
    if(s.classList.contains('collapsed')){s.classList.remove('collapsed');store('hinge-box-min',id);var sz=null;try{sz=(JSON.parse(localStorage.getItem('hinge-box-size')||'{}')||{})[id];}catch(e){}if(sz&&sz.h)s.style.height=sz.h+'px';else if(parseFloat(s.style.height)<60)s.style.height='198px';}
    var pr=rectUI(p),sr=rectUI(s);if(!hit(sr,pr)&&sr.l>=pr.r)return;
    var n=0,others=[].filter.call(document.querySelectorAll('#ui > section.box.floatbox:not(.closed)'),function(o){return o!==s&&o.offsetWidth;});
    while(n<8&&others.some(function(o){var r=rectUI(o);return Math.abs(r.l-(CLR_X+n*24))<6&&Math.abs(r.t-(CLR_Y+n*24))<6;}))n++;
    var x=CLR_X+n*24,y=CLR_Y+n*24;s.style.left=x+'px';s.style.top=y+'px';store('hinge-float-pos',id,{x:x,y:y});}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{flow();}catch(e){}},40);}
  function watchBoxes(){[].forEach.call(document.querySelectorAll('#ui > section.box[data-float]'),function(s){if(s._bwb)return;s._bwb=1;var was=s.classList.contains('closed');
    new MutationObserver(function(){var c=s.classList.contains('closed');if(was&&!c)setTimeout(function(){try{place(s);}catch(e){}},30);was=c;}).observe(s,{attributes:true,attributeFilter:['class']});});}
  function init(){var u=document.getElementById('ui');if(!u||!P()){setTimeout(init,500);return;}
    new MutationObserver(function(){soon();watchBoxes();}).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    watchBoxes();flow();setInterval(function(){flow();watchBoxes();},2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
