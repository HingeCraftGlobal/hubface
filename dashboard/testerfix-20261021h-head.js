/* testerfix-20261021h-head: GET /api/account/email-feed[?t=] answered in the page with a 200 empty feed
   {"items":[],"waiting":[],"contacts":[],"newEmails":[],"updated":""} (applyFeed/applyNew in index.html accept it; the
   Requires reply box shows "No items yet"). Covers fetch (wraps testerfix-g-head, loaded right after it), XMLHttpRequest and
   navigator.sendBeacon. Every intercepted call is logged with its caller stack in window.__tfEfLog (for Tester).
   The only callers in the dashboard are index.html loadNew() and the Requires-reply loader (both fetch).
   Server-side alternative (NOT done): nginx `location = /api/account/email-feed { return 200 '{"items":[]}'; }`.
   Roll back: ROLLBACK-testerfixh.sh */
(function(){
  if(window.__tfHeadH)return;window.__tfHeadH='testerfix-20261021h';
  var BODY='{"items":[],"waiting":[],"contacts":[],"newEmails":[],"updated":""}',LOG=window.__tfEfLog=[];
  try{var m=JSON.parse(localStorage.getItem('hf-tf-404')||'{}');if(m&&m.ef){delete m.ef;localStorage.setItem('hf-tf-404',JSON.stringify(m));}}catch(e){}
  function hit(s){try{var u=new URL(String(s),location.href);return u.origin===location.origin&&/^\/api\/account\/email-feed\/?$/.test(u.pathname);}catch(e){return false;}}
  function log(k){var st='';try{st=(new Error().stack||'').split('\n').slice(2,5).join(' | ');}catch(e){}LOG.push({via:k,at:Date.now(),stack:st});if(LOG.length>30)LOG.shift();}
  var of=window.fetch;
  if(of)window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||String(u||''),mm=((o&&o.method)||(u&&u.method)||'GET').toUpperCase();
    if(mm==='GET'&&hit(s)){log('fetch');/* emailwidget-20261025: pass through so the signed-in owner gets the real feed; empty feed only on non-200 */var E=function(){return new Response(BODY,{status:200,headers:{'Content-Type':'application/json'}});};return of.apply(this,arguments).then(function(r){return r&&r.ok?r:E();},function(){return E();});}return of.apply(this,arguments);};
  var X=window.XMLHttpRequest&&XMLHttpRequest.prototype;
  if(X){var oo=X.open,os=X.send;X.open=function(m,u){this.__tfEf=String(m||'GET').toUpperCase()==='GET'&&hit(u);return oo.apply(this,arguments);};
    X.send=function(){if(!this.__tfEf)return os.apply(this,arguments);log('xhr');var x=this;
      try{Object.defineProperty(x,'readyState',{value:4});Object.defineProperty(x,'status',{value:200});Object.defineProperty(x,'responseText',{value:BODY});Object.defineProperty(x,'response',{value:BODY});}catch(e){}
      setTimeout(function(){try{x.onreadystatechange&&x.onreadystatechange();}catch(e){}try{x.onload&&x.onload();}catch(e){}try{x.dispatchEvent(new Event('load'));x.dispatchEvent(new Event('loadend'));}catch(e){}},0);};}
  if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){if(hit(u)){log('beacon');return true;}return sb.apply(null,arguments);};}
})();
