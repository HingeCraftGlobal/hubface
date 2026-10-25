/* wakeall-20261021a (Dan, voice Oct 21 2026): shared name trigger for every bot, dashboard + rooms.
   Taps every SpeechRecognition on the page (same prototype onresult hook style as bargein-v1). A final phrase that STARTS with a bot's
   name ("Theo, how's it going?", "Hey Mara ...") wakes that bot and it answers once, in its own server voice via POST /api/tts
   {text,voice_id}: Theo=helios, Mara=ursa, Moderator=aurora, Professor=orion. Misspellings: Tayo/Teo/Tio, Mora/Maura/Mera, Prof, ...
   Ava + Finn keep their own brain/voice path (Fin bar, eve/lumen); their misspellings (Eva, Phin, Fen, Fin) are rewritten to
   "ava"/"finn" so the existing wake word catches them. Same phrase heard by two recognizers (wake + room STT) is handled once.
   Ava double-TTS fix: an identical /api/tts {text,voice_id} for eve/lumen within 4 s of the first gets a silent clip instead
   of a second spoken copy. Extend: window.__hfWakeAll.add({name,re,voice,reply}). Roll back: ROLLBACK-wakeall.sh (remove tag). */
(function(){
  'use strict';
  if(window.__hfWakeAll)return;
  var BUILD='wakeall-20261021a';
  var LEAD='^(?:(?:hey|hi|hello|ok|okay|yo|oh)\\s+)?';
  function rx(a){return new RegExp(LEAD+'(?:'+a+')\\b[\\s,.!?]*');}
  function greet(t){return /\b(how(?:s| is| are)? (?:it going|you|things|are you|you doing)|how are|you there|are you there|hello|hi|hey|good (?:morning|afternoon|evening))\b/.test(t)||!t;}
  var BOTS=[
    {name:'Theo',voice:'helios',re:rx('theo|tayo|teo|tio|teyo|theyo|tayo|thayo|theodore'),
      hi:['Hi Dan, Theo here. I\u2019m doing well, thanks for asking. How are you doing today?','Hey Dan, it\u2019s Theo. I\u2019m good. What\u2019s on your mind?'],
      other:'Theo here. I\u2019m listening, take your time.'},
    {name:'Mara',voice:'ursa',re:rx('mara|mora|marra|maura|mera|marah|mahra'),
      hi:['Hi Dan, it\u2019s Mara. I\u2019m doing well, thank you. How are you feeling today?','Hey Dan, Mara here. I\u2019m good. What would you like to talk about?'],
      other:'Mara here. I\u2019m listening.'},
    {name:'Moderator',voice:'aurora',re:rx('moderator|moderater|moderador|the moderator'),
      hi:['Hi Dan, the Moderator here. Everything\u2019s running smoothly. How can I help the session?'],
      other:'Moderator here. Go ahead, I\u2019m listening.'},
    {name:'Professor',voice:'orion',re:rx('professor|proffesor|professer|prof|the professor'),
      hi:['Hello Dan, the Professor here. I\u2019m doing very well, thank you. What shall we look into?'],
      other:'Professor here. Go on, I\u2019m listening.'}
  ];
  /* Ava / Finn: rewrite misspellings to the canonical wake word; their own path answers */
  var CANON=[[new RegExp(LEAD+'(eva|avah|ava s|ava|ava\u2019s)\\b','i'),'ava'],[new RegExp(LEAD+'(phin|fen|fynn|fin|finn)\\b','i'),'finn']];
  var stats={wakes:[],tts:0,dupBlocked:0,rewrites:0};
  function norm(t){return String(t||'').toLowerCase().replace(/[\u2018\u2019']/g,'').replace(/[^a-z0-9 ,.!?]+/g,' ').replace(/\s+/g,' ').trim();}
  var cur=null,busyUntil=0,lastKey='',lastAt=0,said=[];
  function stop(){if(cur){try{cur.ctl.abort();}catch(_){}try{if(cur.a){cur.a.onended=null;cur.a.pause();}}catch(_){}cur=null;}}
  function quiet(b){try{if(window.__hfQuiet&&window.__hfQuiet())return true;}catch(_){}
    try{var R=window.__roomFixApi;if(R&&R.muted&&(R.muted(b.name.toLowerCase())||R.muted(b.name)))return true;}catch(_){}return false;}
  function speak(b,text){
    stop();said.push({n:norm(text),at:Date.now()});said=said.slice(-6);
    if(quiet(b))return;
    var c={ctl:new AbortController()};cur=c;stats.tts++;busyUntil=Date.now()+15000;
    var api=(window.__voice&&window.__voice.api)||'';if(api===location.origin)api='';
    fetch(api+'/api/tts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text,voice_id:b.voice}),signal:c.ctl.signal})
      .then(function(r){if(!r.ok)throw 0;return r.blob();})
      .then(function(bl){if(cur!==c)return;var u=URL.createObjectURL(bl),a=new Audio(u);c.a=a;a.setAttribute('data-hf-bot',b.name);
        a.onended=a.onerror=function(){URL.revokeObjectURL(u);if(cur===c)cur=null;busyUntil=Date.now()+1500;};
        var p=a.play();if(p&&p.catch)p.catch(function(){busyUntil=Date.now()+500;});})
      .catch(function(){if(cur===c)cur=null;busyUntil=Date.now()+500;});
    try{if(window.__trxAdd)window.__trxAdd(b.name.toLowerCase(),text);}catch(_){}
  }
  function echo(t){var n=norm(t).replace(/[,.!?]/g,''),now=Date.now();return said.some(function(x){return now-x.at<20000&&x.n.replace(/[,.!?]/g,'').indexOf(n)>=0;});}
  var rot={};
  function handle(raw){
    var t=norm(raw);if(!t)return false;
    for(var i=0;i<BOTS.length;i++){var b=BOTS[i],m=t.match(b.re);if(!m)continue;
      if(echo(raw)||(cur&&Date.now()<busyUntil))return true;
      var key=b.name+'|'+t.replace(/[,.!?]/g,'');if(key===lastKey&&Date.now()-lastAt<5000)return true;   /* same phrase from a 2nd recognizer */
      lastKey=key;lastAt=Date.now();
      var rest=t.slice(m[0].length).replace(/[,.!?]/g,' ').trim(),line;
      if(b.reply){try{line=b.reply(rest);}catch(_){}}
      if(!line){if(greet(rest)){var k=rot[b.name]||0;line=b.hi[k%b.hi.length];rot[b.name]=k+1;}else line=b.other;}
      stats.wakes.push({bot:b.name,voice:b.voice,heard:raw,at:Date.now()});if(stats.wakes.length>30)stats.wakes.shift();
      try{document.dispatchEvent(new CustomEvent('hf:botwake',{detail:{bot:b.name,voice:b.voice,heard:raw}}));}catch(_){}
      speak(b,line);return true;}
    return false;
  }
  function canon(s){for(var i=0;i<CANON.length;i++){var r=CANON[i][0],m=s.match(r);if(m&&m[1].toLowerCase()!==CANON[i][1]){stats.rewrites++;
        return s.slice(0,m.index)+s.slice(m.index,m.index+m[0].length).replace(new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),CANON[i][1])+s.slice(m.index+m[0].length);}}
    return null;}
  function wrapEv(ev){
    var changed=false,list=[];
    for(var i=0;i<ev.results.length;i++){var r=ev.results[i],alts=[];
      for(var k=0;k<r.length;k++){var tr=r[k].transcript,c=(i>=ev.resultIndex)?canon(tr.trim()):null;if(c!==null){changed=true;tr=c;}alts.push({transcript:tr,confidence:r[k].confidence});}
      alts.isFinal=r.isFinal;alts.item=function(n){return this[n];};list.push(alts);}
    if(!changed)return ev;list.item=function(n){return this[n];};
    return {type:'result',resultIndex:ev.resultIndex,results:list,target:ev.target,timeStamp:ev.timeStamp,__wakeall:1};
  }
  function tap(ev){var claimed=false;try{for(var i=ev.resultIndex;i<ev.results.length;i++){var r=ev.results[i];if(!r[0])continue;var t=norm(r[0].transcript);
      if(r.isFinal){if(handle(r[0].transcript))claimed=true;}else if(BOTS.some(function(b){return b.re.test(t);}))claimed=true;}}catch(_){}return claimed;}   /* claimed = a non-Ava/Finn bot's phrase: other listeners (Finn's open conversation, room STT -> Yoda) never also answer it */
  function hook(C){try{if(!C||!C.prototype||C.prototype.__wakeall)return;var P=C.prototype,d=Object.getOwnPropertyDescriptor(P,'onresult');
      var K='__wakeallOnresult';
      Object.defineProperty(P,'onresult',{configurable:true,enumerable:true,
        get:function(){return this[K]||null;},
        set:function(fn){var self=this;this[K]=fn;
          var w=typeof fn==='function'?function(ev){if(tap(ev))return;var e2=ev;try{e2=wrapEv(ev);}catch(_){}return fn.call(self,e2);}:null;
          if(d&&d.set)d.set.call(this,w);else{if(this.__wakeallW)this.removeEventListener('result',this.__wakeallW);this.__wakeallW=w;if(w)this.addEventListener('result',w);}}});
      var ael=P.addEventListener;
      P.addEventListener=function(type,fn,o){if(type==='result'&&typeof fn==='function'&&!fn.__wa&&fn!==this.__wakeallW){var self=this,w=function(ev){var e2=ev;try{e2=wrapEv(ev);}catch(_){}return fn.call(self,e2);};w.__wa=1;fn.__waW=w;return ael.call(this,type,w,o);}
        return ael.call(this,type,(fn&&fn.__waW)||fn,o);};
      var rel=P.removeEventListener;P.removeEventListener=function(type,fn,o){return rel.call(this,type,(fn&&fn.__waW)||fn,o);};
      /* recognizers made before this include loaded: re-wrap their handler on the next start() (engines restart every ~60 s and on resume) */
      var ost=P.start;P.start=function(){try{if(!this[K]){var h=this.onresult;if(typeof h==='function')this.onresult=h;}}catch(_){}return ost.apply(this,arguments);};
      P.__wakeall=1;}catch(e){}}
  /* EventTarget methods live on EventTarget.prototype, so hooking P.addEventListener only affects recognizers */
  hook(window.SpeechRecognition);if(window.webkitSpeechRecognition!==window.SpeechRecognition)hook(window.webkitSpeechRecognition);
  /* kick the shared wake listener once so an already-running recognizer picks up the hook now */
  setTimeout(function(){try{var V=window.VoiceLayer;if(V&&V.state&&V.state()!=='off'&&V.paused&&!V.paused()){V.pause();setTimeout(function(){try{if(V.paused())V.resume();}catch(_){}},150);}}catch(_){}},1500);
  /* Ava double-TTS fix */
  var SIL=null;function silent(){if(!SIL){var n=800,b=new ArrayBuffer(44+n*2),v=new DataView(b),s=function(o,t){for(var i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));};
      s(0,'RIFF');v.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*2,true);SIL=b;}
    return new Response(SIL.slice(0),{status:200,headers:{'Content-Type':'audio/wav'}});}
  var recentTts=[],of=window.fetch;
  if(of){window.fetch=function(input,init){try{var url=typeof input==='string'?input:(input&&input.url)||'';
      if(/\/api\/tts(?:\?|$)/.test(url)&&init&&typeof init.body==='string'){var j=JSON.parse(init.body);
        if(j&&(j.voice_id==='eve'||j.voice_id==='lumen')&&j.text){var key=j.voice_id+'|'+norm(j.text),now=Date.now();
          recentTts=recentTts.filter(function(x){return now-x.at<4000;});
          if(recentTts.some(function(x){return x.k===key;})){stats.dupBlocked++;try{console.log('[wakeall] duplicate TTS blocked:',j.voice_id,String(j.text).slice(0,40));}catch(_){}return Promise.resolve(silent());}
          recentTts.push({k:key,at:now});}}}catch(_){}
    return of.apply(this,arguments);};}
  window.__hfWakeAll={build:BUILD,stats:stats,bots:BOTS,hear:handle,canon:canon,stop:stop,
    add:function(b){if(b&&b.name&&b.voice&&b.re){b.hi=b.hi||[b.name+' here. How can I help?'];b.other=b.other||(b.name+' here. I\u2019m listening.');BOTS.push(b);}}};
})();
