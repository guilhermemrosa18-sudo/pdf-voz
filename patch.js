(function(){
"use strict";
var run=0,list=[],pos=0;

function clean(s){return String(s||"").replace(/[\u00A0\t\r]+/g," ").replace(/\s+/g," ").trim();}
function key(s){return clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}

function pageLines(p){
  var items=(state.layoutPages&&state.layoutPages[p])||[];
  if(!items.length){
    return String(state.pages[p]||"").split(/\n+/).map(clean).filter(Boolean);
  }
  var sorted=items.filter(function(x){return clean(x.str);}).slice().sort(function(a,b){
    return Number(b.y||0)-Number(a.y||0)||Number(a.x||0)-Number(b.x||0);
  });
  var lines=[];
  sorted.forEach(function(it){
    var y=Number(it.y||0),h=Math.max(7,Math.abs(Number(it.h||10))),line=null;
    if(it.hasEOL){
      for(var k=0;k<lines.length;k++){
        if(Math.abs(lines[k].y-y)<=Math.max(2.5,Math.min(h,lines[k].h)*0.45)){line=lines[k];break;}
      }
      if(!line){line={y:y,h:h,items:[]};lines.push(line);}
      line.items.push(it);line.h=Math.max(line.h,h);line.forceBreak=true;return;
    }
    for(var i=0;i<lines.length;i++){
      if(lines[i].forceBreak)continue;
      if(Math.abs(lines[i].y-y)<=Math.max(2.5,Math.min(h,lines[i].h)*0.45)){line=lines[i];break;}
    }
    if(!line){line={y:y,h:h,items:[]};lines.push(line);}
    line.items.push(it);line.h=Math.max(line.h,h);
  });
  return lines.map(function(line){
    line.items.sort(function(a,b){return Number(a.x||0)-Number(b.x||0);});
    var out="",prev=null;
    line.items.forEach(function(it){
      var s=clean(it.str);if(!s)return;
      if(!prev){out=s;}
      else{
        var gap=Number(it.x||0)-(Number(prev.x||0)+Number(prev.w||0));
        var pc=Math.max(1,clean(prev.str).length),ic=Math.max(1,s.length);
        var cw=((Number(prev.w||0)/pc)+(Number(it.w||0)/ic))/2;
        var noSpace=/^[,.;:!?%)\]}]/.test(s)||/[([{"'¿¡-]$/.test(prev.str||"");
        var attached=gap<=Math.max(1.2,cw*0.70);
        out+=(noSpace||attached?"":" ")+s;
      }
      prev=it;
    });
    for(var pass=0;pass<3;pass++){
      out=out.replace(/\b([A-ZÀ-Ý])\s+([A-ZÀ-Ý]{1,4})\s+([a-zà-ÿ]{2,})\b/g,"$1$2$3");
      out=out.replace(/\b([A-ZÀ-Ý])\s+([a-zà-ÿ]{2,})\s+([A-ZÀ-Ý]{1,3})\s+([a-zà-ÿ]{2,})\b/g,"$1$2$3$4");
    }
    return clean(out);
  }).filter(Boolean);
}
function removePdfDuplicates(text){
  var stop=/^(a|o|os|as|um|uma|uns|umas|e|ou|de|da|do|das|dos|em|no|na|nos|nas|por|para|com|sem|que|se|não|sim)$/i;
  var toks=clean(text).split(/\s+/),out=[];
  toks.forEach(function(t){
    var prev=out[out.length-1];
    if(prev&&key(prev)===key(t)&&t.length>=3&&!stop.test(t))return;
    out.push(t);
  });
  for(var pass=0;pass<2;pass++){
    var changed=false,next=[];
    for(var i=0;i<out.length;){
      var found=false;
      for(var n=6;n>=2;n--){
        if(i+2*n>out.length)continue;
        var same=true;
        for(var j=0;j<n;j++)if(key(out[i+j])!==key(out[i+n+j])){same=false;break;}
        if(same){
          for(var z=0;z<n;z++)next.push(out[i+z]);
          i+=2*n;found=true;changed=true;break;
        }
      }
      if(!found){next.push(out[i]);i++;}
    }
    out=next;
    if(!changed)break;
  }
  return out.join(" ");
}
function edgeCounts(){
  var c=Object.create(null);
  for(var p=0;p<state.pdf.numPages;p++){
    var a=pageLines(p),e=[];
    for(var i=0;i<Math.min(3,a.length);i++)e.push(a[i]);
    for(var j=Math.max(0,a.length-3);j<a.length;j++)if(e.indexOf(a[j])<0)e.push(a[j]);
    e.forEach(function(s){var k=key(s);if(k)c[k]=(c[k]||0)+1;});
  }
  return c;
}
function readablePage(p,c){
  var a=pageLines(p),out=[];
  a.forEach(function(s,i){
    if(/^\d+\s+de\s+\d+$/i.test(s))return;
    if(/^p[áa]gina\s+\d+(?:\s+de\s+\d+)?$/i.test(s))return;
    if(/gran\.com\.br/i.test(s))return;
    if(/^(?:https?:\/\/|www\.)/i.test(s))return;
    if((i<3||i>=a.length-3)&&a.length>5&&c[key(s)]>=2)return;
    out.push(s);
  });
  return removePdfDuplicates(clean(out.join(" ")));
}
function speechText(s){
  s=clean(s).replace(/(?:https?:\/\/|www\.)\S+/gi," ").replace(/\b[-\w]+\.com\.br\b/gi," ");
  s=s.replace(/\bLei\s+n[ºo°]?\.\s*8[.]?080\s*\/\s*1990\b/gi,"Lei número oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\bLei\s+n[ºo°]?\s*8[.]080\s*\/\s*1990\b/gi,"Lei número oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\b8[.]080\s*\/\s*1990\b/g,"oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\bSUS\b/g,"Sistema Único de Saúde");
  s=s.replace(/\bPDF\b/g,"P D F").replace(/\bSTF\b/g,"S T F").replace(/\bSTJ\b/g,"S T J");
  s=s.replace(/\bCLT\b/g,"C L T").replace(/\bINSS\b/g,"I N S S").replace(/\bFGTS\b/g,"F G T S");
  s=s.replace(/\barts?\.\s*/gi,function(m){return m.toLowerCase().indexOf("arts")===0?"artigos ":"artigo ";});
  s=s.replace(/\bincs?\.\s*/gi,function(m){return m.toLowerCase().indexOf("incs")===0?"incisos ":"inciso ";});
  s=s.replace(/\bpar\.\s*/gi,"parágrafo ").replace(/\bcap\.\s*/gi,"capítulo ");
  s=s.replace(/\bprofa?\.\s*/gi,function(m){return m.toLowerCase().indexOf("profa")===0?"professora ":"professor ";});
  s=s.replace(/\bn[ºo°]\.?\s*(?=\d)/gi,"número ").replace(/\bn\.\s*(?=\d)/gi,"número ");
  s=s.replace(/§+/g," parágrafo ");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*%/g,"$1 por cento");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*km\b/gi,"$1 quilômetros");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,"$1 quilos");
  s=s.replace(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/gi,"$1 reais");
  return clean(s.replace(/\s+([,.;:!?])/g,"$1").replace(/([,;:]){2,}/g,"$1"));
}
function splitChunks(text,max){
  var a=String(text||"").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[],out=[],cur="";
  a.forEach(function(s){
    s=clean(s);if(!s)return;
    if(cur&&(cur.length+s.length+1)>max){out.push(cur);cur=s;}else cur=(cur+" "+s).trim();
  });
  if(cur)out.push(cur);
  return out;
}
function makeList(start){
  var c=edgeCounts(),out=[];
  for(var p=start-1;p<state.pdf.numPages;p++){
    var t=speechText(readablePage(p,c));if(!t)continue;
    splitChunks(t,650).forEach(function(s){out.push({text:s,page:p+1});});
  }
  return out;
}
function stop(){
  run++;list=[];pos=0;
  try{speechSynthesis.cancel();}catch(e){}
  try{if(state.aiAudio){state.aiAudio.pause();state.aiAudio.removeAttribute("src");state.aiAudio.load();}}catch(e){}
  state.aiAudio=null;state.aiRun++;
  state.speaking=false;state.paused=false;state.utterance=null;
  els.play.textContent="▶ Ler";
}
window.stopSpeech=stop;

function showPage(p){
  if(!state.pdf)return;
  if(state.page!==p)renderPage(p);
  els.now.textContent=els.name.textContent+" — página "+p;
}
window.speakFromPage=function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  stop();
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  state.readStartPage=start;
  list=makeList(start);
  if(!list.length){toast("Não encontrei texto principal para ler.");return;}
  state.speaking=true;state.paused=false;els.play.textContent="⏸ Pausar";
  els.pdfTab.click();
  if(els.voiceEngine.value==="transformers" && typeof window.speakAI==="function"){
    toast("Preparando a voz IA…");
    var all=list.map(function(x){return x.text;}).join(" ");
    window.speakAI(all);
  }else{
    run++;speakSystem(run);
  }
};
function speakSystem(my){
  function next(){
    if(my!==run||!state.speaking)return;
    if(pos>=list.length){state.speaking=false;state.paused=false;els.play.textContent="▶ Ler";toast("Leitura concluída.");return;}
    var item=list[pos++];showPage(item.page);
    els.sent.textContent=pos+" / "+list.length;
    els.pct.textContent=Math.round(pos/list.length*100)+"%";
    els.fill.style.width=Math.round(pos/list.length*100)+"%";
    var u=new SpeechSynthesisUtterance(item.text),v=state.voices[Number(els.voice.value)];
    if(v){u.voice=v;u.lang=v.lang;}else u.lang="pt-BR";
    u.rate=Math.max(.65,Math.min(1.8,Number(els.speed.value)||1));u.pitch=1;u.volume=1;
    state.utterance=u;
    u.onend=function(){if(my===run)next();};
    u.onerror=function(e){if(my!==run||e.error==="canceled"||e.error==="interrupted")return;next();};
    try{speechSynthesis.speak(u);}catch(e){state.speaking=false;els.play.textContent="▶ Ler";toast("Não foi possível iniciar a voz.");}
  }
  next();
}
els.play.onclick=function(){
  if(!state.pdf)return;
  if(!state.speaking){window.speakFromPage();return;}
  if(els.voiceEngine.value==="transformers"){
    if(!state.aiAudio){toast("Aguarde o áudio ser preparado.");return;}
    if(state.paused){state.aiAudio.play().catch(function(){});state.paused=false;els.play.textContent="⏸ Pausar";}
    else{state.aiAudio.pause();state.paused=true;els.play.textContent="▶ Continuar";}
  }else{
    if(state.paused){speechSynthesis.resume();state.paused=false;els.play.textContent="⏸ Pausar";}
    else{speechSynthesis.pause();state.paused=true;els.play.textContent="▶ Continuar";}
  }
};
if(els.stop)els.stop.onclick=function(){stop();toast("Leitura parada.");};
if(els.startRead)els.startRead.onclick=function(){window.speakFromPage();};
})();