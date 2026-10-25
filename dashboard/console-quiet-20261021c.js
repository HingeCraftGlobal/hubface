/* consolequiet-20261021c (Dan, Tester incognito fails): loaded first in <head>, before any page script fetches.
   (1) Signed out (GET /api/account/me -> authenticated:false): GETs to /api/account/priorities, /api/account/email-feed and
       /api/vault (list) are answered locally with 401 {error:'signed out'} instead of going to the network, so no red 401s.
       Re-checked when the 'hubface-auth' event fires (sign in / out).
   (2) A real 401/404 from those routes is cached 10 min and replayed locally (no repeat network errors).
   (3) /interface/yoda-transcript.json: signed out -> empty transcript locally; signed in -> a 404 is cached 10 min.
   (4) email-feed dedupe: calls with and without ?t= share one in-flight request and a 5 s result.
   Roll back: remove the consolequiet-20261021c include line from <head> in index.html. */
(function(){
  if(window.__cq3)return;window.__cq3='consolequiet-20261021c';
  var of=window.fetch;if(!of)return;
  var ME=null;
  function me(){if(!ME)ME=of.call(window,'/api/account/me',{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}})
      .then(function(r){return r.ok?r.json():null;}).then(function(j){return j?!!j.authenticated:true;}).catch(function(){return true;});return ME;}
  me();
  var cache={},infl={};
  function reset(){ME=null;cache={};infl={};me();}
  try{addEventListener('hubface-auth',reset);}catch(e){}
  function mk(st,body){return new Response(body,{status:st,headers:{'Content-Type':'application/json'}});}
  function path(s){try{var u=new URL(s,location.href);if(u.origin!==location.origin)return null;return u.pathname;}catch(e){return null;}}
  var GATED=/^\/api\/account\/(priorities|email-feed)\/?$|^\/api\/vault\/?$/;
  window.fetch=function(u,o){
    var s=typeof u==='string'?u:(u&&u.url)||'',m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase(),p=path(s),self=this,args=arguments;
    if(!p||m!=='GET')return of.apply(self,args);
    var trx=/\/interface\/yoda-transcript\.json$/.test(p),gated=GATED.test(p);
    if(!trx&&!gated)return of.apply(self,args);
    var key=p,c=cache[key];
    if(c&&Date.now()<c.until)return Promise.resolve(mk(c.st,c.body));
    return me().then(function(signed){
      if(!signed)return trx?mk(200,'{"lines":[]}'):mk(401,'{"error":"signed out"}');
      var ef=/email-feed/.test(p);
      if(ef&&infl[key])return infl[key].then(function(r){return r.clone();});
      var pr=of.apply(self,args).then(function(r){
        if(r.status===404||r.status===401){var b=trx?'{"lines":[]}':'';cache[key]={until:Date.now()+600000,st:trx?200:r.status,body:b};
          if(!trx)r.clone().text().then(function(t){if(cache[key])cache[key].body=t;}).catch(function(){});
          if(trx)return mk(200,b);}
        else if(ef&&r.ok){r.clone().text().then(function(t){cache[key]={until:Date.now()+5000,st:r.status,body:t};}).catch(function(){});}
        return r;});
      if(ef){infl[key]=pr;pr.then(function(){setTimeout(function(){delete infl[key];},0);},function(){delete infl[key];});return pr.then(function(r){return r.clone();});}
      return pr;});
  };
  window.__cq3Api={reset:reset,me:me};
})();
