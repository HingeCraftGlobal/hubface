/* sttfix-20261021c: pill shows build tag + live mic owner; Alt+L / copy icon copies last 40 log lines; loop breaker
   (>5 sessions in 10 s with no audiostart => stop auto-restarts, pill "mic gives no audio: <owner>"). No POST (no log endpoint).
   Roll back: remove the sttfix-20261021c tag. */
(function(){
  var TAG='sttfix-20261021c',X=window.__sttfix||(window.__sttfix={log:[]});X.tagC=TAG;X.broken=null;
  function L(m){var e=new Date().toISOString().slice(11,23)+' '+m;X.log.push(e);if(X.log.length>400)X.log.shift();try{console.info('[sttfix] '+m);}catch(_){}}
  var lastGesture=0;addEventListener('pointerdown',function(){lastGesture=Date.now();},true);addEventListener('keydown',function(e){if(!e.repeat)lastGesture=Date.now();},true);
  var cyc={};
  ['webkitSpeechRecognition','SpeechRecognition'].forEach(function(n){var A=window[n];if(!A||A.__sttfixC)return;
    var W=function(){var r=new A();var id=r.__owner||'?',heard=false;
      r.addEventListener('audiostart',function(){heard=true;cyc[id]=[];L((r.__sid||id)+' audiostart');});
      r.addEventListener('end',function(){if(heard){heard=false;return;}var now=Date.now(),a=(cyc[id]=(cyc[id]||[]).filter(function(t){return now-t<10000;}));a.push(now);
        if(a.length>5&&!X.broken){X.broken=id;L('LOOP BREAKER: '+id+' cycled '+a.length+'x in 10s with no audiostart; auto-restarts stopped');}});
      var s=r.start;r.start=function(){heard=false;var tap=Date.now()-lastGesture<1500;
        if(X.broken){if(!tap){L((r.__sid||id)+' auto-start blocked by loop breaker');return;}L('tap: loop breaker reset');X.broken=null;cyc={};}
        return s.apply(r,arguments);};
      return r;};
    W.prototype=A.prototype;try{Object.setPrototypeOf(W,A);}catch(_){}W.__sttfix=true;W.__sttfixB=A.__sttfixB;W.__sttfixC=true;window[n]=W;});
  function copy(){var t=X.log.slice(-40).join('\n');var ok=function(){flash('log copied (40 lines)');};
    try{navigator.clipboard.writeText(t).then(ok,fb);}catch(_){fb();}
    function fb(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');ok();}catch(_){}a.remove();}}
  var b=null,msg='',msgT=0;function flash(m){msg=m;msgT=Date.now();tick();}
  function tick(){if(!document.body)return;if(!b){b=document.createElement('div');b.id='sttfix-c';
      b.style.cssText='position:fixed;left:8px;bottom:34px;z-index:2147483647;font:11px/1.2 system-ui,sans-serif;padding:3px 8px;border-radius:10px;color:#fff;background:#222;opacity:.9';
      var t=document.createElement('span');t.id='sttfix-c-t';var c=document.createElement('span');c.textContent=' \u{1F4CB}';c.title='Copy last 40 log lines (Alt+L)';c.style.cursor='pointer';c.onclick=function(e){e.stopPropagation();copy();};
      b.appendChild(t);b.appendChild(c);document.body.appendChild(b);}
    var p=document.getElementById('sttfix-pill');b.style.display=(p&&p.style.display==='none')?'none':'block';
    if(X.broken&&p){p.textContent='STT: mic gives no audio: '+X.broken;p.style.background='#b71c1c';}
    var o=(window.__mic&&window.__mic.owner)||'none';
    b.firstChild.textContent=(Date.now()-msgT<2000?msg+' \u00b7 ':'')+TAG+' \u00b7 owner: '+o;}
  setInterval(tick,400);
  addEventListener('keydown',function(e){if(e.altKey&&(e.key==='l'||e.key==='L')){e.preventDefault();copy();}},true);
  L(TAG+' loaded');
})();
