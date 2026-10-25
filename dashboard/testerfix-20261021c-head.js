/* testerfix-20261021c-head: /interface/yoda-transcript.json (with or without ?t= / ?probe=) never goes to the network.
   The file does not exist on the server, and the only caller is the Yoda transcript pane's pollOut() in index.html
   (via window.__trxFetch from console-quiet.js, which calls window.fetch). Intercepted at the earliest point in <head>:
   fetch, XMLHttpRequest.open/send, window.__trxFetch (locked), EventSource; each gets {"lines":[]} locally.
   Supersedes testerfix-b-head's 6 h probe (disabled here). Roll back: ROLLBACK-testerfixc.sh */
(function(){
  if(window.__tfHeadC)return;window.__tfHeadC='testerfix-20261021c';
  try{localStorage.setItem('hf-tf-trx-probe',String(Date.now()+1e12));localStorage.removeItem('hf-tf-trx-ok');}catch(e){}
  var RE=/(^|\/)yoda-transcript\.json(\?|#|$)/,BODY='{"lines":[]}',n={fetch:0,xhr:0,es:0};window.__tfTrxStats=n;
  function hit(u){try{var x=new URL(String(u),location.href);return x.origin===location.origin&&RE.test(x.pathname+x.search);}catch(e){return RE.test(String(u));}}
  function resp(){return new Response(BODY,{status:200,headers:{'Content-Type':'application/json'}});}
  var of=window.fetch;
  if(of){window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||String(u||'');if(hit(s)){n.fetch++;return Promise.resolve(resp());}return of.apply(this,arguments);};}
  var lf=function(u,o){n.fetch++;return Promise.resolve(resp());};
  try{Object.defineProperty(window,'__trxFetch',{configurable:false,get:function(){return lf;},set:function(){}});}catch(e){}
  var X=window.XMLHttpRequest&&XMLHttpRequest.prototype;
  if(X){var oo=X.open,os=X.send;
    X.open=function(m,u){this.__tfTrx=hit(u);return oo.apply(this,arguments);};
    X.send=function(){if(!this.__tfTrx)return os.apply(this,arguments);n.xhr++;var x=this;
      try{Object.defineProperty(x,'readyState',{value:4});Object.defineProperty(x,'status',{value:200});Object.defineProperty(x,'responseText',{value:BODY});Object.defineProperty(x,'response',{value:BODY});}catch(e){}
      setTimeout(function(){try{x.onreadystatechange&&x.onreadystatechange();}catch(e){}try{x.onload&&x.onload();}catch(e){}try{x.dispatchEvent(new Event('load'));x.dispatchEvent(new Event('loadend'));}catch(e){}},0);};}
  if(window.EventSource){var ES=window.EventSource;window.EventSource=function(u,c){if(hit(u)){n.es++;var f=new EventTarget();f.close=function(){};f.readyState=2;return f;}return new ES(u,c);};window.EventSource.prototype=ES.prototype;}
})();
