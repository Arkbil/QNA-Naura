const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app.js', 'utf8').split('function setMatchPill')[0];
const guidance = JSON.parse(fs.readFileSync('guidance-en.json', 'utf8'));
const spoken = JSON.parse(fs.readFileSync('spoken-questions.json', 'utf8'));
const more = JSON.parse(fs.readFileSync('qna-variants-more.json', 'utf8'));
const expanded = JSON.parse(fs.readFileSync('expanded-answers.json', 'utf8'));
const bank = [
  ...JSON.parse(fs.readFileSync('qna.json', 'utf8')).map(item => ({ ...item, ...guidance[item.id] })),
  ...JSON.parse(fs.readFileSync('qna-extra.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('qna-ai.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('qna-ai-deep.json', 'utf8'))
].map(item => ({ ...item, question: spoken[item.id] || item.question, variants: [item.question, ...item.variants, ...(more[item.id] || [])], answer: expanded[item.id] || item.answer }));
const context = vm.createContext({ document: { getElementById: () => ({}) } });
vm.runInContext(source, context);
vm.runInContext(`bank = ${JSON.stringify(bank)}`, context);
const match = question => vm.runInContext(`matchQuestion(${JSON.stringify(question)})`, context);
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const worker = fs.readFileSync('sw.js', 'utf8');
for (const [, id] of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(html.includes(`id="${id}"`), `Missing HTML element: ${id}`);
for (const asset of ['index.html', 'styles.css', 'extras.css', 'vendor/vosk.js', 'app.js', 'qna.json', 'qna-extra.json', 'qna-ai.json', 'qna-ai-deep.json', 'guidance-en.json', 'spoken-questions.json', 'qna-variants-more.json', 'expanded-answers.json', 'manifest.webmanifest']) {
  assert.ok(fs.existsSync(asset), `Missing asset: ${asset}`);
  assert.ok(worker.includes(`'./${asset}'`), `Asset absent from offline cache: ${asset}`);
}
assert.ok(fs.existsSync('model-en.tar.gz'), 'Missing offline speech model');
assert.ok(app.includes("loadBundledVoskModel('./model-en.tar.gz')"), 'Speech model is not loaded locally');

assert.equal(bank.length, 201);
assert.equal(new Set(bank.map(entry => entry.id)).size, bank.length, 'Duplicate entry ID');
for (const entry of bank) {
  assert.ok(entry.category && entry.thinking && entry.answer && entry.source, `Incomplete entry: ${entry.id}`);
  for (const question of [entry.question, ...entry.variants]) {
    assert.equal(match(question).match?.entry.id, entry.id, `Wrong match: ${question}`);
  }
  for (const id of entry.followUps || []) assert.ok(bank.some(other => other.id === id), `Broken follow-up: ${entry.id} → ${id}`);
}

for (const [question, expected] of [
  ["Hi, thank you for the presentation. I have a question. Since XGBoost already has its own feature importance method, why did you decide to use LIME as well? What makes LIME useful for your research?", 'lime_vs_gain'],
  ["I noticed that your baseline model already performed quite well. So, I'm just curious, why did you still feel the need to refine it? What were you hoping to achieve beyond improving the accuracy?", 'contribution'],
  ["I was looking at your ablation study, and I noticed that cyclic encoding alone achieved the same F1-score as the full Path A. So, I'm wondering, how much of the improvement can we actually attribute to LIME? And what would you say is LIME's main contribution to your results?", 'ablation'],
  ['Why use LIME if accuracy did not significantly improve?', 'why_lime'],
  ['Is the target exactly the next calendar day?', 'horizon_misalignment'],
  ['How stable was LIME across random seeds?', 'lime_stability'],
  ['Why use a 2% pruning threshold?', 'why_two_percent'],
  ['What did the ablation study show?', 'ablation'],
  ['Is there data leakage in the evaluation?', 'leakage']
]) {
  const result = match(question);
  assert.equal(result.match?.entry.id, expected, `${question}: got ${result.match?.entry.id || 'none'}`);
}
for (const question of ['What is your favorite food?', 'Tell me about neural networks for image classification', 'LIME', 'What time is lunch?', 'What is the weather in Tokyo tomorrow?', 'Who won the election?']) {
  assert.equal(match(question).match, null, `Unsupported question matched: ${question}`);
}
assert.equal(match('lime feature').match, null, 'Ambiguous short query must not auto-answer');
console.log(`Q&A: ${bank.length} topics, ${bank.reduce((count, entry) => count + 1 + entry.variants.length, 0)} phrasings; matching, follow-ups, DOM IDs, and offline assets passed.`);
