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
      .replace(/\b([A-ZÀ-Ý])\s+([A-ZÀ-Ý][a-zà-ÿ]{2,})\b/g,"$1$2")
      .replace(/\b([A-ZÀ-Ý][a-zà-ÿ]{2,})\s+([A-ZÀ-Ý])\s+([a-zà-ÿ]{2,})\b/g,"$1$2$3");
  }
  return clean(s);
}
function repairSpelledLetters(s){
  var a=clean(s).split(/\s+/),out=[],i=0;
  while(i<a.length){
    var run=[],j=i;
    while(j<a.length&&/^[A-Za-zÀ-ÿ]$/.test(a[j])){run.push(a[j]);j++;}
    if(run.length>=4){
      var joined=run.join("");
      if(joined.length<=18)out.push(joined);
      else out.push.apply(out,run);
      i=j;
    }else{
      out.push(a[i]);i++;
    }
  }
  return out.join(" ");
}
function duplicateClean(s){
  var w=clean(s).split(/\s+/),out=[];
  var weak=/^(a|o|as|os|um|uma|uns|umas|de|da|do|das|dos|e|ou|em|no|na|nos|nas|por|para|com|sem|que|se|não|sim)$/i;
  w.forEach(function(x){
    var p=out[out.length-1];
    if(p&&key(p)===key(x)&&x.length>=3&&!weak.test(x))return;
    out.push(x);
  });
  for(var n=6;n>=2;n--){
    var changed=true;
    while(changed){
      changed=false;
      for(var i=0;i+n*2<=out.length;i++){
        var same=true;
        for(var j=0;j<n;j++){
          if(key(out[i+j])!==key(out[i+n+j])){same=false;break;}
        }
        if(same){out.splice(i+n,n);changed=true;break;}
      }
    }
  }
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
    return {
      y:line.y,
      h:Math.max.apply(null,line.items.map(function(x){return Math.abs(Number(x.h||10));})),
      minX:Math.min.apply(null,line.items.map(function(x){return Number(x.x||0);})),
      maxX:Math.max.apply(null,line.items.map(function(x){return Number(x.x||0)+Number(x.w||0);})),
      text:repairSpelledLetters(repairWords(out))
    };
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
function edgeKey(s){
  return key(s).replace(/\b\d+(?:[.,]\d+)*\b/g,"#").replace(/\s+/g," ").trim();
}
function edgeCounts(){
  var top=Object.create(null),bottom=Object.create(null);
  for(var p=0;p<state.pdf.numPages;p++){
    var lines=rawLines(p); if(!lines.length)continue;
    var ys=lines.map(function(l){return l.y;}),hi=Math.max.apply(null,ys),lo=Math.min.apply(null,ys),span=Math.max(1,hi-lo);
    lines.forEach(function(l){
      var k=edgeKey(l.text); if(!k)return;
      if(hi-l.y<span*.18)top[k]=(top[k]||0)+1;
      if(l.y-lo<span*.18)bottom[k]=(bottom[k]||0)+1;
    });
  }
  return {top:top,bottom:bottom};
}
function clusterColumns(lines,k){
  if(lines.length<k*3)return null;
  var xs=lines.map(function(l){return l.minX;}).filter(isFinite).sort(function(a,b){return a-b;});
  if(xs.length<k*3)return null;
  var min=xs[0],max=xs[xs.length-1],range=Math.max(1,max-min),centers=[];
  for(var i=0;i<k;i++)centers.push(min+range*(i+.5)/k);
  for(var pass=0;pass<20;pass++){
    var groups=Array.from({length:k},function(){return [];});
    xs.forEach(function(x){
      var bi=0,bd=Math.abs(x-centers[0]);
      for(var j=1;j<k;j++){var d=Math.abs(x-centers[j]);if(d<bd){bd=d;bi=j;}}
      groups[bi].push(x);
    });
    var next=groups.map(function(g,idx){return g.length?g.reduce(function(s,x){return s+x;},0)/g.length:centers[idx];});
    var stable=next.every(function(x,idx){return Math.abs(x-centers[idx])<.5;});
    centers=next;if(stable)break;
  }
  centers.sort(function(a,b){return a-b;});
  var cols=centers.map(function(center,ci){
    return lines.filter(function(l){
      var bi=0,bd=Math.abs(l.minX-centers[0]);
      for(var j=1;j<centers.length;j++){var d=Math.abs(l.minX-centers[j]);if(d<bd){bd=d;bi=j;}}
      return bi===ci;
    }).sort(function(a,b){return b.y-a.y;});
  });
  var bounds=cols.map(function(col){return {minX:Math.min.apply(null,col.map(function(l){return l.minX;})),maxX:Math.max.apply(null,col.map(function(l){return l.maxX;})),lines:col};});
  for(var q=0;q<bounds.length-1;q++){
    if(bounds[q+1].minX-bounds[q].maxX<range*.035)return null;
  }
  return {cols:cols,bounds:bounds,range:range};
}
function cellGroups(lines){
  var a=lines.slice().sort(function(x,y){return y.y-x.y;}),groups=[];
  a.forEach(function(l){
    var g=groups[groups.length-1];
    if(!g){groups.push([l]);return;}
    var prev=g[g.length-1],gap=prev.y-l.y,h=Math.max(prev.h||10,l.h||10);
    if(gap<=h*1.8)g.push(l);else groups.push([l]);
  });
  return groups.map(function(g){
    return {lines:g,top:g[0].y,bottom:g[g.length-1].y,text:clean(g.map(function(l){return l.text;}).join(" "))};
  });
}
function tableReading(p){
  var lines=rawLines(p).filter(function(l){return l.text&&!isFooter(l.text);});
  if(lines.length<6)return null;
  var chosen=null;
  [2,3].some(function(k){
    var cl=clusterColumns(lines,k); if(!cl)return false;
    var counts=cl.cols.map(function(x){return x.length;});
    if(Math.min.apply(null,counts)<3)return false;
    var width=cl.range;
    if(k===2){
      var b0=cl.bounds[0],b1=cl.bounds[1];
      if((b0.maxX-b0.minX)>width*.40)return false;
      if((b1.maxX-b1.minX)<width*.40)return false;
    }else{
      var f=cl.bounds[0],m=cl.bounds[1],r=cl.bounds[2];
      if((f.maxX-f.minX)>width*.40)return false;
      if(m.minX-f.maxX<width*.02||r.minX-m.maxX<width*.02)return false;
    }
    chosen={k:k,layout:cl};return true;
  });
  if(!chosen)return null;

  var cols=chosen.layout.cols, rows=cellGroups(cols[0]);
  if(rows.length<3)return null;
  var data=[];
  for(var r=0;r<rows.length;r++){
    var row=rows[r],upper=r? (rows[r-1].bottom+row.top)/2 : Infinity,lower=(r+1<rows.length)?(row.bottom+rows[r+1].top)/2:-Infinity;
    var cells=[];
    for(var c=1;c<cols.length;c++){
      var parts=cols[c].filter(function(l){return l.y<=upper&&l.y>lower;});
      cells.push(clean(parts.map(function(l){return l.text;}).join(" ")));
    }
    data.push({label:row.text,cells:cells});
  }
  function isHeaderRow(row){
    var l=key(row.label),r=key(row.cells.join(" "));
    return /^(significado|tópico|topico|item|conceito|categoria|nome|tema)$/.test(l) ||
      (/(descrição|descricao|explicação|explicacao|definição|definicao)/i.test(r)&&l.length<30);
  }
  if(data.length&&isHeaderRow(data[0]))data.shift();
  data=data.filter(function(x){return x.label&&x.cells.some(Boolean);});
  if(data.length<2)return null;

  if(chosen.k===2){
    return data.map(function(x){return clean(x.label)+". "+clean(x.cells[0])+((/[.!?]$/.test(x.cells[0]))?"":".");}).join(" ");
  }

  var leftHeader=cols[1][0]?clean(cols[1][0].text):"Primeira coluna";
  var rightHeader=cols[2][0]?clean(cols[2][0].text):"Segunda coluna";
  var left=[],right=[];
  data.forEach(function(x){
    if(x.cells[0])left.push(clean(x.label)+". "+clean(x.cells[0]));
    if(x.cells[1])right.push(clean(x.label)+". "+clean(x.cells[1]));
  });
  return clean(leftHeader+" "+left.join(". ")+" "+rightHeader+" "+right.join(". "));
}

function pageText(p,edges){
  var lines=rawLines(p); if(!lines.length)return "";
  var table=tableReading(p); if(table)return duplicateClean(repairWords(table));
  var smart="",visual="";
  try{
    if(typeof window.pageSmartText==="function"){smart=window.pageSmartText(p,"smart")||"";visual=window.pageSmartText(p,"visual")||"";}
  }catch(e){}
  var base=smart?String(smart).split(/\n+/).map(clean).filter(Boolean):(visual?String(visual).split(/\n+/).map(clean).filter(Boolean):lines.map(function(l){return l.text;}));
  var ys=lines.map(function(l){return l.y;}),top=Math.max.apply(null,ys),bottom=Math.min.apply(null,ys),span=Math.max(1,top-bottom);
  var headerKeys=Object.create(null),footerKeys=Object.create(null);
  lines.forEach(function(l){
    var fromTop=top-l.y,fromBottom=l.y-bottom,k=key(l.text);if(!k)return;
    if(fromTop<span*.18&&edges.top[edgeKey(l.text)]>=2)headerKeys[k]=true;
    if(fromBottom<span*.18&&edges.bottom[edgeKey(l.text)]>=2)footerKeys[k]=true;
    if(fromTop<span*.16&&/(?:gran\s+concursos?|gran\.com\.br|pdf\s+sint[eé]tico|introdu[cç][aã]o\s+.*administr)/i.test(l.text))headerKeys[k]=true;
    if(fromBottom<span*.20&&isFooter(l.text))footerKeys[k]=true;
    if(fromTop<span*.20&&/(?:gran\s+concursos?|gran\.com\.br|pdf\s+sint[eé]tico|www\.|https?:\/\/)/i.test(l.text))headerKeys[k]=true;
  });
  base=base.filter(function(s){
    s=clean(s);if(!s)return false;var k=key(s);
    if(headerKeys[k]||footerKeys[k]||isFooter(s))return false;
    for(var hk in headerKeys)if(hk.length>=8&&(k.indexOf(hk)>=0||hk.indexOf(k)>=0))return false;
    return true;
  });
  var text=base.join(" ");
  text=text.replace(/(?:o conteúdo deste livro eletrônico|todos os direitos reservados|copyright)[^.!?]*(?:[.!?]|$)/gi," ");
  text=text.replace(/\b\d+\s+de\s+\d+\b/gi," ").replace(/\bgran\.com\.br\b/gi," ").replace(/(?:https?:\/\/|www\.)\S+/gi," ");
  return duplicateClean(repairSpelledLetters(repairWords(clean(text))));
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
  return duplicateClean(repairSpelledLetters(clean(s)));
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

var cachedEdges=null,cachedEdgeToken=0;
function getEdges(){
  if(cachedEdges&&cachedEdgeToken===state.fileToken)return cachedEdges;
  cachedEdges=edgeCounts();
  cachedEdgeToken=state.fileToken;
  return cachedEdges;
}
function buildPageQueue(p){
  var text=speechText(pageText(p,getEdges()));
  return splitSpeech(text,650).map(function(x){return {text:duplicateClean(x),page:p+1};});
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

function setupBackgroundAudio(){
  try{
    if("audioSession" in navigator && navigator.audioSession)navigator.audioSession.type="playback";
  }catch(e){}
  if(!window._pdfvozAudio){
    var audio=document.createElement("audio");
    audio.preload="auto";
    audio.playsInline=true;
    audio.setAttribute("playsinline","");
    audio.setAttribute("webkit-playsinline","");
    audio.controls=false;
    // Não use display:none: no iOS, manter o elemento de mídia "vivo"
    // ajuda o WebKit a tratá-lo como uma reprodução real em segundo plano.
    audio.style.position="fixed";
    audio.style.width="1px";
    audio.style.height="1px";
    audio.style.opacity="0.001";
    audio.style.pointerEvents="none";
    audio.style.left="-2px";
    audio.style.bottom="-2px";
    audio.setAttribute("aria-hidden","true");
    document.body.appendChild(audio);
    window._pdfvozAudio=audio;
  }
  return window._pdfvozAudio;
}
function setMediaSession(){
  try{
    if("mediaSession" in navigator && "MediaMetadata" in window){
      navigator.mediaSession.metadata=new MediaMetadata({
        title:"PDF Voz — Leitura",
        artist:"PDF Voz",
        album:els.name.textContent||"PDF"
      });
      var audio=setupBackgroundAudio();
      var actions={
        play:function(){audio.play().catch(function(){});state.paused=false;els.play.textContent="⏸ Pausar";},
        pause:function(){audio.pause();state.paused=true;els.play.textContent="▶ Continuar";},
        seekbackward:function(){audio.currentTime=Math.max(0,audio.currentTime-15);},
        seekforward:function(){audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+15);}
      };
      Object.keys(actions).forEach(function(k){
        try{navigator.mediaSession.setActionHandler(k,actions[k]);}catch(e){}
      });
    }
  }catch(e){}
}
function clearMediaSession(){
  try{
    if("mediaSession" in navigator){
      ["play","pause","seekbackward","seekforward"].forEach(function(k){
        try{navigator.mediaSession.setActionHandler(k,null);}catch(e){}
      });
      navigator.mediaSession.playbackState="none";
      navigator.mediaSession.metadata=null;
    }
  }catch(e){}
}
function wavDataInfo(buf){
  var v=new DataView(buf),p=12,fmt=null;
  while(p+8<=buf.byteLength){
    var id=String.fromCharCode(v.getUint8(p),v.getUint8(p+1),v.getUint8(p+2),v.getUint8(p+3));
    var n=v.getUint32(p+4,true);
    if(id==="fmt "&&n>=16){
      fmt={
        channels:v.getUint16(p+10,true),
        sampleRate:v.getUint32(p+12,true),
        bits:v.getUint16(p+22,true),
        byteRate:v.getUint32(p+16,true)
      };
    }
    if(id==="data")return {
      dataStart:p+8,
      dataSize:n,
      dataSizePos:p+4,
      fmt:fmt
    };
    p+=8+n+(n&1);
  }
  return null;
}
async function mergeWavs(blobs){
  if(!blobs.length)throw new Error("Nenhum áudio foi gerado.");
  if(blobs.length===1)return blobs[0];
  var bufs=await Promise.all(blobs.map(function(b){return b.arrayBuffer();}));
  var firstInfo=wavDataInfo(bufs[0]);
  if(!firstInfo||!firstInfo.fmt)throw new Error("Áudio TTS inválido.");
  var total=0;
  var infos=bufs.map(function(buf){
    var x=wavDataInfo(buf);
    if(!x||!x.fmt)throw new Error("Formato de áudio incompatível.");
    if(x.fmt.channels!==firstInfo.fmt.channels||
       x.fmt.sampleRate!==firstInfo.fmt.sampleRate||
       x.fmt.bits!==firstInfo.fmt.bits||
       x.fmt.byteRate!==firstInfo.fmt.byteRate){
      throw new Error("Os trechos de áudio têm formatos diferentes.");
    }
    total+=x.dataSize;
    return x;
  });
  var merged=new Uint8Array(firstInfo.dataStart+total);
  merged.set(new Uint8Array(bufs[0],0,firstInfo.dataStart),0);
  var pos=firstInfo.dataStart;
  bufs.forEach(function(buf,idx){
    var x=infos[idx];
    merged.set(new Uint8Array(buf,x.dataStart,x.dataSize),pos);
    pos+=x.dataSize;
  });
  var dv=new DataView(merged.buffer);
  dv.setUint32(4,merged.byteLength-8,true);
  dv.setUint32(firstInfo.dataSizePos,total,true);
  return new Blob([merged],{type:"audio/wav"});
}
function wavDuration(blob){
  return blob.arrayBuffer().then(function(buf){
    var x=wavDataInfo(buf);
    if(!x||!x.fmt||!x.fmt.byteRate)return 0;
    return x.dataSize/x.fmt.byteRate;
  });
}
async function generateAudioBlob(text){
  if(typeof window.getTransformers!=="function")throw new Error("Motor Supertonic não carregado.");
  var tts=await window.getTransformers();
  var parts=splitSpeech(text,420);
  if(!parts.length)throw new Error("Texto vazio.");
  var voice=(els.aiVoice&&els.aiVoice.value)||"M1";
  var speaker="https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/"+encodeURIComponent(voice)+".bin";
  var blobs=[];
  for(var i=0;i<parts.length;i++){
    var output=await tts("<pt>"+parts[i],{
      speaker_embeddings:speaker,
      num_inference_steps:6,
      speed:Math.max(.5,Math.min(2.5,Number(els.speed.value)||1))
    });
    var blob=output&&typeof output.toBlob==="function"?await output.toBlob():null;
    if(!blob)throw new Error("O Supertonic não retornou áudio.");
    blobs.push(blob);
  }
  return mergeWavs(blobs);
}
async function generateWholeReading(start,my){
  var pageBlobs=[],pageDurations=[],total=state.pdf.numPages-start+1;
  for(var pno=start;pno<=state.pdf.numPages;pno++){
    if(my!==readingRun||!state.speaking)throw new Error("Leitura cancelada.");
    var text=speechText(pageText(pno-1,getEdges()));
    if(!text)continue;
    els.now.textContent=els.name.textContent+" — preparando página "+pno;
    els.sent.textContent=pno+" / "+state.pdf.numPages;
    els.pct.textContent=Math.round(((pno-start)/Math.max(1,total))*100)+"%";
    els.fill.style.width=els.pct.textContent;
    toast("Preparando áudio: página "+pno+" de "+state.pdf.numPages+"…");
    var blob=await generateAudioBlob(text);
    if(my!==readingRun||!state.speaking)throw new Error("Leitura cancelada.");
    pageBlobs.push(blob);
    pageDurations.push({page:pno,duration:await wavDuration(blob)});
  }
  if(!pageBlobs.length)throw new Error("Não encontrei texto principal para ler.");
  var whole=await mergeWavs(pageBlobs);
  return {blob:whole,pages:pageDurations};
}
function updatePageFromAudio(){
  var audio=window._pdfvozAudio;
  if(!audio||!window._pdfvozPages||!window._pdfvozPages.length)return;
  var t=audio.currentTime||0,acc=0,chosen=window._pdfvozPages[window._pdfvozPages.length-1];
  for(var i=0;i<window._pdfvozPages.length;i++){
    var d=window._pdfvozPages[i];
    if(t<acc+d.duration){chosen=d;break;}
    acc+=d.duration;
  }
  if(currentPage!==chosen.page){
    currentPage=chosen.page;
    els.now.textContent=els.name.textContent+" — página "+chosen.page;
    els.sent.textContent=chosen.page+" / "+state.pdf.numPages;
    var pct=Math.round(((chosen.page-1)/Math.max(1,state.pdf.numPages))*100);
    els.pct.textContent=pct+"%";els.fill.style.width=pct+"%";
    if(state.page!==chosen.page)renderPage(chosen.page);
  }
}
function stop(){
  readingRun++;
  queue=[];queuePos=0;currentPage=0;
  try{speechSynthesis.cancel();}catch(e){}
  try{
    var audio=window._pdfvozAudio;
    if(audio){
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if(audio._pdfvozUrl)URL.revokeObjectURL(audio._pdfvozUrl);
      audio._pdfvozUrl=null;
    }
  }catch(e){}
  window._pdfvozPages=null;
  state.speaking=false;state.paused=false;state.utterance=null;state.aiAudio=null;
  preparingAudio=false;
  releaseWakeLock();
  clearMediaSession();
  if(els.play)els.play.textContent="▶ Ler";
}
window.stopSpeech=stop;

var audioProgressTimer=null;
var wakeLock=null;
var preparingAudio=false;

async function acquireWakeLock(){
  try{
    if("wakeLock" in navigator && navigator.wakeLock && !wakeLock){
      wakeLock=await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release",function(){wakeLock=null;});
    }
  }catch(e){}
}
async function releaseWakeLock(){
  try{if(wakeLock){await wakeLock.release();wakeLock=null;}}catch(e){wakeLock=null;}
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible" && state.speaking && window._pdfvozAudio){
    // Depois de voltar do bloqueio/central de controle, reconecta a sessão
    // e tenta continuar somente se o áudio já estava preparado.
    if(!preparingAudio && window._pdfvozAudio.src && window._pdfvozAudio.paused){
      window._pdfvozAudio.play().then(function(){
        state.paused=false;
        els.play.textContent="⏸ Pausar";
        setMediaSession();
      }).catch(function(){});
    }
  }
});
window.addEventListener("pageshow",function(){
  if(state.speaking && !preparingAudio && window._pdfvozAudio && window._pdfvozAudio.src){
    window._pdfvozAudio.play().catch(function(){});
  }
});

