/* widgetfix-20261021c2 (Dan, xplain-20261021a): main Dashboard Builder only. Keeps ONLY the duplicate WIDGET PICKER title hide.
   Removed: red .wfcx X's on bot rows and left sidebar (added today), and the bot-row hide. Also removes leftover .wfx/.wfcx nodes. Roll back: /opt/hubface/backups/xplain-20261021a/ROLLBACK.sh */
(function(){
  if(window.__widgetFixC2)return;window.__widgetFixC2='widgetfix-20261021c2';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function css(){if(document.getElementById('wfc2-css'))return;var s=document.createElement('style');s.id='wfc2-css';
    s.textContent='html:not(.rb-room) #ui > section.box[data-float="other"] > header > b,html:not(.rb-room) #ui > section.box[data-float="other"] > header > .pen{visibility:hidden!important}';
    document.head.appendChild(s);}
  function clean(){if(room())return;[].forEach.call(document.querySelectorAll('#ui .wfx,#ui .wfcx'),function(x){x.remove();});}
  function init(){css();clean();setTimeout(clean,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
