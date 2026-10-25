/* widget-read.js widgetread-20261021f — standard 🔊 Read button for dashboard widgets (POST /api/tts, existing voices: Ava=eve, Finn=lumen) */
(function(){
  var BUILD='widgetread-20261021f', VOICES={ava:'eve',finn:'lumen'}, reg={}, cur=null;
  var AUTO={'weather':/^WEATHER/i,'schedule':/^SCHEDULE/i,'home-status':/^HOME STATUS/i,'priorities':/^PRIORITIES/i,'news-briefing':/^NEWS BRIEFING/i,'other':/^OTHER/i,'email':/\bE-?MAIL\b|INBOX/i,'youtube':/YOUTUBE/i};
  var NAMES={'weather':'Weather','schedule':'Schedule','home-status':'Home Status','priorities':'Priorities','news-briefing':'News Briefing','other':'Other','email':'Email (Requires Reply)','youtube':'YouTube'};
  function api(){return (window.__voice&&window.__voice.api)||location.origin;}
  function findBox(id){if(id==='email'){var pe=document.querySelector('section[data-float="priorities-email"]');if(pe)return pe;}if(id==='priorities'){var pp=document.querySelector('section[data-float="priorities"]');if(pp)return pp;}if(id.indexOf('prio:')===0)return document.querySelector('section[data-float="priorities-'+id.slice(5)+'"]');var W={email:'emailReader',youtube:'ent'}[id];if(W){var wb=document.querySelector('#ui > .wbx[data-w="'+W+'"]')||document.querySelector('.wbx[data-w="'+W+'"]');if(wb)return wb;}if(id==='youtube'){var yp=document.getElementById('ytPanel');if(yp)return yp;}var re=AUTO[id];if(!re)return null;var bs=document.querySelectorAll('section.box header b, section header b');for(var i=0;i<bs.length;i++)if(re.test(bs[i].textContent.trim()))return bs[i].closest('section');return null;}
  function visibleText(b){
    var c=b.cloneNode(true); c.querySelectorAll('header,.whead,.wplayer,.yth,.ytstats,img,picture,canvas,.ctl,button,input,video,iframe,audio,script,style,svg,.wr-btn,[aria-hidden="true"]').forEach(function(n){n.remove();});
    c.querySelectorAll('[style*="display:none"],[style*="display: none"]').forEach(function(n){n.remove();});
    return (c.textContent||'').replace(/\s+/g,' ').trim();
  }
  function chunks(t){var out=[],buf='';(t.match(/[^.!?]+[.!?]*\s*/g)||[t]).forEach(function(s){s=s.trim();while(s.length>220){out.push(s.slice(0,220));s=s.slice(220);}if((buf+' '+s).length>220){if(buf)out.push(buf);buf=s;}else buf=(buf?buf+' ':'')+s;});if(buf)out.push(buf);return out.filter(Boolean);}
  function tts(text,voice,signal){return fetch(api()+'/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text,voice_id:voice}),signal:signal,credentials:'include'}).then(function(r){if(!r.ok)throw new Error('tts '+r.status);return r.blob();}).then(function(bl){return new Promise(function(res,rej){var a=new Audio();a.preload='auto';a.oncanplaythrough=function(){a.oncanplaythrough=null;res(a);};a.onerror=function(){rej(new Error('audio'));};a.src=URL.createObjectURL(bl);a.load();});});}
  function setBtn(id,on){var e=reg[id]&&reg[id].btn;if(e){e.textContent=on?'⏹':'🔊';e.title=on?'Stop reading':'Read '+reg[id].title;e.setAttribute('aria-pressed',on);}}
  function stop(){if(!cur)return;cur.stopped=true;try{cur.ctl.abort();}catch(e){}if(cur.audio){cur.audio.pause();}setBtn(cur.id,false);var c=cur;cur=null;window.__widgetRead.last=c.log;}
  function read(id,o){
    o=o||{}; if(cur){var same=cur.id===id;stop();if(same&&!o.force)return Promise.resolve('stopped');}
    var r=reg[id]; if(!r)return Promise.reject(new Error('not registered: '+id));
    var text=(r.getText?r.getText():'')||visibleText(r.box()||document.createElement('div'));
    if(!text)text='Nothing to read in '+r.title+' right now.';
    var voice=VOICES[(o.agent||'ava').toLowerCase()]||VOICES.ava, parts=chunks(r.title+'. '+text);
    var me={id:id,ctl:new AbortController(),stopped:false,log:{id:id,voice:voice,chunks:parts.length,fetched:0,played:0}}; cur=me; setBtn(id,true);
    var next=tts(parts[0],voice,me.ctl.signal), i=0;
    function step(p){return p.then(function(a){me.log.fetched++;if(me.stopped)return;i++;var pre=i<parts.length?tts(parts[i],voice,me.ctl.signal):null;if(pre)pre.catch(function(){});
      return new Promise(function(res){me.audio=a;a.onended=res;a.onerror=res;var pp=a.play();if(pp&&pp.catch)pp.catch(res);}).then(function(){me.log.played++;URL.revokeObjectURL(a.src);if(pre&&!me.stopped)return step(pre);});});}
    return step(next).catch(function(e){me.log.error=String(e&&e.message||e);}).then(function(){if(cur===me){setBtn(id,false);cur=null;}window.__widgetRead.last=me.log;return me.log;});
  }
  function register(id,opt){
    opt=opt||{}; var old=reg[id]; reg[id]={title:opt.title||NAMES[id]||id,getText:opt.getText||(old&&old.getText),box:opt.box||function(){return findBox(id);},btn:old&&old.btn};
    attach(id); return reg[id];
  }
  function attach(id){
    var r=reg[id], b=r.box(); if(!b)return; var h=b.querySelector('header')||b.querySelector('.whead')||b.querySelector('.yth'); if(!h)return;
    if(r.btn&&b.contains(r.btn))return; var ex=b.querySelector('.wr-btn'); if(ex)ex.remove();
    var e=document.createElement('button'); e.type='button'; e.className='wr-btn'; e.textContent='🔊'; e.title='Read '+r.title;
    e.style.cssText='cursor:pointer;font-size:10px;background:none;border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:0 5px;margin-left:3px;color:inherit;line-height:14px';
    e.addEventListener('click',function(ev){ev.stopPropagation();read(id);});
    var chips=b.querySelector('.nf-chips-type'); if(chips) chips.appendChild(e); else { var wt=h.querySelector('.wtitle'); if(wt){wt.parentNode.insertBefore(e,wt.nextSibling);} else { var bb=h.querySelector('b'); if(bb&&bb.nextSibling) h.insertBefore(e,bb.nextSibling.nextSibling||null); else h.appendChild(e); } }
    r.btn=e;
  }
  function scan(){document.querySelectorAll('section[data-prio-inst]').forEach(function(s){var k=s.getAttribute('data-prio-inst');if(k==='email')return;var id='prio:'+k;if(!reg[id])register(id,{title:s.getAttribute('aria-label')||('Priorities '+k)});else attach(id);});Object.keys(AUTO).forEach(function(id){var b=findBox(id);if(!b)return;if(id==='youtube'&&!reg[id])register(id,{title:'YouTube',getText:function(){var bx=findBox('youtube');if(!bx)return '';var t=bx.querySelector('.wtitle')||bx.querySelector('.yth b');return ((t?t.textContent.trim()+'. ':'')+visibleText(bx)).trim();}});else if(!reg[id])register(id,{});else attach(id);});}
  /* voice: "read my <widget>" typed or spoken to Finn/Ava goes through POST /api/dashboard/chat; answer locally and read it */
  var of=window.fetch;
  window.fetch=function(u,init){try{if(typeof u==='string'&&/\/api\/dashboard\/chat$/.test(u.split('?')[0])&&init&&init.body){var b=JSON.parse(init.body),m=/\bread (?:me )?(?:my |the )?(.+?)(?: please)?[.!?]*$/i.exec(String(b.text||'').trim());
    if(m){var want=m[1].toLowerCase().replace(/\bwidget\b/,'').trim(),id=Object.keys(NAMES).filter(function(k){return want.indexOf(NAMES[k].toLowerCase())>=0||want.indexOf(k)>=0||(k==='news-briefing'&&/news|briefing|headlines/.test(want));})[0];
      if(id){scan();var agent=/\bava\b/i.test(JSON.stringify(b))?'ava':'finn';setTimeout(function(){read(id,{agent:agent,force:true});},2500);
        return Promise.resolve(new Response(JSON.stringify({reply:'Reading your '+NAMES[id]+'.',text:'Reading your '+NAMES[id]+'.',voice_id:VOICES[agent]}),{status:200,headers:{'Content-Type':'application/json'}}));}}}}catch(e){}
    return of.apply(this,arguments);};
  /* (e) header controls above the drag overlay .fhandle: real mouse clicks reach Read, chips, buttons, inputs and links; empty header still drags */
  (function(){var s=document.createElement('style');s.textContent='#ui section > header .wr-btn,#ui section > header .nf-chips-type,#ui section > header .nf-tchip,#ui section > header button,#ui section > header input,#ui section > header select,#ui section > header a,#ui section > header [role=button],#ui .wbx .whead .wr-btn,#ui .yth .wr-btn,#ui .nf-wrap,#ui .nf-wrap *{pointer-events:auto!important}#ui section > header .wr-btn,#ui section > header .nf-chips-type,#ui section > header .nf-tchip,#ui section > header button,#ui section > header input,#ui section > header select,#ui section > header a,#ui section > header [role=button],#ui .wbx .whead .wr-btn,#ui .yth .wr-btn{position:relative;z-index:60}';document.head.appendChild(s);})();
  window.__widgetRead={build:BUILD,register:register,read:read,stop:stop,list:function(){return Object.keys(reg);},chunks:chunks,last:null};
  function start(){scan();setInterval(scan,3000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
