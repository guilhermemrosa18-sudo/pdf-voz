(function(){
"use strict";
var run=0,list=[],pos=0;

function clean(s){return String(s||"").replace(/[\u00A0\t\r]+/g," ").replace(/\s+/g," ").trim();}
function key(s){return clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w]+/g," ").trim();}

function lineData(p){
  var items=(state.layoutPages&&state.layoutPages[p])||[];
  if(!items.length)return [];
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
  lines.forEach(function(l){
    l.items.sort(function(x,y){return Number(x.x||0)-Number(y.x||0);});
    var out="",prev=null;
    l.items.forEach(function(it){
      var s=clean(it.str);if(!s)return;
      if(!prev)out=s;
      else{
        var gap=Number(it.x||0)-(Number(prev.x||0)+Number(prev.w||0));
        var pc=Math.max(1,clean(prev.str).length),ic=Math.max(1,s.length);
        var cw=((Number(prev.w||0)/pc)+(Number(it.w||0)/ic))/2;
        var noSpace=/^[,.;:!?%)\]}]/.test(s)||/[([{"'¿¡-]$/.test(prev.str||"");
        out+=(noSpace||gap<=Math.max(1.2,cw*.72)?"":" ")+s;
      }
      prev=it;
    });
    l.text=clean(out);
    l.minX=Math.min.apply(null,l.items.map(function(x){return Number(x.x||0);}));
    l.maxX=Math.max.apply(null,l.items.map(function(x){return Number(x.x||0)+Number(x.w||0);}));
  });
  return lines.filter(function(l){return l.text;});
}

function duplicateClean(text){
  var w=clean(text).split(/\s+/),out=[],weak=/^(a|o|as|os|um|uma|uns|umas|de|da|do|das|dos|e|ou|em|no|na|nos|nas|por|para|com|sem|que|se|não|sim)$/i;
  w.forEach(function(x){
    var p=out[out.length-1];
    if(p&&key(p)===key(x)&&x.length>=3&&!weak.test(x))return;
    out.push(x);
  });
  return out.join(" ");
}

function pageSpeechText(p,repeated){
  var lines=lineData(p),out=[];
  if(!lines.length)return clean((state.pages[p]||""));
  var ys=lines.map(function(l){return l.y;});
  var top=Math.max.apply(null,ys),bottom=Math.min.apply(null,ys);
  var span=Math.max(1,top-bottom);
  lines.forEach(function(l,i){
    var nearTop=(top-l.y)<span*.08;
    var nearBottom=(l.y-bottom)<span*.12;
    var s=l.text;
    if(/^\d+\s+de\s+\d+$/i.test(s))return;
    if(/^p[áa]gina\s+\d+(?:\s+de\s+\d+)?$/i.test(s))return;
    if(/gran\.com\.br/i.test(s))return;
    if(/(?:https?:\/\/|www\.)/i.test(s))return;
    if(/^(?:conteúdo|o conteúdo|material|todos os direitos|direitos reservados|copyright)\b/i.test(s))return;
    if(nearBottom&&!/^\\d{1,4}$/.test(s))return;
    if((nearTop||nearBottom)&&repeated[key(s)]>=2)return;
    out.push(s);
  });
  return duplicateClean(out.join(" "));
}

function repeatedEdges(){
  var c=Object.create(null);
  for(var p=0;p<state.pdf.numPages;p++){
    var a=lineData(p),ys=a.map(function(l){return l.y;}),top=ys.length?Math.max.apply(null,ys):0,bottom=ys.length?Math.min.apply(null,ys):0,span=Math.max(1,top-bottom);
    a.forEach(function(l){
      if((top-l.y)<span*.08||(l.y-bottom)<span*.12){
        var k=key(l.text);if(k)c[k]=(c[k]||0)+1;
      }
    });
  }
  return c;
}

function speechNormalize(s){
  s=clean(s).replace(/(?:https?:\/\/|www\.)\S+/gi," ");
  s=s.replace(/\bLei\s+n[ºo°]?\.?\s*8[.]?080\s*\/\s*1990\b/gi,"Lei número oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\b8[.]080\s*\/\s*1990\b/g,"oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\bSUS\b/g,"Sistema Único de Saúde");
  s=s.replace(/\bPDF\b/g,"P D F");
  s=s.replace(/\bSTF\b/g,"S T F");
  s=s.replace(/\bSTJ\b/g,"S T J");
  s=s.replace(/\bCLT\b/g,"C L T");
  s=s.replace(/\bINSS\b/g,"I N S S");
  s=s.replace(/\bFGTS\b/g,"F G T S");
  s=s.replace(/\barts?\.\s*/gi,function(m){return /^arts/i.test(m)?"artigos ":"artigo ";});
  s=s.replace(/\bincs?\.\s*/gi,function(m){return /^incs/i.test(m)?"incisos ":"inciso ";});
  s=s.replace(/\bpar\.\s*/gi,"parágrafo ");
  s=s.replace(/\bcap\.\s*/gi,"capítulo ");
  s=s.replace(/\bn[ºo°]\.?\s*(?=\d)/gi,"número ");
  s=s.replace(/\bn\.\s*(?=\d)/gi,"número ");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*%/g,"$1 por cento");
  s=s.replace(/\s+([,.;:!?])/g,"$1");
  return duplicateClean(s);
}

