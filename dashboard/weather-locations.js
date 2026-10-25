/* weather-locations.js  build wxlocs-20261021b
   Multi-location weather: "Add location" button under the main Weather view, a saved list of places
   (name + current temp, X to remove). Tapping a row makes it the active home (main view switches via
   window.__wxLoc.set) and the old home drops into the list. Keyless Open-Meteo geocoding + forecast.
   localStorage: hinge-wx-list (list); active home lives in the existing hinge-wx-loc. Page-side only. */
(function(){
  var TAG="wxlocs-20261021b",KEY="hinge-wx-list";
  var GEO="https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=";
  var CODE={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Heavy rain",71:"Snow",73:"Snow",75:"Heavy snow",80:"Showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm"};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function ok(p){return p&&typeof p.name==="string"&&isFinite(p.lat)&&isFinite(p.lon);}
  function cp(p){var o={name:String(p.name).replace(/[<>]/g,"").slice(0,60),lat:+(+p.lat).toFixed(4),lon:+(+p.lon).toFixed(4)};if(p.sub)o.sub=String(p.sub).slice(0,80);return o;}
  function same(a,b){return Math.abs(a.lat-b.lat)<0.01&&Math.abs(a.lon-b.lon)<0.01;}
  function load(){try{var l=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(l)?l.filter(ok).map(cp):[];}catch(e){return [];}}
  var LIST=load();
  function save(){try{localStorage.setItem(KEY,JSON.stringify(LIST));}catch(e){}}
  function unit(){try{return localStorage.getItem("hinge-wx-unit")==="c"?"c":"f";}catch(e){return "f";}}
  function deg(f){return Math.round(unit()==="c"?(f-32)*5/9:f);}
  function home(){try{return window.__wxLoc&&window.__wxLoc.get().home;}catch(e){return null;}}
var KNOWN="Acapulco,Cancun,Mexico City,Guadalajara,Monterrey,Puerto Vallarta,Cabo San Lucas,Tijuana,Havana,Punta Cana,Santo Domingo,San Juan,Nassau,Kingston,Montego Bay,Bridgetown,Panama City,San Jose,Bogota,Medellin,Cartagena,Lima,Quito,Santiago,Buenos Aires,Rio de Janeiro,Sao Paulo,Caracas,Ottawa,Toronto,Montreal,Quebec City,Vancouver,Calgary,Edmonton,Winnipeg,Halifax,Victoria,Kingston,Peterborough,Belleville,Norwood,Kelowna,Regina,Saskatoon,St. John's,Charlottetown,Fredericton,Moncton,Whitehorse,Yellowknife,New York,Los Angeles,Chicago,Houston,Phoenix,Philadelphia,San Antonio,San Diego,Dallas,Austin,Miami,Orlando,Tampa,Atlanta,Boston,Seattle,Portland,San Francisco,Las Vegas,Denver,Nashville,New Orleans,Honolulu,Anchorage,Washington,Detroit,Buffalo,Minneapolis,London,Paris,Berlin,Madrid,Barcelona,Rome,Milan,Venice,Florence,Lisbon,Porto,Amsterdam,Brussels,Dublin,Edinburgh,Vienna,Prague,Budapest,Warsaw,Athens,Istanbul,Zurich,Geneva,Copenhagen,Stockholm,Oslo,Helsinki,Reykjavik,Moscow,Cairo,Marrakesh,Casablanca,Cape Town,Johannesburg,Nairobi,Lagos,Dubai,Abu Dhabi,Doha,Tel Aviv,Jerusalem,Mumbai,Delhi,Bangalore,Kolkata,Chennai,Bangkok,Phuket,Singapore,Kuala Lumpur,Jakarta,Bali,Manila,Cebu,Hanoi,Ho Chi Minh City,Hong Kong,Shanghai,Beijing,Taipei,Seoul,Tokyo,Osaka,Kyoto,Sydney,Melbourne,Brisbane,Perth,Auckland,Wellington,Fiji".split(",");
  function lev(a,b){a=a.toLowerCase();b=b.toLowerCase();var m=[],i,j;for(i=0;i<=a.length;i++){m[i]=[i];}for(j=0;j<=b.length;j++)m[0][j]=j;for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length];}
  function guess(q){var best=[],n=q.replace(/,.*$/,"").trim();KNOWN.forEach(function(c){var d=lev(n,c);if(d<=Math.max(2,Math.floor(c.length*0.55)))best.push([d,c]);});best.sort(function(a,b){return a[0]-b[0];});return best.slice(0,3).map(function(x){return x[1];});}
  /* savemanual-v1 restores hinge-wx-loc from the last Save on every load; Dan asked for the tapped home to stick, so
     a row tap also updates just that one key inside hinge-committed-v1 (nothing else in the saved layout changes). */
  function commitHome(){try{var c=JSON.parse(localStorage.getItem("hinge-committed-v1")||"null"),v=localStorage.getItem("hinge-wx-loc");
    if(c&&c.v&&v!==null){c.v["hinge-wx-loc"]=v;localStorage.setItem("hinge-committed-v1",JSON.stringify(c));}}catch(e){}}
  var cache={};
  function start(){
    var t=document.getElementById("wTemp");if(!t){return setTimeout(start,400);}
    var box=t.closest("section");if(!box||document.getElementById("wxLocs"))return;
    var st=document.createElement("style");st.textContent=
      "#wxLocs{position:absolute;left:10px;right:10px;font-size:10px;color:#fff;pointer-events:auto}#wxLocs *{pointer-events:auto}"+
      "#wxLocs .wxa{width:100%;height:22px;border-radius:7px;border:1px solid rgba(255,255,255,.45);background:rgba(var(--hub-blue-rgb,60,120,220),.35);color:#fff;font:inherit;font-weight:600;cursor:pointer}"+
      "#wxLocs .wxa:hover{background:rgba(var(--hub-blue-rgb,60,120,220),.55)}"+
      "#wxLocs .wxf{display:none;gap:4px;margin-top:4px}#wxLocs.adding .wxf{display:flex}"+
      "#wxLocs input{flex:1;min-width:0;height:22px;padding:0 6px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.3);color:#fff;font:inherit}"+
      "#wxLocs .wxm,#wxLocs .wxg{flex:none;height:22px;min-width:24px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font:inherit}"+
      "#wxLocs .wxm.on{background:rgba(220,60,60,.6)}#wxLocs .wxn{font-size:9px;opacity:.85;margin-top:3px}#wxLocs .wxn:empty{display:none}"+
      "#wxLocs .wxr{display:flex;align-items:center;gap:6px;padding:3px 6px;margin-top:3px;border-radius:6px;background:rgba(255,255,255,.07);cursor:pointer}"+
      "#wxLocs .wxr:hover{background:rgba(var(--hub-blue-rgb,60,120,220),.3)}#wxLocs .wxr b{flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
      "#wxLocs .wxr i{font-style:normal;opacity:.8}#wxLocs .wxx{flex:none;width:16px;height:16px;border:0;border-radius:8px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;padding:0;line-height:16px}"+
      "#wxLocs .wxx:hover{background:rgba(220,60,60,.7)}#wxLocs .wxp{display:block;width:100%;text-align:left;padding:3px 6px;margin-top:2px;border:0;border-radius:5px;background:rgba(255,255,255,.06);color:#fff;font:inherit;cursor:pointer}"+
      "#wxLocs .wxp:hover{background:rgba(var(--hub-blue-rgb,60,120,220),.35)}";
    document.head.appendChild(st);
    var w=document.createElement("div");w.id="wxLocs";w.className="live";w.setAttribute("data-build",TAG);
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    w.innerHTML='<button type="button" class="wxa" title="Add a weather location">+ Add location</button>'+
      '<div class="wxf"><input type="text" maxlength="60" placeholder="City or place\u2026" aria-label="Place name">'+
      (SR?'<button type="button" class="wxm" title="Say the place">\ud83c\udfa4</button>':'')+'<button type="button" class="wxg" title="Search">Go</button></div>'+
      '<div class="wxn"></div><div class="wxpk"></div><div class="wxl"></div>';
    box.appendChild(w);
    var inp=w.querySelector("input"),note=w.querySelector(".wxn"),pk=w.querySelector(".wxpk"),lst=w.querySelector(".wxl");
    ["click","mousedown","pointerdown","dblclick","keydown"].forEach(function(ev){w.addEventListener(ev,function(e){e.stopPropagation();});});
    var baseH=null,baseTop=null;
    function fit(){
      if(baseH===null){baseH=box.offsetHeight||150;}
      var foot=box.querySelector(".w-clock")||box.querySelector(".w-foot");
      var top=foot?foot.offsetTop+foot.offsetHeight+6:baseH-6;
      if(baseTop===null)baseTop=top;w.style.top=baseTop+"px";
      var need=baseTop+w.offsetHeight+10;box.style.height=Math.max(baseH,need)+"px";
      /* 20261021b: keep the saved-places list visible over boxes below it (Morning layout: Priorities) without moving
         anyone's saved positions. The dashboard pins floating boxes at z-index 4400 !important, so lift Weather one step
         while it has a list or the add form open; drop back to the normal stack when the list is empty. */
      if(LIST.length||w.classList.contains("adding")){if(box.__wxlZ===undefined)box.__wxlZ=box.style.zIndex;}if(LIST.length||w.classList.contains("adding"))box.style.setProperty("z-index","4410","important");else if(box.__wxlZ!==undefined){box.style.removeProperty("z-index");box.style.zIndex=box.__wxlZ;}
    }
    function row(p,i){
      var c=cache[p.lat+","+p.lon],tx=c?deg(c.t)+"\u00b0 "+(CODE[c.code]||""):"\u2026";
      return '<div class="wxr" data-i="'+i+'" title="Make '+esc(p.name)+' the main weather"><b>'+esc(p.name)+'</b><i>'+esc(tx)+'</i><button type="button" class="wxx" data-x="'+i+'" title="Remove" aria-label="Remove '+esc(p.name)+'">\u00d7</button></div>';
    }
    function render(){lst.innerHTML=LIST.map(row).join("");fit();}
    function fetchT(p){var k=p.lat+","+p.lon;
      fetch("https://api.open-meteo.com/v1/forecast?latitude="+p.lat+"&longitude="+p.lon+"&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto")
        .then(function(r){return r.json();}).then(function(j){if(j&&j.current){cache[k]={t:j.current.temperature_2m,code:j.current.weather_code};render();}}).catch(function(){});}
    function refresh(){LIST.forEach(fetchT);}
    function add(p){p=cp(p);var h=home();if(h&&same(h,p)){note.textContent=p.name+" is already the main weather.";return;}
      if(LIST.some(function(q){return same(q,p);})){note.textContent=p.name+" is already in your list.";return;}
      LIST.push(p);save();render();fetchT(p);note.textContent="Added "+p.name+".";pk.innerHTML="";inp.value="";w.classList.remove("adding");fit();}
    function makeHome(i){var p=LIST[i],h=home();if(!p||!window.__wxLoc)return;
      LIST.splice(i,1);if(h&&ok(h)&&!LIST.some(function(q){return same(q,h);}))LIST.unshift(cp(h));save();
      window.__wxLoc.set({home:p,cur:p});commitHome();render();refresh();note.textContent=p.name+" is now the main weather.";}
    var found=[];
    function search(opt){opt=opt||{};var q=inp.value.trim();if(!q)return;note.textContent="Searching\u2026";pk.innerHTML="";
      fetch(GEO+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){
        found=(j&&j.results||[]).map(function(r){var sub=[r.admin1,r.country].filter(Boolean).join(", ");return {name:r.name+(r.admin1&&r.country_code&&/^(CA|US)$/.test(r.country_code)?", "+r.admin1:""),lat:r.latitude,lon:r.longitude,sub:sub};});
        if(!found.length){var g=guess(q);if(g.length&&!opt.noGuess){note.textContent="Did you mean:";pk.innerHTML=g.map(function(c){return '<button type="button" class="wxp" data-g="'+esc(c)+'">'+esc(c)+'?</button>';}).join("");fit();return;}note.textContent="No place found for \u201c"+q+"\u201d. Try another spelling.";fit();return;}
        note.textContent="Pick one:";pk.innerHTML=found.map(function(p,i){return '<button type="button" class="wxp" data-p="'+i+'">'+esc(p.name)+' <span style="opacity:.6">'+esc(p.sub)+'</span></button>';}).join("");fit();
      }).catch(function(){note.textContent="Place search is unavailable right now.";fit();});}
    w.addEventListener("click",function(e){var t=e.target.closest("button,.wxr");if(!t)return;
      if(t.classList.contains("wxa")){w.classList.toggle("adding");if(w.classList.contains("adding"))inp.focus();else{pk.innerHTML="";note.textContent="";}fit();}
      else if(t.classList.contains("wxg"))search();
      else if(t.classList.contains("wxp")&&t.hasAttribute("data-g")){inp.value=t.getAttribute("data-g");search({noGuess:1});}
      else if(t.classList.contains("wxp"))add(found[+t.getAttribute("data-p")]);
      else if(t.classList.contains("wxx")){var i=+t.getAttribute("data-x"),n=LIST[i]&&LIST[i].name;LIST.splice(i,1);save();render();note.textContent=n?"Removed "+n+".":"";fit();}
      else if(t.classList.contains("wxm")&&SR){var r=new SR();r.lang="en-US";r.interimResults=false;t.classList.add("on");note.textContent="Listening\u2026";
        r.onresult=function(ev){inp.value=ev.results[0][0].transcript.replace(/[.?!]+$/,"");search();};r.onend=function(){t.classList.remove("on");};r.onerror=function(){note.textContent="Didn't catch that. Type the place instead.";};try{r.start();}catch(err){}}
      else if(t.classList.contains("wxr"))makeHome(+t.getAttribute("data-i"));});
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();search();}});
    var u=document.getElementById("wUnit");if(u)u.addEventListener("click",function(){setTimeout(render,0);});
    render();refresh();setInterval(refresh,10*60*1000);setTimeout(fit,800);
    window.__wxLocs={list:function(){return JSON.parse(JSON.stringify(LIST));},add:add,makeHome:makeHome,build:TAG};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
