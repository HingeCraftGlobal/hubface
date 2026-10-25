/* roomfit-20261021a: room UI fixes (1) room box controls pinned to the right edge, (2) Photos/Videos header X at far right,
   (3) Widgets panel fits its contents (cap at viewport bottom, scroll past), (4) Properties panel fits its contents, transcript
   overlays it instead of stretching it, (5) transcript box resizable vertically from a bottom handle (height kept in sessionStorage). */
(function(){
  if(window.__roomFit)return;window.__roomFit='roomfit-20261021a';
  var css=[
  /* 1+2: right-anchored close controls */
  '#ui > section.rbbox > .ctl.fogbtn{left:auto!important;right:50px!important}',
  '#ui > section.rbbox > .ctl.boxmin{left:auto!important;right:32px!important}',
  '#ui > section.rbbox > .ctl.boxclose{left:auto!important;right:8px!important}',
  '#ui > .wbx[data-w=media] > .whead{width:100%;box-sizing:border-box}',
  '#ui > .wbx[data-w=media] > .whead > .wx{margin-left:auto;order:99}',
  '#ui > .wbx[data-w=media] > .whead > .wmin{order:98}#ui > .wbx[data-w=media] > .whead > .wfog{order:97}',
  /* 3: widgets panel fits */
  'html.rb-room #ui > aside.panel:not(.props):not(.collapsed){bottom:auto!important;height:auto!important;max-height:var(--rfmax,524px)!important;overflow:hidden!important}',
  'html.rb-room #ui > aside.panel:not(.props):not(.collapsed) > .rbwl{position:relative!important;top:auto!important;bottom:auto!important;left:auto!important;right:auto!important;margin:36px 6px 8px 8px;max-height:calc(var(--rfmax,524px) - 44px);overflow:auto}',
  /* 4: properties fits (height set by JS), transcript overlays */
  'html.rb-room #ui > aside.panel.props.rffit{bottom:auto!important;max-height:var(--rfmax,524px)!important}',
  'html.rb-room #ui > aside.panel.props.rffit.rfscroll{overflow-y:auto!important}',
  'html.rb-room #ui > aside.panel.props.rffit:not(.rfscroll){overflow:visible!important}',
  '#stage #ui aside.panel.props .trxsec.open{z-index:40;background:rgba(14,22,34,.94);border:1px solid rgba(var(--hub-blue-rgb,79,209,255),.5);border-radius:8px;padding:4px 5px 10px;box-shadow:0 6px 18px rgba(0,0,0,.45)}',
  /* 5: transcript bottom-edge handle */
  '#yTrx .rfgrip{display:none;position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;touch-action:none;pointer-events:auto!important;z-index:2}',
  '#yTrx.open .rfgrip{display:block}#yTrx .rfgrip:after{content:"";position:absolute;left:50%;top:2px;width:26px;margin-left:-13px;height:3px;border-radius:2px;background:rgba(255,255,255,.45)}',
  '#yTrx .rfgrip:hover:after,#yTrx.rfdrag .rfgrip:after{background:rgba(79,209,255,.95)}'
  ].join('\n');
  var st=document.createElement('style');st.id='roomfit-css';st.textContent=css;document.head.appendChild(st);
  var KEY='hf-trx-h',MINH=80;
  function ui(){return document.getElementById('ui');}
  function room(){return document.documentElement.classList.contains('rb-room');}
  function cap(){var u=ui();var H=u?u.clientHeight:576;return Math.max(120,H-48-4);}
  function fitProps(){
    var u=ui();if(u)u.style.setProperty('--rfmax',cap()+'px');
    var p=document.querySelector('#ui > aside.panel.props');if(!p)return;
    if(!room()||p.classList.contains('collapsed')){if(p.classList.contains('rffit')||p.classList.contains('rfscroll')){p.classList.remove('rffit','rfscroll');p.style.removeProperty('height');}return;}
    var mx=0;[].forEach.call(p.children,function(c){if(c.id==='yTrx'||c.tagName==='STYLE'||c.tagName==='SCRIPT')return;if(!c.offsetParent&&getComputedStyle(c).position!=='fixed')return;var b=c.offsetTop+c.offsetHeight;if(b>mx)mx=b;});
    var t=document.getElementById('yTrx');
    if(t&&!t.classList.contains('open')&&t.offsetParent){var b=t.offsetTop+(t.querySelector('.trxh')||t).offsetHeight;if(b>mx)mx=b;}
    var h=Math.ceil(mx+8),c=cap();if(!p.classList.contains('rffit'))p.classList.add('rffit');if(p.classList.contains('rfscroll')!==(h>c))p.classList.toggle('rfscroll',h>c);
    var hv=Math.min(h,c)+'px';if(p.style.getPropertyValue('height')!==hv)p.style.setProperty('height',hv,'important');
  }
  function scale(el){var r=el.getBoundingClientRect();return el.offsetHeight?r.height/el.offsetHeight:1;}
  function trxMax(t){var u=ui(),uh=u?u.clientHeight:576,ur=u?u.getBoundingClientRect():{top:0},s=scale(t),top=(t.getBoundingClientRect().top-ur.top)/s;return Math.max(MINH,Math.floor(uh-4-top));}
  function setTrxH(t,h){h=Math.round(Math.max(MINH,Math.min(trxMax(t),h)));t.style.setProperty('height',h+'px','important');return h;}
  function hookTrx(){
    var t=document.getElementById('yTrx');if(!t||t._rf)return;t._rf=1;
    var g=document.createElement('div');g.className='rfgrip';g.title='Drag to resize';t.appendChild(g);
    var sv=+sessionStorage.getItem(KEY)||0;if(sv)t.style.setProperty('height',sv+'px','important');
    var y0=0,h0=0,s=1,raf=0,ny=0;
    g.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();s=scale(t);y0=e.clientY;h0=t.offsetHeight;t.classList.add('rfdrag');try{g.setPointerCapture(e.pointerId);}catch(_){}} );
    g.addEventListener('pointermove',function(e){if(!t.classList.contains('rfdrag'))return;e.stopPropagation();ny=e.clientY;if(raf)return;raf=requestAnimationFrame(function(){raf=0;setTrxH(t,h0+(ny-y0)/s);});});
    function end(e){if(!t.classList.contains('rfdrag'))return;t.classList.remove('rfdrag');try{g.releasePointerCapture(e.pointerId);}catch(_){}try{sessionStorage.setItem(KEY,String(t.offsetHeight));}catch(_){}}
    g.addEventListener('pointerup',end);g.addEventListener('pointercancel',end);
    ['click','dblclick','mousedown'].forEach(function(ev){g.addEventListener(ev,function(e){e.stopPropagation();});});
  }
  function tick(){try{hookTrx();fitProps();}catch(e){}}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;tick();},60);}
  new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  function obsUi(){var u=ui();if(!u){setTimeout(obsUi,500);return;}new MutationObserver(soon).observe(u,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});tick();}
  obsUi();window.addEventListener('resize',soon);setInterval(tick,2000);
  window.__roomFit_tick=tick;
})();
