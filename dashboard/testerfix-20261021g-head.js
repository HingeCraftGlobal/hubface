/* testerfix-20261021g-head: GET /api/account/email-feed (with or without ?t=) never goes to the network, first hit included.
   The account email feed has no server writer yet, so signed-in it always 404s. Answered locally: signed in -> 404
   {"error":"no feed"} (same answer the server gives, so the page keeps "No email feed connected"; a locally made Response logs
   nothing), signed out -> 401 like consolequiet-c. Sign-in state from one GET /api/account/me. Roll back: ROLLBACK-testerfixg.sh */
(function(){
  if(window.__tfHeadG)return;window.__tfHeadG='testerfix-20261021g';var of=window.fetch;if(!of)return;var n=window.__tfEfStats={local:0};
  var ME=null;function me(){if(!ME)ME=of.call(window,'/api/account/me',{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}}).then(function(r){return r.ok?r.json():null;}).then(function(j){return !!(j&&j.authenticated);}).catch(function(){return true;});return ME;}
  try{addEventListener('hubface-auth',function(){ME=null;});}catch(e){}
  function hit(s){try{var u=new URL(s,location.href);return u.origin===location.origin&&/^\/api\/account\/email-feed\/?$/.test(u.pathname);}catch(e){return false;}}
  window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||'',m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase();
    if(m==='GET'&&hit(s)){n.local++;var self=this,args=arguments;return me().then(function(si){/* emailwidget-20261025: signed in -> real network feed */return si?of.apply(self,args):new Response('{"error":"signed out"}',{status:401,headers:{'Content-Type':'application/json'}});});}
    return of.apply(this,arguments);};
})();
