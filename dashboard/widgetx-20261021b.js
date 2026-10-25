/* widgetx-20261021b: keep header Read (.wr-btn) / extra header buttons left of fog/min/X, never overlapping */
/* colflicker-fix-20261024: no longer clears translate each tick (caused re-layout jump on right-column widgets); computes natural position from current offset and writes only if changed */
(function(){function fix(){try{document.querySelectorAll('#ui > section.box:not(.ava), .wbx.open').forEach(function(bx){
 var ctl=bx.querySelector(':scope > .fogbtn, .whead > .wfog');if(!ctl)return;var cr=ctl.getBoundingClientRect();if(!cr.width)return;
 bx.querySelectorAll('.wr-btn').forEach(function(w){var r=w.getBoundingClientRect();if(!r.width)return;var s=(w.offsetWidth?r.width/w.offsetWidth:1)||1;
  var cur=parseFloat(w.style.translate)||0;var L=r.left-cur*s,R=r.right-cur*s;var want='';
  if(r.top<cr.bottom&&r.bottom>cr.top&&R>cr.left-3){want=(-Math.ceil((R-cr.left+4)/s))+'px 0';}
  if((w.style.translate||'')!==want){w.style.translate=want;}});
 });}catch(e){}}
 setInterval(fix,1200);window.addEventListener('resize',fix);document.addEventListener('DOMContentLoaded',fix);})();
