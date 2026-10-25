/* hrvwbtn-20261023a (Dan): visible "Bot Vacation World" button right after "Bot Room" in the Hub Rooms start list; opens the vacation-world overlay (hrvacation-20261023a.js). Roll back: remove the script tag. */
(function(){function add(){document.querySelectorAll('.hrw .hrnewcol').forEach(function(col){if(col.querySelector('.hrvw'))return;var br=[].filter.call(col.querySelectorAll('button'),function(b){return b.textContent.trim()==='Bot Room';})[0];
 var b=document.createElement('button');b.type='button';b.className='hrnew hrlive hrvw';b.textContent='Bot Vacation World';b.title='Open Bot Vacation World (seat card required)';
 b.addEventListener('click',function(e){e.stopPropagation();if(window.__vwOpen)window.__vwOpen();else window.open('/botroom/vacation-world/','_blank');});
 if(br)br.insertAdjacentElement('afterend',b);else col.appendChild(b);});}
new MutationObserver(add).observe(document.documentElement,{childList:true,subtree:true});add();})();
