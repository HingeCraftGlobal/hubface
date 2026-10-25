/* savedrooms-20261021b-roomdelete (was 20261019a): deleted rooms (hcrb-saved-deleted / server tombstones deleted:true) are never re-added.
   savedrooms-20261019a: keep Hub Rooms "My rooms" (localStorage hcrb-saved) in step with the signed-in account.
   On load: rooms stored on the account are added to this browser's list (by id). On every Save room: the list is sent to the account. */
(function(){
  var K='hcrb-saved',KD='hcrb-saved-deleted',API='/api/account/saved-rooms';
  function local(){try{var a=JSON.parse(localStorage.getItem(K)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function gone(){try{var a=JSON.parse(localStorage.getItem(KD)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function good(o){return o&&typeof o.id==='string'&&/^sr[a-z0-9]{1,24}$/.test(o.id)&&typeof o.title==='string'&&o.title.trim()&&/^(private|public|premium)$/.test(o.vault);}
  function push(){var a=local().filter(good).slice(0,60);if(!a.length)return;
    fetch(API,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({rooms:a})}).catch(function(){});}
  function pull(){fetch(API,{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.authenticated)return;var all=(j.rooms||[]).filter(good),dead=gone(),srv=[],loc,ids={},added=0;
    all.forEach(function(o){if(o.deleted){if(dead.indexOf(o.id)<0)dead.push(o.id);}else srv.push(o);});
    srv=srv.filter(function(o){return dead.indexOf(o.id)<0;});
    loc=local();var n0=loc.length;loc=loc.filter(function(o){return !(o&&dead.indexOf(o.id)>=0);});if(loc.length!==n0)added=1;
    try{localStorage.setItem(KD,JSON.stringify(dead.slice(-200)));}catch(e){}
    loc.forEach(function(o){if(o&&o.id)ids[o.id]=1;});
    srv.forEach(function(o){if(!ids[o.id]){loc.push(o);ids[o.id]=1;added++;}});
    if(added){loc.sort(function(a,b){return String(b.savedAt||'').localeCompare(String(a.savedAt||''));});try{localStorage.setItem(K,JSON.stringify(loc));}catch(e){}}
    if(local().filter(good).some(function(o){return !all.some(function(s){return s.id===o.id;});}))push();   // rooms saved here before sign-in go up to the account
  }).catch(function(){});}
  document.addEventListener('rb-saved',function(){setTimeout(push,50);});
  window.__savedRoomsSync={pull:pull,push:push};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pull);else pull();
})();
