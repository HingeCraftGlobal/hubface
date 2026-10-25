/* hrvacation-20261023a (Dan): Hub Rooms room type "Bot Vacation World" (data entry in assets/hubrooms-data.json) opens /botroom/vacation-world/ full screen inside HubFace.
   No X: Esc (also inside the iframe) or picking the type again hides it. Roll back: remove the script tag + the JSON entry (backup kept). */
(function(){var o=null,f=null,NAME='Bot Vacation World';
function esc(e){if(e.key==='Escape'&&o&&o.style.display!=='none'){e.preventDefault();o.style.display='none';}}
function open(){if(!o){o=document.createElement('div');o.id='vwOverlay';o.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#000;display:none';
  f=document.createElement('iframe');f.src='/botroom/vacation-world/';f.title=NAME;f.allow='camera;microphone';f.style.cssText='border:0;width:100%;height:100%;display:block';
  f.addEventListener('load',function(){try{f.contentWindow.document.addEventListener('keydown',esc);}catch(e){}});o.appendChild(f);document.body.appendChild(o);}
 if(o.style.display!=='none'){o.style.display='none';return;}o.style.display='block';
 var t=document.createElement('div');t.textContent='Esc to exit';t.style.cssText='position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:2147483001;background:#0b1f4a;color:#fff;font:600 13px system-ui,sans-serif;padding:6px 12px;border-radius:14px;transition:opacity .6s;pointer-events:none';
 document.body.appendChild(t);setTimeout(function(){t.style.opacity='0';},1200);setTimeout(function(){t.remove();},1900);}
window.__vwOpen=open;
document.addEventListener('keydown',esc);
document.addEventListener('change',function(e){var s=e.target;if(s&&s.classList&&s.classList.contains('hrt')){var op=s.options[s.selectedIndex];if(op&&op.text.indexOf(NAME)===0)setTimeout(open,50);}},true);
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.hrr,.hropen');if(!b)return;var h=b.classList.contains('hrr')?b.querySelector('b'):(b.closest('.hrcard')||{}).querySelector&&b.closest('.hrcard').querySelector('h5');
 if(h&&h.textContent.trim()===NAME){e.preventDefault();e.stopPropagation();open();}},true);
})();

/* vwmin-20261023a: corner minimize (inward four arrows, 32px, same as Bot Room) on the header row left of "Map of the World"; minimizes to a dock badge like the Bot Room */
(function(){var D=null;function ov(){return document.getElementById('vwOverlay');}
function dock(){if(D)return D;D=document.createElement('button');D.type='button';D.id='vwDock';D.title='Bot Vacation World';D.setAttribute('aria-label','Bot Vacation World');
 D.innerHTML=vwIcon();
 D.style.cssText='position:fixed;bottom:14px;left:70px;z-index:2147483000;width:38px;height:38px;border-radius:50%;border:2px solid #fff;background:#0b1f4a;color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;box-shadow:0 2px 10px rgba(0,0,0,.5)';
 D.onclick=function(e){if(e&&e.target&&e.target.closest&&e.target.closest('.vwHat')){e.preventDefault();e.stopPropagation();return;}var o=ov();if(o){o.style.display='block';D.style.display='none';}};document.body.appendChild(D);return D;}
function sync(){var o=ov();if(!o)return;var m=document.getElementById('vwMinBtn');
 if(!m){m=document.createElement('button');m.type='button';m.id='vwMinBtn';m.title='Minimize Bot Vacation World (Esc)';m.setAttribute('aria-label','Minimize Bot Vacation World');
  m.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l6 6M9 4v5H4M21 3l-6 6M15 4v5h5M3 21l6-6M4 15h5v5M21 21l-6-6M20 15h-5v5"/></svg>';
  m.style.cssText='position:absolute;top:12px;right:260px;z-index:2;width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.6);border-radius:8px;background:#0b1f4a;color:#fff;cursor:pointer';
  m.onclick=function(){o.style.display='none';dock().style.display='flex';};o.appendChild(m);}
 var b=dock();if(o.style.display!=='none')b.style.display='none';
 try{var f=o.querySelector('iframe'),doc=f.contentWindow.document,h=doc.querySelector('header'),st=doc.getElementById('stage');if(h&&st){var k=st.getBoundingClientRect().width/1920||1;h.style.paddingRight=(30+44/k)+'px';var r=h.getBoundingClientRect();m.style.top=Math.round(r.top+r.height/2-16)+'px';m.style.right='8px';}}catch(e){}}
/* vwmin-20261023b: minimize is the RIGHTMOST item on the Spire header row; header padded by 44px (button + gap) so its buttons shift left */
setInterval(sync,600);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var o=ov();setTimeout(function(){if(o&&o.style.display==='none')dock().style.display='flex';},30);}},true);
})();

