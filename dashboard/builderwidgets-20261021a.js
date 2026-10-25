/* builderwidgets-20261021a: outside rooms, fit the Widgets and Properties panels to their contents (same measure as room-fit.js fitProps). */
(function(){
  if(window.__builderWidgets)return;window.__builderWidgets='builderwidgets-20261021a';
  function ui(){return document.getElementById('ui');}
  function room(){return document.documentElement.classList.contains('rb-room');}
  function cap(){var u=ui();var H=u?u.clientHeight:576;return Math.max(120,H-48-4);}
  function clear(p){if(p.classList.contains('bwfit')||p.classList.contains('bwscroll')){p.classList.remove('bwfit','bwscroll');p.style.removeProperty('height');}}
  function fit(p){
    if(!p)return;if(room()||p.classList.contains('collapsed')){clear(p);return;}
    var u=ui();if(u)u.style.setProperty('--rfmax',cap()+'px');
    var mx=0;[].forEach.call(p.children,function(c){if(c.id==='yTrx'||c.tagName==='STYLE'||c.tagName==='SCRIPT')return;if(!c.offsetParent&&getComputedStyle(c).position!=='fixed')return;var b=c.offsetTop+c.offsetHeight;if(b>mx)mx=b;});
    var t=p.querySelector('#yTrx');if(t&&!t.classList.contains('open')&&t.offsetParent){var b=t.offsetTop+(t.querySelector('.trxh')||t).offsetHeight;if(b>mx)mx=b;}
    if(!mx)return;var h=Math.ceil(mx+8),c=cap();p.classList.add('bwfit');if(p.classList.contains('bwscroll')!==(h>c))p.classList.toggle('bwscroll',h>c);
    var hv=Math.min(h,c)+'px';if(p.style.getPropertyValue('height')!==hv)p.style.setProperty('height',hv,'important');
  }
  function tick(){try{fit(document.querySelector('#ui > aside.panel.props'));fit(document.querySelector('#ui > aside.panel:not(.props)'));}catch(e){}}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;tick();},60);}
  new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  function obs(){var u=ui();if(!u){setTimeout(obs,500);return;}new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});tick();}
  obs();window.addEventListener('resize',soon);setInterval(tick,2000);
})();
