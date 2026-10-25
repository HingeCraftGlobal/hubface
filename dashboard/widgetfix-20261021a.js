/* widgetfix-20261021a (Dan): (1) window X on the 8 picker widgets also returns the tile to the Widget Picker; (2) YOUR ROW head hidden,
   arrangement autosaves to hf-dash-row-v1 on every change (presses dash-row's own Save). No mic code. Roll back: /opt/hubface/backups/widgetfix-20261021a/ROLLBACK.sh */
(function(){
  if(window.__widgetFix)return;window.__widgetFix='widgetfix-20261021a';
  var M={family:'family vault',canvas:'life canvas board',fitness:'fitness',pets:'pet vault',recipes:'my recipe book',business:'business',lab:'lab',career:'career'};
  function room(){return document.documentElement.classList.contains('rb-room');}
  function L(){return document.querySelector('#ui .blist');}
  function tile(n){var l=L();return l&&[].filter.call(l.querySelectorAll(':scope > .build'),function(t){var b=t.querySelector(':scope > b');return b&&b.textContent.trim().toLowerCase()===n;})[0];}
  document.addEventListener('click',function(e){if(room())return;var x=e.target.closest&&e.target.closest('#ui > .wbx > .whead > .wx');if(!x)return;
    var w=x.closest('.wbx').getAttribute('data-w'),n=M[w]||null;if(!n){var b=x.closest('.wbx').querySelector('.wtitle');n=b&&b.textContent.trim().toLowerCase();}
    setTimeout(function(){var t=n&&tile(n);if(t&&!t.classList.contains('dwother')){var d=t.querySelector(':scope > .dwx');if(d)d.click();}},30);},true);
  var q=0;function autosave(){if(q)return;q=setTimeout(function(){q=0;var l=L();if(!l||room())return;var h=l.querySelector(':scope > .dwhead .dwhint'),s=l.querySelector(':scope > .dwhead .dwsave');
    if(s&&h&&h.style.visibility==='visible')s.click();},400);}
  function fit(){if(room())return;var b=document.querySelector('#ui > section.box[data-float="other"]');if(!b||b.classList.contains('closed')||!b.offsetHeight)return;
    var r=b.getBoundingClientRect(),k=r.height/b.offsetHeight||1,over=r.bottom-(innerHeight-8);if(over>1){var t=parseFloat(b.style.top)||0;b.style.top=Math.max(40,t-over/k)+'px';}}
  function init(){var l=L();setInterval(fit,1000);addEventListener('resize',fit);if(!l){setTimeout(init,500);return;}
    new MutationObserver(autosave).observe(l,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});setInterval(autosave,3000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
