/* botroom-overlay-20261023a (Dan): Hub Rooms "Bot Room" opens /botroom/ full screen inside HubFace; X or Esc returns to the dashboard. Roll back: remove the script tag. */
(function(){var o=null;
function close(){if(o)o.style.display='none';}
window.__brOpen=function(){
 if(!o){o=document.createElement('div');o.id='brOverlay';
  o.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;background:#000;display:none';
  var f=document.createElement('iframe');f.src='/botroom/';f.title='Bot Room';f.style.cssText='border:0;width:100%;height:100%;display:block';
  var x=document.createElement('button');x.type='button';x.title='Back to HubFace';x.setAttribute('aria-label','Close Bot Room');x.textContent='\u2715';
  x.style.cssText='position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483001;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.45);background:rgba(10,20,40,.9);color:#fff;font:600 15px/1 system-ui,sans-serif;cursor:pointer;pointer-events:auto';
  x.onclick=close;o.appendChild(f);o.appendChild(x);document.body.appendChild(o);}
 o.style.display='block';return true;};
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&o&&o.style.display!=='none')close();});
})();