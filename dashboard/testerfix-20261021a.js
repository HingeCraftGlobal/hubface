/* testerfix-20261021a (Tester retest fails + Dan-approved prep-card dedupe, Oct 21 2026). Client-side only.
   (1) Pic box: grows the Photo widget box so Brightness + filter row are visible (no inner scrollbar).
   (2) Typed "Moderator ..." / "Professor ..." / "Mara ..." / "Theo ..." in room chat wakes that bot (invites it if not in the room,
       else it answers via the shared wakeall voice path), like typed Finn / Ava.
   (3) Invite bot menu: Mara (companion-f) and Theo (companion-m) listed by name and live; inviting opens their panel.
   (6) Room title: typed title is committed immediately (Enter / blur / leaving the field / entering the room), not after a
       700-900 ms debounce, so "QA-TEST3" no longer ends up as "Untitled room".
   (8) Moderator panel: the duplicate Prep card icon (notes icon, same action as the gear) is hidden; the gear stays.
   Roll back: ROLLBACK-testerfix.sh */
(function(){
  'use strict';if(window.__testerfix)return;
  var S=window.__testerfix={build:'testerfix-20261021a',pic:0,wakes:[],title:0,prep:0};
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  function App(){return window.__rb&&window.__rb.App;}
  /* (3) Mara / Theo */
  var NM={'companion-f':'Mara','companion-m':'Theo'};
  function fixList(){var B=window.HF_INVITABLE_BOTS;if(!Array.isArray(B))return;
    Object.keys(NM).forEach(function(id){var b=B.filter(function(x){return x.id===id;})[0];if(!b){B.push({id:id,name:NM[id]});}else{b.name=NM[id];b.soon=false;}});}
  fixList();setInterval(fixList,1500);
  var st=document.createElement('style');st.id='tf-css';st.textContent='#rxSoon_companion-f,#rxSoon_companion-m{display:none!important}';document.head.appendChild(st);
  function panelCur(){try{return window.HF_agentPanel&&window.HF_agentPanel.current();}catch(e){return null;}}
  addEventListener('hf:bot-invite',function(e){var id=e.detail&&e.detail.id;if(!NM[id])return;setTimeout(function(){try{var c=panelCur();if(!(c&&c.id===id))window.__hfCompanion.open(id);}catch(_){}},150);});
  addEventListener('hf:bot-remove',function(e){var id=e.detail&&e.detail.id;if(!NM[id])return;try{var c=panelCur();if(c&&c.id===id)window.HF_agentPanel.close();}catch(_){}});
  /* (2) typed wake in room chat */
  var WRE=/^\s*(?:(?:hey|hi|hello|ok|okay|yo)\s+)?(?:the\s+)?(moderator|moderater|professor|prof|mara|maura|theo|teo)\b[\s,.!?:]*(.*)$/i;
  var MAP={moderator:'moderator',moderater:'moderator',professor:'professor',prof:'professor',mara:'companion-f',maura:'companion-f',theo:'companion-m',teo:'companion-m'};
  function typed(v){if(!inRm()||!v)return;var m=WRE.exec(v);if(!m)return;var id=MAP[m[1].toLowerCase()];S.wakes.push({id:id,at:Date.now()});
    var inList=false;try{inList=typeof window.HF_roomBots==='function'&&window.HF_roomBots().indexOf(id)>=0;}catch(_){}
    setTimeout(function(){
      if(!inList&&typeof window.HF_inviteBot==='function'){window.HF_inviteBot(id);return;}
      try{if(id==='professor'&&window.HF_professor){var c=panelCur();if(!(c&&c.id==='professor'))window.HF_professor.open();}}catch(_){}
      try{if(window.__hfWakeAll&&window.__hfWakeAll.hear)window.__hfWakeAll.hear(v);}catch(_){}
    },60);}
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.id==='rb_rcIn')typed(e.target.value.trim());},true);
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#rb_rcSend');if(b){var i=document.getElementById('rb_rcIn');if(i)typed(i.value.trim());}},true);
  /* (6) title commit */
  var TSEL='.hrbt,#rb_aT';
  function commit(el){var A=App();if(!A||!el)return;var v=String(el.value||'').trim();if(!v)return;var r=A.state.room;if(r.title===v)return;r.title=v;S.title++;try{A.applyRoom();}catch(_){}}
  function commitAll(){[].forEach.call(document.querySelectorAll(TSEL),function(el){if(el.offsetParent!==null||el.value)commit(el);});}
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches&&e.target.matches(TSEL))commit(e.target);},true);
  document.addEventListener('change',function(e){if(e.target.matches&&e.target.matches(TSEL))commit(e.target);},true);
  document.addEventListener('focusout',function(e){if(e.target.matches&&e.target.matches(TSEL))commit(e.target);},true);
  document.addEventListener('pointerdown',function(e){var a=document.activeElement;if(a&&a.matches&&a.matches(TSEL)&&e.target!==a)commit(a);},true);
  (function wrapEnter(n){var A=App();if(!A||typeof A.enter!=='function'){if(n<40)setTimeout(function(){wrapEnter(n+1);},250);return;}
    [A,window.__rb].forEach(function(o){if(!o||typeof o.enter!=='function'||o.enter.__tf)return;var f=o.enter,g=function(){try{commitAll();}catch(_){}return f.apply(this,arguments);};g.__tf=1;o.enter=g;});})(0);
  /* (1) Pic box + (8) prep card, checked every second */
  function picFix(){var pb=document.getElementById('rb_pb');if(!pb||!pb.offsetParent)return;
    var el=pb.parentElement,box=null;
    for(var x=pb.parentElement;x&&x!==document.body;x=x.parentElement){var cs=getComputedStyle(x);
      if(/(auto|scroll)/.test(cs.overflowY)&&x.scrollHeight>x.clientHeight+2){var d=x.scrollHeight-x.clientHeight;
        var outer=x;for(var y=x;y&&y!==document.body;y=y.parentElement){if(y.style&&y.style.height){outer=y;break;}}
        if(outer!==x&&outer.style.height){outer.style.height=(parseFloat(outer.style.height)+d+2)+'px';}
        else{x.style.overflowY='visible';x.style.height='auto';x.style.maxHeight='none';}
        S.pic++;break;}}}
  function prepFix(){var bar=document.getElementById('hfap-moderator');if(!bar)return;
    var ic=[].filter.call(bar.querySelectorAll('i[title="Prep card"],button[title="Prep card"]'),function(i){return i.style.display!=='none';});
    for(var k=1;k<ic.length;k++){ic[k].style.display='none';ic[k].setAttribute('data-tf-hidden','prepdup');S.prep++;}}
  setInterval(function(){try{picFix();}catch(_){}try{prepFix();}catch(_){}},1000);
})();
