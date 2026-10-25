/* modvoice-20261021a (Dan, voice Oct 21 ~12:17pm ET): real server voices for the page-voiced bots.
   Moderator=aurora, Professor=orion, Mara (companion-f)=ursa, Theo (companion-m)=helios, via the live /api/tts {text,voice_id}.
   Hooks speechSynthesis.speak: only utterances spoken from moderator.js / agent-panel.js / companion.js / professor.js are
   rerouted (matched to the bot by that bot's pitch+rate). Yoda/Ava/Finn paths are untouched. Intros included (greeting goes
   through the same speak). If /api/tts fails, the original browser voice plays (fallback). cancel() also stops the server clip.
   Roll back: remove the <script src="modvoice-20261021a.js"> tag. */
(function(){
  'use strict';
  var ss=window.speechSynthesis;if(!ss||window.__hfModVoice)return;
  var origSpeak=ss.speak.bind(ss),origCancel=ss.cancel.bind(ss);
  var SRC=/(moderator|agent-panel|companion|professor)\.js/;
  var cur=null,stats={calls:0,ok:0,fail:0,last:null};
  function near(a,b){return Math.abs((a||0)-(b||0))<0.011;}
  function who(u){
    if(near(u.pitch,1.0)&&near(u.rate,0.9))return 'aurora';      /* Moderator (moderator.js + agent-panel) */
    if(near(u.pitch,0.78)&&near(u.rate,0.9))return 'orion';      /* Professor */
    var P=window.__hfCompanion&&window.__hfCompanion.personas;
    if(P){if(P['companion-f']&&near(u.pitch,P['companion-f'].pitch)&&near(u.rate,P['companion-f'].rate))return 'ursa';
      if(P['companion-m']&&near(u.pitch,P['companion-m'].pitch)&&near(u.rate,P['companion-m'].rate))return 'helios';}
    return null;}
  function fire(u,t){try{var f=u['on'+t];if(f)f.call(u,{type:t,utterance:u});}catch(_){}}
  function stop(){if(cur){var c=cur;cur=null;c.dead=true;try{c.ctl.abort();}catch(_){}try{if(c.a){c.a.onended=c.a.onerror=null;c.a.pause();}}catch(_){}}}
  ss.cancel=function(){var c=cur;stop();if(c&&!c.fell)fire(c.u,'end');return origCancel();};
  ss.speak=function(u){
    var st='';try{st=new Error().stack||'';}catch(_){}
    var v=(u&&SRC.test(st))?who(u):null;
    if(!v||!u.text)return origSpeak(u);
    stop();var c={u:u,v:v,ctl:new AbortController()};cur=c;stats.calls++;stats.last={voice:v,at:Date.now()};
    function fallback(){if(c.dead)return;c.fell=true;stats.fail++;if(cur===c)cur=null;try{origSpeak(u);}catch(_){fire(u,'end');}}
    fetch('/api/tts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:String(u.text).slice(0,2000),voice_id:v}),signal:c.ctl.signal})
    .then(function(r){if(!r.ok)throw 0;return r.blob();})
    .then(function(b){if(c.dead)return;var url=URL.createObjectURL(b),a=new Audio(url);c.a=a;a.volume=u.volume==null?1:u.volume;
      a.onended=function(){URL.revokeObjectURL(url);if(cur===c)cur=null;if(!c.dead)fire(u,'end');};
      a.onerror=function(){URL.revokeObjectURL(url);fallback();};
      var p=a.play();fire(u,'start');stats.ok++;if(p&&p.catch)p.catch(function(){fallback();});})
    .catch(function(){if(!c.dead)fallback();});
  };
  window.__hfModVoice={build:'modvoice-20261021a',stats:stats,stop:stop};
})();
