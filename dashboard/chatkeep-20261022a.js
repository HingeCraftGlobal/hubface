/* chatkeep-20261022a (Dan approved, room page): Room Chat replies never get lost.
   1) Every incoming room 'chat' line (and any spoken 'yoda-say' not also posted as chat) is kept here and re-inserted into
      #rb_roomChat if the chat box was not on screen / was re-rendered when it arrived (App.chatLine silently drops lines then).
   2) The black "💬 Name: text" toast stays ~4 s + 60 ms/word (min 6 s, max 12 s) and other toasts wait until it ends.
   Dedupe: same sender+text within 8 s counts once. Rollback: /opt/hubface/backups/chatkeep-20261022a/ROLLBACK.sh */
(function(){'use strict';if(window.__hfChatKeep)return;var TAG='chatkeep-20261022a';
  var L=[],pendSay=[];
  function App(){return window.__rb&&window.__rb.App;}
  function selfId(){try{var s=window.__roomLive.state();return s&&s.self&&s.self.id;}catch(_){return null;}}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim();}
  function dup(name,text,at){for(var i=L.length-1;i>=0;i--){var x=L[i];if(Math.abs(x.at-at)>8000)continue;if(x.name===name&&x.raw===text)return true;}return false;}
  function line(name,text,mine,voice){return mine?norm((voice?'\ud83c\udf99 ':'')+text):norm(name+': '+(voice?'\ud83c\udf99 ':'')+text);}
  function add(name,text,mine,voice,at){text=String(text||'');if(!norm(text)||dup(name,text,at))return;
    L.push({name:name,raw:text,mine:!!mine,at:at,txt:line(name,text,mine,voice),voice:!!voice});if(L.length>100)L.shift();setTimeout(ensure,250);}
  var lastRoom='';
  function put(c,x){var d=document.createElement('div');d.className='m'+(x.mine?' me':'');d.textContent=(x.mine?'You: ':'')+x.txt;d.setAttribute('data-ck','1');c.insertBefore(d,c.firstChild);c.scrollTop=0;}
  function ensure(){var a=App();var r='';try{r=String(a.state.room.id||a.state.room.code||'');}catch(_){}if(r!==lastRoom){if(lastRoom){L.length=0;}lastRoom=r;}
    if(!L.length)return;var cs=document.querySelectorAll('[id="rb_roomChat"]');
    Array.prototype.forEach.call(cs,function(c){var have={};for(var n=c.firstChild;n;n=n.nextSibling){var t=norm(n.textContent).replace(/^You: /,'');have[t]=(have[t]||0)+1;}
      var miss=L.filter(function(x){if(have[x.txt]){have[x.txt]--;return false;}return true;});if(!miss.length)return;
      if(miss.length===L.length){c.innerHTML='';L.forEach(function(x){put(c,x);});}else miss.forEach(function(x){put(c,x);});});}
  function onMsg(e){var m;try{m=JSON.parse(e.data);}catch(_){return;}if(!m)return;
    if(m.t==='welcome'&&Array.isArray(m.chat)){L.length=0;var me0=selfId();m.chat.forEach(function(x){if(x&&x.text)add((x.from&&x.from.name)||'Someone',x.text,me0&&x.from&&String(x.from.id)===String(me0),x.src==='voice',x.at||Date.now());});return;}
    if(m.t==='chat'&&m.text){var me=selfId();var nm=(m.from&&m.from.name)||'Someone';pendSay=pendSay.filter(function(p){return !(p.name===nm&&p.text===String(m.text));});
      add(nm,m.text,me&&m.from&&String(m.from.id)===String(me),m.src==='voice',Date.now());return;}
    if(m.t==='yoda-say'&&m.text&&!m.bridge){var p={name:m.name||'Yoda',text:String(m.text)};pendSay.push(p);
      setTimeout(function(){var i=pendSay.indexOf(p);if(i<0)return;pendSay.splice(i,1);add(p.name,p.text,false,false,Date.now());},3000);}}
  var NW=window.WebSocket;
  if(NW){var W=function(u,p){var w=p===undefined?new NW(u):new NW(u,p);try{if(/\/api\/room-live/.test(String(u)))w.addEventListener('message',onMsg);}catch(_){}return w;};
    W.prototype=NW.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){W[k]=NW[k];});for(var k in NW)try{if(!(k in W))W[k]=NW[k];}catch(_){}window.WebSocket=W;}
  /* toast pinning */
  var pinUntil=0,queued=null,wrapped=null;
  function dur(m){var w=norm(m).split(' ').length;return Math.max(6000,Math.min(12000,4000+60*w));}
  function isReply(m){m=String(m||'');if(m.indexOf('\ud83d\udcac ')===0)return true;for(var i=L.length-1;i>=0&&i>L.length-6;i--){if(!L[i].mine&&m.indexOf(L[i].name+': ')===0)return true;}return false;}
  function show(m,ms){var t=document.getElementById('rb_toast');if(!t)return false;t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(function(){t.style.display='none';if(queued){var q=queued;queued=null;try{App().toast(q);}catch(_){}}},ms);return true;}
  function wrap(){var a=App();if(!a||!a.toast||a.toast===wrapped)return;var orig=a.toast;
    wrapped=function(m){var now=Date.now();if(isReply(m)){var ms=dur(m);if(show(m,ms)){pinUntil=now+ms;return;}return orig.apply(this,arguments);}
      if(now<pinUntil){queued=m;return;}return orig.apply(this,arguments);};a.toast=wrapped;}
  setInterval(function(){try{wrap();}catch(_){}try{ensure();}catch(_){}},700);
  window.__hfChatKeep={build:TAG,log:L};
})();
