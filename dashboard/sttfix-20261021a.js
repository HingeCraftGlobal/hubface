/* sttfix-20261021a: clear persisted hold/STT-off flags, self-expiring __micHold (5s), stale cross-tab hold guard (4s),
   SpeechRecognition event logging + bottom-left status pill. Roll back: remove the sttfix-20261021a tag. */
(function(){
  var TAG='sttfix-20261021a';window.__sttfix={tag:TAG,log:[]};
  function L(m){var e=new Date().toISOString().slice(11,23)+' '+m;window.__sttfix.log.push(e);if(window.__sttfix.log.length>200)window.__sttfix.log.shift();try{console.info('[sttfix] '+m);}catch(_){}}
  /* 1. clear persisted flags */
  try{var rm=[];[localStorage,sessionStorage].forEach(function(S){for(var i=S.length-1;i>=0;i--){var k=S.key(i);if(k==='hubface-stt'||/mic.?hold|stt.?(off|hold|disabled)|hubface-mic/i.test(k)){rm.push(k);S.removeItem(k);}}});
    document.cookie.split(';').forEach(function(c){var k=c.split('=')[0].trim();if(/mic.?hold|stt/i.test(k)){rm.push('cookie:'+k);document.cookie=k+'=;max-age=0;path=/';}});
    L('cleared: '+(rm.join(',')||'none'));}catch(e){L('clear failed '+e);}
  /* 2. __micHold self-expires after 5s */
  var hv=false,hset=0;
  try{Object.defineProperty(window,'__micHold',{configurable:true,get:function(){if(hv&&Date.now()-hset>5000){hv=false;L('__micHold expired');}return hv;},set:function(v){v=!!v;if(v)hset=Date.now();if(v!==hv)L('__micHold='+v);hv=v;}});}catch(e){L('hold wrap failed '+e);}
  /* 3. ignore cross-tab holds older than 4s */
  try{var BC=window.BroadcastChannel;if(BC){var NB=function(n){var b=new BC(n);if(n==='hubface-mic'){var seen={};var desc=Object.getOwnPropertyDescriptor(BC.prototype,'onmessage');var user=null;
      var filt=function(e){var d=e&&e.data;if(d&&d.t==='hold'){var ts=d.ts||Date.now();if(Date.now()-ts>4000){L('stale hold ignored');return;}} if(user)user.call(b,e);};
      Object.defineProperty(b,'onmessage',{configurable:true,get:function(){return user;},set:function(f){user=f;desc.set.call(b,f?filt:null);}});
      var pm=b.postMessage.bind(b);b.postMessage=function(m){if(m&&typeof m==='object'&&!m.ts)m.ts=Date.now();return pm(m);};}return b;};
    NB.prototype=BC.prototype;window.BroadcastChannel=NB;}}catch(e){L('bc wrap failed '+e);}
  /* 5. pill */
  var pill=null,show=true;try{show=localStorage.getItem('sttfix-pill')!=='off';}catch(_){}
  function P(t,c){window.__sttfix.state=t;if(!pill&&document.body){pill=document.createElement('div');pill.id='sttfix-pill';pill.title='STT status (click to hide; Alt+S toggles)';
      pill.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.2 system-ui,sans-serif;padding:4px 9px;border-radius:12px;color:#fff;background:#555;opacity:.9;cursor:pointer;pointer-events:auto';
      pill.onclick=function(){tog(false);};document.body.appendChild(pill);}
    if(pill){pill.textContent='STT: '+t;pill.style.background=c||'#555';pill.style.display=show?'block':'none';}}
  function tog(v){show=v===undefined?!show:v;try{localStorage.setItem('sttfix-pill',show?'on':'off');}catch(_){}if(pill)pill.style.display=show?'block':'none';}
  window.__sttfix.toggle=tog;addEventListener('keydown',function(e){if(e.altKey&&(e.key==='s'||e.key==='S'))tog();});
  function ready(){P(window.__sttfix.state||'idle');}if(document.body)ready();else addEventListener('DOMContentLoaded',ready);
  /* 4. wrap SpeechRecognition */
  ['webkitSpeechRecognition','SpeechRecognition'].forEach(function(n){var O=window[n];if(!O||O.__sttfix)return;
    var W=function(){var r=new O();var id=Math.random().toString(36).slice(2,6);L(n+'#'+id+' created');
      ['start','audiostart','soundstart','speechstart','result','nomatch','error','end'].forEach(function(ev){r.addEventListener(ev,function(e){
        if(ev==='error'){L('#'+id+' error '+e.error+(e.message?' '+e.message:''));P('error: '+e.error,'#b3261e');}
        else if(ev==='result'){var t='';try{var x=e.results[e.results.length-1];t=x[0].transcript;}catch(_){}L('#'+id+' result "'+t+'"');P('hearing','#1b7f3b');}
        else{L('#'+id+' '+ev);if(ev==='start'||ev==='audiostart')P('started','#1565c0');else if(ev==='speechstart'||ev==='soundstart')P('hearing','#1b7f3b');else if(ev==='end')P('ended','#555');else if(ev==='nomatch')P('no match','#8a6d00');}});});
      var st=r.start;r.start=function(){try{L('#'+id+' start() called');return st.apply(r,arguments);}catch(e){L('#'+id+' start() threw '+(e&&e.name)+' '+(e&&e.message));P('error: start-threw '+(e&&e.name),'#b3261e');throw e;}};
      return r;};
    W.prototype=O.prototype;W.__sttfix=true;try{window[n]=W;}catch(e){L('wrap '+n+' failed');}});
  if(!window.webkitSpeechRecognition&&!window.SpeechRecognition){L('no SpeechRecognition API');setTimeout(function(){P('error: no-api','#b3261e');},0);}
  L('loaded');
})();
