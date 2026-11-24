const $ = id => document.getElementById(id);
const ui = {
  language: $('language'), prepare: $('prepare-button'), mic: $('mic-button'), micPill: $('mic-pill'),
  status: $('speech-status'), question: $('question'), clear: $('clear-button'), transcriptNote: $('transcript-note'),
  followup: $('followup-button'), reset: $('reset-button'), contextLabel: $('context-label'),
  empty: $('answer-empty'), content: $('answer-content'), noMatch: $('no-match'), matchPill: $('match-pill'),
  matchBar: $('match-bar'), matchedQuestion: $('matched-question'), matchedAnswer: $('matched-answer'),
  matchedEvidence: $('matched-evidence'),
  matchedSource: $('matched-source'), candidatePanel: $('candidate-panel'), candidates: $('candidate-list'), weakCandidate: $('weak-candidate'), copy: $('copy-button'),
  matchedThinking: $('matched-thinking'), matchedKeywords: $('matched-keywords'), followups: $('followups'),
  bankCount: $('bank-count'), categoryTabs: $('category-tabs'), categoryList: $('category-list'),
  offlineDot: $('offline-dot'), offlineLabel: $('offline-label')
};

let bank = [];
let recognition = null;
let listening = false;
let finalText = '';
let currentMatch = null;
let readyLanguage = '';
let speechEngine = null;
let voskModel = null;
let pendingVoskModel = null;
let voskRecognizer = null;
let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let silenceNode = null;
let contextEntry = null;
let followupMode = false;
let captureGeneration = 0;

const stopWords = new Set('the a an and or of to in on for with from about what why how when where which is are was were be been do does did can could should would this that it we our your you i they them their there as at by if then than have has had more most much many any all between compared compare using use used hi hello thanks thank presentation question curious wondering wonder noticed looking please explain tell clarify could kind just actually basically yang dan di ke dari untuk pada apa mengapa kenapa bagaimana apakah apakahnya ini itu dengan sebagai adalah ada lebih oleh kami saya kita'.split(' '));
const aliases = new Map(Object.entries({
  accuracy:'accuraci', accurate:'accuraci', akurasi:'accuraci', performance:'perform', performa:'perform',
  significant:'signific', significance:'signific', statistically:'statist', statistical:'statist', statistik:'statist', signifikan:'signific',
  improvement:'improv', improved:'improv', improve:'improv', increase:'improv', peningkatan:'improv', meningkat:'improv',
  feature:'fitur', features:'fitur', importance:'importanc', penting:'importanc', kepentingan:'importanc',
  input:'fitur', inputs:'fitur', predictor:'fitur', predictors:'fitur', strongest:'dominant', main:'dominant',
  rainfall:'rain', rainy:'rain', raining:'rain', hujan:'rain', precipitation:'rain',
  humidity:'humid', kelembapan:'humid', lembap:'humid', rh:'humid',
  missing:'missing', hilang:'missing', kosong:'missing', gap:'missing', gaps:'missing',
  deleting:'removed', deleted:'removed', remove:'removed', removing:'removed', removed:'removed',
  leakage:'leak', bocor:'leak', kebocoran:'leak',
  tomorrow:'tomorrow', besok:'tomorrow', nextday:'tomorrow', h1:'tomorrow',
  lime:'lime', shap:'shap', xai:'xai', xgboost:'xgboost',
  fold:'fold', folds:'fold', crossvalidation:'cv', crossvalidated:'cv', validation:'cv', validasi:'cv', cv:'cv',
  fully:'full', nested:'nested', evaluation:'evaluation',
  threshold:'threshold', ambang:'threshold', cutoff:'threshold',
  ablation:'ablasi', ablasi:'ablasi',
  station:'stasiun', stasiun:'stasiun', bandung:'bandung', generalize:'general', generalization:'general', generalisasi:'general', digeneralisasi:'general',
  stable:'stabil', stability:'stabil', stabilitas:'stabil', stabil:'stabil',
  seed:'seed', seeds:'seed',
  prune:'pruning', pruning:'pruning', pemangkasan:'pruning',
  season:'musim', seasonal:'musim', musim:'musim',
  cyclic:'siklik', cyclical:'siklik', siklik:'siklik', calendar:'kalender', kalender:'kalender',
  limitation:'limitasi', limitations:'limitasi', weakness:'limitasi', kelemahan:'limitasi', batasan:'limitasi',
  precision:'precision', presisi:'precision', recall:'recall', f1:'f1',
  local:'lokal', lokal:'lokal', global:'global',
  baseline:'baseline', comparator:'pembanding', comparison:'pembanding', pembanding:'pembanding',
  warnings:'warning', emergency:'warning', ready:'operational',
  data:'data', train:'train', training:'train', latih:'train', test:'test', testing:'test', uji:'test'
}));

