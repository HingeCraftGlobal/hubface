/* buyscreen-20261026a (Dan): out of room time -> in-page buy-tokens screen instead of redirecting to HingeHub Studio. */
(function(){
  var PRICES=[500,2000,5000,10000];
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function show(rt){
    var old=document.getElementById('hfBuy');if(old)old.remove();
    var tp=Number(rt.tokenPriceCents)||0,tm=Number(rt.tokenMin)||15;
    var o=document.createElement('div');o.id='hfBuy';
    o.style.cssText='position:fixed;inset:0;z-index:2147483001;background:rgba(3,8,24,.92);display:flex;align-items:center;justify-content:center;font:15px/1.45 system-ui,sans-serif;color:#e6eeff';
    var cards=PRICES.map(function(c){var tok=tp?c/tp:0,min=Math.round(tok*tm*10)/10;
      return '<div class="hfbo" style="border:1px solid rgba(86,150,255,.5);border-radius:12px;padding:14px;text-align:center;background:rgba(12,26,60,.8)">'+
      '<div style="font:700 26px system-ui">$'+(c/100)+'</div><div style="opacity:.85;margin:6px 0 10px">'+(tp?(Math.round(tok*10)/10)+' tokens · '+min+' min of room time':'rate unavailable')+'</div>'+
      '<button type="button" data-c="'+c+'" style="font:600 14px system-ui;color:#fff;background:#2563eb;border:0;border-radius:8px;padding:8px 14px;cursor:pointer">Buy $'+(c/100)+'</button>'+
      '<div class="hfbm" style="font-size:12px;color:#ffcf7a;margin-top:8px;min-height:16px"></div></div>';}).join('');
    o.innerHTML='<div style="max-width:720px;width:92%;background:#0a1430;border:1px solid rgba(86,150,255,.6);border-radius:16px;padding:24px;position:relative">'+
      '<button type="button" id="hfBuyX" style="position:absolute;right:12px;top:10px;background:none;border:0;color:#cfe0ff;font-size:22px;cursor:pointer" aria-label="Close">×</button>'+
      '<h2 style="margin:0 0 6px;font:700 22px system-ui">You\u2019re out of room time</h2>'+
      '<div style="opacity:.85;margin-bottom:16px">Buy tokens to enter the room. One token = '+tm+' min at $'+(tp/100).toFixed(2)+'.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">'+cards+'</div></div>';
    document.body.appendChild(o);
    ['pointerdown','mousedown','dblclick','keydown','wheel'].forEach(function(ev){o.addEventListener(ev,function(e){e.stopPropagation();});});
    o.querySelector('#hfBuyX').onclick=function(){o.remove();};
    o.querySelectorAll('button[data-c]').forEach(function(b){b.onclick=function(){
      b.parentNode.querySelector('.hfbm').textContent='Checkout not connected for this amount yet.';};});
  }
  /* returns true when it takes over (async check); calls go() if the member has time, or if the check can't run (guest path unchanged) */
  window.__hfBuyGate=function(go){
    fetch('/api/account/room-time',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(j&&j.authenticated&&j.outOfTime)show(j);else go();
    }).catch(function(){go();});
    return true;
  };
  window.__hfBuyShow=show;
})();
