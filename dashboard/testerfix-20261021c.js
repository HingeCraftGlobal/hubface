/* testerfix-20261021c (Tester real-room retest of testerfix-b, Oct 21 2026). Client-side only. Event/observer driven (no guess poll).
   (2) Companion panel (.hfcp, companion.js: fixed right:16px bottom:90px w340) vs Moderator panel (#hfMod, moderator.js: fixed
       right:16px top:90px w260): while #hfMod is shown, .hfcp docks to its LEFT (right edge 12px left of #hfMod's measured left edge). If the window is too
       narrow for both side by side (<720px), .hfcp is capped to end above #hfMod's top... i.e. placed below it with max-height to fit.
   (3) Pic box (App.wins.pic): grown to fit its Brightness/filter row, then placed below #rtBox ("Room open" timer card,
       room-timer.js) and above #rbBar; if there is no vertical room, moved beside #rtBox. Re-run on open/resize/drag of either.
   (5) Invite bot list (#rxBotPick, room-extras.js): clicking an already-invited bot's name does nothing; only its "Remove" removes.
   (6) "Mic blocked" pill (.vl-pill): lifted clear of the room bar Invite bot button (#rx_yoda) / #rbBar.
   Roll back: ROLLBACK-testerfixc.sh */
(function(){
  'use strict';if(window.__testerfixC)return;
  var S=window.__testerfixC={build:'testerfix-20261021c',dock:0,pic:0,inviteBlocked:0,pill:0};
  function vis(e){if(!e||!e.isConnected)return false;var cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return false;var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}
  function ov(a,b){return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;}
  var st=document.createElement('style');st.id='tfc-css';
  st.textContent='html.tfc-mod .hfcp{right:var(--tfc-cpright,300px)!important}'+
    'html.tfc-mod.tfc-narrow .hfcp{right:16px!important;bottom:auto!important;top:var(--tfc-cptop,90px)!important;max-height:var(--tfc-cpmax,50vh)!important}'+
    '#rxBotPick button[data-id] > span:last-child{padding:1px 6px;border-radius:6px}'+
    '#rxBotPick button[data-tfc-on] > span:last-child{background:#6b2a33;cursor:pointer}#rxBotPick button[data-tfc-on]{cursor:default!important}';
  document.head.appendChild(st);
  /* (2) */
  function dock(){var m=document.getElementById('hfMod'),on=vis(m),H=document.documentElement;
    H.classList.toggle('tfc-mod',on);var narrow=on&&innerWidth<720;H.classList.toggle('tfc-narrow',narrow);
    if(on&&!narrow){H.style.setProperty('--tfc-cpright',Math.round(innerWidth-m.getBoundingClientRect().left+12)+'px');}
    if(narrow){var r=m.getBoundingClientRect();H.style.setProperty('--tfc-cptop',Math.round(r.bottom+10)+'px');H.style.setProperty('--tfc-cpmax',Math.max(120,Math.round(innerHeight-r.bottom-100))+'px');}
    S.dock++;}
  /* (3) */
  function App(){return window.__rb&&window.__rb.App;}
  function picWin(){var A=App(),w=A&&A.wins&&A.wins.pic;if(w&&w.isConnected)return w;var pb=document.getElementById('rb_pb');return pb&&pb.closest?(pb.closest('.win,.rbwin,[data-k="pic"]')||null):null;}
  var busy=false;
  function pic(){if(busy)return;var w=picWin();if(!vis(w))return;busy=true;try{
    var sc=w.offsetHeight?w.getBoundingClientRect().height/w.offsetHeight:1;
    /* grow to fit content (testerfix-a let the body overflow) */
    var r=w.getBoundingClientRect(),cb=r.bottom;[].forEach.call(w.querySelectorAll('#rb_pb,#rb_pfl,.row,button'),function(e){if(vis(e))cb=Math.max(cb,e.getBoundingClientRect().bottom+8);});
    if(cb>r.bottom+1){w.style.height=Math.ceil((r.height+(cb-r.bottom))/sc)+'px';r=w.getBoundingClientRect();}
    var t=document.getElementById('rtBox'),tr=vis(t)?t.getBoundingClientRect():null,bar=document.getElementById('rbBar'),br=vis(bar)?bar.getBoundingClientRect():null;
    var floor=br?br.top-8:innerHeight-8,dx=0,dy=0;
    if(tr&&ov(tr,r)){
      if(tr.bottom+8+r.height<=floor)dy=tr.bottom+8-r.top;
      else{dx=(tr.left-8-r.width>=0)?(tr.left-8-r.right):(tr.right+8-r.left);if(r.bottom>floor)dy=floor-r.bottom;}
    }else if(r.bottom>floor)dy=Math.max(floor-r.bottom,(tr&&tr.left<r.right&&r.left<tr.right&&tr.bottom<r.top?tr.bottom+8:8)-r.top);
    if(dx||dy){w.style.left=(w.offsetLeft+dx/sc)+'px';w.style.top=(w.offsetTop+dy/sc)+'px';S.pic++;}
  }finally{busy=false;}}
  /* (6) */
  function pill(){var y=document.getElementById('rx_yoda'),bar=document.getElementById('rbBar');var tgt=vis(y)?y:(vis(bar)?bar:null);
    document.querySelectorAll('.vl-pill').forEach(function(p){if(!/mic blocked|microphone/i.test(p.textContent||''))return;
      var cur=+p.getAttribute('data-tfc-dy')||0,want=0;
      if(tgt&&vis(p)){var r=p.getBoundingClientRect(),q=tgt.getBoundingClientRect(),b=vis(bar)?bar.getBoundingClientRect():q;
        var base={left:r.left,right:r.right,top:r.top-cur,bottom:r.bottom-cur};
        if(ov(base,q)||ov(base,b))want=-Math.round(base.bottom-Math.min(q.top,b.top)+8);}
      if(want!==cur){if(want)p.style.setProperty('transform','translateY('+want+'px)');else p.style.removeProperty('transform');p.setAttribute('data-tfc-dy',String(want));S.pill++;}});}
  /* (5) */
  document.addEventListener('click',function(e){var p=document.getElementById('rxBotPick');if(!p||!p.contains(e.target))return;
    var b=e.target.closest('button[data-id]');if(!b)return;var act=b.lastElementChild;
    if(act&&/^(Remove|हटाएँ)$/.test((act.textContent||'').trim())&&!act.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();S.inviteBlocked++;}},true);
  function markPick(){var p=document.getElementById('rxBotPick');if(!p)return;[].forEach.call(p.querySelectorAll('button[data-id]'),function(b){var a=b.lastElementChild;if(a&&/^Remove$/.test(a.textContent.trim()))b.setAttribute('data-tfc-on','');});}
  /* scheduling: one rAF after any relevant DOM change / resize */
  var q=0;function run(){q=0;try{dock();}catch(_){}try{pic();}catch(_){}try{pill();}catch(_){}try{markPick();}catch(_){}}
  function kick(){if(!q)q=requestAnimationFrame(run);}
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target;
      if(ms[i].type==='childList'||(t&&t.id&&/^(hfMod|rtBox|rbBar|rx_yoda)$/.test(t.id))||(t&&t.classList&&(t.classList.contains('hfcp')||t.classList.contains('vl-pill')))||(t&&t===picWin())){kick();return;}}})
    .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
  addEventListener('resize',kick);addEventListener('pointerup',function(){setTimeout(kick,30);},true);
  kick();
})();