function tokenize(text) {
  return [...new Set(text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:x\s*g\s*boost|extreme gradient boosting)\b/g, 'xgboost')
    .replace(/\b(?:f\s*one|eff one)\b/g, 'f1')
    .replace(/\b(?:mac nemar|mc nemar)\b/g, 'mcnemar')
    .replace(/h\s*\+\s*1/g, ' h1 ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word)).map(word => aliases.get(word) || word))];
}

const variantCache = new WeakMap();
const phrase = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

function scoreEntry(query, entry) {
  const q = tokenize(query);
  let variants = variantCache.get(entry);
  if (!variants) {
    variants = [entry.question, ...entry.variants, entry.keywords.join(' ')].map(value => ({ phrase: phrase(value), terms: tokenize(value) }));
    variantCache.set(entry, variants);
  }
  if (variants.slice(0, -1).some(variant => phrase(query) === variant.phrase)) return { score: 1, shared: Math.max(2, q.length) };
  if (q.length < 2) return { score: 0, shared: 0 };
  let best = 0;
  let shared = 0;
  for (const variant of variants) {
    const terms = variant.terms;
    const common = q.filter(term => terms.includes(term));
    const overlap = common.length;
    const coverage = overlap / q.length;
    const variantCoverage = overlap / terms.length;
    const dice = 2 * overlap / (q.length + terms.length);
    const score = 0.42 * coverage + 0.32 * variantCoverage + 0.26 * dice;
    if (score > best) { best = score; shared = overlap; }
  }
  const keywordHits = tokenize(entry.keywords.join(' ')).filter(term => q.includes(term)).length;
  return { score: Math.min(0.96, best + Math.min(0.06, keywordHits * 0.02)), shared };
}

function matchQuestion(query) {
  const parts = [query, ...query.split(/[?.!;]+/).map(part => part.trim()).filter(part => tokenize(part).length >= 2)];
  const ranked = bank.map(entry => {
    const base = parts.map(part => scoreEntry(part, entry)).sort((a, b) => b.score - a.score)[0];
    const related = followupMode && contextEntry && (contextEntry.followUps || []).includes(entry.id);
    return { entry, ...base, score: base.shared >= 2 && base.score >= 0.48 && related ? Math.min(1, base.score + 0.05) : base.score };
  }).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const ambiguous = top && ranked[1] && top.score - ranked[1].score < 0.08 && !(top.score === 1 && ranked[1].score < 1);
  if (!top || top.shared < 2 || top.score < 0.54 || ambiguous) return { match: null, weak: top && top.score > 0.25 ? top : null, ranked };
  return { match: top, weak: null, ranked };
}

function setMatchPill(label, level) { ui.matchPill.textContent = label; ui.matchPill.className = `pill ${level}`; }

function renderCandidates(ranked, selectedId) {
  ui.candidatePanel.hidden = false;
  ui.candidates.replaceChildren();
  const candidates = ranked.filter(item => item.shared >= 2 && item.score >= 0.25).slice(0, 5);
  if (!candidates.length) {
    const message = document.createElement('p');
    message.textContent = 'No meaningful candidates yet. Add more terms or ask for clarification.';
    ui.candidates.append(message);
    return;
  }
  candidates.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'candidate-item';
    button.textContent = `${index + 1}. ${Math.round(item.score * 100)}% · ${item.entry.question}`;
    if (item.entry.id === selectedId) button.classList.add('selected');
    button.onclick = () => {
      [...ui.candidates.children].forEach(child => child.classList.remove('selected'));
      button.classList.add('selected');
      showEntry(item, false, 'candidate');
    };
    ui.candidates.append(button);
  });
}

