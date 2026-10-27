/* avalong-20261026a (Dan, voice Oct 26 ~10:16pm ET: "Ava responds a little bit and then stops talking").
   Cause: the server prompt caps dashboard replies at "1-3 sentences, under 60 words"; Ava's replies tonight were ~1 sentence (3-4 s of audio).
   Fix (client only, no restart): for persona "ava" chat calls, prepend a length override so she gives a full conversational answer.
   Finn / other personas untouched. Roll back: sh /opt/hubface/dashboard/ROLLBACK-avalong.sh */
(function(){
  "use strict";if(window.__hfAvaLong)return;window.__hfAvaLong="avalong-20261026a";
  var NOTE="[Length override from Dan: you may go past the usual 1-3 sentence limit. Give a complete, natural spoken answer of about 4-8 sentences (up to ~150 words) when the question deserves it; keep replies short only for simple commands, confirmations or greetings. Plain spoken English, no lists, no markdown.] ";
  var of=window.fetch;if(!of)return;
  window.fetch=function(u,o){
    try{var url=typeof u==="string"?u:(u&&u.url)||"";
      if(/\/api\/dashboard\/chat(\?|$)/.test(url)&&o&&typeof o.body==="string"){
        var b=JSON.parse(o.body);
        if(b&&b.persona==="ava"&&b.purpose!=="email-draft"&&typeof b.text==="string"&&b.text.indexOf("[Length override")<0){
          b.text=(NOTE+b.text).slice(0,3000);o=Object.assign({},o,{body:JSON.stringify(b)});}}
    }catch(e){}
    var a=[].slice.call(arguments);a[1]=o;return of.apply(this,a);};
})();