function makeList(start){
  var rep=repeatedEdges(),out=[];
  for(var p=start-1;p<state.pdf.numPages;p++){
    var text;
    try{
      var smart=(typeof window.pageSmartText==="function")?window.pageSmartText(p,"smart"):"";
      text=pageSpeechText(p,rep);
      if(smart&&/organiza(?:ções|coes)/i.test(smart)&&/organiza(?:ções|coes)/i.test(text)===false)text=smart;
    }catch(e){text=pageSpeechText(p,rep);}
    text=speechNormalize(text);
    if(!text)continue;
    var parts=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
    parts.forEach(function(s){s=clean(s);if(s)out.push({text:s,page:p+1});});
  }
  return out;
}

function stop(){
  run++;list=[];pos=0;
  try{speechSynthesis.cancel();}catch(e){}
  state.speaking=false;state.paused=false;state.utterance=null;
  els.play.textContent="▶ Ler";
}
window.stopSpeech=stop;

function getVoice(){
  var voices=(speechSynthesis.getVoices()||[]);
  if(voices.length)state.voices=voices.slice().sort(function(a,b){
    return (a.lang||"").localeCompare(b.lang||"")||(a.name||"").localeCompare(b.name||"");
  });
  var v=state.voices[Number(els.voice.value)];
  if(!v)v=state.voices.find(function(x){return /^pt[-_]BR$/i.test(x.lang||"");});
  if(!v)v=state.voices.find(function(x){return /^pt[-_]BR/i.test(x.lang||"");});
  if(!v)v=state.voices[0];
  return v||null;
}

window.speakFromPage=function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  stop();
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  state.readStartPage=start;
  try{list=makeList(start);}catch(e){
    toast("Erro ao preparar a leitura: "+(e&&e.message||"erro"));
    return;
  }
  if(!list.length){toast("Não encontrei texto principal para ler.");return;}
  state.speaking=true;state.paused=false;els.play.textContent="⏸ Pausar";
  els.pdfTab.classList.add("active");els.textTab.classList.remove("active");els.stage.hidden=false;els.text.hidden=true;
  run++;
  var my=run;
  function next(){
    if(my!==run||!state.speaking)return;
    if(pos>=list.length){
      state.speaking=false;state.paused=false;els.play.textContent="▶ Ler";toast("Leitura concluída.");return;
    }
    var item=list[pos++];
    if(state.page!==item.page)renderPage(item.page);
    els.now.textContent=els.name.textContent+" — página "+item.page;
    var pct=Math.round(pos/list.length*100);
    els.pct.textContent=pct+"%";els.fill.style.width=pct+"%";els.sent.textContent=pos+" / "+list.length;
    var u=new SpeechSynthesisUtterance(item.text),v=getVoice();
    if(v){u.voice=v;u.lang=v.lang||"pt-BR";}else u.lang="pt-BR";
    u.rate=Math.max(.6,Math.min(2,Number(els.speed.value)||1));
    u.pitch=1;u.volume=1;state.utterance=u;
    u.onstart=function(){toast("Lendo página "+item.page+"…");};
    u.onend=function(){if(my===run)next();};
    u.onerror=function(e){
      if(my!==run||e.error==="canceled"||e.error==="interrupted")return;
      state.speaking=false;els.play.textContent="▶ Ler";
      toast("A voz do dispositivo não iniciou: "+(e.error||"erro desconhecido"));
    };
    try{
      speechSynthesis.cancel();
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    }catch(e){
      state.speaking=false;els.play.textContent="▶ Ler";
      toast("Erro ao iniciar a voz: "+(e&&e.message||"erro"));
    }
  }
  next();
};

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