function showEntry(result, provisional = false, origin = 'matched') {
  currentMatch = result.entry;
  ui.followup.disabled = false;
  ui.empty.hidden = true; ui.noMatch.hidden = true; ui.content.hidden = false;
  const high = result.score >= 0.76;
  if (origin === 'browse') setMatchPill('Opened from bank', 'neutral');
  else if (origin === 'candidate') setMatchPill(`Selected candidate · ${Math.round(result.score * 100)}% · verify`, result.score >= 0.54 ? 'medium' : 'low');
  else setMatchPill(`${high ? 'Strong' : 'Moderate'} · ${Math.round(result.score * 100)}%${provisional ? ' provisional' : ''}`, high ? 'high' : 'medium');
  ui.matchBar.style.width = `${Math.round(result.score * 100)}%`;
  ui.matchedQuestion.textContent = result.entry.question;
  ui.matchedEvidence.textContent = result.entry.evidence || 'Evidence: study paper';
  ui.matchedAnswer.textContent = result.entry.answer;
  ui.matchedThinking.textContent = result.entry.thinking || 'State the claim, the supporting figure, and its limit.';
  ui.matchedKeywords.textContent = result.entry.speakingKeywords?.join(' · ') || result.entry.keywords.join(' · ');
  ui.matchedSource.textContent = result.entry.source;
  ui.followups.replaceChildren();
  const followups = (result.entry.followUps || []).map(id => bank.find(item => item.id === id)).filter(Boolean);
  if (followups.length) {
    const label = document.createElement('span'); label.textContent = 'Related follow-up questions:'; ui.followups.append(label);
    for (const item of followups) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.question;
      button.onclick = () => showEntry({ entry: item, score: 1 }, false, 'browse');
      ui.followups.append(button);
    }
  }
}

function renderCategories() {
  const priority = ['AI technical · XGBoost', 'AI technical · LIME', 'AI technical · metrics', 'AI technical · evaluation'];
  const categories = [...new Set(bank.map(item => item.category || 'Other'))]
    .sort((a, b) => (priority.includes(a) ? priority.indexOf(a) : 100) - (priority.includes(b) ? priority.indexOf(b) : 100) || a.localeCompare(b));
  ui.bankCount.textContent = `${bank.length} answer topics · ${bank.reduce((sum, item) => sum + 1 + item.variants.length, 0)} question phrasings`;
  ui.categoryTabs.replaceChildren();
  const draw = category => {
    ui.categoryList.replaceChildren();
    for (const item of bank.filter(entry => (entry.category || 'Lainnya') === category)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.question;
      button.onclick = () => { showEntry({ entry: item, score: 1 }, false, 'browse'); window.scrollTo({ top: 250, behavior: 'smooth' }); };
      ui.categoryList.append(button);
    }
    [...ui.categoryTabs.children].forEach(button => button.classList.toggle('selected', button.textContent === category));
  };
  for (const category of categories) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = category;
    button.onclick = () => draw(category); ui.categoryTabs.append(button);
  }
  if (categories.length) draw(categories[0]);
}

