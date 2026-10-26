/* priocats-20261025a (Dan): six category checkboxes at the TOP of every Priorities box (and New Emails).
   Personal, Work, Finance, Appointments, Non-shipping receipts, Everything else. Promos always hidden; shipping lives in Packages.
   Picks shared with emailcats (localStorage hinge-email-cats). Items without a category are classified here by sender/subject. */
(function(){
  if(document.documentElement.classList.contains('rb-room'))return;
  var CATS=[['personal','Personal'],['work','Work'],['finance','Finance'],['appointments','Appointments'],['receipts','Non-shipping receipts'],['other','Everything else']];
  var KEY='hinge-email-cats';
  function get(){if(window.__emailCats)return window.__emailCats.get();try{var a=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(a))return a;}catch(e){}return CATS.map(function(c){return c[0];});}
  var PROMO=/\b(sale|% off|deal|promo|coupon|newsletter|unsubscribe|webinar|offer ends|limited time)\b/i,
      SHIP=/\b(shipped|shipping|delivered|out for delivery|tracking|package|your order|ups|fedex|usps|dhl)\b/i;
  function cls(m){if(m.category)return m.category;var t=((m.from||'')+' '+(m.fromEmail||m.toEmail||'')+' '+(m.subject||'')).toLowerCase();
    if(/receipt|invoice #|your purchase|order confirmation/.test(t))return 'receipts';
    if(/bank|bluevine|stripe|paypal|payment|invoice|budget|tax|billing|wire|statement/.test(t))return 'finance';
    if(/meeting|calendar|invite|appointment|schedule|zoom|call at|reschedul/.test(t))return 'appointments';
    if(/hingecraft|github|repo|partner|investor|venture|capital|deck|contract|proposal/.test(t))return 'work';
    if(/gmail\.com|icloud\.com|yahoo\.com|outlook\.com|hotmail\.com/.test(t))return 'personal';
    return 'other';}
  function keep(m){var t=(m.subject||'')+' '+(m.from||'');if(m.category==='promo'||m.category==='shipping')return false;
    if(!m.category&&(PROMO.test(t)&&m.automated!==false)&&!/re:/i.test(m.subject||''))return false;
    if(!m.category&&SHIP.test(t))return false;
    return get().indexOf(cls(m))>=0;}
  window.__prioCls=cls;
  var of=window.fetch;if(!of)return;
  window.fetch=function(u){var p=of.apply(this,arguments);var s=typeof u==='string'?u:(u&&u.url)||'';
    if(s.indexOf('/api/account/email-feed')<0)return p;
    return p.then(function(r){if(!r.ok)return r;return r.clone().json().then(function(j){
      ['items','waiting'].forEach(function(k){if(Array.isArray(j[k])){j[k]=j[k].filter(keep);j[k].forEach(function(m){m.category=cls(m);});}});
      if(Array.isArray(j.newEmails))j.newEmails=j.newEmails.filter(function(m){return m.category!=='promo'&&m.category!=='shipping';});
      return new Response(JSON.stringify(j),{status:200,headers:{'Content-Type':'application/json'}});}).catch(function(){return r;});});};
  var st=document.createElement('style');st.textContent='.pcats{position:absolute;left:10px;right:10px;top:var(--pcatst,52px);z-index:6;display:grid;grid-auto-flow:column;grid-template-rows:repeat(3,auto);grid-template-columns:auto 1fr;gap:3px 12px;padding:4px 6px;border-radius:6px;background:rgba(8,20,38,.28);border:1px solid rgba(140,190,255,.18);font:600 7px/10px system-ui;letter-spacing:.1px;color:#e2eeff}.pcats label:nth-child(n+4){max-width:none}#ui .pcats,#ui .pcats *{pointer-events:auto!important}section.box.collapsed>.pcats,section.box.closed>.pcats{display:none!important}.pcats label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;display:flex;align-items:center;gap:4px;min-width:0;max-width:100%}.pcats input{flex:none;width:8px;height:8px;margin:0;accent-color:#6ea8ff}.pcats.narrow{grid-auto-flow:row;grid-template-rows:none;grid-template-columns:1fr;gap:2px}section.box.haspcats ol.plist{top:var(--pcatsb,90px)!important;margin-top:0!important;bottom:14px!important;overflow:hidden!important;justify-content:flex-start!important;scroll-padding:0}section.box.haspcats details.ecats{display:none!important}';
  document.head.appendChild(st);
  function reload(){try{if(window.__prioReload)window.__prioReload();}catch(e){}if(window.__newEmails&&window.__newEmails.reload)window.__newEmails.reload();}
  function strip(b){if(b.querySelector(':scope > .pcats'))return;var d=document.createElement('div');d.className='pcats';
    var on=get();d.innerHTML=CATS.map(function(c){return '<label title="Show '+c[1]+'"><input type="checkbox" data-c="'+c[0]+'"'+(on.indexOf(c[0])>=0?' checked':'')+'>'+c[1]+'</label>';}).join('');
    ['pointerdown','mousedown','dblclick','click'].forEach(function(e){d.addEventListener(e,function(ev){ev.stopPropagation();});});
    d.addEventListener('change',function(){var a=[].slice.call(d.querySelectorAll('input:checked')).map(function(i){return i.getAttribute('data-c');});
      try{localStorage.setItem(KEY,JSON.stringify(a));}catch(e){}if(window.__emailCats)window.__emailCats.set(a);
      document.querySelectorAll('.pcats input').forEach(function(i){i.checked=a.indexOf(i.getAttribute('data-c'))>=0;});
      reload();});
    b.appendChild(d);b.classList.add('haspcats');try{new ResizeObserver(function(){lay(b);}).observe(b);}catch(e){}
    lay(b);}
  function lay(b){var d=b.querySelector(':scope > .pcats');if(!d)return;var t=b.querySelector(':scope > .pcat'),h=b.querySelector(':scope > header');
    var top=Math.max(h?h.offsetTop+h.offsetHeight:40,t&&t.offsetHeight&&getComputedStyle(t).display!=='none'?t.offsetTop+t.offsetHeight:0)+4;
    d.classList.toggle('narrow',b.clientWidth<150);b.style.setProperty('--pcatst',top+'px');b.style.setProperty('--pcatsb',(top+d.offsetHeight+6)+'px');}
  setInterval(function(){document.querySelectorAll('section.box.haspcats').forEach(lay);},1500);
  function scan(){document.querySelectorAll('#ui > section.box[data-float^="priorities"]').forEach(strip);
    document.querySelectorAll('section.box.haspcats').forEach(lay);}
  new MutationObserver(function(){scan();}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(reload,900);scan();window.__prioCats={get:get,cats:CATS};
})();
