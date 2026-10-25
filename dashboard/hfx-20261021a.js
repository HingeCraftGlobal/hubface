/* hfx-20261021a (Dan approved Oct 21 ~10:54pm ET): round red X on every companion tile in HubFace rooms (html.rb-room only):
   Ava/Finn bar (#vbBar), Moderator card (#hfMod), agent bars (.hfap: Professor, Moderator, Mara, Theo), companion panel (.hfcp), Moderator / companion tiles.
   Click = remove that bot from the room via HF_removeBot(id) (same save path as Invite bot / Close all), closes its bar/panel.
   Main dashboard untouched (no X outside rooms). Roll back: /opt/hubface/backups/hfx-20261021a/ROLLBACK.sh */
(function(){
  'use strict';
  if(window.__hfX)return;window.__hfX={build:'hfx-20261021a',clicks:[]};
  var st=document.createElement('style');
  st.textContent='.hfx-x{display:none;position:fixed;z-index:2147483647!important;pointer-events:auto!important;visibility:visible!important;width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:#b3261e;color:#fff;font:bold 14px/18px system-ui;text-align:center;padding:0;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.45)}.hfx-x:hover{background:#d93025}';
  (document.head||document.documentElement).appendChild(st);
  function inRm(){return document.documentElement.classList.contains('rb-room');}
  function bots(){try{return typeof window.HF_roomBots==='function'?window.HF_roomBots():[];}catch(_){return [];}}
  function idOf(el){
    if(el.id==='vbBar'){var m=el.querySelector('.rfMute[data-bot]');if(m)return m.getAttribute('data-bot');var s=(el.querySelector('#vbFace,.portrait')||{}).src||'';return /ava/i.test(s.split('/').pop())?'ava':'finn';}
    if(/^hfap-/.test(el.id))return el.id.slice(5);
    if(el.id==='rxModTile'||el.id==='hfMod')return 'moderator';
    if(/^rxSoon_/.test(el.id))return el.id.slice(7);
    return el.getAttribute('data-bot')||el.getAttribute('data-agent')||'';
  }
  function remove(id,el){
    window.__hfX.clicks.push(id);
    try{var c=window.HF_agentPanel&&window.HF_agentPanel.current();if(c&&c.id===id)window.HF_agentPanel.close();}catch(_){}
    try{if(el.classList.contains('hfcp')){var x=el.querySelector('button.x');if(x)x.click();}}catch(_){}
    try{if(el.id==='hfMod'){var cb=[].filter.call(el.querySelectorAll('button'),function(x){return /^\s*Close\s*$/i.test(x.textContent);})[0];if(cb)cb.click();else el.style.display='none';}}catch(_){}
    try{if(typeof window.HF_removeBot==='function')window.HF_removeBot(id);}catch(_){}
  }
  var M=new Map();   /* tile -> its X (X lives on <body>, position:fixed, so tile drag handles can't cover it) */
  function place(el,b){var r=el.getBoundingClientRect();var vis=r.width>30&&r.height>20&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
    b.style.display=vis?'block':'none';if(!vis)return;var cp=el.classList.contains('hfcp');b.style.left=Math.round(r.right-(cp?58:23))+'px';b.style.top=Math.round(r.top+(cp?12:3))+'px';}
  function scan(){
    var room=inRm(),on=room?bots():[],seen=new Set();
    if(room)[].forEach.call(document.querySelectorAll('#vbBar, section.hfap, .hfcp, #hfMod, #rxModTile, [id^="rxSoon_"], .hfModTile[data-bot], .hfcpTile[data-bot]'),function(el){
      var id=idOf(el);if(!id||on.indexOf(id)<0)return;seen.add(el);
      var b=M.get(el);
      if(!b){b=document.createElement('button');b.type='button';b.className='hfx-x';b.textContent='\u00d7';
        b.title='Remove from room';b.setAttribute('aria-label','Remove from room');
        b.addEventListener('pointerdown',function(e){e.stopPropagation();},true);
        b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();remove(b.dataset.bot,el);setTimeout(scan,50);});
        document.body.appendChild(b);M.set(el,b);}
      b.dataset.bot=id;place(el,b);
    });
    M.forEach(function(b,el){if(!seen.has(el)||!el.isConnected){b.remove();M.delete(el);}});
  }
  setInterval(scan,250);document.addEventListener('hf:bot-remove',function(){setTimeout(scan,50);});
})();