function updateMatch(provisional = false) {
  const query = ui.question.value.trim();
  currentMatch = null;
  if (!followupMode) ui.followup.disabled = true;
  if (!query) { ui.candidatePanel.hidden = true; ui.candidates.replaceChildren(); ui.empty.hidden = false; ui.content.hidden = true; ui.noMatch.hidden = true; setMatchPill('Waiting', 'neutral'); return; }
  const result = matchQuestion(query);
  renderCandidates(result.ranked, result.match?.entry.id);
  if (result.match) return showEntry(result.match, provisional);
  ui.empty.hidden = true; ui.content.hidden = true; ui.noMatch.hidden = false;
  setMatchPill('No reliable match', 'low');
  ui.weakCandidate.textContent = result.weak ? 'Review the candidates above before choosing an answer.' : '';
}

function restartQuestionCapture() {
  if (followupMode && currentMatch) contextEntry = currentMatch;
  updateContextLabel();
  finalText = ''; ui.question.value = ''; updateMatch();
  if (listening && recognition) {
    captureGeneration++;
    recognition.onend = null; recognition.abort(); recognition = null;
    setTimeout(startSession, 200);
  }
  if (listening && speechEngine === 'vosk' && audioContext) {
    if (voskRecognizer) voskRecognizer.remove();
    startVoskRecognizer();
  }
}

function updateContextLabel() {
  ui.contextLabel.textContent = followupMode && contextEntry ? `Follow-up to: ${contextEntry.question}` : 'Context: main question';
  ui.followup.textContent = followupMode ? 'Main question mode' : 'Follow-up mode';
}

function updateNetwork() {
  const offline = !navigator.onLine;
  ui.offlineDot.classList.toggle('offline', offline);
  ui.offlineLabel.textContent = offline ? 'Offline · on-device' : 'Online · on-device';
}

const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = !!(Speech && typeof Speech.available === 'function' && typeof Speech.install === 'function' && 'processLocally' in Speech.prototype);
const voskSupported = !!(window.Vosk?.createModel && navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));

function loadBundledVoskModel(path) {
  if (!window.Vosk.Model) return window.Vosk.createModel(path);
  const model = new window.Vosk.Model(path);
  pendingVoskModel = model;
  return new Promise((resolve, reject) => {
    model.on('load', message => message.result ? resolve(model) : reject(new Error('The local speech model was rejected by the Vosk worker.')));
    model.on('error', message => reject(new Error(message.error || 'Local speech setup failed. Check browser storage; the unpacked model needs about 71 MB.')));
    model.worker.addEventListener('error', event => reject(new Error(event.message || 'The local speech worker failed.')), { once: true });
    model.worker.addEventListener('messageerror', () => reject(new Error('The local speech worker could not transfer model data.')), { once: true });
  });
}

async function prepareSpeech() {
  if (readyLanguage === ui.language.value && speechEngine) return true;
  const lang = ui.language.value;
  ui.prepare.disabled = true;
  ui.mic.disabled = true;
  ui.mic.textContent = 'Loading speech…';
  try {
    if (speechSupported) {
      try {
        ui.status.textContent = `Checking local ${lang} speech…`;
        const state = await Speech.available({ langs: [lang], processLocally: true });
        if (state === 'available') {
          speechEngine = 'native'; readyLanguage = lang;
          ui.status.textContent = `${lang} on-device speech is ready.`;
          return true;
        }
      } catch { /* Chrome local speech failed; use the bundled model below. */ }
    }
    if (!voskSupported) throw new Error('Local microphone processing is unavailable. Typed search still works.');
    ui.status.textContent = 'Preparing local speech model (41 MB download, about 71 MB browser storage). Typed search works meanwhile.';
    if (!voskModel) {
      let timeout;
      const started = Date.now();
      const progress = setInterval(() => {
        ui.status.textContent = `Loading local speech model… ${Math.floor((Date.now() - started) / 1000)}s elapsed. Typed search works meanwhile.`;
      }, 5000);
      try {
        voskModel = await Promise.race([
          loadBundledVoskModel('./model-en.tar.gz'),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Speech model did not finish within 3 minutes. Check free browser storage or use a profile on drive D:. Typed search still works.')), 180000); })
        ]);
      } finally {
        clearTimeout(timeout); clearInterval(progress);
        if (!voskModel && pendingVoskModel) pendingVoskModel.worker.terminate();
        pendingVoskModel = null;
      }
    }
    speechEngine = 'vosk'; readyLanguage = lang;
    ui.status.textContent = 'Offline Vosk speech is ready. Question mode can listen now.';
    return true;
  } catch (error) {
    speechEngine = null; readyLanguage = ''; ui.status.textContent = error?.message || 'Local speech model failed to load. Typed search still works.';
    return false;
  } finally { ui.prepare.disabled = false; ui.mic.disabled = false; if (!listening) ui.mic.textContent = 'Enter question mode'; }
}

