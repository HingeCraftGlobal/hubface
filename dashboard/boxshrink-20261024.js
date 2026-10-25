/* boxshrink-20261024 (Dan): shrink the blue Properties panel vertically. Every absolutely placed row below the title (top>=60)
   is moved up to 60+(top-60)*0.9. Original tops are remembered, so re-runs (props-tight etc.) never compound. Writes only when changed.
   Panel height then follows automatically (builderwidgets fit). Roll back: remove the boxshrink-20261024 script tag in index.html. */
(function(){if(window.__boxShrink)return;window.__boxShrink=1;var K=0.9,B=60;
  function run(){var pr=document.querySelector('#ui > aside.panel.props');if(!pr||document.documentElement.classList.contains('rb-room')||pr.classList.contains('collapsed'))return;
    [].forEach.call(pr.children,function(c){if(c.tagName==='STYLE'||c.tagName==='SCRIPT')return;var cs=getComputedStyle(c);if(cs.position!=='absolute')return;
      var cur=parseFloat(cs.top);if(!isFinite(cur))return;
      if(c.__bsSet===undefined||Math.abs(cur-c.__bsSet)>0.5){c.__bsOrig=cur;}  /* someone else placed it: take that as the new original */
      var o=c.__bsOrig;if(o<B){c.__bsSet=cur;return;}var v=Math.round((B+(o-B)*K)*10)/10;
      if(Math.abs(cur-v)>0.5)c.style.setProperty('top',v+'px','important');c.__bsSet=v;});}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},80);}
  function init(){if(!document.getElementById('ui')){setTimeout(init,400);return;}run();setTimeout(run,1300);setTimeout(run,4200);setInterval(run,2000);
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();
