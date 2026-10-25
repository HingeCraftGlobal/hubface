/* botbarx-20261021a: Expand/Collapse the bot bar button on the agent-panel clone bars (Professor, Moderator, Mara, Theo:
   section.ava.hfap[data-agent]). Same behaviour as Finn's #vbBar: collapsed = face + toggle only; label/aria/pressed follow.
   State per bar in localStorage hinge-vb-col-<agent>. Roll back: remove the <script src="botbar-expand.js"> tag. */
(function(){
  "use strict";
  var IN='M3 3l6 6M9 4v5H4M21 3l-6 6M15 4v5h5M3 21l6-6M4 15h5v5M21 21l-6-6M20 15h-5v5',OUT='M9 9L3 3M3 8V3h5M15 9l6-6M16 3h5v5M9 15l-6 6M3 16v5h5M15 15l6 6M21 16v5h-5';
  var st=document.createElement('style');
  st.textContent='#ui > section.ava.hfap > .vbmin,#ui > section.ava.hfap > .vbmin *{pointer-events:auto!important;cursor:pointer}'+
    '#ui > section.ava.hfap.vbcol{width:72px!important;height:60px!important;min-width:0!important}'+
    '#ui > section.ava.hfap.vbcol > :not(.portrait):not(.vbmin){display:none!important}'+
    '#ui > section.ava.hfap.vbcol > .vbmin{left:53px!important;top:6px!important;right:auto!important}'+
    '#ui > section.ava.hfap.vbcol > .portrait{cursor:pointer}';
  document.head.appendChild(st);
  function wire(bar){
    if(bar.__bbx)return;var b=bar.querySelector(':scope > .vbmin');if(!b)return;bar.__bbx=1;
    var id=bar.getAttribute('data-agent')||bar.id||'agent',KEY='hinge-vb-col-'+id,face=bar.querySelector(':scope > .portrait');
    var nm=(face&&face.alt)||id;
    function col(){return bar.classList.contains('vbcol');}
    function sync(){var c=col();b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(c?OUT:IN)+'"/></svg>';
      var t=c?'Expand the bot bar':'Collapse the bot bar';b.title=t;b.setAttribute('aria-label',t);b.setAttribute('aria-pressed',c?'true':'false');
      if(face)face.title=c?nm+' (click to expand)':nm;}
    function set(c){bar.classList.toggle('vbcol',!!c);try{localStorage.setItem(KEY,c?'1':'0');}catch(e){}sync();}
    bar.classList.remove('vbcol');try{if(localStorage.getItem(KEY)==='1')bar.classList.add('vbcol');}catch(e){}
    sync();
    b.addEventListener('pointerdown',function(e){e.stopPropagation();});
    b.addEventListener('dblclick',function(e){e.stopPropagation();e.preventDefault();});
    b.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();set(!col());});
    if(face){var down=null;face.addEventListener('pointerdown',function(e){down={x:e.clientX,y:e.clientY};},true);
      face.addEventListener('click',function(e){if(!down||!col())return;var mv=Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y);down=null;if(mv<=4)set(false);});}
    bar.__bbxSet=set;
  }
  function scan(){[].forEach.call(document.querySelectorAll('#ui > section.ava.hfap'),wire);}
  function boot(){var ui=document.getElementById('ui');scan();if(ui)new MutationObserver(scan).observe(ui,{childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
