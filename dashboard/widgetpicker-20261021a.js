/* widgetpicker-20261021a (Dan): main page only (not rooms). The Dashboard Builder box (was OTHER) is now the WIDGET PICKER category;
   the 'Other Widgets' divider inside it is renamed Widget Picker, so inactive widgets live under Widget Picker; row X = 'Move to Widget Picker'. '+ Name your own widget' shown inside Widget Picker (flex order only, DOM untouched).
   Labels only: same elements, same dash-row.js behaviour/saving. Roll back: /opt/hubface/backups/widgetpicker-20261021a/ROLLBACK.sh */
(function(){
  if(window.__widgetPicker)return;window.__widgetPicker='widgetpicker-20261021a';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function run(){if(room())return;
    var l=document.querySelector('#ui section.box .blist');var bx=l&&l.closest('section.box');
    if(bx){var h=bx.querySelector(':scope > header > b');if(h&&h.textContent!=='WIDGET PICKER')h.textContent='WIDGET PICKER';
      var c=bx.querySelector(':scope > .boxclose');if(c&&c.title!=='Close Widget Picker'){c.title='Close Widget Picker';c.setAttribute('aria-label',c.title);}}
    var d=document.querySelector('#ui .blist .dwdiv > span');if(d&&d.textContent!=='WIDGET PICKER')d.textContent='WIDGET PICKER';
    [].forEach.call(document.querySelectorAll('#ui .blist .build:not(.dwother) > .dwx'),function(x){if(x.title!=='Move to Widget Picker'){x.title='Move to Widget Picker';x.setAttribute('aria-label',x.title);}});
    [].forEach.call(document.querySelectorAll('#ui > aside.panel:not(.props) > .witem > span'),function(s){if(/^\s*Other\s*\/\s*Widget\s*$/i.test(s.textContent))s.textContent='Widget Picker';});}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},60);}
  function css(){if(document.getElementById('wpk-css'))return;var st=document.createElement('style');st.id='wpk-css';st.textContent='html:not(.rb-room) #ui .blist > .dwdiv{order:1}html:not(.rb-room) #ui .blist > .bnew{order:2}html:not(.rb-room) #ui .blist > .build.dwother{order:3}';document.head.appendChild(st);}
  function init(){css();var u=document.getElementById('ui');if(!u){setTimeout(init,500);return;}
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,characterData:true});run();setInterval(run,2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
