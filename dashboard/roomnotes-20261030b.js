/* roomnotes-20261029a (Dan host command 2026-10-29): top-of-room bar with "Save transcript" (all) and host-only "Record"
   (moves the existing room-rec.js #rx_rec button up; hidden for guests). Exit room first asks
   "Save the meeting notes before leaving?" Save and leave / Leave without saving / Cancel (reuses roomdl-20261028a logic).
   Transcript = __hfRoomChat.log (timestamps ET + speaker), falls back to visible chat. Rollback: remove its script tag. */
(function(){'use strict';if(window.__rbNotes)return;window.__rbNotes=1;var ET={timeZone:'America/New_York'};
function App(){return window.__rb&&window.__rb.App}
function isHost(){try{if(App().state.room.roomKey)return true}catch(_){}try{var s=window.__roomLive&&window.__roomLive.state().self;if(s&&s.role==="host")return true}catch(_){}return false}
function rid(){try{var r=App().state.room;return String(r.id||r.code||'room')}catch(_){return 'room'}}
function rname(){var e=document.getElementById('rb_roomName');var t=e&&e.textContent.trim();return t||rid()}
function parts(d){var g={};new Intl.DateTimeFormat('en-US',Object.assign({year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false},ET)).formatToParts(d).forEach(function(x){g[x.type]=x.value});if(g.hour==='24')g.hour='00';return g}
function fileStamp(d){var g=parts(d);return g.year+'-'+g.month+'-'+g.day+'_'+g.hour+g.minute}
function tm(at){var g=parts(new Date(at));return g.hour+':'+g.minute+':'+g.second}
/* roomnotes-20261030b: Bot Room runs in its own iframe; read its chat (window.__brHdr.msgs()) and Voices lines (#vrLive) */
function brFrames(){var o=[];[].slice.call(document.querySelectorAll('iframe')).forEach(function(f){try{var w=f.contentWindow;if(w&&w.__brHdr)o.push(w)}catch(_){}});return o}
function brLog(){var out=[],seen={};brFrames().forEach(function(w){var h=w.__brHdr,ms=[];try{ms=h.msgs()||[]}catch(_){}
 ms.forEach(function(m){if(m.pending)return;var k=m.at+'|'+m.text;if(seen[k])return;seen[k]=1;out.push({at:+m.at||Date.now(),from:m.from||'?',text:String(m.text||''),room:h.room})});
 if(!out.length){try{var lv=w.document.getElementById('vrLive');if(lv)[].slice.call(lv.children).forEach(function(e){var t=e.innerText.trim();if(t)out.push({at:0,from:'',text:t,room:h.room,raw:1})})}catch(_){}}
 });return out}
function build(){var id=rid(),log=[],now=new Date(),g=parts(now);try{log=(window.__hfRoomChat&&window.__hfRoomChat.log||[]).filter(function(x){return !x.room||x.room.indexOf(id)>=0||id==='room'})}catch(_){}
 var bl=[];if(!log.length){try{bl=brLog()}catch(_){}}if(bl.length){var br=bl[0].room;if(br)id=br;}
 var L=['HubFace room: '+(bl.length?'Bot Room':rname()),'Room ID: '+id,'Saved: '+g.year+'-'+g.month+'-'+g.day+' '+g.hour+':'+g.minute+' ET','Times are Eastern (ET).',''];
 if(!log.length&&bl.length){bl.forEach(function(x){L.push(x.raw?x.text:'['+tm(x.at)+'] '+x.from+': '+x.text.replace(/\r\n?/g,'\n'))})}
 else if(log.length)log.slice().sort(function(a,b){return a.at-b.at}).forEach(function(x){L.push('['+tm(x.at)+'] '+String(x.from||'?')+(x.source==='voice'?' (voice)':'')+': '+String(x.text||'').replace(/\r\n?/g,'\n'))});
 else{var c=document.getElementById('rb_roomChat');if(c){var rows=[].slice.call(c.children).map(function(e){return e.innerText.trim()}).filter(Boolean);L.push('(from the visible chat)','');rows.reverse().forEach(function(t){L.push(t,'')})}else L.push('(no transcript lines yet)')}
 return L.join('\n')+'\n'}
function download(){var safe=(rname()+'').replace(/[^\w-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'room';
 var bl=new Blob([build()],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download='hubface-notes-'+safe+'-'+fileStamp(new Date())+'.txt';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1500);try{App().toast('Meeting notes saved')}catch(_){}}
window.__rbSaveNotes=download;
var st=document.createElement('style');st.textContent='#rnQ{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}#rnQ .bx{background:#141c33;color:#e6edff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:16px 18px;max-width:340px;font:13px system-ui,sans-serif}#rnQ p{margin:0 0 12px}#rnQ button{margin:0 8px 6px 0;padding:6px 12px;border-radius:7px;border:1px solid rgba(255,255,255,.25);background:#24345e;color:#fff;cursor:pointer}#rnTop{position:static;display:inline-flex;align-items:center;gap:4px;margin:0 4px;vertical-align:middle}#rnTop button{border:1px solid rgba(255,255,255,.25);background:#24345e;color:#fff;border-radius:7px;padding:4px 10px;font:12px system-ui,sans-serif;cursor:pointer;min-width:0;height:auto}#rnTop #rx_rec.on{background:#c62828;color:#fff}';document.head.appendChild(st);
function ask(){return new Promise(function(res){var o=document.createElement('div');o.id='rnQ';o.innerHTML='<div class=bx role=dialog aria-modal=true><p>Save the meeting notes before leaving?</p><button id=rnS>Save and leave</button><button id=rnN>Leave without saving</button><button id=rnC>Cancel</button></div>';document.body.appendChild(o);function done(v){document.removeEventListener('keydown',k,true);o.remove();res(v)}function k(e){if(e.key==='Escape'){e.stopPropagation();done(null)}}document.addEventListener('keydown',k,true);o.addEventListener('mousedown',function(e){if(e.target===o)done(null)});o.querySelector('#rnS').onclick=function(){done(true)};o.querySelector('#rnN').onclick=function(){done(false)};o.querySelector('#rnC').onclick=function(){done(null)};o.querySelector('#rnS').focus()})}
document.addEventListener('click',async function(ev){var b=ev.target.closest&&ev.target.closest('#rb_exit');if(!b||b.__rnPass)return;ev.stopImmediatePropagation();ev.preventDefault();var v=await ask();if(v===null)return;if(v){try{download()}catch(e){}}b.__rnPass=true;try{b.click()}finally{b.__rnPass=false}},true);
function vis(e){if(!e||!e.isConnected)return false;if(!e.getClientRects().length)return false;var c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'}
/* restorebtns-20261029: gate only on the room being open (html.rb-room or App.inRoom) + Exit room visible */function inRoomNow(){var a=App(),r=document.documentElement.classList.contains('rb-room');try{if(a&&(a.inRoom===true||(typeof a.inRoom==='function'&&a.inRoom())))r=true}catch(_){}try{if(window.__rb&&window.__rb.inRoom&&window.__rb.inRoom())r=true}catch(_){}return r&&vis(document.getElementById('rb_exit'))}
function attach(){var bar=document.getElementById('rbBar'),t=document.getElementById('rnTop'),ex=document.getElementById('rb_exit');
 if(!t){t=document.createElement('span');t.id='rnTop';var s=document.createElement('button');s.type='button';s.id='rnSave';s.textContent='Save transcript';s.title='Download the room transcript as a .txt file';s.onclick=download;t.appendChild(s)}
 var r=document.getElementById('rx_rec');if(r&&r.parentNode!==t)t.appendChild(r);
 var on=!!(bar&&ex&&inRoomNow());
 if(on){if(t.parentNode!==bar||t.nextSibling!==ex)bar.insertBefore(t,ex);t.style.display='';if(r)r.style.display=isHost()?'':'none'}
 else{t.style.display='none';if(t.parentNode!==document.body&&t.parentNode!==bar)document.body.appendChild(t)}}
setInterval(attach,700);attach();})();
/* fullscreen-20261029: Full screen icon button at the right end of the room bottom bar (#rbBar), after Exit room; shown only in a room. Roll back: restore .bak-fullscreen-20261029 */
(function(){"use strict";if(window.__rbFs)return;window.__rbFs=1;
var EXP="<svg width=16 height=16 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d=\"M12 2v6M9 5l3-3 3 3M12 22v-6M9 19l3 3 3-3M2 12h6M5 9l-3 3 3 3M22 12h-6M19 9l3 3-3 3\"/></svg>";
var CON="<svg width=16 height=16 viewBox=\"0 0 24 24\" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d=\"M12 2v6M9 5l3 3 3-3M12 22v-6M9 19l3-3 3 3M2 12h6M5 9l3 3-3 3M22 12h-6M19 9l-3 3 3 3\"/></svg>";
var st=document.createElement("style");st.textContent="#rbBar #rnFs{display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;margin-left:4px;line-height:0}";document.head.appendChild(st);
function fsEl(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function tgt(){return document.getElementById("rbLayer")||document.documentElement}
function lbl(){var b=document.getElementById("rnFs");if(!b)return;var on=!!fsEl();b.innerHTML=on?CON:EXP;var t=on?"Exit full screen (Esc)":"Full screen";b.title=t;b.setAttribute("aria-label",t);b.setAttribute("aria-pressed",on?"true":"false")}
function toggle(){try{if(fsEl()){(document.exitFullscreen||document.webkitExitFullscreen).call(document)}else{var e=tgt();var p=(e.requestFullscreen||e.webkitRequestFullscreen).call(e);if(p&&p.catch)p.catch(function(){try{window.__rb.App.toast("Full screen not allowed here")}catch(_){}})}}catch(_){}}
function tick(){var bar=document.getElementById("rbBar"),ex=document.getElementById("rb_exit"),t=document.getElementById("rnTop"),b=document.getElementById("rnFs");
 if(!b){b=document.createElement("button");b.type="button";b.id="rnFs";b.onclick=toggle;lbl()}
 var on=!!(bar&&ex&&t&&t.parentNode===bar&&t.style.display!=="none");
 if(on){if(b.parentNode!==bar||ex.nextSibling!==b)ex.parentNode.insertBefore(b,ex.nextSibling);b.style.display=""}
 else{b.style.display="none";var _f=fsEl();if(_f&&_f.id==="rbLayer"){try{document.exitFullscreen()}catch(_){}}}/* fsfix-20261030q */}
document.addEventListener("fullscreenchange",lbl);document.addEventListener("webkitfullscreenchange",lbl);
setInterval(tick,700);tick()})();
