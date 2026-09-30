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
function finish(msg) {
  state.speaking = false; state.paused = false;
  els.play.textContent = '▶ Ler'; toast(msg || 'Leitura concluída.');
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
  t = t.replace(ABBR_RE, function (m, pre, ab) {
    var v = ABBR[ab.toLowerCase()]; if (!v) return m;
    if (ab.charAt(0) !== ab.charAt(0).toLowerCase()) v = v.charAt(0).toUpperCase() + v.slice(1);
    return pre + v;
  });
  return t
    .replace(/US\$\s*([\d.]+(?:,\d+)?)/g, '$1 dólares')
    .replace(/R\$\s*([\d.]+(?:,\d+)?)/g, '$1 reais')
    .replace(/(\d),00\b/g, '$1')
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1')            // 1.500 -> 1500
    .replace(/(\d)\s*%/g, '$1 por cento')
    .replace(/(\d)\s*km\b/g, '$1 quilômetros')
    .replace(/(\d)\s*kg\b/g, '$1 quilos')
    .replace(/(\d)\s*m²/g, '$1 metros quadrados')
    .replace(/(\d)\s*°\s*C\b/g, '$1 graus Celsius')
    .replace(/\bn(?:\.\s*|\.?\s?[º°]\s*)(?=\d)/gi, 'número ')
    .replace(/\b(\d{1,2})º/g, function (m, n) { return ORD[+n] || n; })
    .replace(/\b(\d{1,2})ª/g, function (m, n) { return ORDF[+n] || n; })
    .replace(/(\d)\.(?=\d)/g, '$1 ponto ')
    .replace(/\d+(?:,\d+)?/g, numWords)
    .replace(SIGLA_RE, function (m) { return SIGLAS[m]; });
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

function dedupe(items) {
  var seen = {}, out = [];
  items.forEach(function (it) {
    var k = it.str + '|' + Math.round(it.x / 2) + '|' + Math.round(it.y / 2);
    if (seen[k]) return; seen[k] = 1; out.push(it);
  });
  return out;
}
var curList = null, curC = null, curW = null, view = { list: null, page: 0 };

/* ---------- texto falado de uma pagina ---------- */
function pageSents(p, mode) {
  var it = state.layoutPages[p];
  if (it && !it.__d) { it = state.layoutPages[p] = dedupe(it); it.__d = 1; }
  var lines = (pageSmartText(p, mode) || '').split('\n')
    .map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return [];
  var t = '';
  lines.forEach(function (l, k) {
    var next = lines[k + 1] || '';
    if (/[A-Za-zÀ-ÿ]-$/.test(l) && /^[a-zà-ÿ]/.test(next)) { t += l.slice(0, -1); return; }
    if (next && l.length < 60 && !/[.!?…:;,]["')»\]]*$/.test(l) && /^[A-ZÀ-Ý0-9]/.test(next)) l += '.';
    t += l + ' ';
  });
  t = expand(t.replace(/\s+/g, ' ').trim());
  if (!t) return [];
  if (!/[.!?]["')»\]]*$/.test(t)) t += '.';
  return t.replace(/([.!?]["')»\]]*)\s+(?=[A-ZÀ-Ý"(0-9])/g, '$1\n').split('\n');
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
        var pg = p + 1;
        pack(s, list.length ? max : (ai ? 100 : 200), max).forEach(function (c) { list.push({ text: c, page: pg }); });
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
function wordsOf(c) {
  if (!c.w) { c.w = []; c.text.replace(/\S+/g, function (w, o) { c.w.push({ s: o, e: o + w.length }); return w; }); }
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
function mark(list, i, wi) {
  draw(list, i);
  var c = list[i];
  if (curC !== c) {
    if (curC && curC.box) curC.box.classList.remove('on');
    if (c.box) { c.box.classList.add('on'); if (c.box.scrollIntoView) c.box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    curC = c;
  }
  var w = c.ws && c.ws[wi];
  if (w !== curW) { if (curW) curW.classList.remove('on'); if (w) w.classList.add('on'); curW = w; }
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
  if (els.text.hidden) els.textTab.click();          // mostra o texto para acompanhar a marcacao
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
