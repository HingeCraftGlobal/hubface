/* emailcats-20261025a: New Emails category filter + real inbox unread. Data: GET /api/account/email-feed (owner session only;
   file /var/lib/hubface/email-feed/<uid>.json built from Gmail read-only). Ads/promos and shipping mail are excluded at build time.
   Checked types persist in localStorage hinge-email-cats (default all six). Main dashboard only. */
(function(){
  if(document.documentElement.classList.contains('rb-room'))return;
  var CATS=[['personal','Personal'],['work','Work & business'],['finance','Finance & bills'],['appointments','Appointments & calendar'],['receipts','Receipts'],['other','Everything else']];
  var KEY='hinge-email-cats',on;try{on=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){on=null;}
  if(!Array.isArray(on))on=CATS.map(function(c){return c[0];});
  var total=null,shown=null,of=window.fetch;
  if(!of)return;
  window.fetch=function(u,o){var p=of.apply(this,arguments);var s=typeof u==='string'?u:(u&&u.url)||'';
    if(s.indexOf('/api/account/email-feed')<0)return p;
    return p.then(function(r){if(!r.ok)return r;return r.clone().json().then(function(j){
      if(j&&Array.isArray(j.newEmails)){if(typeof j.unreadCount==='number')total=j.unreadCount;
        j.newEmails=j.newEmails.filter(function(m){return on.indexOf(m.category||'other')>=0;});
        var t={};j.newEmails.forEach(function(m){t[m.threadId||m.id]=1;});shown=Object.keys(t).length;}
      setTimeout(label,50);
      return new Response(JSON.stringify(j),{status:200,headers:{'Content-Type':'application/json'}});}).catch(function(){return r;});});};
  function box(){return document.querySelector('#ui section[data-float*="newmail"]');}
  function label(){var b=box();if(!b)return;var s=b.querySelector('li.nsub');
    if(s&&shown!=null){var t='Unread \u00b7 '+shown+' shown'+(total!=null?' \u00b7 '+total+' in inbox':'');if(s.textContent!==t)s.textContent=t;}
    if(!b.querySelector('.ecats'))ui(b);}
  function ui(b){var d=document.createElement('details');d.className='ecats';
    d.style.cssText='position:absolute;right:10px;bottom:3px;z-index:5;font:9px system-ui;color:#cfe6ff';
    d.innerHTML='<summary style="cursor:pointer;list-style:none;opacity:.8" title="Choose email types">Types \u25be</summary><div style="background:rgba(10,20,35,.92);border:1px solid rgba(120,180,255,.35);border-radius:6px;padding:5px 7px;position:absolute;right:0;bottom:14px;white-space:nowrap">'+
      CATS.map(function(c){return '<label style="display:block;line-height:15px"><input type="checkbox" data-c="'+c[0]+'"'+(on.indexOf(c[0])>=0?' checked':'')+' style="vertical-align:-2px;margin-right:4px">'+c[1]+'</label>';}).join('')+'</div>';
    ['pointerdown','mousedown'].forEach(function(e){d.addEventListener(e,function(ev){ev.stopPropagation();});});
    d.addEventListener('change',function(){on=[].slice.call(d.querySelectorAll('input:checked')).map(function(i){return i.getAttribute('data-c');});
      try{localStorage.setItem(KEY,JSON.stringify(on));}catch(e){}if(window.__newEmails&&window.__newEmails.reload)window.__newEmails.reload();});
    b.appendChild(d);}
  window.__emailCats={get:function(){return on.slice();},set:function(a){on=a.slice();try{localStorage.setItem(KEY,JSON.stringify(on));}catch(e){}if(window.__newEmails)window.__newEmails.reload();},total:function(){return total;},shown:function(){return shown;}};
  new MutationObserver(function(){label();}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){if(window.__newEmails&&window.__newEmails.reload)window.__newEmails.reload();},800);
})();