function startVoskRecognizer() {
  voskRecognizer = new voskModel.KaldiRecognizer(audioContext.sampleRate);
  voskRecognizer.on('result', message => {
    if (!listening) return;
    const text = (message.result?.text || '').trim();
    if (text) finalText = `${finalText} ${text}`.trim();
    ui.question.value = finalText;
    ui.transcriptNote.textContent = 'Final transcript · still listening';
    updateMatch(false);
  });
  voskRecognizer.on('partialresult', message => {
    if (!listening) return;
    const partial = (message.result?.partial || '').trim();
    ui.question.value = `${finalText} ${partial}`.trim();
    ui.transcriptNote.textContent = 'Provisional transcript · still listening';
    updateMatch(true);
  });
}

async function startVosk() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    if (!listening) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; return; }
    const Audio = window.AudioContext || window.webkitAudioContext;
    try { audioContext = new Audio({ sampleRate: 16000 }); } catch { audioContext = new Audio(); }
    await audioContext.resume();
    if (!listening) { stopVosk(); return; }
    startVoskRecognizer();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = event => {
      try { if (listening && voskRecognizer) voskRecognizer.acceptWaveform(event.inputBuffer); }
      catch (error) { enterIdle(); ui.status.textContent = `Local speech stopped: ${error.message}`; }
    };
    silenceNode = audioContext.createGain(); silenceNode.gain.value = 0;
    sourceNode.connect(processorNode); processorNode.connect(silenceNode); silenceNode.connect(audioContext.destination);
  } catch (error) { enterIdle(); ui.status.textContent = `Microphone unavailable: ${error.message}. Typed search still works.`; }
}

