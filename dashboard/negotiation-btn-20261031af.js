/* negotiation-btn-20261031af (Dan, voice 3:59 PM ET Oct 31 2026): fifth Hub Rooms start-list button "Negotiation Hubrooms", after Bot Vacation World.
   Click = exactly what picking Negotiation in the Room type picker does: sets that <select> to the Negotiation option and fires 'change' (-> pickType -> openNego, buy gate included).
   Roll back: remove the script tag. */
(function(){
function sel(col){var w=col.closest('.hrw')||document;var ss=w.querySelectorAll('select');for(var i=0;i<ss.length;i++){var o=[].filter.call(ss[i].options,function(o){return /^\s*Negotiation/i.test(o.textContent);})[0];if(o)return {s:ss[i],o:o};}return null;}
function add(){document.querySelectorAll('.hrw .hrnewcol').forEach(function(col){if(col.querySelector('.hrnego'))return;
 var b=document.createElement('button');b.type='button';b.className='hrnew hrlive hrnego';b.textContent='Negotiation Hubrooms';b.title='Open the Negotiation Hub Room (same as Room type \u2192 Negotiation)';
 b.addEventListener('click',function(e){e.stopPropagation();var r=sel(col);if(r){r.s.value=r.o.value;r.s.dispatchEvent(new Event('change',{bubbles:true}));}else if(window.__nego)window.__nego.open();});
 var vw=col.querySelector('.hrvw');if(vw)vw.insertAdjacentElement('afterend',b);else col.appendChild(b);});}
new MutationObserver(add).observe(document.documentElement,{childList:true,subtree:true});add();})();