function startAudioProgress(){
  clearInterval(audioProgressTimer);
  audioProgressTimer=setInterval(function(){
    if(state.speaking)updatePageFromAudio();
  },500);
}
function stopAudioProgress(){
  clearInterval(audioProgressTimer);audioProgressTimer=null;
}

window.speakFromPage=async function(){
  if(!state.pdf){toast("Abra um PDF primeiro.");return;}
  var start=Math.max(1,Math.min(Number(els.startPage.value)||state.page,state.pdf.numPages));
  stop();
  state.readStartPage=start;
  state.speaking=true;state.paused=false;
  els.play.textContent="⏸ Pausar";
  els.pdfTab.classList.add("active");els.textTab.classList.remove("active");
  els.stage.hidden=false;els.text.hidden=true;
  var audio=setupBackgroundAudio();
  setMediaSession();
  readingRun++;
  var my=readingRun;

  if(els.voiceEngine.value==="transformers"){
    try{
      preparingAudio=true;
      await acquireWakeLock();
      els.now.textContent="Preparando áudio para segundo plano…";
      els.sent.textContent="Aguarde antes de bloquear a tela";
      els.pct.textContent="0%";
      els.fill.style.width="0%";
      toast("⏳ PREPARANDO ÁUDIO — não bloqueie a tela ainda.");
      var prepared=await generateWholeReading(start,my);
      if(my!==readingRun||!state.speaking)return;
      window._pdfvozPages=prepared.pages;
      await releaseWakeLock();
      preparingAudio=false;
      els.now.textContent="✓ Áudio pronto — pode bloquear a tela";
      els.sent.textContent="Pode bloquear a tela agora";
      els.pct.textContent="100%";
      els.fill.style.width="100%";
      toast("✓ ÁUDIO PRONTO — agora você pode bloquear a tela.");
      var url=URL.createObjectURL(prepared.blob);
      audio._pdfvozUrl=url;
      audio.src=url;
      audio.load();

      // Aguarda o elemento de mídia carregar o arquivo inteiro antes de
      // iniciar. Assim o iPhone não precisa depender de JavaScript para
      // montar o próximo trecho depois que a tela for bloqueada.
      await new Promise(function(resolve,reject){
        var done=false;
        var ok=function(){if(done)return;done=true;cleanup();resolve();};
        var fail=function(){if(done)return;done=true;cleanup();reject(new Error("O áudio não pôde ser carregado."));};
        var cleanup=function(){
          audio.removeEventListener("loadedmetadata",ok);
          audio.removeEventListener("canplay",ok);
          audio.removeEventListener("error",fail);
        };
        audio.addEventListener("loadedmetadata",ok,{once:true});
        audio.addEventListener("canplay",ok,{once:true});
        audio.addEventListener("error",fail,{once:true});
        if(audio.readyState>=1)ok();
      });

      audio.onended=function(){
        if(my!==readingRun)return;
        state.speaking=false;state.paused=false;els.play.textContent="▶ Ler";
        stopAudioProgress();clearMediaSession();
        toast("Leitura concluída.");
      };
      audio.onerror=function(){
        if(my!==readingRun)return;
        state.speaking=false;els.play.textContent="▶ Ler";stopAudioProgress();clearMediaSession();
        toast("Falha ao reproduzir o áudio preparado.");
      };
      audio.onplay=function(){state.paused=false;els.play.textContent="⏸ Pausar";setMediaSession();};
      audio.onpause=function(){if(state.speaking&&!state.paused)state.paused=true;els.play.textContent=state.paused?"▶ Continuar":"⏸ Pausar";};
      startAudioProgress();
      try{
        await audio.play();
        if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";
        toast("Lendo. Agora você pode bloquear a tela.");
      }catch(e){
        state.paused=true;els.play.textContent="▶ Continuar";
        toast("O navegador bloqueou o início automático. Toque em ▶ Continuar.");
      }
      return;
    }catch(e){
      await releaseWakeLock();
      preparingAudio=false;
      if(my!==readingRun)return;
      state.speaking=false;els.play.textContent="▶ Ler";stopAudioProgress();clearMediaSession();
      toast("Não foi possível preparar a voz IA: "+(e&&e.message||"erro"));
      return;
    }
  }

  // A voz do sistema continua disponível, mas o navegador não garante que
  // speechSynthesis sobreviva ao bloqueio de tela. Para segundo plano use Supertonic 2.
  if(!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window)){
    state.speaking=false;els.play.textContent="▶ Ler";clearMediaSession();
    toast("Este navegador não disponibilizou a leitura por voz.");
    return;
  }
  var textParts=[];
  for(var p=start;p<=state.pdf.numPages;p++){
    var tx=speechText(pageText(p-1,getEdges()));
    if(tx)textParts.push(tx);
  }
  var all=textParts.join(" ");
  var parts=splitSpeech(all,650),i=0;
  function nextSystem(){
    if(!state.speaking)return;
    if(i>=parts.length){state.speaking=false;els.play.textContent="▶ Ler";clearMediaSession();return;}
    var u=new SpeechSynthesisUtterance(parts[i++]),v=getVoice();
    if(v){u.voice=v;u.lang=v.lang||"pt-BR";}else u.lang="pt-BR";
    u.rate=Math.max(.6,Math.min(1.8,Number(els.speed.value)||1));u.pitch=1;u.volume=1;state.utterance=u;
    u.onend=nextSystem;
    u.onerror=function(ev){if(ev.error==="canceled"||ev.error==="interrupted")return;state.speaking=false;els.play.textContent="▶ Ler";};
    try{speechSynthesis.speak(u);}catch(e){state.speaking=false;els.play.textContent="▶ Ler";}
  }
  nextSystem();
};

els.play.onclick=function(){
  if(!state.pdf)return;
  if(!state.speaking){window.speakFromPage();return;}
  if(els.voiceEngine.value==="transformers"){
    var audio=window._pdfvozAudio;
    if(!audio||!audio.src){toast("O áudio ainda está sendo preparado.");return;}
    if(audio.paused){
      audio.play().then(function(){state.paused=false;els.play.textContent="⏸ Pausar";setMediaSession();}).catch(function(e){toast("Não foi possível continuar: "+(e&&e.message||"erro"));});
    }else{
      audio.pause();state.paused=true;els.play.textContent="▶ Continuar";
    }
    return;
  }
  try{
    if(speechSynthesis.paused){speechSynthesis.resume();state.paused=false;els.play.textContent="⏸ Pausar";}
    else{speechSynthesis.pause();state.paused=true;els.play.textContent="▶ Continuar";}
  }catch(e){}
};
if(els.stop)els.stop.onclick=function(){stop();toast("Leitura parada.");};
if(els.startRead)els.startRead.onclick=function(){window.speakFromPage();};


})();