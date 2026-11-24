const assert = require('node:assert/strict');
const server = require('./server.cjs');

server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Incoming question/);
    assert.match(home.headers.get('content-type'), /text\/html/);
    const model = await fetch(`${base}/model-en.tar.gz`, { method: 'HEAD' });
    assert.equal(model.status, 200);
    assert.equal(Number(model.headers.get('content-length')), 41166150);
    assert.equal((await fetch(`${base}/server.cjs`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    console.log('Server: homepage, speech model, private-file blocking, and methods passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
