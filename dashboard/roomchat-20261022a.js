/* roomchat-20261022a (Dan approved, room page): Room Chat opens on every room join; incoming lines from others raise toast + soft chime + unread count
   (tab title) when chat is closed, and fire window event 'hubface:roomchat' + window.__hfRoomChat.log for browser-driven bots.
   Rollback: /opt/hubface/backups/roomchat-20261022a/ROLLBACK.sh */
(function(){'use strict';if(window.__hfRoomChat)return;var TAG='roomchat-20261022a';
  var log=[],unread=0,baseTitle=null,lastRoom='',opened='',ac=null;
  function App(){return window.__rb&&window.__rb.App;}
  function inRoom(){var a=App();return !!(a&&a.state&&a.state.room&&document.documentElement.classList.contains('rb-room'));}
  function roomId(){try{var a=App();return String(a.state.room.id||a.state.room.code||location.hash||'');}catch(_){return '';}}
  function selfId(){try{var s=window.__roomLive.state();return s&&s.self&&s.self.id;}catch(_){return null;}}
  function chatOpen(){try{var a=App();var w=a.wins&&a.wins.chat;if(!w)return false;var el=w.el||w;return !(el.hidden||(el.style&&el.style.display==='none'));}catch(_){return false;}}
  function openChat(){try{var a=App();if(a&&a.open&&!chatOpen())a.open('chat');}catch(_){}}
  function chime(){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();var o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(0.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.08,ac.currentTime+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.35);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.4);}catch(_){}}
  function paintTitle(){if(baseTitle==null)baseTitle=document.title.replace(/^\(\d+\) /,'');document.title=(unread?'('+unread+') ':'')+baseTitle;}
  var lastToast=0;
  function onMsg(e){var m;try{m=JSON.parse(e.data);}catch(_){return;}if(!m||m.t!=='chat'||!m.text)return;
    var me=selfId();var mine=me&&m.from&&String(m.from.id)===String(me);
    var item={room:roomId(),from:(m.from&&m.from.name)||'Someone',role:m.from&&m.from.role,text:String(m.text),source:m.src==='voice'?'voice':'chat',at:m.at||Date.now(),mine:!!mine};
    log.push(item);if(log.length>100)log.shift();
    try{window.dispatchEvent(new CustomEvent('hubface:roomchat',{detail:item}));}catch(_){}
    if(mine)return;
    if(!chatOpen()){unread++;paintTitle();}
    var now=Date.now();if(now-lastToast>1500){lastToast=now;chime();try{var a=App();a&&a.toast&&a.toast('\ud83d\udcac '+item.from+': '+item.text.slice(0,90));}catch(_){}}}
  var NW=window.WebSocket;
  if(NW){var W=function(u,p){var w=p===undefined?new NW(u):new NW(u,p);try{if(/\/api\/room-live/.test(String(u)))w.addEventListener('message',onMsg);}catch(_){}return w;};
    W.prototype=NW.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){W[k]=NW[k];});for(var k in NW)try{if(!(k in W))W[k]=NW[k];}catch(_){}window.WebSocket=W;}
  setInterval(function(){
    if(!inRoom()){lastRoom='';return;}
    var r=roomId();if(r!==lastRoom){lastRoom=r;opened='';}
    if(opened!==r){if(App()&&App().open){openChat();if(chatOpen())opened=r;}}
    if(unread&&chatOpen()&&document.hasFocus()){unread=0;paintTitle();}
  },700);
  window.__hfRoomChat={build:TAG,log:log,unread:function(){return unread;}};
})();