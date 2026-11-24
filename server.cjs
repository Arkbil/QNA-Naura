const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const files = new Set([
  'index.html', 'styles.css', 'extras.css', 'app.js', 'sw.js',
  'manifest.webmanifest', 'model-en.tar.gz', 'vendor/vosk.js',
  'qna.json', 'qna-extra.json', 'qna-ai.json', 'qna-ai-deep.json',
  'guidance-en.json', 'spoken-questions.json', 'qna-variants-more.json', 'expanded-answers.json'
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.gz': 'application/gzip'
};

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  let file;
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    file = decodeURIComponent(pathname).replace(/^\//, '') || 'index.html';
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (!files.has(file)) {
    response.writeHead(404).end();
    return;
  }
  const fullPath = path.join(__dirname, file);
  fs.stat(fullPath, (error, info) => {
    if (error || !info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)],
      'Content-Length': info.size,
      'Cache-Control': 'no-cache'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(fullPath).pipe(response);
  });
});

if (require.main === module) server.listen(Number(process.env.PORT || 10000), '0.0.0.0');
module.exports = server;
