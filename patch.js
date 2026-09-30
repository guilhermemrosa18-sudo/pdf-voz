(function(){
"use strict";

var readingRun=0;
var queue=[];
var queuePos=0;
var currentPage=0;

function clean(s){
  return String(s||"").replace(/[\u00A0\t\r]+/g," ").replace(/\s+/g," ").trim();
}
function key(s){
  return clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w]+/g," ").trim();
}
function repairWords(s){
  s=clean(s);
  for(var i=0;i<3;i++){
    s=s
      .replace(/\b([A-ZÀ-Ý])\s+([A-ZÀ-Ý]{1,4})\s+([a-zà-ÿ]{2,})\b/g,"$1$2$3")
      .replace(/\b([A-ZÀ-Ý]{1,3})\s+([a-zà-ÿ]{2,})\b/g,"$1$2");
  }
  return clean(s);
}
function duplicateClean(s){
  var w=clean(s).split(/\s+/),out=[];
  var weak=/^(a|o|as|os|um|uma|uns|umas|de|da|do|das|dos|e|ou|em|no|na|nos|nas|por|para|com|sem|que|se|não|sim)$/i;
  w.forEach(function(x){
    var p=out[out.length-1];
    if(p&&key(p)===key(x)&&x.length>=3&&!weak.test(x))return;
    out.push(x);
  });
  return out.join(" ");
}