function stopVosk() {
  if (processorNode) { processorNode.onaudioprocess = null; processorNode.disconnect(); processorNode = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (silenceNode) { silenceNode.disconnect(); silenceNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
  if (voskRecognizer) { voskRecognizer.remove(); voskRecognizer = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
}

function enterIdle() {
  listening = false;
  captureGeneration++;
  if (recognition) { recognition.onend = null; recognition.abort(); recognition = null; }
  stopVosk();
  ui.mic.textContent = 'Enter question mode'; ui.mic.classList.remove('active');
  ui.micPill.textContent = 'Idle mode'; ui.micPill.className = 'pill neutral';
  if (readyLanguage) ui.status.textContent = 'Idle mode. Microphone off. Typed search still works.';
}

function startSession() {
  if (!listening || !speechSupported || readyLanguage !== ui.language.value) return;
  const generation = captureGeneration;
  recognition = new Speech();
  recognition.lang = readyLanguage;
  recognition.processLocally = true;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript.trim();
      if (event.results[i].isFinal) finalText = `${finalText} ${text}`.trim();
      else interim += ` ${text}`;
    }
    ui.question.value = `${finalText} ${interim.trim()}`.trim();
    ui.transcriptNote.textContent = interim ? 'Provisional transcript · still listening' : 'Final transcript · still listening';
    updateMatch(!!interim);
  };
  recognition.onerror = event => {
    if (event.error === 'no-speech') return;
    ui.status.textContent = `Microphone: ${event.error}. ${event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Allow microphone access and check the local pack.' : 'Try question mode again.'}`;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') enterIdle();
  };
  recognition.onend = () => { if (listening && generation === captureGeneration) setTimeout(() => { if (listening && generation === captureGeneration) startSession(); }, 250); };
  try { recognition.start(); } catch (error) { ui.status.textContent = `Could not start microphone: ${error.message}`; enterIdle(); }
}

async function enterQuestionMode() {
  if (readyLanguage !== ui.language.value || !speechEngine) { ui.status.textContent = 'Prepare offline speech first.'; return; }
  listening = true; captureGeneration++; finalText = ''; ui.question.value = ''; updateMatch();
  ui.mic.textContent = 'Return to idle'; ui.mic.classList.add('active');
  ui.micPill.textContent = 'Question mode · listening'; ui.micPill.className = 'pill high';
  ui.status.textContent = 'Listening. Audio stays on this device.';
  if (speechEngine === 'vosk') await startVosk();
  else startSession();
}

ui.prepare.onclick = prepareSpeech;
ui.mic.onclick = async () => {
  if (listening) { enterIdle(); return; }
  if (!speechEngine || readyLanguage !== ui.language.value) {
    const ready = await prepareSpeech();
    if (!ready) return;
  }
  await enterQuestionMode();
};
ui.language.onchange = () => { enterIdle(); readyLanguage = ''; speechEngine = null; ui.status.textContent = 'Prepare offline speech for the selected language.'; };
ui.question.oninput = () => { finalText = ui.question.value.trim(); updateMatch(); };
ui.clear.onclick = () => { restartQuestionCapture(); ui.question.focus(); };
ui.followup.onclick = () => {
  if (!followupMode) { contextEntry = currentMatch; followupMode = true; }
  else { contextEntry = null; followupMode = false; }
  updateContextLabel(); restartQuestionCapture(); ui.question.focus();
};
ui.reset.onclick = () => { contextEntry = null; followupMode = false; ui.followup.disabled = true; updateContextLabel(); restartQuestionCapture(); ui.question.focus(); };
ui.copy.onclick = async () => {
  if (!currentMatch) return;
  try {
    await navigator.clipboard.writeText(currentMatch.answer);
    ui.copy.textContent = 'Copied';
    setTimeout(() => ui.copy.textContent = 'Copy answer', 1600);
  } catch { ui.copy.textContent = 'Copy unavailable'; }
};
window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork); updateNetwork();
if (!speechSupported) ui.status.textContent = voskSupported ? 'Bundled offline speech is available. Enter question mode to load it.' : 'Local speech is unavailable in this browser. Typed search still works.';
Promise.all(['./qna.json', './qna-extra.json', './qna-ai.json', './qna-ai-deep.json', './guidance-en.json', './spoken-questions.json', './qna-variants-more.json', './expanded-answers.json'].map(path => fetch(path).then(response => { if (!response.ok) throw new Error('Q&A bank could not be opened'); return response.json(); })))
  .then(([base, extra, ai, deep, guidance, spoken, more, expanded]) => {
    bank = [...base.map(item => ({ ...item, ...guidance[item.id] })), ...extra, ...ai, ...deep]
      .map(item => ({ ...item, question: spoken[item.id] || item.question, variants: [item.question, ...item.variants, ...(more[item.id] || [])], answer: expanded[item.id] || item.answer }));
    renderCategories(); updateMatch();
  })
  .catch(error => { ui.status.textContent = error.message; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});

// Test hook for the small matching self-check; no network or speech needed.
if (typeof module !== 'undefined') module.exports = { tokenize, scoreEntry, matchQuestion, setBank: data => { bank = data; } };
