/* widgetx-20261021a: keep header Read (.wr-btn) / extra header buttons left of fog/min/X, never overlapping */
(function(){function fix(){try{document.querySelectorAll('#ui > section.box:not(.ava), .wbx.open').forEach(function(bx){
 var ctl=bx.querySelector(':scope > .fogbtn, .whead > .wfog');if(!ctl)return;var cr=ctl.getBoundingClientRect();if(!cr.width)return;
 bx.querySelectorAll('.wr-btn').forEach(function(w){w.style.translate='';var r=w.getBoundingClientRect();
  if(r.width&&r.top<cr.bottom&&r.bottom>cr.top&&r.right>cr.left-3){var s=(w.offsetWidth?r.width/w.offsetWidth:1)||1;w.style.translate=(-Math.ceil((r.right-cr.left+4)/s))+'px 0';}});
 });}catch(e){}}
 setInterval(fix,1200);window.addEventListener('resize',fix);document.addEventListener('DOMContentLoaded',fix);})();
