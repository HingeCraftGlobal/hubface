/* console-quiet.js consolequiet-20261021b — stop the Yoda transcript pane polling a missing /interface/yoda-transcript.json every few seconds
   (each 404 logged a console error). Uses the page's own hook window.__trxFetch (pollOut: var fx=window.__trxFetch||fetch). After a 404 the
   file is re-checked at most every 10 minutes; in between an empty transcript is returned locally. Roll back: remove this script tag. */
(function(){
  var miss=0;
  window.__trxFetch=function(u,o){
    if(miss&&Date.now()-miss<600000)return Promise.resolve(new Response('{"lines":[]}',{status:200,headers:{'Content-Type':'application/json'}}));
    return fetch(u,o).then(function(r){if(r.status===404){miss=Date.now();return new Response('{"lines":[]}',{status:200,headers:{'Content-Type':'application/json'}});}miss=0;return r;});
  };
  /* (b) /api/account/email-feed: the route exists (userdata.mjs) and answers 404 {error:'no feed'} when the account has no feed file, 401 when signed out.
     After a 404/401 the page's polls get the same answer locally for 10 minutes instead of hitting the network (no console error each poll). */
  var of=window.fetch, ef={at:0,status:0,body:''};
  window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||'';
    if(/\/api\/account\/email-feed(\?|$)/.test(s)&&(!o||!o.method||o.method==='GET')){
      if(ef.at&&Date.now()-ef.at<600000)return Promise.resolve(new Response(ef.body,{status:ef.status,headers:{'Content-Type':'application/json'}}));
      return of.apply(this,arguments).then(function(r){if(r.status===404||r.status===401){ef={at:Date.now(),status:r.status,body:''};r.clone().text().then(function(t){ef.body=t;});}else ef.at=0;return r;});}
    return of.apply(this,arguments);};
})();
