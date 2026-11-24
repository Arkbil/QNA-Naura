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
const context = vm.createContext({
  document: { getElementById: get, createElement: element },
  window: { addEventListener() {}, scrollTo() {} },
  navigator: { onLine: true },
  location: { protocol: 'http:' },
  fetch: async path => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.slice(2), 'utf8')) }),
  setTimeout
});

(async () => {
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.match(get('bank-count').textContent, /201 answer topics/);
  assert.equal(get('category-tabs').children[0].textContent, 'AI technical · XGBoost');

  get('question').value = 'Why use LIME if it did not significantly improve accuracy?';
  get('question').oninput();
  assert.equal(get('answer-content').hidden, false);
  assert.match(get('matched-answer').textContent, /13 features instead of the baseline's 22/);
  assert.equal(get('candidate-panel').hidden, false);
  assert.match(get('candidate-list').children[0].textContent, /^1\. 100%/);
  assert.equal(get('followup-button').disabled, false);

  get('followup-button').onclick();
  assert.match(get('context-label').textContent, /Follow-up to:/);
  assert.equal(get('question').value, '');
  get('question').value = 'What did the nine-feature pruning-only model show?';
  get('question').oninput();
  assert.match(get('matched-answer').textContent, /nine predictors/);
  get('clear-button').onclick();
  assert.match(get('context-label').textContent, /prune features using LIME/);

  get('reset-button').onclick();
  assert.equal(get('context-label').textContent, 'Context: main question');
  assert.equal(get('question').value, '');
  get('question').value = 'What time is lunch?';
  get('question').oninput();
  assert.equal(get('no-match').hidden, false);
  assert.equal(get('match-pill').textContent, 'No reliable match');
  get('question').value = 'lime feature';
  get('question').oninput();
  assert.equal(get('no-match').hidden, false, 'Ambiguous short query must not auto-answer');
  const candidates = get('candidate-list').children;
  assert.equal(candidates.length, 5);
  const scores = candidates.map(button => Number(button.textContent.match(/^\d+\. (\d+)%/)[1]));
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  candidates[1].onclick();
  assert.equal(get('answer-content').hidden, false);
  assert.match(get('match-pill').textContent, /Selected candidate/);
  get('clear-button').onclick();
  assert.equal(get('candidate-panel').hidden, true);
  console.log('UI: ranked candidates, manual selection, follow-up, reset, and abstention passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