function rawLines(p){
  var items=(state.layoutPages&&state.layoutPages[p])||[];
  if(!items.length)return String(state.pages[p]||"").split(/\n+/).map(clean).filter(Boolean);
  var a=items.filter(function(x){return clean(x.str);}).slice().sort(function(x,y){
    return Number(y.y||0)-Number(x.y||0)||Number(x.x||0)-Number(y.x||0);
  });
  var lines=[];
  a.forEach(function(it){
    var y=Number(it.y||0),h=Math.max(7,Math.abs(Number(it.h||10))),line=null;
    for(var i=0;i<lines.length;i++){
      if(Math.abs(lines[i].y-y)<=Math.max(2.5,Math.min(h,lines[i].h)*.45)){line=lines[i];break;}
    }
    if(!line){line={y:y,h:h,items:[]};lines.push(line);}
    line.items.push(it);line.h=Math.max(line.h,h);
  });
  return lines.map(function(line){
    line.items.sort(function(x,y){return Number(x.x||0)-Number(y.x||0);});
    var out="",prev=null;
    line.items.forEach(function(it){
      var s=clean(it.str);if(!s)return;
      if(!prev)out=s;
      else{
        var gap=Number(it.x||0)-(Number(prev.x||0)+Number(prev.w||0));
        var pc=Math.max(1,clean(prev.str).length),ic=Math.max(1,s.length);
        var cw=((Number(prev.w||0)/pc)+(Number(it.w||0)/ic))/2;
        var punctuation=/^[,.;:!?%)\]}]/.test(s)||/[([{"'¿¡-]$/.test(prev.str||"");
        var fragment=pc<=2||ic<=2;
        var joinGap=fragment?Math.max(1.4,cw*1.15):Math.max(1,cw*.30);
        out+=(punctuation||gap<=joinGap?"":" ")+s;
      }
      prev=it;
    });
    return {y:line.y,minX:Math.min.apply(null,line.items.map(function(x){return Number(x.x||0);})),text:repairWords(out)};
  }).filter(function(l){return l.text;});
}

function isFooter(s){
  s=clean(s);
  return /^\d+\s+de\s+\d+$/i.test(s) ||
    /^p[áa]gina\s+\d+(?:\s+de\s+\d+)?$/i.test(s) ||
    /(?:https?:\/\/|www\.)\S+/i.test(s) ||
    /gran\.com\.br/i.test(s) ||
    /^(?:©|copyright|todos os direitos|o conteúdo deste livro|este conteúdo|proibida a reprodução)/i.test(s);
}

function pageText(p){
  var lines=rawLines(p);
  if(!lines.length)return "";
  
  // Use the existing PDF layout engine for actual column/table pages.
  var source=state.layoutPages[p]||[];
  var base=[];
  try{
    var smart=(typeof window.pageSmartText==="function")?window.pageSmartText(p,"smart"):"";
    var visual=(typeof window.pageSmartText==="function")?window.pageSmartText(p,"visual"):"";
    if(smart && /(?:organiza(?:ções|coes)|comunica(?:ção|cao)|tradicionais|modernas)/i.test(smart) &&
       /(?:organiza(?:ções|coes)|tradicionais|modernas)/i.test(smart)){
      base=String(smart).split(/\n+/).map(clean).filter(Boolean);
    }else{
      base=lines.map(function(l){return l.text;});
    }
    if(!base.length)base=visual?String(visual).split(/\n+/).map(clean).filter(Boolean):lines.map(function(l){return l.text;});
  }catch(e){
    base=lines.map(function(l){return l.text;});
  }
  
  var ys=lines.map(function(l){return l.y;});
  var top=ys.length?Math.max.apply(null,ys):0;
  var bottom=ys.length?Math.min.apply(null,ys):0;
  var span=Math.max(1,top-bottom);
  
  // Build a map of exact line text so footer filtering can be applied without
  // destroying legitimate body text.
  var kept=[];
  lines.forEach(function(l,i){
    var bottomZone=(l.y-bottom)<span*.10;
    if(bottomZone && isFooter(l.text))return;
    if(isFooter(l.text))return;
    kept.push(l.text);
  });
  
  var text=base.length?base.join(" "):kept.join(" ");
  text=text.replace(/\b\d+\s+de\s+\d+\b/gi," ");
  text=text.replace(/\bgran\.com\.br\b/gi," ");
  text=text.replace(/(?:https?:\/\/|www\.)\S+/gi," ");
  return duplicateClean(repairWords(text));
}

function speechText(s){
  s=clean(s);
  s=s.replace(/\bLei\s+n[ºo°]?\.?\s*8[.]?080\s*\/\s*1990\b/gi,"Lei número oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\b8[.]080\s*\/\s*1990\b/g,"oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\bSUS\b/g,"Sistema Único de Saúde");
  s=s.replace(/\bPDF\b/g,"P D F");
  s=s.replace(/\bSTF\b/g,"S T F").replace(/\bSTJ\b/g,"S T J");
  s=s.replace(/\bCLT\b/g,"C L T").replace(/\bINSS\b/g,"I N S S").replace(/\bFGTS\b/g,"F G T S");
  s=s.replace(/\barts?\.\s*/gi,function(m){return /^arts/i.test(m)?"artigos ":"artigo ";});
  s=s.replace(/\bincs?\.\s*/gi,function(m){return /^incs/i.test(m)?"incisos ":"inciso ";});
  s=s.replace(/\bpar\.\s*/gi,"parágrafo ");
  s=s.replace(/\bcap\.\s*/gi,"capítulo ");
  s=s.replace(/\bn[ºo°]\.?\s*(?=\d)/gi,"número ");
  s=s.replace(/\bn\.\s*(?=\d)/gi,"número ");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*%/g,"$1 por cento");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*km\b/gi,"$1 quilômetros");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,"$1 quilos");
  s=s.replace(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/gi,"$1 reais");
  s=s.replace(/\s+([,.;:!?])/g,"$1").replace(/([,;:]){2,}/g,"$1");
  return duplicateClean(clean(s));
}

function splitSpeech(s,max){
  var sentences=String(s||"").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
  var out=[],cur="";
  sentences.forEach(function(x){
    x=clean(x);if(!x)return;
    if(cur&&(cur.length+x.length+1)>max){out.push(cur);cur=x;}
    else cur=(cur+" "+x).trim();
  });
  if(cur)out.push(cur);
  return out;
}

function buildPageQueue(p){
  var text=speechText(pageText(p));
  return splitSpeech(text,650).map(function(x){return {text:x,page:p+1};});
}

function getVoice(){
  var voices=speechSynthesis.getVoices()||[];
  if(voices.length){
    state.voices=voices.slice().sort(function(a,b){
      return (a.lang||"").localeCompare(b.lang||"")||(a.name||"").localeCompare(b.name||"");
    });
  }
  var idx=Number(els.voice.value);
  var v=state.voices[idx];
  if(!v)v=state.voices.find(function(x){return /^pt[-_]BR$/i.test(x.lang||"");});
  if(!v)v=state.voices.find(function(x){return /^pt[-_]BR/i.test(x.lang||"");});
  return v||state.voices[0]||null;
}

