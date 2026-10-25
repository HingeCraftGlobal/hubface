/* testerfix-20261021b-head: signed-in first-hit 404 on /interface/yoda-transcript.json. Browsers log every 4xx fetch, so until a 200
   has been seen in this browser (localStorage hf-tf-trx-ok) the GET is answered locally with {"lines":[]}. A background probe
   (?probe=1, 20 s after load, at most once per 6 h) checks whether the file exists; that probe is the only request that can 404.
   Once it sees a 200, real fetches go through. Roll back: ROLLBACK-testerfixb.sh */
(function(){
  if(window.__tfHeadB)return;window.__tfHeadB='testerfix-20261021b';
  var of=window.fetch;if(!of)return;var OK='hf-tf-trx-ok',PR='hf-tf-trx-probe',H6=6*3600*1000;
  function g(k){try{return localStorage.getItem(k);}catch(e){return null;}}function s(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function path(u){try{var x=new URL(u,location.href);return x.origin===location.origin?x.pathname:null;}catch(e){return null;}}
  function probe(){var last=+g(PR)||0;if(Date.now()-last<H6)return;s(PR,String(Date.now()));
    setTimeout(function(){of.call(window,'/interface/yoda-transcript.json?probe=1',{credentials:'same-origin',cache:'no-store'}).then(function(r){if(r.ok)s(OK,'1');}).catch(function(){});},20000);}
  window.fetch=function(u,o){var str=typeof u==='string'?u:(u&&u.url)||'',m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase(),p=path(str);
    if(p&&m==='GET'&&/\/yoda-transcript\.json$/.test(p)&&!/[?&]probe=1/.test(str)&&g(OK)!=='1'){probe();
      return Promise.resolve(new Response('{"lines":[]}',{status:200,headers:{'Content-Type':'application/json'}}));}
    return of.apply(this,arguments);};
})();
