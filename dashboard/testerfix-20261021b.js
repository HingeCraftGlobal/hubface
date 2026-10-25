/* testerfix-20261021b (Tester signed-in retest of testerfix-a, Oct 21 2026). Client-side only.
   (1) Typed "Moderator/Professor/Mara/Theo ..." in room chat: the line is shown locally (not sent to the room server, so Yoda's
       webhook never sees it) and the woken bot's scripted reply is added as a chat line "<Bot>: ..." (voice via wakeall as before).
       Runs on window capture so testerfix-a's handler for the same line does not also fire.
   (2) Bot panels (.hfap: Moderator, Professor, Mara, Theo): if two overlap, the later one is moved below/next to the other.
   (3) Pic box (App.wins.pic): kept below the "Room open" timer card (#rtBox) and above the room bar (#rbBar).
   (4) yoda-transcript.json signed in: answered locally with an empty transcript once its 404 has been seen in this browser
       (shared memo with testerfix-a-head) - see testerfix-20261021b-head.js for the first-hit case.
   Roll back: ROLLBACK-testerfixb.sh */
(function(){
  'use strict';if(window.__testerfixB)return;
  var S=window.__testerfixB={build:'testerfix-20261021b',wakes:[],moved:0,pic:0};
  function App(){return window.__rb&&window.__rb.App;}
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  var WRE=/^\s*(?:(?:hey|hi|hello|ok|okay|yo)\s+)?(?:the\s+)?(moderator|moderater|professor|prof|mara|maura|theo|teo)\b[\s,.!?:]*(.*)$/i;
  var MAP={moderator:'moderator',moderater:'moderator',professor:'professor',prof:'professor',mara:'companion-f',maura:'companion-f',theo:'companion-m',teo:'companion-m'};
  var NAME={moderator:'Moderator',professor:'Professor','companion-f':'Mara','companion-m':'Theo'};
  function panelCur(){try{return window.HF_agentPanel&&window.HF_agentPanel.current();}catch(e){return null;}}
  function line(txt,me){var A=App();if(!A)return;try{A.chatLine('roomChat',txt,me,true);}catch(_){}}
  function wake(v){var m=WRE.exec(v);if(!m)return false;var id=MAP[m[1].toLowerCase()],nm=NAME[id];
    line(v,true);S.wakes.push({id:id,at:Date.now()});
    var inList=false;try{inList=typeof window.HF_roomBots==='function'&&window.HF_roomBots().indexOf(id)>=0;}catch(_){}
    if(!inList&&typeof window.HF_inviteBot==='function'){try{window.HF_inviteBot(id);}catch(_){}}
    try{if(id==='professor'&&window.HF_professor){var c=panelCur();if(!(c&&c.id==='professor'))window.HF_professor.open();}}catch(_){}
    var got=null,W=window.__hfWakeAll,ot=window.__trxAdd;
    window.__trxAdd=function(who,text){if(got==null)got=text;if(typeof ot==='function')try{return ot.apply(this,arguments);}catch(_){}};
    try{if(W&&W.hear)W.hear(v);}catch(_){}
    window.__trxAdd=ot;
    if(got==null){var b=W&&W.bots&&W.bots.filter(function(x){return x.name===nm;})[0];
      if(b)got=(b.hi&&(!m[2]||/\b(how|hello|hi|hey|there|good)\b/i.test(m[2])))?b.hi[0]:b.other;}
    line(nm+': '+(got||nm+' here. I\u2019m listening.'),false);
    return true;}
  function grab(e,inp){if(!inRm()||!inp)return;var v=inp.value.trim();if(!v||!WRE.test(v))return;
    e.preventDefault();e.stopImmediatePropagation();inp.value='';wake(v);}
  window.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.id==='rb_rcIn')grab(e,e.target);},true);
  window.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#rb_rcSend');if(b)grab(e,document.getElementById('rb_rcIn'));},true);
  /* (2) panel stacking */
  function ov(a,b){return a.left<b.right-4&&b.left<a.right-4&&a.top<b.bottom-4&&b.top<a.bottom-4;}
  function stack(){var bars=[].filter.call(document.querySelectorAll('.hfap'),function(x){return x.offsetParent!==null;});
    for(var i=1;i<bars.length;i++)for(var j=0;j<i;j++){var a=bars[j].getBoundingClientRect(),r=bars[i].getBoundingClientRect();
      if(!ov(a,r))continue;var top=a.bottom+8,left=r.left;
      if(top+r.height>innerHeight-8){top=Math.max(8,a.top);left=a.right+8;if(left+r.width>innerWidth-8)left=Math.max(8,a.left-r.width-8);}
      var dx=left-r.left,dy=top-r.top;bars[i].style.left=(bars[i].offsetLeft+dx)+'px';bars[i].style.top=(bars[i].offsetTop+dy)+'px';S.moved++;r=bars[i].getBoundingClientRect();}}
  /* (3) Pic box clear of #rtBox and #rbBar */
  function pic(){var A=App(),w=A&&A.wins&&A.wins.pic;if(!w||!w.isConnected||w.offsetParent===null)return;
    var r=w.getBoundingClientRect(),t=document.getElementById('rtBox'),bar=document.getElementById('rbBar');
    var tr=t&&t.offsetParent!==null?t.getBoundingClientRect():null,br=bar&&bar.offsetParent!==null?bar.getBoundingClientRect():null;
    var minTop=tr&&ov(tr,r)?tr.bottom+8:null,maxBot=br&&br.top>0&&r.bottom>br.top-4&&r.top<br.top?br.top-8:null;
    if(minTop==null&&maxBot==null)return;var dy=0;
    if(minTop!=null)dy=minTop-r.top;
    if(maxBot!=null&&r.bottom+dy>maxBot){var need=r.bottom+dy-maxBot;if(minTop==null){dy-=need;}else{w.style.height=Math.max(160,r.height-need)+'px';}}
    if(dy){w.style.top=(w.offsetTop+dy)+'px';}S.pic++;}
  setInterval(function(){try{stack();}catch(_){}try{pic();}catch(_){}},1000);
})();
