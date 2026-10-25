/* roomdelete-20261021a: delete control on saved rooms (Hub Rooms "My rooms" list + room bar "Saved rooms" popup).
   ✕ -> box "Are you sure you want to delete this room?" Yes / No. Only Yes deletes.
   Yes: removes the room from localStorage hcrb-saved, records the id in hcrb-saved-deleted (tombstone) and sends a
   tombstone to the account (existing PUT /api/account/saved-rooms merge: newer savedAt wins), so the sync never re-adds it. */
(function(){
  var K='hcrb-saved',KD='hcrb-saved-deleted',API='/api/account/saved-rooms';
  function lj(k){try{var a=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function sj(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
  function css(){if(document.getElementById('srdCss'))return;var s=document.createElement('style');s.id='srdCss';
    s.textContent='.srdWrap{position:relative;display:block}.srdWrap>button:first-child{width:100%;padding-right:34px!important}'+
    '.srdX{position:absolute;top:50%;right:6px;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font:14px/24px system-ui;cursor:pointer;padding:0;z-index:2}.srdX:hover{background:#c0392b}'+
    '#srdBox{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}'+
    '#srdBox>div{background:#1e2230;color:#fff;border-radius:14px;padding:20px 22px;max-width:320px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:15px system-ui;text-align:center}'+
    '#srdBox button{margin:14px 6px 0;min-width:80px;padding:8px 14px;border-radius:8px;border:0;font:600 14px system-ui;cursor:pointer}#srdBox .y{background:#c0392b;color:#fff}#srdBox .n{background:#3a4155;color:#fff}';
    document.head.appendChild(s);}
  function ask(cb){var o=document.getElementById('srdBox');if(o)o.remove();o=document.createElement('div');o.id='srdBox';
    o.innerHTML='<div role="dialog" aria-modal="true"><div>Are you sure you want to delete this room?</div><button type="button" class="y">Yes</button><button type="button" class="n">No</button></div>';
    function close(){o.remove();document.removeEventListener('keydown',key,true);}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close();}}
    o.addEventListener('click',function(e){e.stopPropagation();if(e.target.classList.contains('y')){close();cb();}else if(e.target.classList.contains('n')||e.target===o)close();});
    document.addEventListener('keydown',key,true);document.body.appendChild(o);o.querySelector('.n').focus();}
  function del(id){
    var all=lj(K),o=all.find(function(x){return x&&x.id===id;});
    sj(K,all.filter(function(x){return !(x&&x.id===id);}));
    var d=lj(KD);if(d.indexOf(id)<0){d.push(id);sj(KD,d.slice(-200));}
    if(o&&/^sr[a-z0-9]{1,24}$/.test(id)){try{fetch(API,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rooms:[{id:id,title:'(deleted)',vault:/^(private|public|premium)$/.test(o.vault)?o.vault:'private',savedAt:new Date().toISOString(),deleted:true}]})}).catch(function(){});}catch(e){}}
    try{document.dispatchEvent(new CustomEvent('rb-deleted',{detail:{id:id}}));}catch(e){}
  }
  function removeRows(id){document.querySelectorAll('.srdWrap[data-srd="'+id.replace(/"/g,'')+'"]').forEach(function(w){var list=w.parentNode;w.remove();
    if(list&&!list.querySelector('.srdWrap')){if(list.classList.contains('hrsavedl')){var h=list.previousElementSibling;if(h&&h.classList.contains('hrpath'))h.remove();list.remove();}}});}
  function decorate(){css();document.querySelectorAll('.hrsavedl button[data-a="rbopensaved"][data-id], #rxPop button.sv[data-id]').forEach(function(b){
    if(b.parentNode&&b.parentNode.classList&&b.parentNode.classList.contains('srdWrap'))return;
    var id=b.getAttribute('data-id'),w=document.createElement('span');w.className='srdWrap';w.setAttribute('data-srd',id);
    b.parentNode.insertBefore(w,b);w.appendChild(b);
    var x=document.createElement('button');x.type='button';x.className='srdX';x.textContent='\u2715';x.title='Delete room';x.setAttribute('aria-label','Delete room');
    x.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();ask(function(){del(id);removeRows(id);});},true);
    w.appendChild(x);});}
  var t=0;new MutationObserver(function(){if(!t)t=setTimeout(function(){t=0;decorate();},30);}).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
  window.__savedRoomDelete={del:del};
})();
