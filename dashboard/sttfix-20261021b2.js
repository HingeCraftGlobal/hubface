/* sttfix-20261021b2 (= b + dictation owner label fix: __fieldMicActive => 'dict'; nothing else changed). Was sttfix-20261021b: single-owner mic lock (window.__mic) + per-instance id/caller logging + restart backoff.
   Undoes the 5 s __micHold expiry from sttfix-20261021a (it drove wake restarts). Restores SR statics (available/install).
   Roll back: remove the sttfix-20261021b tag. */
(function(){
  var X=window.__sttfix||(window.__sttfix={log:[]});X.tagB='sttfix-20261021b';
  function L(m){var e=new Date().toISOString().slice(11,23)+' '+m;X.log.push(e);if(X.log.length>400)X.log.shift();try{console.info('[sttfix] '+m);}catch(_){}}
  function pill(t,c){var p=document.getElementById('sttfix-pill');if(p){p.textContent='STT: '+t;if(c)p.style.background=c;}X.state=t;}
  function src(){var s=(new Error().stack||'').split('\n').slice(1).map(function(l){return l.trim();}).filter(function(l){return !/sttfix-20261021/.test(l)&&/:\d+:\d+/.test(l);});
    var f=s[0]||'?',m=f.match(/([^\/\s(]+\.(?:js|html))(?:\?[^:]*)?:(\d+):\d+/);return m?m[1]+':'+m[2]:f.slice(0,80);}
  function kind(s){if(window.__fieldMicActive)return 'dict';   /* sttfix-20261021e: field dictation is always 'dict' */
    var f=s.split(':')[0],n=+s.split(':')[1]||0;if(f==='voice-layer.js')return 'wake';if(f==='agent-panel.js')return 'agent';if(f==='room-live.js')return 'room';
    if(f==='hrtitle-mic-20261021a.js')return 'hrtitle';if(f==='index.html'||f==='interface'||f===''){if(n>=930&&n<=1000)return 'finn';if(n>=12250&&n<=12400)return 'dict';if(n>=700&&n<=760)return 'search';}return s;}
  /* (1) remove the 5 s self-expiry: plain value again; (4) also true while a non-wake owner holds the mic, so hcaOn keeps wake paused */
  var hv=!!(function(){try{return window.__micHold;}catch(_){return false;}})();
  try{Object.defineProperty(window,'__micHold',{configurable:true,get:function(){return hv||!!(M.owner&&M.owner!=='wake');},set:function(v){v=!!v;if(v!==hv)L('__micHold='+v);hv=v;}});}catch(e){L('hold redefine failed '+e);}
  var lastGesture=0;addEventListener('pointerdown',function(){lastGesture=Date.now();},true);addEventListener('keydown',function(e){if(!e.repeat)lastGesture=Date.now();},true);
  /* (2) single-owner lock */
  var M=window.__mic={owner:null,rec:null,lost:null,
    acquire:function(id,rec){if(M.rec&&M.rec!==rec){var o=M.rec;o.__lost=true;L('acquire '+id+': aborts '+M.owner+(o.__sid?' '+o.__sid:''));if(M.owner==='wake')M.lost=o;try{o.onend=null;}catch(_){}try{o.__nabort.call(o);}catch(_){}}
      M.owner=id;M.rec=rec;rec.__lost=false;if(id==='wake')M.lost=null;return true;},
    release:function(id){if(M.owner!==id)return;var r=M.rec;M.owner=null;M.rec=null;L('release '+id+' -> owner=null');
      var w=M.lost;if(w&&id!=='wake'){M.lost=null;setTimeout(function(){if(M.owner)return;L('resume wake '+w.__sid);try{w.start();}catch(_){}},500);}},
    mine:function(id){return M.owner===id;}};
  ['webkitSpeechRecognition','SpeechRecognition'].forEach(function(n){var A=window[n];if(!A||A.__sttfixB)return;var NATIVE=(A.prototype&&A.prototype.constructor)||A;var seq=0;
    var W=function(){var r=new A();var born=src(),id=kind(born);r.__sid=id+'#'+(++seq);r.__owner=id;L(r.__sid+' created by '+born);
      var ns=r.start;r.__nabort=r.abort;var t0=0,got=false,delay=250,timer=0;
      r.addEventListener('result',function(e){try{for(var i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal){got=true;delay=250;}}catch(_){}});
      r.addEventListener('end',function(){var dur=Date.now()-t0;if(!got&&dur<1500){delay=Math.min(delay*2,8000);}
        L(r.__sid+' END '+dur+'ms'+(got?' final':' empty')+' owner='+M.owner+(r.__lost?' (lost)':'')+' next-delay='+delay);
        if(M.rec===r)M.release(id);});
      /* (3) every start() acquires; a self-restart (no tap) of a short empty session waits the backoff; (5) a tap always wins; wake never steals */
      r.start=function(){var caller=src(),tap=Date.now()-lastGesture<1500;
        if(M.rec===r){L(r.__sid+' start() while owner (ignored) by '+caller);return;}
        if(r.__lost&&!tap&&id!=='wake'){L(r.__sid+' lost; restart blocked');return;}
        if(id==='wake'&&M.owner&&M.owner!=='wake'){L('wake start deferred: owner='+M.owner);M.lost=r;return;}
        var since=Date.now()-t0;if(!tap&&t0&&!got&&since<delay+1500){clearTimeout(timer);var w=delay;L(r.__sid+' self-restart backoff '+w+'ms by '+caller);
          timer=setTimeout(function(){if(M.owner&&M.owner!=='wake'&&M.rec!==r&&id==='wake')return;if(r.__lost&&id!=='wake')return;go();},w);return;}
        go();
        function go(){M.acquire(id,r);t0=Date.now();got=false;L(r.__sid+' START owner='+M.owner+(tap?' (tap)':'')+' by '+caller);pill('started ('+id+')','#1565c0');
          try{return ns.call(r);}catch(e){L(r.__sid+' start threw '+e.name);if(M.rec===r)M.release(id);throw e;}}};
      r.abort=function(){clearTimeout(timer);return r.__nabort.call(r);};
      var nstop=r.stop;r.stop=function(){clearTimeout(timer);return nstop.call(r);};
      return r;};
    W.prototype=A.prototype;try{Object.setPrototypeOf(W,NATIVE);}catch(_){}W.__sttfix=true;W.__sttfixB=true;window[n]=W;});
  L('lock loaded');
})();
