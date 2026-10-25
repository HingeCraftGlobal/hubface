/* sttfix-20261021e (Dan): field dictation (__hfDictate, window.__fieldMicActive) is exempt from the sttfix-20261021c loop breaker:
   a dictation start clears X.broken; if a dictation start still does not begin within 2.5 s (blocked / swallowed), stop dictation
   and show its "try again" note instead of hanging on "Listening...". Roll back: remove the sttfix-20261021e tag. */
(function(){
  var TAG='sttfix-20261021e',X=window.__sttfix||(window.__sttfix={log:[]});X.tagE=TAG;
  function L(m){var e=new Date().toISOString().slice(11,23)+' '+m;X.log.push(e);if(X.log.length>400)X.log.shift();try{console.info('[sttfix] '+m);}catch(_){}}
  ['webkitSpeechRecognition','SpeechRecognition'].forEach(function(n){var A=window[n];if(!A||A.__sttfixE)return;
    var W=function(){var r=new A();if(!window.__fieldMicActive)return r;var began=false,ended=false,wd=0;
      r.addEventListener('start',function(){began=true;});r.addEventListener('audiostart',function(){began=true;});r.addEventListener('end',function(){ended=true;clearTimeout(wd);});
      var s=r.start;r.start=function(){if(X.broken){L('dict start: clears loop breaker (was '+X.broken+')');X.broken=null;}began=false;ended=false;clearTimeout(wd);
        var out=s.apply(r,arguments);
        wd=setTimeout(function(){if(began||ended)return;L('dict start never began: stop + note');
          try{var D=window.__hfDictate;if(D&&D.active&&D.active()){var btn=document.querySelector('.pvmic.on,.fvmic.on,[aria-pressed=true][data-a=mic],[aria-pressed=true][data-a=voice]');D.stop();D.note(btn,'Voice typing could not start (the microphone is busy). Press the mic to try again.');}}catch(_){}},2500);
        return out;};
      return r;};
    W.prototype=A.prototype;try{Object.setPrototypeOf(W,A);}catch(_){}['__sttfix','__sttfixB','__sttfixC','__sttfixD'].forEach(function(k){W[k]=A[k];});W.__sttfixE=true;window[n]=W;});
  L(TAG+' loaded');
})();
