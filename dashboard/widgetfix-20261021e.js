/* widgetfix-20261021e (Dan, xplain-20261021e): main Dashboard Builder only (nothing on html.rb-room).
   '+ Add to bar' on Widget Picker rows is a real button (.wfeadd): click = dash-row toRow(name) + save, no widget opens; row then shows '\u2713 In bar'.
   Clicking the row name elsewhere is unchanged. Roll back: /opt/hubface/backups/xplain-20261021e/ROLLBACK.sh */
(function(){
  if(window.__widgetFixE)return;window.__widgetFixE='widgetfix-20261021e';
  function room(){return document.documentElement.classList.contains('rb-room');}
  var SEL='#ui > section.box[data-float="other"] .blist > .build.dwother > .wfeadd';
  function btn(e){if(room())return null;return e.target&&e.target.closest?e.target.closest(SEL):null;}
  function act(b){var t=b.parentNode,n=t.querySelector(':scope > b'),R=window.__dashRow;if(!n||!R)return;try{R.toRow(n.textContent.trim());if(R.save)R.save();}catch(err){}}
  var last=0;
  ['pointerdown','mousedown','touchstart','mouseup'].forEach(function(t){window.addEventListener(t,function(e){if(btn(e)){e.stopPropagation();e.stopImmediatePropagation();}},true);});
  window.addEventListener('pointerup',function(e){var b=btn(e);if(!b)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();last=Date.now();act(b);},true);
  window.addEventListener('click',function(e){var b=btn(e);if(!b)return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();if(Date.now()-last>700)act(b);},true);
  function run(){if(room())return;var l=document.querySelector('#ui > section.box[data-float="other"] .blist');if(!l)return;
    [].forEach.call(l.querySelectorAll(':scope > .build'),function(t){var a=t.querySelector(':scope > .wfeadd'),o=t.classList.contains('dwother');
      if(o&&!a){a=document.createElement('span');a.className='wfeadd';a.setAttribute('role','button');a.textContent='+ Add to bar';a.title='Add to bar';t.appendChild(a);}
      else if(!o&&a)a.remove();});}
  function css(){if(document.getElementById('wfe-css'))return;var s=document.createElement('style');s.id='wfe-css';
    var P='html:not(.rb-room) #ui > section.box[data-float="other"] .blist > .build.dwother';
    s.textContent=P+'::after{content:none!important}'+P+' > .wfeadd{margin-left:auto;padding:2px 6px;font-size:11px;color:#fff;opacity:.8;white-space:nowrap;cursor:pointer!important;pointer-events:auto!important;position:relative;z-index:3;border-radius:4px;background:transparent}'+P+' > .wfeadd:hover{opacity:1;background:rgba(255,255,255,.12)}';
    document.head.appendChild(s);}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;try{run();}catch(e){}},60);}
  function init(){var u=document.getElementById('ui');if(!u){setTimeout(init,400);return;}css();
    new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});run();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
