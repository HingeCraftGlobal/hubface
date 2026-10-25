/* widgetpicker-20261021b (Dan): (1) row X uses the room glyph; (2) one click on a Widget Picker item moves it to the row AND opens it.
   Roll back: /opt/hubface/backups/widgetpicker-20261021b/ROLLBACK.sh */
(function(){
  if(window.__widgetPickerB)return;window.__widgetPickerB='widgetpicker-20261021b';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function glyph(){[].forEach.call(document.querySelectorAll('#ui .blist .dwx'),function(x){if(x.textContent!=='\u2715')x.textContent='\u2715';});}
  document.addEventListener('click',function(e){if(room()||!e.isTrusted)return;var t=e.target.closest&&e.target.closest('#ui .blist > .build.dwother');
    if(!t||t.dataset.bot||e.target.closest('.bdel,.dwx,input'))return;
    setTimeout(function(){if(t.isConnected&&!t.classList.contains('dwother'))t.click();},60);},true);
  var q=0;function init(){var l=document.querySelector('#ui .blist');if(!l){setTimeout(init,500);return;}glyph();
    new MutationObserver(function(){if(q)return;q=setTimeout(function(){q=0;glyph();},50);}).observe(l,{subtree:true,childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
