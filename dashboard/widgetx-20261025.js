/* widgetx-20261025 (Dan, voice Oct 25 12:24am): Widget Picker rows get a plain X (replaces the circle-slash icon) next to "Add to bar".
   X = remove that widget from the picker (hidden, reversible: a "Restore removed widgets" line appears at the bottom). Custom widgets with their own delete button use it.
   Add to bar is untouched. Main Dashboard Builder only. State: localStorage hf-wfx-gone-v1. */
(function(){
  if(window.__wfx)return;window.__wfx=1;
  var K='hf-wfx-gone-v1',PK='#ui > section.box[data-float="other"] .blist';
  function room(){return document.documentElement.classList.contains('rb-room');}
  function gone(){try{return JSON.parse(localStorage.getItem(K)||'[]');}catch(e){return [];}}
  function save(a){try{localStorage.setItem(K,JSON.stringify(a));}catch(e){}}
  function nm(r){var n=r.querySelector(':scope > .wfnm')||r.querySelector(':scope > b');return n?n.textContent.trim():'';}
  function list(){return document.querySelector(PK);}
  function run(){if(room())return;var l=list();if(!l)return;var g=gone(),hid=0;
    [].forEach.call(l.querySelectorAll(':scope > .build:not(.bnew):not(.dwdiv):not(.dwhead):not([data-bot]):not(.hfcpTile):not(.hfModTile)'),function(r){
      var s=r.querySelector(':scope > .wfsl');if(!s)return;
      if(s.dataset.wfx!=='1'){s.dataset.wfx='1';s.textContent='\u2715';s.title='Remove from picker';s.setAttribute('role','button');s.setAttribute('aria-hidden','false');s.setAttribute('aria-label','Remove '+nm(r)+' from picker');}
      var off=g.indexOf(nm(r))>=0;if(off)hid++;if(off!==(r.style.display==='none')){if(off)r.style.setProperty('display','none','important');else r.style.removeProperty('display');}});
    var bar=l.querySelector(':scope > .wfxbar');
    if(hid&&!bar){bar=document.createElement('div');bar.className='wfxbar';bar.setAttribute('role','button');l.appendChild(bar);}
    if(bar){if(!hid)bar.remove();else{var t='Restore '+hid+' removed widget'+(hid>1?'s':'');if(bar.textContent!==t)bar.textContent=t;}}}
  function X(e){if(room())return null;var t=e.target;return t&&t.closest?t.closest(PK+' > .build > .wfsl[data-wfx="1"]'):null;}
  function eat(e){e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();}
  function onClick(e){var b=e.target&&e.target.closest&&e.target.closest(PK+' > .wfxbar');
    if(b){eat(e);save([]);run();return;}
    var cb=e.target&&e.target.closest&&e.target.closest('.wfxcf');
    if(cb){eat(e);var bt=e.target.closest('button');if(bt){var f=bt.dataset.y==='1'?pend:null;close();if(f)f();}return;}
    var dx=e.target&&e.target.closest&&e.target.closest(PK+' > .bcustom > .bdel');
    var x=X(e);if(!x&&!dx)return;eat(e);var r=(x||dx).parentElement,n=nm(r);
    ask(n,function(){
      if(r.classList.contains('bcustom')&&window.__customWidgets&&r.getAttribute('data-name')){window.__customWidgets.remove(r.getAttribute('data-name'));setTimeout(run,50);return;}
      var g=gone();if(g.indexOf(n)<0)g.push(n);save(g);run();});}
  var pend=null,box=null;
  function close(){if(box){box.remove();box=null;}pend=null;document.removeEventListener('keydown',kd,true);}
  function kd(e){if(!box)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();var f=pend;close();if(f)f();}}
  function ask(name,fn){close();pend=fn;box=document.createElement('div');box.className='wfxcf';box.setAttribute('role','alertdialog');
    box.innerHTML='<div class="wfxcc"><div class="wfxct">Are you sure you want to delete?</div><div class="wfxcn"></div><div class="wfxcb"><button type="button" data-y="1">Yes</button><button type="button" data-y="0">No</button></div></div>';
    box.querySelector('.wfxcn').textContent=name;document.body.appendChild(box);document.addEventListener('keydown',kd,true);
    var nb=box.querySelector('[data-y="0"]');try{nb.focus();}catch(e){}}
  ['pointerdown','mousedown','mouseup','pointerup','touchstart','touchend'].forEach(function(t){window.addEventListener(t,function(e){if(X(e)||(e.target.closest&&e.target.closest(PK+' > .wfxbar, .wfxcf, '+PK+' > .bcustom > .bdel')))eat(e);},true);});
  window.addEventListener('click',onClick,true);
  var s=document.createElement('style');s.textContent='html:not(.rb-room) body #ui#ui > section.box[data-float="other"] .blist.blist > .build.build > .wfsl[data-wfx="1"]{pointer-events:auto!important;cursor:pointer;font-size:13px;line-height:1;width:20px;height:20px;align-items:center;justify-content:center;border-radius:4px;opacity:.7;margin-left:6px;color:#fff;order:99}'+
   'html:not(.rb-room) body #ui#ui > section.box[data-float="other"] .blist.blist > .build.build > .wfsl[data-wfx="1"]:hover{opacity:1;background:rgba(255,90,90,.55)}'+
   'html:not(.rb-room) #ui > section.box[data-float="other"] .blist > .wfxbar{order:200;margin:8px 4px 2px;font-size:11px;color:#fff;opacity:.7;text-align:center;cursor:pointer;text-decoration:underline;pointer-events:auto!important;position:relative;z-index:5;flex:0 0 auto}';
  s.textContent+='.wfxcf{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}.wfxcc{background:#1c1f26;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:20px 24px;min-width:280px;max-width:90vw;text-align:center;font:14px system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.6)}.wfxct{font-size:16px;font-weight:600;margin-bottom:6px}.wfxcn{opacity:.7;margin-bottom:16px;word-break:break-word}.wfxcb{display:flex;gap:12px;justify-content:center}.wfxcb button{min-width:84px;padding:8px 16px;border-radius:8px;border:0;font-size:14px;cursor:pointer;color:#fff;background:#3a3f4b}.wfxcb button[data-y="1"]{background:#d94a4a}';
  document.head.appendChild(s);
  setInterval(run,600);run();
})();
