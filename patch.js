(function(){
"use strict";
var run=0, list=[], pos=0;
function clean(s){return String(s||"").replace(/[\u00A0\t\r]+/g," ").replace(/\s+/g," ").trim();}
function key(s){return clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function pageLines(p){
  var raw=window.pageSmartText?window.pageSmartText(p,"visual"):(state.pages[p]||"");
  return String(raw||"").split(/\n+/).map(clean).filter(Boolean);
}
function repeatedEdgeLines(){
  var count=Object.create(null);
  for(var p=0;p<state.pdf.numPages;p++){
    var a=pageLines(p), edge=[];
    for(var i=0;i<Math.min(3,a.length);i++)edge.push(a[i]);
    for(var j=Math.max(0,a.length-3);j<a.length;j++)if(edge.indexOf(a[j])<0)edge.push(a[j]);
    edge.forEach(function(s){var k=key(s);if(k)count[k]=(count[k]||0)+1;});
  }
  return count;
}
function readablePage(p,count){
  var a=pageLines(p),out=[];
  a.forEach(function(s,i){
    if(/^\d+\s+de\s+\d+$/i.test(s))return;
    if(/^p[áa]gina\s+\d+(?:\s+de\s+\d+)?$/i.test(s))return;
    if(/gran\.com\.br/i.test(s))return;
    if(/^(?:https?:\/\/|www\.)/i.test(s))return;
    if((i<3||i>=a.length-3)&&a.length>5&&count[key(s)]>=2)return;
    out.push(s);
  });
  return clean(out.join(" "));
}
function speechText(s){
  s=clean(s).replace(/(?:https?:\/\/|www\.)\S+/gi," ").replace(/\b[-\w]+\.com\.br\b/gi," ");
  s=s.replace(/\bLei\s+n[ºo°]?\.?\s*8\.080\s*\/\s*1990\b/gi,"Lei número oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\b8[.]?080\s*\/\s*1990\b/g,"oito mil e oitenta, de mil novecentos e noventa");
  s=s.replace(/\bLei\s+n[ºo°]?\.?\s*8[.]?080\b/gi,"Lei número oito mil e oitenta");
  s=s.replace(/\bSUS\b/g,"Sistema Único de Saúde");
  s=s.replace(/\bPDF\b/g,"P D F").replace(/\bSTF\b/g,"S T F").replace(/\bSTJ\b/g,"S T J");
  s=s.replace(/\bCLT\b/g,"C L T").replace(/\bINSS\b/g,"I N S S").replace(/\bFGTS\b/g,"F G T S");
  s=s.replace(/\barts?\.\s*/gi,function(m){return m.toLowerCase().indexOf("arts")===0?"artigos ":"artigo ";});
  s=s.replace(/\bincs?\.\s*/gi,function(m){return m.toLowerCase().indexOf("incs")===0?"incisos ":"inciso ";});
  s=s.replace(/\bpar\.\b/gi,"parágrafo ").replace(/\bcap\.\b/gi,"capítulo ");
  s=s.replace(/\bprofa?\.\s*/gi,function(m){return m.toLowerCase().indexOf("profa")===0?"professora ":"professor ";});
  s=s.replace(/\bn[ºo°]\.?\s*/gi,"número ").replace(/\bn\.\s*(?=\d)/gi,"número ");
  s=s.replace(/§+/g," parágrafo ");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*%/g,"$1 por cento");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*km\b/gi,"$1 quilômetros");
  s=s.replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,"$1 quilos");
  s=s.replace(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/gi,"$1 reais");
  s=s.replace(/\s+([,.;:!?])/g,"$1").replace(/([,;:]){2,}/g,"$1");
  return clean(s);
}
function splitSentences(text,max){
  var parts=String(text||"").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[],out=[],cur="";
  parts.forEach(function(part){
    part=clean(part);if(!part)return;
    if(cur&&(cur.length+part.length+1)>max){out.push(cur);cur=part;}
    else cur=(cur+" "+part).trim();
  });
  if(cur)out.push(cur);
  return out;
}
function makeList(start){
  var edge=repeatedEdgeLines(),out=[];
  for(var p=start-1;p<state.pdf.numPages;p++){
    var t=speechText(readablePage(p,edge));if(!t)continue;
    splitSentences(t,700).forEach(function(s){out.push({text:s,page:p+1});});
  }
  return out;
}
function stop(){
  run++;list=[];pos=0;
  try{speechSynthesis.cancel();}catch(e){}
  state.speaking=false;state.paused=false;state.utterance=null;els.play.textContent="▶ Ler";
}
window.stopSpeech=stop;
window.speakFromPage=function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  stop();
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  state.readStartPage=start;
  list=makeList(start);
  if(!list.length){toast("Não encontrei texto principal para ler.");return;}
  state.speaking=true;state.paused=false;els.play.textContent="⏸ Pausar";
  els.pdfTab.click();toast("Leitura iniciada.");run++;next();
};
function next(){
  var my=run;
  if(!state.speaking||my!==run)return;
  if(pos>=list.length){
    state.speaking=false;state.paused=false;els.play.textContent="▶ Ler";toast("Leitura concluída.");return;
  }
  var item=list[pos++],pct=Math.round((pos/list.length)*100);
  els.now.textContent=els.name.textContent+" — página "+item.page;
  els.pct.textContent=pct+"%";els.fill.style.width=pct+"%";
  var u=new SpeechSynthesisUtterance(item.text),v=state.voices[Number(els.voice.value)];
  if(v){u.voice=v;u.lang=v.lang;}else u.lang="pt-BR";
  u.rate=Math.max(.65,Math.min(1.8,Number(els.speed.value)||1));u.pitch=1;u.volume=1;state.utterance=u;
  u.onend=function(){if(my===run)next();};
  u.onerror=function(e){
    if(my!==run)return;
    if(e.error==="canceled"||e.error==="interrupted")return;
    toast("A voz encontrou um erro neste trecho; continuando.");
    next();
  };
  try{speechSynthesis.speak(u);}
  catch(e){state.speaking=false;els.play.textContent="▶ Ler";toast("Não foi possível iniciar a voz do dispositivo.");}
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