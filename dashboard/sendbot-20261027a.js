/* sendbot-20261027a (Dan, voice b1498dc6, Oct 27 2026): "Send my bot" one-tap stand-in on the room invite page.
   Signed-in user on a #room=HF-... page: "Send my bot" (not joined) or "Leave, bot stays" (joined) -> /api/sendbot/room/<ID>/on;
   "Take my seat back" -> /off (recap saved). Stand-in tiles show the user's photo, labelled as a bot. "My bot recaps" lists recaps.
   Invite links with &sendbot=1 highlight the button. Roll back: remove this script tag from index.html. */
(function(){
  var ME=null,ST=[],busy=false;
  function rid(){var m=/[#&?]room=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.hash||location.search);return m?m[1].toUpperCase():'';}
  function live(){try{var s=window.__roomLive&&window.__roomLive.state();return !!(s&&s.status==='live'&&s.self);}catch(_){return false;}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function el(id,css){var e=document.getElementById(id);if(!e){e=document.createElement('div');e.id=id;e.style.cssText=css;document.body.appendChild(e);}return e;}
  function post(act,o){return fetch('/api/sendbot/room/'+rid()+'/'+act,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(o||{})}).then(function(r){return r.json();});}
  function poll(){var id=rid();if(!id){draw();return;}if(busy)return;busy=true;
    fetch('/api/sendbot/room/'+id,{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){busy=false;if(j&&rid()===id){ME=j.me;ST=j.standins||[];}else{ST=[];}draw();}).catch(function(){busy=false;});}
  function mine(){return ME&&ST.filter(function(s){return s.name===ME;})[0];}
  function toast(t){var e=el('sbToast','position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#0b2540;color:#fff;padding:10px 16px;border-radius:10px;font:13px system-ui;z-index:100000;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:80vw');e.textContent=t;e.style.display='block';clearTimeout(e.__t);e.__t=setTimeout(function(){e.style.display='none';},6000);}
  function act(kind){
    if(kind==='off'){post('off').then(function(j){toast(j&&j.recap?'Seat back. Recap saved to My bot recaps.':'Seat back.');poll();});return;}
    var stay=live();
    post('on',{mode:stay?'stay':'send'}).then(function(j){if(!j||!j.ok){toast((j&&j.error)||'Could not send your bot.');return;}
      toast(stay?'Your bot has your seat. You can leave; it listens and saves a recap.':'Your bot is in your seat. It listens and saves a recap for you.');
      if(stay){var x=document.getElementById('rb_exit');if(x)setTimeout(function(){x.click();},600);}poll();});
  }
  function recaps(){fetch('/api/sendbot/recaps',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
    var m=el('sbRecaps','position:fixed;inset:10% 20%;overflow:auto;background:#fff;color:#123;border-radius:14px;padding:18px 22px;font:14px system-ui;z-index:100001;box-shadow:0 20px 60px rgba(0,0,0,.5)');m.style.display='block';
    var L=(j&&j.recaps)||[];m.innerHTML='<button id="sbRx" style="float:right;border:0;background:#eee;border-radius:8px;padding:4px 10px;cursor:pointer">Close</button><h3 style="margin:0 0 10px">My bot recaps</h3>'+(L.length?L.map(function(x){
      return '<div style="border-top:1px solid #ddd;padding:10px 0"><b>'+esc(x.room_name)+'</b> <span style="color:#678">'+esc(new Date(x.created).toLocaleString())+'</span><p><b>What else was discussed:</b> '+esc(x.summary)+'</p><p><b>Conclusion:</b> '+esc(x.conclusion)+'</p>'+
      (x.unanswered.length?'<p><b>Questions for you:</b></p><ul>'+x.unanswered.map(function(u){return '<li>'+esc(u.by)+': '+esc(u.q)+'</li>';}).join('')+'</ul>':'<p style="color:#678">No unanswered questions.</p>')+'</div>';}).join(''):'<p>No recaps yet.</p>');
    document.getElementById('sbRx').onclick=function(){m.style.display='none';};});}
  function draw(){
    var id=rid(),bar=document.getElementById('sbBar'),wrap=document.getElementById('sbTiles');
    if(!id||!ME){if(bar)bar.remove();if(wrap)wrap.remove();return;}
    bar=el('sbBar','position:fixed;left:14px;bottom:84px;z-index:99999;display:flex;gap:8px;font:600 13px system-ui');
    var m=mine(),hi=/sendbot=1/.test(location.hash+location.search)&&!m,b='padding:9px 14px;border-radius:22px;border:0;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);';
    var h=m?'<button data-a="off" style="'+b+'background:#fff;color:#0b2540">\u21a9 Take my seat back</button>'
          :'<button data-a="on" style="'+b+'background:'+(hi?'#ff8a00':'#1f7ae0')+';color:#fff'+(hi?';outline:3px solid #ffd27a':'')+'">\ud83e\udd16 '+(live()?'Leave, bot stays':'Send my bot')+'</button>';
    h+='<button data-a="recaps" style="'+b+'background:rgba(0,0,0,.6);color:#fff">My bot recaps</button>';
    if(bar.__h!==h){bar.innerHTML=h;bar.__h=h;Array.prototype.forEach.call(bar.querySelectorAll('button'),function(x){x.onclick=function(){var a=x.getAttribute('data-a');if(a==='recaps')recaps();else act(a);};});}
    wrap=el('sbTiles','position:fixed;right:200px;top:290px;z-index:60;display:flex;flex-direction:column;gap:10px;pointer-events:none');
    var t=ST.map(function(s){var ini=esc(String(s.name).split(/\s+/).map(function(x){return x.charAt(0);}).join('').slice(0,3).toUpperCase());var la=s.answers&&s.answers.length?s.answers[s.answers.length-1]:null;
      return '<div style="width:190px;border-radius:10px;overflow:hidden;background:#0b2540;border:2px dashed #ffb347;box-shadow:0 6px 20px rgba(0,0,0,.4);color:#fff;font:12px system-ui"><div style="height:120px;position:relative;background:'+(s.photo?'#000 url('+esc(s.photo)+') center/cover no-repeat':'linear-gradient(135deg,#123,#246)')+'">'+(s.photo?'':'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700">'+ini+'</div>')+
        '<span style="position:absolute;left:6px;top:6px;background:#ffb347;color:#000;padding:1px 6px;border-radius:5px;font-size:10px;font-weight:700">\ud83e\udd16 BOT STANDING IN</span><span style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:5px;font-size:10px">'+esc(s.label)+'</span></div>'+
        '<div style="padding:6px 8px;font-size:11px;line-height:1.35">'+(la?'<b>'+esc(la.by)+':</b> '+esc(la.q)+'<br>'+esc(la.a):'Listening only. Answers only from what '+esc(s.name)+' said in this meeting.')+'</div></div>';}).join('');
    if(wrap.__h!==t){wrap.innerHTML=t;wrap.__h=t;}
  }
  setInterval(poll,4000);setTimeout(poll,1200);addEventListener('hashchange',function(){setTimeout(poll,300);});
})();
