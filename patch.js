(function(){
"use strict";
var run=0, active=null, audio=null, audioUrl=null, wrap=null, overlay=null, cache=Object.create(null), noise=Object.create(null), last="";

function clean(s){return String(s||"").replace(/[\u00A0\t]+/g," ").replace(/\s+/g," ").trim();}
function key(s){return clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function lines(items){
  var a=(items||[]).filter(function(x){return clean(x.str);}).slice().sort(function(p,q){return Number(q.y||0)-Number(p.y||0)||Number(p.x||0)-Number(q.x||0);});
  var ls=[];
  a.forEach(function(it){
    var y=Number(it.y||0),h=Math.max(7,Math.abs(Number(it.h||10))),l=null;
    for(var i=0;i<ls.length;i++){if(Math.abs(ls[i].y-y)<=Math.max(2.5,Math.min(h,ls[i].h)*.5)){l=ls[i];break;}}
    if(!l){l={y:y,h:h,items:[]};ls.push(l);}
    l.items.push(it);l.h=Math.max(l.h,h);
  });
  ls.forEach(function(l){l.items.sort(function(p,q){return Number(p.x||0)-Number(q.x||0);});l.text=join(l.items);});
  return ls;
}
function join(items){
  var out="",prev=null;
  (items||[]).forEach(function(it){
    var s=clean(it.str);if(!s)return;
    if(!prev)out=s;else{
      var gap=Number(it.x||0)-(Number(prev.x||0)+Number(prev.w||0));
      var h=Math.max(7,Math.min(Math.abs(Number(it.h||10)),Math.abs(Number(prev.h||10))));
      var same=gap<=Math.max(2.5,h*.52)&&!/[.,;:!?%)\]}]$/.test(out)&&!/^[,.;:!?%)\]}]/.test(s);
      out+=same?s:" "+s;
    }
    prev=it;
  });
  for(var i=0;i<2;i++){
    out=out.replace(/\b([A-ZÀ-Ý]{1,4}) ([A-ZÀ-Ý][a-zà-ÿ]{2,})\b/g,"$1$2");
    out=out.replace(/\b([A-Za-zÀ-ÿ]{2,}) ([A-ZÀ-Ý]) ([a-zà-ÿ]{2,})\b/g,"$1 $2$3");
  }
  return clean(out);
}
function obviousNoise(s){
  s=clean(s);
  return !s||/^\d+\s+de\s+\d+$/i.test(s)||/^p[áa]gina\s+\d+\s+de\s+\d+$/i.test(s)||
    /gran\.com\.br/i.test(s)||/^(?:https?:\/\/|www\.)/i.test(s)||/^[-\w]+\.(?:com|com\.br|org|net|br)$/i.test(s);
}
function buildNoise(){
  noise=Object.create(null);
  if(!state.pdf)return;
  var count=Object.create(null);
  for(var p=0;p<state.pdf.numPages;p++){
    var ls=lines(state.layoutPages[p]||[]), pick=[];
    for(var i=0;i<Math.min(3,ls.length);i++)pick.push(ls[i]);
    for(var j=Math.max(0,ls.length-3);j<ls.length;j++)if(pick.indexOf(ls[j])<0)pick.push(ls[j]);
    pick.forEach(function(l){var k=key(l.text);if(k)count[k]=(count[k]||0)+1;});
  }
  Object.keys(count).forEach(function(k){if(count[k]>=2)noise[k]=true;});
}
function pageWords(p){
  if(cache[p])return cache[p];
  var ls=lines(state.layoutPages[p]||[]),out=[];
  ls.forEach(function(l,li){
    var t=l.text,k=key(t);
    if(obviousNoise(t))return;
    if(noise[k]&&ls.length>5&&(li<3||li>=ls.length-3))return;
    var cur=null;
    l.items.forEach(function(it){
      var s=clean(it.str);if(!s)return;
      var x=Number(it.x||0),y=Number(it.y||0),w=Number(it.w||0),h=Math.max(7,Math.abs(Number(it.h||l.h||10)));
      var parts=s.match(/\S+/g)||[],cursor=0;
      parts.forEach(function(part){
        var pos=s.indexOf(part,cursor);if(pos<0)pos=cursor;
        var end=pos+part.length,total=Math.max(1,s.length);
        var x0=x+w*pos/total,x1=x+w*end/total;
        var gap=cur?x0-cur.x1:9999;
        var merge=cur&&gap<=Math.max(2.5,h*.52)&&!/[.,;:!?%)\]}]$/.test(cur.text)&&!/^[,.;:!?%)\]}]/.test(part);
        if(merge){cur.text+=part;cur.x1=Math.max(cur.x1,x1);cur.y0=Math.min(cur.y0,y);cur.y1=Math.max(cur.y1,y+h);}
        else{cur={text:part,x0:x0,x1:x1,y0:y,y1:y+h,page:p};out.push(cur);}
        cursor=end;
      });
    });
  });
  cache[p]=out;return out;
}
function spoken(s){
  s=clean(s).replace(/(?:https?:\/\/|www\.)\S+/gi,"").replace(/\b[-\w]+\.com\.br\b/gi,"");
  s=s.replace(/\b\d+\s+de\s+\d+\b/gi,"");
  s=s.replace(/\bn[ºo]?\.\s*/gi,"número ");
  var a={art:"artigo",arts:"artigos",inc:"inciso",incs:"incisos",cap:"capítulo",caps:"capítulos",prof:"professor",profa:"professora",dr:"doutor",dra:"doutora",sr:"senhor",sra:"senhora",p:"página",pp:"páginas"};
  s=s.replace(/\b(art|arts|inc|incs|cap|caps|prof|profa|dr|dra|sr|sra|p|pp)\.\b/gi,function(m){return a[m.slice(0,-1).toLowerCase()]||m;});
  s=s.replace(/\b(CPF|CNPJ|PDF|CEP|INSS|FGTS|CLT|STF|STJ|CNH|IPTU|IPVA|OAB|TCC|SUS)\b/g,function(m){return m.split("").join(" ");});
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*%/g,"$1 por cento");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*km\b/gi,"$1 quilômetros");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,"$1 quilos");
  s=s.replace(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/gi,"$1 reais");
  s=s.replace(/\s+([,.;:!?])/g,"$1").replace(/([,.;:!?]){2,}/g,"$1");
  return clean(s);
}
function makeList(start){
  var all=[],out=[],p;
  buildNoise();
  for(p=start-1;p<state.pdf.numPages;p++)pageWords(p).forEach(function(w){all.push(w);});
  var cur=null;
  all.forEach(function(w){
    var s=spoken(w.text);if(!s)return;
    var toks=s.match(/\S+/g)||[s];
    toks.forEach(function(tok){
      if(!cur||cur.text.length+tok.length+1>210){
        if(cur&&cur.text)out.push(cur);
        cur={text:"",page:w.page,spans:[]};
      }
      var st=cur.text.length;
      cur.text+=(cur.text?" ":"")+tok;
      cur.spans.push({start:st,end:cur.text.length,word:w});
    });
    if(/[.!?]$/.test(w.text)&&cur){out.push(cur);cur=null;}
  });
  if(cur&&cur.text)out.push(cur);
  return out;
}
function ensureOverlay(){
  if(overlay)return;
  wrap=document.createElement("div");
  wrap.style.position="relative";wrap.style.display="inline-block";wrap.style.lineHeight="0";
  els.canvas.parentNode.insertBefore(wrap,els.canvas);wrap.appendChild(els.canvas);
  overlay=document.createElement("div");
  overlay.style.position="absolute";overlay.style.left="0";overlay.style.top="0";overlay.style.pointerEvents="none";overlay.style.zIndex="99";
  wrap.appendChild(overlay);
  var st=document.createElement("style");
  st.textContent=".pdfvoz-highlight{position:absolute;background:rgba(255,214,50,.82);border:1px solid rgba(180,130,0,.6);border-radius:3px;box-shadow:0 1px 6px rgba(0,0,0,.16)}";
  document.head.appendChild(st);
}
function clear(){last="";if(overlay)overlay.textContent="";}
function mark(c,i){
  if(!c||!c.spans.length||!state.pdf)return;
  var span=c.spans[Math.max(0,Math.min(c.spans.length-1,i))],w=span.word,target=w.page+1;
  Promise.resolve(target===state.page?null:renderPage(target)).then(async function(){
    if(target!==state.page)return;
    ensureOverlay();
    wrap.style.width=els.canvas.clientWidth+"px";wrap.style.height=els.canvas.clientHeight+"px";
    overlay.style.width=els.canvas.clientWidth+"px";overlay.style.height=els.canvas.clientHeight+"px";
    var pg=await state.pdf.getPage(target),vp=pg.getViewport({scale:1});
    var k=target+":"+Math.round(w.x0)+":"+Math.round(w.y0);
    if(k===last)return;last=k;overlay.textContent="";
    var sx=els.canvas.clientWidth/vp.width,sy=els.canvas.clientHeight/vp.height;
    var h=document.createElement("div");h.className="pdfvoz-highlight";
    h.style.left=Math.max(0,w.x0*sx-1)+"px";
    h.style.top=Math.max(0,(vp.height-w.y1)*sy-1)+"px";
    h.style.width=Math.max(5,(w.x1-w.x0)*sx+2)+"px";
    h.style.height=Math.max(9,(w.y1-w.y0)*sy+2)+"px";
    overlay.appendChild(h);
    try{wrap.scrollIntoView({block:"center",behavior:"smooth"});}catch(e){}
  }).catch(function(){});
}
function spanAt(c,pos){
  for(var i=0;i<c.spans.length;i++)if(pos>=c.spans[i].start&&pos<c.spans[i].end)return i;
  return Math.max(0,c.spans.length-1);
}
function stop(){
  run++;
  if(active)active.stop=true;
  try{speechSynthesis.cancel();}catch(e){}
  if(audio){try{audio.pause();}catch(e){}}
  if(audioUrl){try{URL.revokeObjectURL(audioUrl);}catch(e){}}
  audio=null;audioUrl=null;active=null;state.speaking=false;state.paused=false;
  els.play.textContent="▶ Ler";clear();
}
window.stopSpeech=stop;
window.speakFromPage=function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  stop();cache=Object.create(null);repeatedNoise=null;buildNoise();ensureOverlay();
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  var l=makeList(start);
  if(!l.length){toast("Não encontrei texto principal nesta página.");return;}
  active=l;state.speaking=true;state.paused=false;els.play.textContent="⏸ Pausar";
  els.pdfTab.click();
  /* Para evitar a fala embolada em motores problemáticos, usa a voz do sistema quando a IA não estiver disponível. */
  if(els.voiceEngine.value==="transformers" && window.getTransformers){runAI(l);}
  else{if(els.voiceEngine.value==="transformers")toast("Voz IA indisponível nesta sessão; usando a voz do dispositivo.");speakSystem(l);}
};
function speakSystem(l){
  var my=++run,i=0;
  function next(){
    if(my!==run||!state.speaking)return;
    if(i>=l.length){stop();toast("Leitura concluída.");return;}
    var c=l[i],u=new SpeechSynthesisUtterance(c.text),v=state.voices[Number(els.voice.value)];
    if(v){u.voice=v;u.lang=v.lang;}else u.lang="pt-BR";
    u.rate=Math.max(.5,Math.min(2.1,Number(els.speed.value)||1));
    var boundary=false,t0=0,timer=null,done=false;
    function adv(){if(done||my!==run)return;done=true;clearInterval(timer);i++;next();}
    u.onstart=function(){t0=performance.now();timer=setInterval(function(){if(boundary||state.paused)return;var dur=Math.max(.45,c.text.length*.055/u.rate),r=Math.min(.98,(performance.now()-t0)/1000/dur);mark(c,Math.floor(r*c.spans.length));},100);};
    u.onboundary=function(e){boundary=true;mark(c,spanAt(c,e.charIndex||0));};
    u.onend=adv;u.onerror=function(e){if(e.error!=="canceled"&&e.error!=="interrupted")adv();};
    mark(c,0);speechSynthesis.speak(u);
  }
  next();
}
async function runAI(l){
  var my=++run,synth;
  try{synth=await window.getTransformers();}catch(e){if(my===run){toast("A voz IA falhou; usando a voz do dispositivo.");speakSystem(l);}return;}
  for(var i=0;i<l.length&&my===run;i++){
    var c=l[i];
    try{
      var speaker="https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/"+encodeURIComponent(els.aiVoice?els.aiVoice.value:"M1")+".bin";
      var o=await synth("<pt>"+c.text+"</pt>",{speaker_embeddings:speaker,num_inference_steps:8,speed:Math.max(.8,Math.min(1.2,Number(els.speed.value)||1))});
      if(my!==run)return;
      var b=o&&typeof o.toBlob==="function"?o.toBlob():null;if(!b)throw new Error("sem audio");
      if(audioUrl)URL.revokeObjectURL(audioUrl);
      audioUrl=URL.createObjectURL(b);audio=new Audio(audioUrl);audio.playbackRate=Number(els.speed.value)||1;
      (function(ch){
        function tick(){if(my!==run||!audio)return;if(audio.duration>0&&isFinite(audio.duration))mark(ch,Math.floor(Math.min(.98,audio.currentTime/audio.duration)*ch.spans.length));requestAnimationFrame(tick);}
        requestAnimationFrame(tick);
      })(c);
      await new Promise(function(resolve,reject){audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);});
    }catch(e){if(my===run){toast("A voz IA falhou; usando a voz do dispositivo.");speakSystem(l.slice(i));}return;}
  }
  if(my===run){stop();toast("Leitura concluída.");}
}
els.play.onclick=function(){
  if(!state.pdf)return;
  if(!state.speaking){window.speakFromPage();return;}
  state.paused=!state.paused;els.play.textContent=state.paused?"▶ Continuar":"⏸ Pausar";
  if(els.voiceEngine.value==="transformers"){if(audio){if(state.paused)audio.pause();else audio.play().catch(function(){});}}
  else{if(state.paused)speechSynthesis.pause();else speechSynthesis.resume();}
};
if(els.stop)els.stop.onclick=function(){stop();toast("Leitura parada.");};
})();