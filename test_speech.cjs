const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
function element() {
  return {
    textContent: '', value: '', hidden: false, disabled: false, style: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); }, focus() {}
  };
}
const get = id => elements.get(id) || (elements.set(id, element()), elements.get(id));
get('language').value = 'en-US';
let modelLoads = 0;
let micOpens = 0;
let tracksStopped = 0;
let recognizerRemoved = 0;
let modelCacheAdds = 0;
let recognizer;
const audioNode = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
class AudioContext {
  sampleRate = 16000;
  async resume() {}
  async close() {}
  createMediaStreamSource() { return audioNode(); }
  createScriptProcessor() { return audioNode(); }
  createGain() { return audioNode(); }
  destination = audioNode();
}
class SpeechRecognition {
  processLocally = false;
  static async available() { return 'unavailable'; }
  static async install() { throw new Error('Native speech should not install when unavailable'); }
}
const context = vm.createContext({
  document: { getElementById: get, createElement: element },
  window: {
    addEventListener() {}, scrollTo() {}, AudioContext, SpeechRecognition,
    caches: { async open(name) {
      assert.equal(name, 'naura-qna-v11');
      return { async match() { return modelCacheAdds ? {} : undefined; }, async add(path) { assert.equal(path, './model-en.tar.gz'); modelCacheAdds++; } };
    } },
    Vosk: {
      async createModel() { throw new Error('Direct model load should be used'); },
      Model: class {
        constructor(path) {
          assert.equal(path, './model-en.tar.gz');
          modelLoads++;
          this.worker = { addEventListener() {} };
        }
        on(event, callback) { if (event === 'load') setTimeout(() => callback({ result: true }), 0); }
        KaldiRecognizer = class {
        handlers = {};
        constructor(rate) { assert.equal(rate, 16000); recognizer = this; }
        on(event, handler) { this.handlers[event] = handler; }
        acceptWaveform() {}
        remove() { recognizerRemoved++; }
        };
      }
    }
  },
  navigator: {
    onLine: true,
    mediaDevices: { async getUserMedia() {
      micOpens++;
      return { getTracks: () => [{ stop() { tracksStopped++; } }] };
    } }
  },
  location: { protocol: 'http:' },
  fetch: async path => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.slice(2), 'utf8')) }),
  setTimeout, clearTimeout, setInterval, clearInterval
});

(async () => {
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(get('mic-button').disabled, false);
  await get('mic-button').onclick();
  assert.equal(modelLoads, 1);
  assert.equal(modelCacheAdds, 1);
  assert.equal(micOpens, 1);
  assert.match(get('mic-pill').textContent, /Question mode/);
  recognizer.handlers.partialresult({ result: { partial: 'why use lime' } });
  assert.equal(get('question').value, 'why use lime');
  recognizer.handlers.result({ result: { text: 'why use lime if accuracy did not significantly improve' } });
  assert.match(get('matched-answer').textContent, /22 to 13/);
  await get('mic-button').onclick();
  assert.equal(tracksStopped, 1);
  assert.equal(recognizerRemoved, 1);
  assert.equal(get('mic-pill').textContent, 'Idle mode');
  await get('mic-button').onclick();
  assert.equal(modelLoads, 1, 'Prepared model should be reused');
  assert.equal(micOpens, 2);
  await get('mic-button').onclick();
  console.log('Speech: native unavailable -> bundled Vosk -> question/idle/restart passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
