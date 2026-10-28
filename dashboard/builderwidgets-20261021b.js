/* builderwidgets-20261021b (Dan): outside rooms, (1) re-flow Widgets rows compactly like the room list, (2) widgets opened from the sidebar
   land in the clear area right of the Widgets panel (like room windows), expanded, never on top of the sidebar.
   Roll back: /opt/hubface/backups/builderwidgets-20261021b/ROLLBACK.sh */
(function(){
  if(window.__builderWidgetsB)return;window.__builderWidgetsB='builderwidgets-20261021b';
  var TOP=62,STEP=25,CLR_X=178,CLR_Y=82;
  /* shakefix1-20261027 (Dan): debug log (localStorage hfdebug=1 or ?hfdebug=1 -> window.__hfMoveLog), pause during hf-lwait, place() only after a user click on a sidebar row, no style watch. Rollback: .bak-shakefix1 */
  var __mv=window.__hfMoveLog||(window.__hfMoveLog=[]);function DBG(){try{return localStorage.getItem('hfdebug')==='1'||/[?&]hfdebug=1/.test(location.search);}catch(e){return false;}}
  function mlog(src,el,prop,val){if(!DBG())return;var who=el&&(el.getAttribute&&(el.getAttribute('data-float')||el.id)||el.className)||'?';var st=((new Error().stack||'').split('\n')[3]||'').trim();var r={t:Math.round(performance.now()),src:src,el:String(who).slice(0,40),prop:prop,val:val,at:st};__mv.push(r);if(__mv.length>2000)__mv.shift();try{console.debug('[hfmove]',src,r.el,prop,val,st);}catch(e){}}
  function lwait(){return document.documentElement.classList.contains('hf-lwait');}
  var userOpenT=0;document.addEventListener('pointerdown',function(e){try{if(e.isTrusted&&e.target.closest&&e.target.closest('#ui > aside.panel:not(.props) > .witem'))userOpenT=Date.now();}catch(_){}},true);
  function room(){return document.documentElement.classList.contains('rb-room');}
  function P(){return document.querySelector('#ui > aside.panel:not(.props)');}
  function flow(){var p=P();if(!p||lwait()||room()||p.classList.contains('collapsed'))return;
    if(!p.querySelector(':scope > .bwhd')){var h=document.createElement('div');h.className='bwhd';h.textContent='Dashboard widgets';p.appendChild(h);}
    var it=[].filter.call(p.children,function(c){return c.classList.contains('witem')&&getComputedStyle(c).display!=='none';});
    it.sort(function(a,b){return (a._bwo||parseFloat(a.style.top)||0)-(b._bwo||parseFloat(b.style.top)||0);});
    /* dragorder-20261025: a saved drag-reorder (window.__wOrder, widgetorder-20261018) wins over the native order, otherwise this re-flow put every dragged row straight back. Widget Picker stays last, like widgetfix. */
    try{var wo=window.__wOrder;if(wo&&wo.get().dash&&wo.get().dash.length){var nmz=function(c){var sp=c.querySelector('span');return sp?sp.textContent.trim().replace(/\d+$/,'').trim():'';};
      var base=it.slice(),names=base.map(nmz),ord=wo.apply('dash',names),rk={};ord.forEach(function(n,i){if(rk[n]===undefined)rk[n]=i;});
      it.sort(function(a,b){var ra=rk[nmz(a)],rb=rk[nmz(b)];if(ra===undefined)ra=1e6;if(rb===undefined)rb=1e6;return ra-rb;});
      var wpi=-1;it.forEach(function(c,i){if(nmz(c)==='Widget Picker')wpi=i;});if(wpi>=0&&wpi!==it.length-1)it.push(it.splice(wpi,1)[0]);}}catch(e){}
    /* pickerlast1-20261027: Widget Picker always last even with no saved order; otherwise this fought widgetfix-20261021i (picker last) over the Sticky Note row and every widget row flickered. */
    try{var wpj=-1;it.forEach(function(c,i){var sp=c.querySelector("span");if(sp&&sp.textContent.trim().replace(/\d+$/,"").trim()==="Widget Picker")wpj=i;});if(wpj>=0&&wpj!==it.length-1)it.push(it.splice(wpj,1)[0]);}catch(e){}
    /* shakefix2-20261027 (Dan): widgetfix-20261021i is the ONLY writer of sidebar row tops outside rooms; two writers fought (row shake). Rollback: .bak-shakefix2 */
    if(!room())return;
    it.forEach(function(c,i){if(!c._bwo)c._bwo=parseFloat(c.style.top)||(i+1)*1000;var v=(TOP+i*STEP)+'px';if(c.style.getPropertyValue('top')!==v){mlog('bwB.flow',c,'top',v);c.style.setProperty('top',v,'important');}});}
  function rectUI(e){var u=document.getElementById('ui'),ur=u.getBoundingClientRect(),k=ur.width/u.clientWidth||1,r=e.getBoundingClientRect();return {l:(r.left-ur.left)/k,t:(r.top-ur.top)/k,r:(r.right-ur.left)/k,b:(r.bottom-ur.top)/k};}
  function hit(a,b){return a.l<b.r&&a.r>b.l&&a.t<b.b&&a.b>b.t;}
  function store(k,id,v){try{var o=JSON.parse(localStorage.getItem(k)||'{}')||{};if(v===undefined)delete o[id];else o[id]=v;localStorage.setItem(k,JSON.stringify(o));}catch(e){}}
  function place(s){var p=P();if(!p||lwait()||room())return;var id=s.getAttribute('data-float');if(!id||id==='yoda'||id==='call')return;
    if(s.classList.contains('collapsed')){s.classList.remove('collapsed');store('hinge-box-min',id);var sz=null;try{sz=(JSON.parse(localStorage.getItem('hinge-box-size')||'{}')||{})[id];}catch(e){}if(sz&&sz.h)s.style.height=sz.h+'px';else if(parseFloat(s.style.height)<60)s.style.height='198px';}
    var pr=rectUI(p),sr=rectUI(s);if(!hit(sr,pr)&&sr.l>=pr.r)return;
    var n=0,others=[].filter.call(document.querySelectorAll('#ui > section.box.floatbox:not(.closed)'),function(o){return o!==s&&o.offsetWidth;});
    while(n<8&&others.some(function(o){var r=rectUI(o);return Math.abs(r.l-(CLR_X+n*24))<6&&Math.abs(r.t-(CLR_Y+n*24))<6;}))n++;
    var x=CLR_X+n*24,y=CLR_Y+n*24;mlog('bwB.place',s,'left/top',x+','+y);s.style.left=x+'px';s.style.top=y+'px';store('hinge-float-pos',id,{x:x,y:y});}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{flow();}catch(e){}},40);}
  function watchBoxes(){[].forEach.call(document.querySelectorAll('#ui > section.box[data-float]'),function(s){if(s._bwb)return;s._bwb=1;var was=s.classList.contains('closed');
    new MutationObserver(function(){var c=s.classList.contains('closed');if(was&&!c&&Date.now()-userOpenT<1500)setTimeout(function(){try{place(s);}catch(e){}},30);was=c;}).observe(s,{attributes:true,attributeFilter:['class']});});}
  function init(){var u=document.getElementById('ui');if(!u||!P()){setTimeout(init,500);return;}
    new MutationObserver(function(){soon();watchBoxes();}).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    watchBoxes();flow();setInterval(function(){if(lwait())return;flow();watchBoxes();},2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
