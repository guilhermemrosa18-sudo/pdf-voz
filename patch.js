/* PDF Voz - patch.js
   Carregue DEPOIS do script principal, logo antes de </body>:
   <script src="patch.js?v=1"></script>                                   */
(function () {
"use strict";
var SIL = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
var STEPS = 8;               // passos da IA: menos = mais rapido, mais = melhor qualidade
var run = 0, shared = null, endPlay = null, engine = 'sys';

/* 1) Corrige a regex quebrada (\\s) que nao juntava espacos */
window.normalizeSpaces = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };

function progress(i, n) {
  var p = Math.round(i / Math.max(1, n) * 100);
  els.pct.textContent = p + '%'; els.fill.style.width = p + '%';
  els.sent.textContent = (i + 1) + ' / ' + n;
  els.now.textContent = 'Lendo trecho ' + (i + 1) + ' de ' + n;
}
function finish(msg){
  state.speaking=false;state.paused=false;els.play.textContent='▶ Ler';clearPdfHighlight();toast(msg||'Leitura concluída.');
}

/* 2) Texto limpo: junta hifenizacao, marca pausas e divide em frases */
/* Abreviacoes e siglas: acrescente as suas nas listas abaixo */
var ABBR = { 'sr.':'senhor','sra.':'senhora','srta.':'senhorita','dr.':'doutor','dra.':'doutora',
  'prof.':'professor','profa.':'professora','eng.':'engenheiro','exmo.':'excelentíssimo','exma.':'excelentíssima',
  'ilmo.':'ilustríssimo','pe.':'padre','sto.':'santo','sta.':'santa','etc.':'etcétera.','p.':'página','pp.':'páginas',
  'pág.':'página','págs.':'páginas','cap.':'capítulo','caps.':'capítulos','art.':'artigo','arts.':'artigos',
  'fig.':'figura','tab.':'tabela','vol.':'volume','ed.':'edição','tel.':'telefone','av.':'avenida','ex.':'exemplo',
  'obs.':'observação','aprox.':'aproximadamente','séc.':'século','cf.':'confira','vs.':'versus','ltda.':'limitada',
  'cia.':'companhia','p.ex.':'por exemplo','i.e.':'isto é','e.g.':'por exemplo','et al.':'e outros' };
var SIGLAS = { CPF:'C P F', CNPJ:'C N P J', RG:'R G', PDF:'P D F', CEP:'C E P', PIB:'P I B', OAB:'O A B',
  INSS:'I N S S', FGTS:'F G T S', CLT:'C L T', STF:'S T F', STJ:'S T J', CNH:'C N H', IPTU:'I P T U',
  IPVA:'I P V A', USP:'U S P', UFRJ:'U F R J', TCC:'T C C' };
var ORD = ['','primeiro','segundo','terceiro','quarto','quinto','sexto','sétimo','oitavo','nono','décimo'];
var ORDF = ['','primeira','segunda','terceira','quarta','quinta','sexta','sétima','oitava','nona','décima'];
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
var keys = [];
Object.keys(ABBR).forEach(function (k) { keys.push(k); keys.push(k.charAt(0).toUpperCase() + k.slice(1)); });
keys.sort(function (a, b) { return b.length - a.length; });
var ABBR_RE = new RegExp('(^|[^A-Za-zÀ-ÿ0-9.])(' + keys.map(esc).join('|') + ')(?=\\s|$|[,;:)])', 'g');
var SIGLA_RE = new RegExp('\\b(' + Object.keys(SIGLAS).join('|') + ')\\b', 'g');
/* Numeros por extenso (a voz de IA erra digitos; palavras ela le bem) */
var U = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
var DZ = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
var CT = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function ate999(n) {
  if (n === 100) return 'cem';
  var c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CT[c]);
  if (r) { if (r < 20) p.push(U[r]); else { var d = Math.floor(r / 10), u = r % 10; p.push(u ? DZ[d] + ' e ' + U[u] : DZ[d]); } }
  return p.join(' e ');
}
function extenso(n) {
  if (n === 0) return 'zero';
  var m = Math.floor(n / 1e6), k = Math.floor(n % 1e6 / 1e3), r = n % 1e3, parts = [], vals = [];
  if (m) { parts.push(m === 1 ? 'um milhão' : ate999(m) + ' milhões'); vals.push(m); }
  if (k) { parts.push(k === 1 ? 'mil' : ate999(k) + ' mil'); vals.push(k); }
  if (r) { parts.push(ate999(r)); vals.push(r); }
  var out = parts[0];
  for (var i = 1; i < parts.length; i++) {
    var last = i === parts.length - 1, v = vals[i];
    out += (last && (v < 100 || v % 100 === 0) ? ' e ' : ' ') + parts[i];
  }
  return out;
}
function digitos(s) { return s.split('').map(function (x) { return U[+x]; }).join(' '); }
function numWords(m) {
  var p = m.split(','), a = p[0], out;
  if (a.length > 9 || (a.length > 1 && a.charAt(0) === '0')) out = digitos(a);
  else out = extenso(+a);
  if (p.length > 1) {
    var b = p[1];
    out += ' vírgula ' + ((b.charAt(0) === '0' || b.length > 3) ? digitos(b) : extenso(+b));
  }
  return out;
}

