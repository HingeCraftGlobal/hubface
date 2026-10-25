/* botrow-20261021b: pack Auto fog + Collapse right after Hang up on every bot panel (no gaps). Rollback: ROLLBACK-botrow.sh */
(function(){function fix(){[].forEach.call(document.querySelectorAll('#ui > section.ava'),function(s){if(!s.offsetParent)return;
 var a=s.querySelector('.abtns'),f=s.querySelector(':scope > .fogbtn'),m=s.querySelector(':scope > .vbmin');if(!a)return;
 var is=[].filter.call(a.children,function(e){return e.offsetWidth;});if(!is.length)return;var last=is[is.length-1];
 var sr=s.getBoundingClientRect(),lr=last.getBoundingClientRect(),sc=sr.width/(s.offsetWidth||sr.width)||1;
 var x=(lr.right-sr.left)/sc-s.clientLeft,y=(lr.top-sr.top)/sc-s.clientTop;
 [f,m].forEach(function(e){if(!e||!e.offsetWidth)return;var l=Math.round(x)+'px';if(e.style.left!==l)e.style.setProperty('left',l,'important');e.style.setProperty('right','auto','important');x+=e.offsetWidth;});});}
 window.__hfBotRow={build:'botrow-20261021b',fix:fix};setInterval(fix,700);addEventListener('resize',fix);})();
