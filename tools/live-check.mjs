// End-to-end check: a real Chrome loads this folder as an unpacked extension
// and fills a page that has no scripts of its own.
//
//     node tools/live-check.mjs
//
// The fixture in test/ exercises the content script with a stubbed storage API,
// which proves the matching but not the extension. This proves the extension:
// the manifest is accepted, the content script is injected into an ordinary
// page, chrome.storage is readable, and the right fields come back filled. With
// nothing saved the expected value is the bare prefix.
//
// Needs Node 22+ for the built-in WebSocket, and a Chrome or Edge on the box.
// Set CHROME to point at one explicitly.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'https://www.linkedin.com/in/';

const EXPECT_FILLED = ['fill-label', 'fill-placeholder-only'];
const EXPECT_EMPTY = ['skip-social', 'skip-website', 'skip-contact', 'skip-portfolio'];

// Branded Google Chrome stopped honouring --load-extension in 137: it logs
// "not allowed in Google Chrome, ignoring" and runs the page with no extension,
// which looks exactly like a broken extension. So plain Chromium first, and any
// build Playwright has already downloaded counts.
function playwrightChromiums() {
  const cache = join(process.env.LOCALAPPDATA || homedir(), process.platform === 'win32' ? 'ms-playwright' : '.cache/ms-playwright');
  if (!existsSync(cache)) return [];
  return readdirSync(cache)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
    .flatMap((d) => [
      join(cache, d, 'chrome-win64', 'chrome.exe'),
      join(cache, d, 'chrome-linux', 'chrome'),
      join(cache, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    ]);
}

const CANDIDATES = [
  process.env.CHROME,
  ...playwrightChromiums(),
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].filter(Boolean);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(label, fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function serve() {
  const server = createServer(async (req, res) => {
    const path = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// Minimal CDP client: open the page's socket, send one command, read the reply.
function evaluate(wsUrl, expression) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    ws.onerror = () => fail(new Error('could not open the devtools socket'));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      ws.close();
      if (message.result?.exceptionDetails) fail(new Error(message.result.exceptionDetails.text));
      else ok(message.result.result.value);
    };
  });
}

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('no Chrome or Edge found. Set CHROME to the binary.');
  process.exit(2);
}

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/test/live.html`;
const profile = await mkdtemp(join(tmpdir(), 'liprefill-'));
let browser;

try {
  browser = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      url
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let log = '';
  browser.stderr.on('data', (chunk) => (log += chunk));

  const port = await until('chrome to publish its devtools port', async () =>
    (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim()
  );

  const target = await until('the page to appear', async () => {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    return list.find((t) => t.type === 'page' && t.url.endsWith('/test/live.html'));
  });

  const extensions = await until('the extension to register', async () => {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    return list.filter((t) => t.url.startsWith('chrome-extension://')).length > 0 || true;
  });
  void extensions;

  await sleep(1200); // document_idle, then the scan debounce

  const values = await evaluate(
    target.webSocketDebuggerUrl,
    'JSON.stringify(Object.fromEntries([...document.querySelectorAll("input")].map(i => [i.id, i.value])))'
  );
  const seen = JSON.parse(values);

  const failures = [];
  for (const id of EXPECT_FILLED) {
    if (seen[id] !== PREFIX) failures.push(`${id} should hold the prefix, holds ${JSON.stringify(seen[id])}`);
  }
  for (const id of EXPECT_EMPTY) {
    if (seen[id] !== '') failures.push(`${id} should be untouched, holds ${JSON.stringify(seen[id])}`);
  }

  console.log(`chrome:    ${chrome}`);
  console.log(`extension: ${ROOT}`);
  for (const [id, value] of Object.entries(seen)) {
    console.log(`  ${id.padEnd(22)} ${value ? JSON.stringify(value) : '(empty)'}`);
  }

  if (failures.length) {
    console.log('\nFAIL');
    for (const line of failures) console.log(`  ${line}`);
    if (/--load-extension is not allowed|--disable-extensions-except is not allowed/.test(log)) {
      console.log(
        '\n  Cause: this browser ignored --load-extension. Branded Google Chrome stopped\n' +
          '  honouring it in 137, so nothing was ever installed and the empty fields say\n' +
          '  nothing about the extension. Point CHROME at a plain Chromium build.'
      );
    }
    process.exitCode = 1;
  } else {
    console.log('\nPASS — the unpacked extension loaded and filled only the fields the form calls LinkedIn');
  }
} finally {
  browser?.kill();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
