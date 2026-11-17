// Makes PNG images for abbsbook records with the browser already installed (Edge or Chrome, headless).
//   node shot.mjs card <card.json> <out.png>   summary card: {date,title,memo,done[],blocked[],decided[],next[]}
//   node shot.mjs url  <http(s) or file url> <out.png> [width] [height]
//   node shot.mjs test                          self-check
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function section(label, items) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return '';
  return `<section><h2>${escapeHtml(label)}</h2><ul>${list.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></section>`;
}

export function cardHtml(card) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:750px;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;background:#fbf7ee;color:#1f1d1a}
.wrap{padding:44px 56px;box-sizing:border-box;height:100%;display:flex;flex-direction:column}
.date{font-size:20px;color:#8a6d1f;font-weight:700;letter-spacing:.04em}
h1{font-size:40px;margin:6px 0 10px;line-height:1.25}
.memo{font-size:22px;color:#4a463f;margin:0 0 22px;border-left:5px solid #d4a52c;padding-left:14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;flex:1;align-content:start}
section{background:#fff;border:1px solid #e8dfc8;border-radius:14px;padding:14px 20px}
h2{font-size:18px;margin:0 0 6px;color:#8a6d1f}
ul{margin:0;padding-left:20px;font-size:19px;line-height:1.5}
</style><div class="wrap">
<div class="date">${escapeHtml(card.date)} · TechRadar</div>
<h1>${escapeHtml(card.title)}</h1>
<p class="memo">${escapeHtml(card.memo)}</p>
<div class="grid">${section('한 일', card.done)}${section('막힌 일 → 푼 방법', card.blocked)}${section('정한 일 · 이유', card.decided)}${section('다음', card.next)}</div>
</div></html>`;
}

function browser() {
  const found = BROWSERS.find((p) => existsSync(p));
  if (!found) throw new Error('Edge or Chrome not found; take the screenshot by hand.');
  return found;
}

export function screenshot(url, out, width = 1200, height = 750) {
  const target = path.resolve(out);
  execFileSync(browser(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'abbs-shot-'))}`, // keeps the user's own profile and cookies out
    `--window-size=${width},${height}`, `--screenshot=${target}`, url,
  ], { stdio: 'ignore', timeout: 60000 });
  if (!existsSync(target) || statSync(target).size === 0) throw new Error(`Screenshot failed: ${target}`);
  return target;
}

function card(jsonPath, out) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (!data.title || !data.date) throw new Error('card.json needs at least date and title.');
  const html = path.join(mkdtempSync(path.join(tmpdir(), 'abbs-card-')), 'card.html');
  writeFileSync(html, cardHtml(data));
  return screenshot(pathToFileURL(html).href, out);
}

function selfCheck() {
  const html = cardHtml({ date: '2026-11-17', title: '<b>x</b>', memo: 'm', done: ['a & b'], blocked: [] });
  console.assert(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'title must be escaped');
  console.assert(html.includes('a &amp; b'), 'items must be escaped');
  console.assert(!html.includes('막힌 일'), 'empty sections are left out');
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'abbs-test-')), 'card.png');
  const json = out.replace(/png$/, 'json');
  writeFileSync(json, JSON.stringify({ date: '2026-11-17', title: '테스트', memo: '한글 확인', done: ['카드 생성'] }));
  const png = card(json, out);
  console.assert(readFileSync(png).subarray(1, 4).toString() === 'PNG', 'output must be a PNG');
  console.log(`self-check ok: ${png}`);
}

const [mode, a, b, w, h] = process.argv.slice(2);
if (mode === 'card' && a && b) console.log(card(a, b));
else if (mode === 'url' && a && b) console.log(screenshot(a, b, Number(w) || 1200, Number(h) || 750));
else if (mode === 'test') selfCheck();
else {
  console.error('Usage: node shot.mjs card <card.json> <out.png> | url <url> <out.png> [w] [h] | test');
  process.exit(1);
}
