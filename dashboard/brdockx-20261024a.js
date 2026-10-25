/* brdockx-20261024a: give the background & recording glass box (#brDock: speaker, loop, video, REC) a close X like the other floating boxes.
   X sits flush right; fold (four-arrow) and fog shift left. Closing folds it into its 9-dot icon (#brIcon), the box's existing restore path. */
(function(){
  "use strict";
  var X='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function css(){if(document.getElementById('brdockx-css'))return;var st=document.createElement('style');st.id='brdockx-css';
    st.textContent='#brDock > .ctl.brx{right:6px;top:5px}#brDock > .brmin{right:24px!important}#brDock > .fogbtn{right:42px!important}#brDock > i.pin{right:46px!important}#brDock > .ctl.brx,#brDock > .ctl.brx *{pointer-events:auto!important;cursor:pointer}';
    document.head.appendChild(st);}
  function add(){var b=document.getElementById('brDock');if(!b||!window.__brDock)return false;if(b.querySelector(':scope > .brx'))return true;css();
    var x=document.createElement('span');x.className='ctl x brx';x.setAttribute('role','button');x.title='Close (reopen from the 9-dot icon)';x.setAttribute('aria-label','Close background and recording controls');x.innerHTML=X;
    x.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();});
    x.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();window.__brDock.close();});
    b.appendChild(x);return true;}
  if(!add()){var n=0,t=setInterval(function(){if(add()||++n>40)clearInterval(t);},250);}
})();