function expand0(t) {
  /* Abreviações apenas quando há um limite claro de palavra. */
  t = t.replace(ABBR_RE, function (m, pre, ab) {
    var v = ABBR[ab.toLowerCase()];
    return v ? pre + v : m;
  });

  /* Datas. */
  t = t.replace(/\\b(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\b/g,function(m,d,mo,y){
    return extenso(+d)+' de '+(MESES[+mo-1]||mo)+' de '+extenso(+y);
  });

  /* Valores monetários: apenas os que realmente possuem R$ ou US$. */
  t = t.replace(/R\\$\\s*[\\d.]+(?:,\\d{1,2})?/g,function(m){
    return moneyPhrase(m,'reais');
  });
  t = t.replace(/US\\$\\s*[\\d.]+(?:,\\d{1,2})?/g,function(m){
    return moneyPhrase(m,'dólares');
  });

  /* Unidades e percentuais. */
  t = t.replace(/\\b(\\d+(?:[.,]\\d+)?)\\s*%/g,function(m,n){return decimalPhrase(n)+' por cento';});
  t = t.replace(/\\b(\\d+(?:[.,]\\d+)?)\\s*km\\b/gi,function(m,n){return decimalPhrase(n)+' quilômetros';});
  t = t.replace(/\\b(\\d+(?:[.,]\\d+)?)\\s*kg\\b/gi,function(m,n){return decimalPhrase(n)+' quilos';});
  t = t.replace(/\\b(\\d+(?:[.,]\\d+)?)\\s*m²/gi,function(m,n){return decimalPhrase(n)+' metros quadrados';});
  t = t.replace(/\\b(\\d+(?:[.,]\\d+)?)\\s*°\\s*C\\b/gi,function(m,n){return decimalPhrase(n)+' graus Celsius';});

  /* Ordinais. */
  t = t.replace(/\\b(\\d{1,2})º\\b/g,function(m,n){return ORD[+n]||n;});
  t = t.replace(/\\b(\\d{1,2})ª\\b/g,function(m,n){return ORDF[+n]||n;});

  /*
    Números jurídicos como 8.080/1990:
    conserva os algarismos para não destruir a correspondência do texto do PDF.
    A fala recebe "número" e "de" sem expandir cada dígito.
  */
  t = t.replace(/\\bn[ºo]?[.]\\s*(\\d[\\d.]*)\\/(\\d{4})\\b/gi,function(m,a,b){
    return 'número '+a+' de '+b;
  });

  /* Decimais: transforma a vírgula em pausa natural, sem expandir todos os dígitos. */
  t = t.replace(/\\b(\\d+),(\\d+)\\b/g,function(m,a,b){
    return a+' vírgula '+b;
  });

  /* Siglas conhecidas: soletra somente siglas, não palavras em caixa alta aleatórias. */
  t = t.replace(SIGLA_RE,function(m){
    return SIGLAS[m.toUpperCase()]||m;
  });

  return t;
}
function decimalPhrase(s){
  var z=String(s).replace(',','.');
  if(z.includes('.')){
    var q=z.split('.');
    return q[0]+' vírgula '+q[1];
  }
  return s;
}
function moneyPhrase(m,currency){
  var raw=m.replace(/[^0-9,.-]/g,'');
  var parts=raw.split(',');
  var whole=parts[0], cents=parts[1];
  var out=whole+' '+currency;
  if(cents) out+=' e '+cents+' centavos';
  return out;
}

var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
/* Simbolos e caracteres especiais (leis, aspas, travessoes, ligaduras...) */
function norm(t) {
  return t
    .replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\t]/g, ' ')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .replace(/§§/g, ' parágrafos ').replace(/§/g, ' parágrafo ').replace(/¶/g, ' parágrafo ')
    .replace(/[“”«»„]/g, '"').replace(/[‘’´`]/g, "'")
    .replace(/(\d)\s*[–—―]\s*(\d)/g, '$1 a $2')
    .replace(/\s*[–—―]\s*/g, ', ')
    .replace(/…/g, '.')
    .replace(/[•·▪●■◦◆►▶]/g, ' ')
    .replace(/[©®™]/g, '')
    .replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, function (m, d, mo, y) { return (+d) + ' de ' + (MESES[+mo - 1] || mo) + ' de ' + y; })
    .replace(/(\d[\d.]{2,})\s*\/\s*(\d{2,4})\b/g, '$1, de $2')      // 8.080/1990 -> 8.080, de 1990
    .replace(/(\d)\s*\/\s*(\d{4})\b/g, '$1, de $2')
    .replace(/&/g, ' e ')
    .replace(/e\/ou/gi, 'e ou').replace(/\//g, ' ')
    .replace(/\+/g, ' mais ').replace(/=/g, ' igual a ')
    .replace(/×/g, ' vezes ').replace(/÷/g, ' dividido por ');
}
/* CAIXA ALTA vira normal (senao a voz soletra); tira qualquer caractere que a voz nao entende */
function cleanEnd(t) {
  return t
    .replace(/[A-ZÀ-Ý]{2,}/g, function (w) { return /^[IVXLCDM]+$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase(); })
    .replace(/[^A-Za-zÀ-ÿ0-9\s.,;:!?'"()\-]/g, ' ')
    .replace(/([A-Za-zÀ-ÿ]{4,})(\s+\1\b)+/gi, '$1')
    .replace(/\.{2,}/g, '.').replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
}
function expand(t) { return cleanEnd(expand0(norm(t))); }

function bboxOverlap(a,b){
  var ax1=a.x, ay1=a.y, ax2=a.x+a.w, ay2=a.y+a.h;
  var bx1=b.x, by1=b.y, bx2=b.x+b.w, by2=b.y+b.h;
  var ix=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1));
  var iy=Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));
  var inter=ix*iy, aa=Math.max(1,(ax2-ax1)*(ay2-ay1)), bb=Math.max(1,(bx2-bx1)*(by2-by1));
  return inter/Math.min(aa,bb);
}
function dedupe(items) {
  var seen = Object.create(null), out = [];
  items.forEach(function(it){
    var txt=String(it.str||'').replace(/\\s+/g,' ').trim();
    if(!txt)return;
    var k=txt.toLowerCase()+'|'+Math.round(it.x/3)+'|'+Math.round(it.y/3);
    if(seen[k])return;
    var duplicate=false;
    for(var j=Math.max(0,out.length-80);j<out.length;j++){
      var prev=out[j];
      if(prev.str.toLowerCase()===txt.toLowerCase() &&
         Math.abs(prev.y-it.y)<=Math.max(3,prev.h,it.h) &&
         bboxOverlap(prev,it)>=0.55){duplicate=true;break;}
    }
    if(duplicate)return;
    seen[k]=1; out.push(it);
  });
  return out;
}
var curList = null, curC = null, curW = null, view = { list: null, page: 0 };

/* ---------- texto falado de uma pagina ---------- */
function pageSents(p, mode) {
  var it = state.layoutPages[p];
  if (it && !it.__d) { it = state.layoutPages[p] = dedupe(it); it.__d = 1; }

  /* Remove elementos de navegação, marca d'água e cabeçalho/rodapé do site. */
  function isNoiseLine(l) {
    var s = (l || '').trim();
    if (!s) return true;
    if (/^(?:p[áa]gina\s*)?\d+\s*(?:de|\/|of)\s*\d+$/i.test(s)) return true;
    if (/^\d+\s+de\s+\d+\b/i.test(s)) return true;
    if (/^(?:www\.)?[-\w]+\.(?:com|com\.br|br|org|net)(?:\/[^\s]*)?$/i.test(s)) return true;
    if (/gran\.com\.br/i.test(s)) return true;
    if (/^(?:sum[áa]rio|menu|compartilhe|www\.|https?:\/\/)/i.test(s)) return true;
    if (/^\d+\s+de\s+\d+\s+.*(?:\.com|\.com\.br|\.br)\b/i.test(s)) return true;
    return false;
  }

  var rawLines = (pageSmartText(p, mode) || '').split('\n')
    .map(function(l){return l.trim();})
    .filter(function(l){return l && !isNoiseLine(l);});

  var lines = [];
  rawLines.forEach(function(l){
    /* Limpa marcadores de página/URL que possam ter vindo grudados ao início/fim. */
    l = l
      .replace(/^\d+\s+de\s+\d+\s*/i, '')
      .replace(/\b(?:p[áa]gina\s*)?\d+\s+de\s+\d+\b/gi, '')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
      .replace(/\b[-\w]+\.com\.br\b/gi, '')
      .replace(/\b[-\w]+\.com\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if(!l || isNoiseLine(l))return;

    var prev=lines[lines.length-1]||'';
    var a=l.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g,' ');
    var b=prev.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g,' ');
    if(a && a===b)return;
    lines.push(l);
  });

  if (!lines.length) return [];

  var t = '';
  lines.forEach(function (l, k) {
    var next = lines[k + 1] || '';
    /* Hifenização de fim de linha: "políti-" + "ca" = "política". */
    if (/[A-Za-zÀ-ÿ]-$/.test(l) && /^[a-zà-ÿ]/.test(next)) { t += l.slice(0, -1); return; }

    /*
      Não inventa ponto no fim de título/linha curta.
      Só cria uma pausa quando a linha parece ser uma frase completa.
    */
    if (next && l.length < 120 && !/[.!?…:;,]["')»\]]*$/.test(l) &&
        /^[A-ZÀ-Ý0-9]/.test(next) && /\s/.test(l)) {
      /* para subtítulos curtos, use ponto; para títulos em caixa alta, não */
      if (!/^[A-ZÀ-Ý0-9\s–—-]+$/.test(l)) l += '.';
    }
    t += l + ' ';
  });

  t = expand(t.replace(/\s+/g, ' ').trim());
  /* Símbolos de pontuação isolados não devem virar palavras. */
  t = t
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\(\s*\)/g, '')
    .trim();

  if (!t) return [];

  /* Evita que uma palavra/linha repetida apareça duas vezes na fala. */
  var result = t.replace(/([^.!?]+)(?:\s+\1)(?=\s|$)/gi, '$1');

  if (!/[.!?]["')»\]]*$/.test(result)) result += '.';
  return result.replace(/([.!?]["')»\]]*)\s+(?=[A-ZÀ-Ý"(0-9])/g, '$1\n').split('\n')
    .map(function(s){return s.trim();})
    .filter(function(s){return s.length>1 && !isNoiseLine(s);});
}
/* junta frases em trechos; o primeiro e curto para a fala comecar logo */
function pack(sents, first, max) {
  var out = [], cur = '';
  function lim() { return out.length ? max : first; }
  sents.forEach(function (s) {
    s = s.trim(); if (!s) return;
    while (s.length > lim()) {
      var L = lim(), cut = s.lastIndexOf(',', L);
      if (cut < L * 0.4) cut = s.lastIndexOf(' ', L);
      if (cut <= 0) cut = L;
      if (cur) { out.push(cur); cur = ''; }
      out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1).trim();
    }
    if (!s) return;
    if (cur && (cur + ' ' + s).length > lim()) { out.push(cur); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  });
  if (cur) out.push(cur);
  return out.filter(Boolean);
}
/* prepara as paginas em fatias de 12 ms: o botao Ler nao trava a tela */
function fill(list, from, mode, ai) {
  var p = from - 1, n = state.pdf.numPages, max = ai ? 260 : 200;
  (function step() {
    if (list.stop) return;
    var t0 = Date.now();
    do {
      if (p >= n) { list.done = true; return; }
      var s = pageSents(p, mode);
      if (s.length) {
        var pg = p + 1, parts = pack(s, list.length ? max : (ai ? 100 : 200), max), off = 0;
        var pageTotal = parts.reduce(function(n,c){return n + c.trim().split(/\s+/).filter(Boolean).length;},0);
        parts.forEach(function(c){
          var words = c.trim().split(/\s+/).filter(Boolean).length;
          list.push({text:c,page:pg,pageWordOffset:off,pageWordTotal:Math.max(1,pageTotal)});
          off += words;
        });
      }
      p++;
    } while (Date.now() - t0 < 12);
    setTimeout(step, 0);
  })();
}
function waitFor(list, i) {
  return new Promise(function (res) {
    (function chk() { if (list.length > i || list.done || list.stop) res(); else setTimeout(chk, 30); })();
  });
}
function showProgress(list, i) {
  var pg = list[i].page, n = state.pdf.numPages, p = Math.round((pg - 1) / Math.max(1, n) * 100);
  els.pct.textContent = p + '%'; els.fill.style.width = p + '%';
  els.sent.textContent = 'Página ' + pg + ' / ' + n;
  els.now.textContent = els.name.textContent + ' — página ' + pg;
}

/* ---------- marca-texto (palavra atual em amarelo, trecho atual em roxo claro) ---------- */
var css = document.createElement('style');
css.textContent = '.pv-c.on{background:rgba(119,92,255,.18);border-radius:4px}.pv-w.on{background:#ffd54a;color:#111;border-radius:3px;box-shadow:0 0 0 2px #ffd54a}';
document.head.appendChild(css);

/* Marcação diretamente sobre a página PDF. */
css.textContent += '.pv-pdf-wrap{position:relative;display:inline-block;line-height:0}.pv-pdf-wrap .pv-pdf-overlay{position:absolute;left:0;top:0;pointer-events:none;z-index:50;overflow:visible}.pv-pdf-word{position:absolute;background:rgba(255,214,60,.74);border:1px solid rgba(190,145,0,.55);border-radius:3px;box-shadow:0 1px 6px rgba(0,0,0,.18)}';
document.head.appendChild(css);

var pdfWrap=document.createElement('div');
pdfWrap.className='pv-pdf-wrap';
els.stage.insertBefore(pdfWrap,els.canvas);
pdfWrap.appendChild(els.canvas);
var pdfOverlay=document.createElement('div');
pdfOverlay.className='pv-pdf-overlay';
pdfOverlay.setAttribute('aria-hidden','true');
pdfWrap.appendChild(pdfOverlay);
var pdfWordsCache=Object.create(null), pdfLastKey='';

function overlayLines(items){
  var sorted=(items||[]).filter(function(x){return x&&x.str;}).slice().sort(function(a,b){return b.y-a.y||a.x-b.x;});
  var lines=[];
  sorted.forEach(function(it){
    var line=lines.find(function(l){return Math.abs(l.y-it.y)<=Math.max(3,Math.min(l.h||it.h||10,it.h||10)*.45);});
    if(!line){line={y:it.y,h:it.h||10,items:[]};lines.push(line);}
    line.items.push(it);line.h=Math.max(line.h,it.h||10);
  });
  lines.forEach(function(l){l.items.sort(function(a,b){return a.x-b.x;});});
  return lines;
}
function overlayWordBoxes(pageIndex){
  if(pdfWordsCache[pageIndex])return pdfWordsCache[pageIndex];
  var lines=overlayLines(state.layoutPages[pageIndex]||[]);
  var detected=typeof detectColumns==='function'?detectColumns(lines):null;
  var ordered=[];
  if(detected){
    for(var c=0;c<detected.k;c++){
      var center=detected.centers[c].c;
      lines.filter(function(l){
        var x0=l.items[0]?.x||0,best=Infinity;
        detected.centers.forEach(function(cc){best=Math.min(best,Math.abs(x0-cc.c));});
        return Math.abs(x0-center)===best;
      }).sort(function(a,b){return b.y-a.y;}).forEach(function(l){ordered.push(l);});
    }
  }else ordered=lines;
  var words=[];
  ordered.forEach(function(line){
    var current=null;
    line.items.forEach(function(it){
      var s=String(it.str||'');if(!s)return;
      var tokens=s.match(/\S+/g)||[],total=Math.max(1,s.length),cursor=0;
      tokens.forEach(function(tok){
        var pos=s.indexOf(tok,cursor);if(pos<0)pos=cursor;
        var end=pos+tok.length;
        var x0=it.x+it.w*(pos/total),x1=it.x+it.w*(end/total);
        var gap=current?x0-current.x1:999;
        var join=current&&gap<=Math.max(1.5,(it.h||10)*.22)&&!/[.,;:!?%)\]}]$/.test(current.text)&&!/^[,.;:!?%)\]}]/.test(tok);
        if(join){current.text+=tok;current.x1=Math.max(current.x1,x1);current.y0=Math.min(current.y0,it.y);current.y1=Math.max(current.y1,it.y+(it.h||10));}
        else{current={text:tok,x0:x0,x1:x1,y0:it.y,y1:it.y+(it.h||10)};words.push(current);}
        cursor=end;
      });
    });
  });
  pdfWordsCache[pageIndex]=words;return words;
}
function placePdfOverlay(){
  pdfWrap.style.width=els.canvas.clientWidth+'px';
  pdfWrap.style.height=els.canvas.clientHeight+'px';
  pdfOverlay.style.left='0';
  pdfOverlay.style.top='0';
  pdfOverlay.style.width=els.canvas.clientWidth+'px';
  pdfOverlay.style.height=els.canvas.clientHeight+'px';
}
function clearPdfHighlight(){pdfLastKey='';pdfOverlay.textContent='';}
async function markPdfWord(c,wi){
  if(!state.pdf||!c)return;
  var pg=c.page-1;
  if(state.page!==c.page){clearPdfHighlight();try{await renderPage(c.page);}catch(e){}}
  if(state.page!==c.page)return;
  var words=overlayWordBoxes(pg);
  if(!words.length||!c.pageWordTotal)return;
  placePdfOverlay();
  var spoken=c.pageWordOffset+Math.max(0,wi||0);
  var raw=Math.min(words.length-1,Math.max(0,Math.floor(((spoken+.25)/c.pageWordTotal)*words.length)));
  var target=words[raw],key=c.page+':'+raw;
  if(key===pdfLastKey)return;
  pdfLastKey=key;pdfOverlay.textContent='';
  var page=await state.pdf.getPage(c.page),vp=page.getViewport({scale:1});
  var sx=els.canvas.clientWidth/vp.width,sy=els.canvas.clientHeight/vp.height;
  var hi=document.createElement('div');hi.className='pv-pdf-word';
  hi.style.left=Math.max(0,target.x0*sx-1)+'px';
  hi.style.top=Math.max(0,(vp.height-target.y1)*sy-1)+'px';
  hi.style.width=Math.max(5,(target.x1-target.x0)*sx+2)+'px';
  hi.style.height=Math.max(9,(target.y1-target.y0)*sy+2)+'px';
  pdfOverlay.appendChild(hi);
  if(!hi.offsetWidth || !hi.offsetHeight){
    hi.style.left='8px';hi.style.top='8px';hi.style.width='60px';hi.style.height='18px';
  }
  try{pdfWrap.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});}catch(e){}
}
function wordsOf(c) {
  if (!c.w) {
    c.w = [];
    c.text.replace(/\S+/g, function (w, o) {
      c.w.push({ s: o, e: o + w.length });
      return w;
    });
  }
  return c.w;
}
function wordAt(c, pos) {
  var w = wordsOf(c), k = 0;
  while (k + 1 < w.length && w[k + 1].s <= pos) k++;
  return k;
}
function draw(list, i) {
  var pg = list[i].page;
  if (view.list === list && view.page === pg) return;
  view.list = list; view.page = pg; els.text.textContent = '';
  var frag = document.createDocumentFragment();
  list.forEach(function (c) {
    if (c.page !== pg) return;
    var box = document.createElement('span'); box.className = 'pv-c'; c.box = box; c.ws = [];
    wordsOf(c).forEach(function (w) {
      var sp = document.createElement('span'); sp.className = 'pv-w';
      sp.textContent = c.text.slice(w.s, w.e);
      box.appendChild(sp); box.appendChild(document.createTextNode(' ')); c.ws.push(sp);
    });
    frag.appendChild(box); frag.appendChild(document.createTextNode(' '));
  });
  els.text.appendChild(frag);
}
function mark(list,i,wi){
  var c=list[i];
  if(!c)return;
  markPdfWord(c,wi);
}

/* ---------- voz do dispositivo ---------- */
function speakSystem(list, from) {
  var my = ++run, i = from || 0; engine = 'sys'; curList = list;
  (function next() {
    if (my !== run) return;
    if (i >= list.length) {
      if (list.done) { finish(list.length ? '' : 'Não há texto extraível a partir dessa página.'); return; }
      waitFor(list, i).then(next); return;
    }
    var c = list[i], u = new SpeechSynthesisUtterance(c.text), v = state.voices[+els.voice.value];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'pt-BR';
    u.rate = +els.speed.value || 1;
    state.utterance = u;                       // evita coleta de lixo no Chrome
    showProgress(list, i); mark(list, i, 0);
    var done = false, wd, gotB = false, iv, t0 = 0;
    function stopTimers() { clearTimeout(wd); clearInterval(iv); }
    function adv() { if (done || my !== run) return; done = true; stopTimers(); i++; next(); }
    function arm() { wd = setTimeout(function () { if (state.paused) arm(); else adv(); }, 6000 + c.text.length * 160 / u.rate); }
    u.onstart = function () {
      t0 = Date.now();
      iv = setInterval(function () {                // sem eventos de palavra (iOS): estima pelo tempo
        if (gotB || my !== run || state.paused) return;
        var tot = c.text.length * 0.068 / u.rate, el = (Date.now() - t0) / 1000;
        mark(list, i, wordAt(c, Math.min(c.text.length - 1, Math.floor(el / tot * c.text.length))));
      }, 120);
    };
    u.onboundary = function (e) { if (my !== run) return; gotB = true; mark(list, i, wordAt(c, e.charIndex || 0)); };
    u.onend = adv;
    u.onerror = function (e) { if (e.error === 'interrupted' || e.error === 'canceled') return; adv(); };
    arm(); speechSynthesis.speak(u);
  })();
}

/* ---------- voz de IA ---------- */
function unlock() {
  try {
    if (!shared) { shared = new Audio(); shared.preload = 'auto'; }
    shared.src = SIL; var p = shared.play(); if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}
function play(url, rate) {
  return new Promise(function (res) {
    var a = shared;
    a.defaultPlaybackRate = rate || 1; a.playbackRate = rate || 1;
    a.preservesPitch = true; a.webkitPreservesPitch = true;
    function fin(ok) { if (!endPlay) return; endPlay = null; a.onended = a.onerror = null; URL.revokeObjectURL(url); res(ok); }
    endPlay = function () { fin(true); };
    a.onended = function () { fin(true); }; a.onerror = function () { fin(true); };
    a.src = url;
    var p = a.play(); if (p && p.catch) p.catch(function () { fin(false); });
  });
}
function follow(list, i, my) {                    // palavra atual = posicao no audio
  var c = list[i], len = c.text.length;
  (function tick() {
    if (my !== run || !endPlay) return;
    var d = shared.duration;
    if (d > 0 && isFinite(d)) mark(list, i, wordAt(c, Math.min(len - 1, Math.floor(shared.currentTime / d * len))));
    requestAnimationFrame(tick);
  })();
}
/* carrega o modelo em segundo plano (worker) para a tela nao travar; se falhar, usa o modo normal */
var ttsLoading = null, ttsObj = null;
window.getTransformers = function () {
  if (ttsObj) return Promise.resolve(ttsObj);
  if (!ttsLoading) {
    ttsLoading = (async function () {
      toast('Carregando a voz Supertonic 2. Na primeira vez, pode demorar alguns minutos…');
      var mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm?pdfvoz=supertonic2');
      function make() { return mod.pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-2-ONNX', { device: 'wasm' }); }
      try { mod.env.backends.onnx.wasm.proxy = true; ttsObj = await make(); }
      catch (e) { try { mod.env.backends.onnx.wasm.proxy = false; } catch (e2) {} ttsObj = await make(); }
      return ttsObj;
    })();
  }
  return ttsLoading.catch(function (e) { ttsLoading = null; throw e; });
};
async function runAI(list) {
  var my = ++run, synth; engine = 'ai'; curList = list;
  try { toast('Preparando a voz de IA…'); synth = await getTransformers(); }
  catch (e) {
    if (my !== run) return;
    toast('Voz de IA indisponível (' + ((e && e.message) || 'erro') + '). Usando a voz do dispositivo.');
    speakSystem(list, 0); return;
  }
  if (my !== run) return;
  var want = +els.speed.value || 1;
  var mrate = Math.min(1.2, Math.max(0.8, want));   // faixa em que o modelo fala com clareza
  var extra = want / mrate;                          // o restante da velocidade e aplicado no player
  var speaker = 'https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/' + encodeURIComponent(els.aiVoice.value) + '.bin';
  if (!window.__ttsWarm) {                           // 1a geracao do modelo costuma sair falhada: descarta
    window.__ttsWarm = true;
    toast('Aquecendo a voz…');
    try { await synth('<pt>Olá.</pt>', { speaker_embeddings: speaker, num_inference_steps: 4, speed: 1 }); } catch (e) {}
    if (my !== run) return;
  }
  var st = STEPS;   // ajusta sozinho: se a geracao for mais lenta que a fala, usa menos passos
  function gen(i) {
    var t0 = Date.now();
    return synth('<pt>' + list[i].text + '</pt>', { speaker_embeddings: speaker, num_inference_steps: st, speed: mrate })
      .then(function (o) {
        var b = typeof o.toBlob === 'function' ? o.toBlob() : null;
        if (!b) throw new Error('sem áudio');
        var dur = o.audio && o.sampling_rate ? o.audio.length / o.sampling_rate : 0;
        if (dur > 0) {
          var rtf = (Date.now() - t0) / 1000 / (dur / (extra || 1));
          if (rtf > 0.85 && st > 6) st--; else if (rtf < 0.4 && st < STEPS) st++;
        }
        return URL.createObjectURL(b);
      });
  }
  var pending = null, pendingI = -1;
  for (var i = 0; my === run; i++) {
    await waitFor(list, i);
    if (my !== run) return;
    if (i >= list.length) break;
    var url;
    try { url = await (pendingI === i ? pending : gen(i)); }
    catch (e) { if (my !== run) return; toast('Falha na voz de IA. Continuando com a voz do dispositivo.'); speakSystem(list, i); return; }
    if (my !== run) { URL.revokeObjectURL(url); return; }
    if (i + 1 < list.length) { pendingI = i + 1; pending = gen(i + 1); pending.catch(function () {}); }
    showProgress(list, i); mark(list, i, 0);
    var pr = play(url, extra); follow(list, i, my);
    var ok = await pr;
    if (my !== run) return;
    if (!ok) { finish('O navegador bloqueou o áudio. Toque em Ler novamente.'); return; }
  }
  if (my === run) finish(list.length ? '' : 'Não há texto extraível a partir dessa página.');
}

/* ---------- controles ---------- */
window.stopSpeech = function () {
  run++;
  if (curList) curList.stop = true;
  try { speechSynthesis.cancel(); } catch (e) {}
  if (shared) { try { shared.pause(); } catch (e) {} }
  if (endPlay) endPlay();
  state.speaking = false; state.paused = false; els.play.textContent = '▶ Ler';
  clearPdfHighlight();
};
window.speakFromPage = function () {
  if (!state.pdf) { toast('Abra um PDF primeiro.'); return; }
  var start = Math.max(1, Math.min(+els.startPage.value || state.page, state.pdf.numPages));
  state.readStartPage = start;
  var ai = els.voiceEngine.value === 'transformers', mode = els.readMode.value || 'smart';
  window.stopSpeech();
  if (ai) unlock();
  var list = []; curList = list; curC = curW = null; view.list = null;
  fill(list, start, mode, ai);                       // prepara so a 1a pagina agora; o resto vem em segundo plano
  state.speaking = true; state.paused = false; els.play.textContent = '⏸ Pausar'; save();
  els.pdfTab.click(); // sempre mantém o PDF visível durante a leitura
  if (ai) runAI(list);
  else setTimeout(function () { speakSystem(list, 0); }, 60);
};
els.play.onclick = function () {
  if (!state.pdf) return;
  if (!state.speaking) { window.speakFromPage(); return; }
  if (!state.paused) {
    state.paused = true; els.play.textContent = '▶ Continuar';
    if (engine === 'ai') { if (shared) shared.pause(); } else speechSynthesis.pause();
  } else {
    state.paused = false; els.play.textContent = '⏸ Pausar';
    if (engine === 'ai') { if (shared) { var p = shared.play(); if (p && p.catch) p.catch(function () {}); } }
    else speechSynthesis.resume();
  }
};

/* 6) Escolhe sozinho a melhor voz do dispositivo (Natural/Premium/Aprimorada) */
function pickBest() {
  var b = -1, bs = 0;
  state.voices.forEach(function (v, i) {
    var s = (/natural|neural|premium|enhanced|aprimorada|melhorada|online/i.test(v.name) ? 10 : 0) +
            (/^pt(-|_)BR/i.test(v.lang) ? 5 : 0) + (/google|luciana|francisca|antonio/i.test(v.name) ? 2 : 0);
    if (s > bs) { bs = s; b = i; }
  });
  if (b >= 0 && bs >= 5) els.voice.value = b;
}
var oldFill = window.fillVoices;
window.fillVoices = function () { oldFill(); pickBest(); };
speechSynthesis.onvoiceschanged = window.fillVoices;
window.fillVoices();
})();