/* vwhat-20261023b: Vacation World dock = robot wearing a hat. Icon only. PULL UP on the hat (drag up >=15px) or LONG-PRESS it to open an icon-only hat chooser
   above the badge; pick one to set it (localStorage 'vwDockHat'). Esc / click outside closes. A plain tap on the hat does nothing; tapping the rest restores the overlay. */
var VW_HATS={cowboy:'<path d="M2 8.6c3 2.4 17 2.4 20 0" stroke-width="1.8"/><path d="M7 8.8 8 3.6c1.4 1 2.8 1 4 0 1.2 1 2.6 1 4 0l1 5.2z" fill="currentColor"/>',
 turban:'<path d="M5 10C5 3.5 19 3.5 19 10z" fill="currentColor"/><path d="M6.5 7.2c3.5-2.2 7.5-2.2 11 0M6 9c4-2.4 8-2.4 12 0" stroke="#0b1f4a" stroke-width="1"/><circle cx="12" cy="5.6" r="1.1" fill="#e5202b" stroke="none"/>',
 paris:'<ellipse cx="12" cy="9" rx="10.5" ry="1.7" fill="currentColor"/><path d="M8 8.6C8 4 16 4 16 8.6z" fill="currentColor"/><path d="M8.2 7.6h7.6" stroke="#e5202b" stroke-width="1.3"/>',
 tophat:'<path d="M3.5 9.3h17" stroke-width="2"/><rect x="7.5" y="1.2" width="9" height="7.6" rx=".6" fill="currentColor"/><path d="M7.5 6.8h9" stroke="#e5202b" stroke-width="1.3"/>',
 sunhat:'<ellipse cx="12" cy="9.2" rx="10" ry="2" fill="currentColor"/><path d="M7.6 8.8C7.6 3.6 16.4 3.6 16.4 8.8z" fill="currentColor"/><path d="M7.8 7.9h8.4" stroke="#f5b301" stroke-width="1.3"/>',
 toque:'<path d="M6 10C6 3.8 18 3.8 18 10z" fill="currentColor"/><rect x="5.5" y="8.4" width="13" height="2.4" rx="1" fill="currentColor" stroke="#0b1f4a" stroke-width=".8"/><circle cx="12" cy="2.6" r="1.8" fill="currentColor"/><path d="M9 5.6v2.4M12 4.9v3M15 5.6v2.4" stroke="#0b1f4a" stroke-width=".8"/>',
 helmet:'<path d="M4.5 12.5C4.5 5.5 8 2 12.5 2s7.5 3.4 7.5 9v1.5z" fill="currentColor"/><path d="M8 8.2h11.2v3H8.6z" fill="#0b1f4a" stroke="currentColor" stroke-width="1"/><path d="M6.5 6.5 9 3.8" stroke="#e5202b" stroke-width="1.4"/>',
 cap:'<path d="M6 10C6 4.5 18 4.5 18 10z" fill="currentColor"/><path d="M15 9.6h7.5" stroke-width="2"/><circle cx="12" cy="4.6" r=".9" fill="currentColor"/>',
 beret:'<ellipse cx="11" cy="8" rx="8.5" ry="3" fill="currentColor"/><path d="M5 10.2h12" stroke="#0b1f4a" stroke-width="1"/><path d="M11 5V3.4" stroke-width="1.6"/>',
 chef:'<rect x="7.5" y="7" width="9" height="3.6" rx=".5" fill="currentColor"/><path d="M7.5 7.4C4.6 7.4 4.6 2.6 8 3.4 8.6.6 15.4.6 16 3.4c3.4-.8 3.4 4 .5 4z" fill="currentColor"/><path d="M10 7v3.4M14 7v3.4" stroke="#0b1f4a" stroke-width=".8"/>',
 crown:'<path d="M5 10.4 4 3.4l4.2 3.4L12 1.8l3.8 5 4.2-3.4-1 7z" fill="#f5b301" stroke="#f5b301"/><circle cx="12" cy="7.6" r="1" fill="#e5202b" stroke="none"/>',
 pirate:'<path d="M2.5 9.5C5 8 7 3 12 3s7 5 9.5 6.5C16 11 8 11 2.5 9.5z" fill="currentColor"/><circle cx="12" cy="6.6" r="1.2" fill="#0b1f4a" stroke="none"/><path d="M10.6 8.3l2.8-.6M10.6 7.7l2.8.6" stroke="#0b1f4a" stroke-width=".7"/>',
 hardhat:'<path d="M5 9.6C5 4.4 8 2.6 12 2.6s7 1.8 7 7z" fill="#f5b301" stroke="#f5b301"/><path d="M3 10h18" stroke="#f5b301" stroke-width="2"/><path d="M12 2.6v4.6" stroke="#0b1f4a" stroke-width="1.2"/>'};
