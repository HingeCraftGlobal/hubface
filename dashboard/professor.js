/* professor-20261021c: Professor bot v1 (male scholarly teacher, photo face, hands-free voice) on the shared Finn-layout bar (agent-panel.js).
   Answers: POST /api/bots/professor/ask (server route professor-chat.mjs, capped by the shared $1/day xAI counter). Roll back: remove script tag. */
(function(){
  var B=window.HF_INVITABLE_BOTS=window.HF_INVITABLE_BOTS||[];
  if(!B.some(function(b){return b.id==='professor';}))B.push({id:'professor',name:'Professor'});
  var GREET="Hello, I'm the Professor. Think of me as the person on the island everyone comes to with a question. Ask me about almost anything, science, history, money, law, technology, and I'll walk you through it step by step, as simply or as deeply as you like. There are no silly questions here.";
  var PERSONA="Professor: a calm, clean-cut, mid-30s male academic. Broad general knowledge across subjects; the go-to person for any question. Scholarly, thoughtful, conversational, like explaining ideas to students. Patient and curious, never condescending.";
  var FACE='assets/professor-face.jpg?v=professor-20261021c';
  function ask(q,level,alt,hist){return fetch('/api/bots/professor/ask',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:q,level:level,alt:alt,voice:true,history:hist||[]})})
    .then(function(r){if(r.status===404||r.status===503)return null;if(r.status===429)return {text:'I\u2019ve reached today\u2019s answer budget. Let\u2019s pick this up tomorrow.'};if(!r.ok)throw 0;return r.json();});}
  function cfg(){return {id:'professor',name:'Professor',face:FACE,voice:{sex:'m',pitch:0.78,rate:0.9,id:'orion'},greeting:GREET,autoListen:true,ask:ask,
    gearTitle:'Breakdown, check question & glossary',notesTitle:'Breakdown, check question & glossary',idle:'Ask me anything'};}
  function open(){if(window.HF_agentPanel)return window.HF_agentPanel.open(cfg());}
  window.HF_professor={open:open,cfg:cfg,persona:PERSONA,greeting:GREET,voice:{pitch:0.78,rate:0.9}};
  /* room: open the bar when invited via the picker, close when removed */
  var was=false;setInterval(function(){try{var inRm=document.documentElement.classList.contains('rb-room');var on=inRm&&typeof window.HF_roomBots==='function'&&window.HF_roomBots().indexOf('professor')>=0;
    var c=window.HF_agentPanel&&window.HF_agentPanel.current();if(on&&!was&&!(c&&c.id==='professor'))open();if(!on&&was&&c&&c.id==='professor')window.HF_agentPanel.close();was=on;}catch(_){}},1000);
})();
