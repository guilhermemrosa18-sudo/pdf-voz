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
function expand(t) {
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
    .replace(/\bn\.?\s?[º°]\s*(?=\d)/gi, 'número ')
    .replace(/\b(\d{1,2})º/g, function (m, n) { return ORD[+n] || n; })
    .replace(/\b(\d{1,2})ª/g, function (m, n) { return ORDF[+n] || n; })
    .replace(SIGLA_RE, function (m) { return SIGLAS[m]; });
}

function buildSents() {
  var start = Math.max(1, Math.min(+els.startPage.value || state.page, state.pdf.numPages));
  state.readStartPage = start;
  var mode = els.readMode.value || 'smart', out = [];
  for (var p = start - 1; p < state.pdf.numPages; p++) {
    var lines = (pageSmartText(p, mode) || '').split('\n')
      .map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) continue;
    var t = '';
    lines.forEach(function (l, k) {
      var next = lines[k + 1] || '';
      if (/[A-Za-zÀ-ÿ]-$/.test(l) && /^[a-zà-ÿ]/.test(next)) { t += l.slice(0, -1); return; }
      if (next && l.length < 60 && !/[.!?…:;,]["')»\]]*$/.test(l) && /^[A-ZÀ-Ý0-9]/.test(next)) l += '.';
      t += l + ' ';
    });
    t = expand(t.replace(/\s+/g, ' ').trim());
    if (!/[.!?…]["')»\]]*$/.test(t)) t += '.';
    out.push.apply(out, t.replace(/([.!?…]["')»\]]*)\s+(?=[A-ZÀ-Ý"“(0-9])/g, '$1\n').split('\n'));
  }
  return out;
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

/* 3) Voz do dispositivo: trechos curtos, sem corrida entre cancel() e speak() */
function speakSystem(list, from) {
  var my = ++run, i = from || 0; engine = 'sys';
  (function next() {
    if (my !== run) return;
    if (i >= list.length) { finish(); return; }
    progress(i, list.length);
    var u = new SpeechSynthesisUtterance(list[i]), v = state.voices[+els.voice.value];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'pt-BR';
    u.rate = +els.speed.value || 1;
    state.utterance = u;                       // evita coleta de lixo no Chrome
    var done = false, wd;
    function adv() { if (done || my !== run) return; done = true; clearTimeout(wd); i++; next(); }
    function arm() { wd = setTimeout(function () { if (state.paused) arm(); else adv(); }, 6000 + list[i].length * 160 / u.rate); }
    u.onend = adv;
    u.onerror = function (e) { if (e.error === 'interrupted' || e.error === 'canceled') return; adv(); };
    arm(); speechSynthesis.speak(u);
  })();
}

/* 4) Voz de IA: um unico <audio> liberado no clique (iOS), proximo trecho gerado
      enquanto o atual toca, e queda automatica para a voz do dispositivo */
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
async function runAI(list) {
  var my = ++run, synth; engine = 'ai';
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
  function gen(i) {
    return synth('<pt>' + list[i] + '</pt>', { speaker_embeddings: speaker, num_inference_steps: STEPS, speed: mrate })
      .then(function (o) {
        var b = typeof o.toBlob === 'function' ? o.toBlob() : null;
        if (!b) throw new Error('sem áudio'); return URL.createObjectURL(b);
      });
  }
  var pending = gen(0); pending.catch(function () {});
  for (var i = 0; i < list.length && my === run; i++) {
    var url;
    try { url = await pending; }
    catch (e) { if (my !== run) return; toast('Falha na voz de IA. Continuando com a voz do dispositivo.'); speakSystem(list, i); return; }
    if (my !== run) { URL.revokeObjectURL(url); return; }
    if (i + 1 < list.length) { pending = gen(i + 1); pending.catch(function () {}); }
    progress(i, list.length);
    var ok = await play(url, extra);
    if (my !== run) return;
    if (!ok) { finish('O navegador bloqueou o áudio. Toque em Ler novamente.'); return; }
  }
  if (my === run) finish();
}

/* 5) Substitui as funcoes com defeito do script original */
window.stopSpeech = function () {
  run++;
  try { speechSynthesis.cancel(); } catch (e) {}
  if (shared) { try { shared.pause(); } catch (e) {} }
  if (endPlay) endPlay();
  state.speaking = false; state.paused = false; els.play.textContent = '▶ Ler';
};
window.speakFromPage = function () {
  if (!state.pdf) { toast('Abra um PDF primeiro.'); return; }
  var sents = buildSents();
  if (!sents.length) { toast('Não há texto extraível a partir dessa página.'); return; }
  var ai = els.voiceEngine.value === 'transformers';
  window.stopSpeech();
  if (ai) unlock();
  state.speaking = true; state.paused = false; els.play.textContent = '⏸ Pausar'; save();
  if (ai) runAI(pack(sents, 120, 220));
  else setTimeout(function () { speakSystem(pack(sents, 170, 170)); }, 60);
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
