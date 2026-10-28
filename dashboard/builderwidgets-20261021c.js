/* builderwidgets-20261021c (flashfix-20261021a): = 20261021a with bwfit added only when missing (stops its self-retriggering loop). Was builderwidgets-20261021a: outside rooms, fit the Widgets and Properties panels to their contents (same measure as room-fit.js fitProps). */
(function(){
  if(window.__builderWidgets)return;window.__builderWidgets='builderwidgets-20261021a';
  /* shakefix1-20261027: debug log + pause during hf-lwait. Rollback: .bak-shakefix1 */
  var __mv=window.__hfMoveLog||(window.__hfMoveLog=[]);function DBG(){try{return localStorage.getItem('hfdebug')==='1'||/[?&]hfdebug=1/.test(location.search);}catch(e){return false;}}
  function mlog(src,el,prop,val){if(!DBG())return;var who=el&&(el.getAttribute&&(el.getAttribute('data-float')||el.id)||el.className)||'?';var st=((new Error().stack||'').split('\n')[3]||'').trim();var r={t:Math.round(performance.now()),src:src,el:String(who).slice(0,40),prop:prop,val:val,at:st};__mv.push(r);if(__mv.length>2000)__mv.shift();try{console.debug('[hfmove]',src,r.el,prop,val,st);}catch(e){}}
  function lwait(){return document.documentElement.classList.contains('hf-lwait');}
  function ui(){return document.getElementById('ui');}
  function room(){return document.documentElement.classList.contains('rb-room');}
  function cap(){var u=ui();var H=u?u.clientHeight:576;return Math.max(120,H-48-4);}
  function clear(p){if(p.classList.contains('bwfit')||p.classList.contains('bwscroll')){p.classList.remove('bwfit','bwscroll');p.style.removeProperty('height');}}
  function fit(p){
    if(!p)return;if(room()||p.classList.contains('collapsed')){clear(p);return;}
    var u=ui();if(u)u.style.setProperty('--rfmax',cap()+'px');
    var mx=0;[].forEach.call(p.children,function(c){if(c.id==='yTrx'||c.tagName==='STYLE'||c.tagName==='SCRIPT')return;if(!c.offsetParent&&getComputedStyle(c).position!=='fixed')return;var b=c.offsetTop+c.offsetHeight;if(b>mx)mx=b;});
    var t=p.querySelector('#yTrx');if(t&&!t.classList.contains('open')&&t.offsetParent){var b=t.offsetTop+(t.querySelector('.trxh')||t).offsetHeight;if(b>mx)mx=b;}
    if(!mx)return;var h=Math.ceil(mx+8),c=cap();if(!p.classList.contains('bwfit'))p.classList.add('bwfit');if(p.classList.contains('bwscroll')!==(h>c))p.classList.toggle('bwscroll',h>c);
    var hv=Math.min(h,c)+'px';if(p.style.getPropertyValue('height')!==hv){mlog('bwC.fit',p,'height',hv);}if(p.style.getPropertyValue('height')!==hv)p.style.setProperty('height',hv,'important');
  }
  function tick(){if(lwait())return;try{fit(document.querySelector('#ui > aside.panel.props'));fit(document.querySelector('#ui > aside.panel:not(.props)'));}catch(e){}}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;tick();},60);}
  new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  function obs(){var u=ui();if(!u){setTimeout(obs,500);return;}new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});tick();}
  obs();window.addEventListener('resize',soon);setInterval(tick,2000);
})();
