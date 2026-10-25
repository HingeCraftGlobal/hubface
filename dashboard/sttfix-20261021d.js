/* sttfix-20261021d: whole-utterance capture for Finn listen() and bot panels (agent-panel.js).
   continuous+interim forced; a Chrome-side end mid-speech restarts the same recognizer at once (same owner) and keeps the utterance;
   pending interim text is kept as final; bot panels get only the joined final text after ~1.5 s silence. Uses b's lock + c's breaker.
   Roll back: remove the sttfix-20261021d tag. */
(function(){
  var TAG='sttfix-20261021d',X=window.__sttfix||(window.__sttfix={log:[]});X.tagD=TAG;var SIL=1500,CAP=60000;
  function L(m){var e=new Date().toISOString().slice(11,23)+' '+m;X.log.push(e);if(X.log.length>400)X.log.shift();try{console.info('[sttfix] '+m);}catch(_){}}
  function fake(text){var alt={transcript:text,confidence:0.9},res=[alt];res.isFinal=true;res.item=function(){return alt;};var rs=[res];rs.item=function(i){return rs[i];};
    return {type:'result',resultIndex:0,results:rs,__glue:true};}
  ['webkitSpeechRecognition','SpeechRecognition'].forEach(function(n){var A=window[n];if(!A||A.__sttfixD)return;
    var W=function(){var r=new A();var id=r.__owner||'?';if(id!=='finn'&&id!=='agent')return r;
      var hRes=null,hEnd=null,pageStop=false,lastRes=0,inter='',t0=0,glues=0,hold='',hT=0;
      try{Object.defineProperty(r,'onresult',{configurable:true,get:function(){return hRes;},set:function(f){hRes=f;}});
          Object.defineProperty(r,'onend',{configurable:true,get:function(){return hEnd;},set:function(f){hEnd=f;}});}catch(e){L(r.__sid+' d: hook failed '+e);return r;}
      function toPage(ev){if(hRes)try{hRes.call(r,ev);}catch(e){L(r.__sid+' d: page onresult threw '+e);}}
      function flushHold(){clearTimeout(hT);var q=hold.replace(/\s+/g,' ').trim();hold='';if(q){L(r.__sid+' d: send joined final ('+q.split(' ').length+' words)');toPage(fake(q));}}
      r.addEventListener('result',function(ev){lastRes=Date.now();var fin='',int='';
        for(var i=ev.resultIndex;i<ev.results.length;i++){var x=ev.results[i];if(x.isFinal)fin+=' '+x[0].transcript;else int+=x[0].transcript;}inter=int;
        if(id==='finn'){toPage(ev);return;}
        /* agent: pass interim (keeps barge-in + its UI alive), hold finals, send the join after SIL of silence */
        if(fin)hold+=' '+fin;if(int||fin){var alt={transcript:int||' '},res=[alt];res.isFinal=false;var rs=[res];toPage({type:'result',resultIndex:0,results:rs});}
        clearTimeout(hT);hT=setTimeout(function(){if(inter){hold+=' '+inter;inter='';}flushHold();},SIL);});
      r.addEventListener('end',function(ev){var mid=!pageStop&&(inter||Date.now()-lastRes<SIL||(id==='agent'&&hold))&&Date.now()-t0<CAP&&glues<8&&!X.broken;
        if(mid){glues++;L(r.__sid+' d: Chrome ended mid-speech, restart same owner (glue '+glues+')'+(inter?' keep interim':''));
          if(inter){if(id==='finn')toPage(fake(inter));else hold+=' '+inter;inter='';}
          try{r.start();}catch(e){L(r.__sid+' d: restart threw '+e.name);mid=false;}
          if(mid)return;}
        if(id==='agent'&&(hold||inter)){if(inter){hold+=' '+inter;inter='';}flushHold();}
        pageStop=false;if(hEnd)try{hEnd.call(r,ev);}catch(e){L(r.__sid+' d: page onend threw '+e);}});
      var s=r.start,st=r.stop,ab=r.abort;
      r.start=function(){pageStop=false;try{r.continuous=true;r.interimResults=true;}catch(_){}if(!glues||Date.now()-t0>CAP)t0=Date.now();return s.apply(r,arguments);};
      r.stop=function(){pageStop=true;glues=0;return st.apply(r,arguments);};
      r.abort=function(){pageStop=true;glues=0;clearTimeout(hT);hold='';inter='';return ab.apply(r,arguments);};
      L(r.__sid+' d: utterance glue on ('+id+')');return r;};
    W.prototype=A.prototype;try{Object.setPrototypeOf(W,A);}catch(_){}W.__sttfix=true;W.__sttfixB=A.__sttfixB;W.__sttfixC=A.__sttfixC;W.__sttfixD=true;window[n]=W;});
  L(TAG+' loaded');
})();
