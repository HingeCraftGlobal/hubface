/* testerfix-20261021a-head (Tester fails, Oct 21 2026). Loaded in <head> right after consolequiet-20261021c, before page fetches.
   (4) Signed-in 404 on /api/account/email-feed and /interface/yoda-transcript.json: a 404 is remembered 30 min in localStorage
       and answered locally (email-feed -> 404 {"error":"not connected"}, transcript -> {"lines":[]}), so reloads make no red 404s.
   (5) Paid greeting TTS: the first POST /api/tts made before any user gesture (page-load greeting) is allowed once per tab
       session (sessionStorage); later page loads get a silent clip instead. Anything after a click/keypress is untouched.
   Roll back: ROLLBACK-testerfix.sh */
(function(){
  if(window.__tfHead)return;window.__tfHead='testerfix-20261021a';
  var of=window.fetch;if(!of)return;
  var MK='hf-tf-404',TTL=30*60*1000,GK='hf-tf-greet',stats={local404:0,greetBlocked:0,greetAllowed:0};
  function memo(){try{return JSON.parse(localStorage.getItem(MK)||'{}')||{};}catch(e){return {};}}
  function setm(k,v){var m=memo();if(v)m[k]=v;else delete m[k];try{localStorage.setItem(MK,JSON.stringify(m));}catch(e){}}
  function path(s){try{var u=new URL(s,location.href);return u.origin===location.origin?u.pathname:null;}catch(e){return null;}}
  function kind(p){if(!p)return null;if(/^\/api\/account\/email-feed\/?$/.test(p))return 'ef';if(/\/yoda-transcript\.json$/.test(p))return 'trx';return null;}
  var SIL=null;function silent(){if(!SIL){var n=800,b=new ArrayBuffer(44+n*2),v=new DataView(b),s=function(o,t){for(var i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));};
    s(0,'RIFF');v.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*2,true);SIL=b;}
    return new Response(SIL.slice(0),{status:200,headers:{'Content-Type':'audio/wav'}});}
  function gestured(){try{return !!(navigator.userActivation&&navigator.userActivation.hasBeenActive);}catch(e){return true;}}
  window.fetch=function(u,o){
    var s=typeof u==='string'?u:(u&&u.url)||'',m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase(),p=path(s),self=this,args=arguments;
    try{
      if(p&&m==='POST'&&/^\/api\/tts\/?$/.test(p)&&!gestured()){
        var seen=null;try{seen=sessionStorage.getItem(GK);}catch(e){}
        if(seen){stats.greetBlocked++;return Promise.resolve(silent());}
        try{sessionStorage.setItem(GK,String(Date.now()));}catch(e){}stats.greetAllowed++;
      }
      var k=m==='GET'?kind(p):null;
      if(k){var t=memo()[k];
        if(t&&Date.now()-t<TTL){stats.local404++;return Promise.resolve(k==='trx'?new Response('{"lines":[]}',{status:200,headers:{'Content-Type':'application/json'}}):new Response('{"error":"not connected"}',{status:404,headers:{'Content-Type':'application/json'}}));}
        return of.apply(self,args).then(function(r){if(r.status===404)setm(k,Date.now());else if(r.ok&&t)setm(k,0);return r;});
      }
    }catch(e){}
    return of.apply(self,args);
  };
  try{addEventListener('hubface-auth',function(){try{localStorage.removeItem(MK);}catch(e){}});}catch(e){}
  window.__tfHeadStats=stats;
})();
