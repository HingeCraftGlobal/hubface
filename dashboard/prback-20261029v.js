/* prback-20261029v (Dan voice Oct 29 2026, STAGED): "Back to pre-room". The live Bot Room frame posts {brPreroom:1,room}; this hides the
   live frame (the live room keeps running) and reopens the pre-room cards in late mode over it. The glowing Bot room button goes back in.
   Also adds a Back to pre-room button on the live bar. Roll back: remove the script tag from dashboard index.html. */
(function(){var D=document;
function prId(){try{var v=window.__prView;if(v&&v.id)return v.id;return localStorage.getItem('hf-last-live-preroom')||'';}catch(e){return '';}}
function back(){var l=D.getElementById('prLive');if(l){var f=l.querySelector('iframe');if(f)f.style.display='none';l.style.height='auto';l.style.bottom='auto';}
 var id=prId();var fr=D.getElementById('prFrame');var w=null;try{w=fr&&fr.contentWindow&&fr.contentWindow.prCards?fr.contentWindow:null;}catch(e){}
 if(w&&w.prCards.back){w.prCards.back();if(window.__prShow)window.__prShow();return;}
 if(window.__prOpen&&/^PR-[0-9A-F]{10}$/.test(id))window.__prOpen('&room='+encodeURIComponent(id)+'&late=1');}
window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||!e.data.brPreroom)return;back();});
setInterval(function(){var bar=D.querySelector('#prLive #prBar');if(!bar||D.getElementById('prLiveBack'))return;var b=D.createElement('button');b.id='prLiveBack';b.textContent='Back to pre-room';b.onclick=back;var x=D.getElementById('prLiveExit');bar.insertBefore(b,x||null);},700);
})();