var VW_ORDER=['cowboy','turban','paris','tophat','sunhat','toque','helmet','cap','beret','chef','crown','pirate','hardhat'];
var VW_ARIA={cowboy:'Cowboy hat',turban:'Turban',paris:'Wide-brim Paris hat',tophat:'Top hat',sunhat:'Sun hat',toque:'Ski toque',helmet:'Racing helmet',cap:'Baseball cap',beret:'Beret',chef:'Chef\'s hat',crown:'Crown',pirate:'Pirate hat',hardhat:'Hard hat'};
function vwHat(){var h='';try{h=localStorage.getItem('vwDockHat')||'';}catch(e){}return VW_ORDER.indexOf(h)>=0?h:'cowboy';}
function vwIcon(){var h=vwHat();return '<svg viewBox="0 0 24 24" width="74%" height="74%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible">'+
 '<rect x="6" y="11.2" width="12" height="9.6" rx="2.4"/><circle cx="9.6" cy="15.4" r="1.25" fill="currentColor"/><circle cx="14.4" cy="15.4" r="1.25" fill="currentColor"/><path d="M10 18.4h4M4.2 15v2.4M19.8 15v2.4"/>'+
 '<g class="vwHat" style="cursor:grab;touch-action:none"><rect x="0" y="0" width="24" height="11" fill="transparent" stroke="none"/>'+VW_HATS[h]+'</g></svg>';}
function vwSet(h){try{localStorage.setItem('vwDockHat',h);}catch(e){}var d=document.getElementById('vwDock');if(d)d.innerHTML=vwIcon();}
var vwPick=null;
function vwClose(){if(vwPick){vwPick.remove();vwPick=null;}}
function vwOpen(){var d=document.getElementById('vwDock');if(!d||vwPick)return;var r=d.getBoundingClientRect(),cur=vwHat();
 vwPick=document.createElement('div');vwPick.id='vwHatPick';vwPick.setAttribute('role','listbox');vwPick.setAttribute('aria-label','Choose a hat');
 vwPick.style.cssText='position:fixed;left:'+Math.max(6,Math.round(r.left+r.width/2-98))+'px;bottom:'+Math.round(innerHeight-r.top+8)+'px;z-index:2147483001;display:grid;grid-template-columns:repeat(5,34px);gap:5px;padding:7px;background:#0b1f4a;border:2px solid #fff;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.55)';
 VW_ORDER.forEach(function(h){var b=document.createElement('button');b.type='button';b.setAttribute('aria-label',VW_ARIA[h]);b.dataset.hat=h;
  b.style.cssText='width:34px;height:34px;padding:3px;border-radius:8px;cursor:pointer;color:#fff;background:'+(h===cur?'rgba(255,255,255,.22)':'transparent')+';border:1px solid '+(h===cur?'#fff':'rgba(255,255,255,.35)');
  b.innerHTML='<svg viewBox="0 0 24 13" width="26" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible">'+VW_HATS[h]+'</svg>';
  b.onclick=function(e){e.stopPropagation();vwSet(h);vwClose();};vwPick.appendChild(b);});
 document.body.appendChild(vwPick);}
document.addEventListener('pointerdown',function(e){if(vwPick&&!vwPick.contains(e.target)&&!(e.target.closest&&e.target.closest('#vwDock .vwHat')))vwClose();},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&vwPick){vwClose();e.stopPropagation();}},true);
(function(){var y0=null,lp=null;
 document.addEventListener('pointerdown',function(e){var h=e.target.closest&&e.target.closest('#vwDock .vwHat');if(!h)return;e.preventDefault();y0=e.clientY;clearTimeout(lp);lp=setTimeout(function(){y0=null;vwOpen();},550);},true);
 document.addEventListener('pointermove',function(e){if(y0==null)return;if(y0-e.clientY>=15){y0=null;clearTimeout(lp);vwOpen();}},true);
 document.addEventListener('pointerup',function(){y0=null;clearTimeout(lp);},true);document.addEventListener('pointercancel',function(){y0=null;clearTimeout(lp);},true);})();
window.vwHatChooser={open:vwOpen,close:vwClose,set:vwSet,get:vwHat};