function stop(){
  readingRun++;
  queue=[];queuePos=0;currentPage=0;
  try{speechSynthesis.cancel();}catch(e){}
  state.speaking=false;state.paused=false;state.utterance=null;
  if(els.play)els.play.textContent="▶ Ler";
}
window.stopSpeech=stop;

window.speakFromPage=function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  stop();
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  state.readStartPage=start;
  
  // Prepare only the first page synchronously so the first speech call remains
  // directly inside the user's click and is not blocked by a large 111-page scan.
  queue=buildPageQueue(start-1);
  queuePos=0;
  currentPage=start;
  if(!queue.length){toast("Não encontrei texto principal nesta página.");return;}
  
  state.speaking=true;state.paused=false;
  els.play.textContent="⏸ Pausar";
  els.pdfTab.classList.add("active");els.textTab.classList.remove("active");
  els.stage.hidden=false;els.text.hidden=true;
  
  readingRun++;
  var my=readingRun;
  speakNext(my);
};

function speakNext(my){
  if(my!==readingRun||!state.speaking)return;
  
  if(queuePos>=queue.length){
    var nextPage=currentPage+1;
    if(nextPage>state.pdf.numPages){
      state.speaking=false;state.paused=false;els.play.textContent="▶ Ler";
      toast("Leitura concluída.");return;
    }
    currentPage=nextPage;
    queue=buildPageQueue(nextPage-1);
    queuePos=0;
    if(!queue.length){speakNext(my);return;}
  }
  
  var item=queue[queuePos++];
  els.now.textContent=els.name.textContent+" — página "+item.page;
  var pct=Math.round(((item.page-1)/Math.max(1,state.pdf.numPages))*100);
  els.pct.textContent=pct+"%";
  els.fill.style.width=pct+"%";
  els.sent.textContent=item.page+" / "+state.pdf.numPages;
  if(state.page!==item.page)renderPage(item.page);
  
  if(!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window)){
    state.speaking=false;els.play.textContent="▶ Ler";
    toast("Este navegador não disponibilizou a leitura por voz.");
    return;
  }
  var v=getVoice();
  var u=new SpeechSynthesisUtterance(item.text);
  if(v){u.voice=v;u.lang=v.lang||"pt-BR";}else u.lang="pt-BR";
  u.rate=Math.max(.6,Math.min(1.8,Number(els.speed.value)||1));
  u.pitch=1;u.volume=1;state.utterance=u;
  var started=false;
  u.onstart=function(){started=true;toast("Lendo página "+item.page+"…");};
  u.onend=function(){if(my===readingRun){setTimeout(function(){speakNext(my);},0);}};
  u.onerror=function(ev){
    if(my!==readingRun||ev.error==="canceled"||ev.error==="interrupted")return;
    state.speaking=false;els.play.textContent="▶ Ler";
    toast("A voz do PC não iniciou: "+(ev.error||"erro desconhecido"));
  };
  
  try{
    speechSynthesis.speak(u);
    setTimeout(function(){
      if(my!==readingRun||started||!state.speaking)return;
      if(!speechSynthesis.speaking&&!speechSynthesis.pending){
        // Opera/Chromium can occasionally drop a single utterance. Retry the same
        // utterance once without clearing the queue.
        try{speechSynthesis.speak(u);}catch(e){}
      }
    },700);
  }catch(e){
    state.speaking=false;els.play.textContent="▶ Ler";
    toast("Erro ao iniciar a voz: "+(e&&e.message||"erro"));
  }
}

els.play.onclick=function(){
  if(!state.pdf)return;
  if(!state.speaking){window.speakFromPage();return;}
  try{
    if(state.paused){speechSynthesis.resume();state.paused=false;els.play.textContent="⏸ Pausar";}
    else{speechSynthesis.pause();state.paused=true;els.play.textContent="▶ Continuar";}
  }catch(e){}
};
if(els.stop)els.stop.onclick=function(){stop();toast("Leitura parada.");};
if(els.startRead)els.startRead.onclick=function(){window.speakFromPage();};

})();