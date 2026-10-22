'use strict';

// 用 Chrome DevTools Protocol 驱动真实浏览器点完五步向导并逐步截图。
// 仅用于本地验收，不属于产品代码。

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://127.0.0.1:7788/';
const OUT = path.join(__dirname, '..', 'dist', 'wizard-steps');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(process.env.TEMP, `edge-cdp-${Date.now()}`);

  const edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1000,1400',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    BASE
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await httpJson(`http://127.0.0.1:${PORT}/json`);
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 还没起来 */ }
    await sleep(300);
  }
  if (!target) throw new Error('未能连接到浏览器调试端口');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`页面异常：${res.exceptionDetails.text} ${JSON.stringify(res.exceptionDetails.exception?.description || '')}`);
    }
    return res.result.value;
  }

  async function shot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log(`  截图 ${path.basename(file)} (${fs.statSync(file).size} B)`);
  }

  async function waitFor(expr, label, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expr)) return;
      await sleep(400);
    }
    throw new Error(`等待超时：${label}`);
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1500);

  console.log('步骤 1：说出想法');
  await evaluate(`(() => {
    const t = document.getElementById('ideaInput');
    t.value = '我想做一个 5V LED 指示灯板，带测试点，用来确认电源是否正常。';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await shot('step1-idea');

  await evaluate(`document.getElementById('beginBtn').click()`);
  await waitFor(`document.querySelectorAll('[data-q]').length >= 9`, '步骤 2 渲染');
  console.log('步骤 2：澄清需求');
  await shot('step2-questions');

  await evaluate(`(() => {
    document.querySelector('[data-q="purpose"][data-v="auto"]').click();
    document.querySelector('[data-q="supply"][data-v="5v"]').click();
    document.querySelector('[data-q="testpoints"][data-v="yes"]').click();
    return true;
  })()`);
  await sleep(300);
  await shot('step2-answered');

  await evaluate(`document.getElementById('answersBtn').click()`);
  await waitFor(`document.querySelectorAll('[data-choose]').length >= 1`, '步骤 3 渲染');
  console.log('步骤 3：选择方案');
  await shot('step3-options');

  await evaluate(`document.querySelector('[data-choose="5v-led-indicator"]').click()`);
  await waitFor(`document.getElementById('generateBtn') !== null`, '步骤 4 渲染');
  console.log('步骤 4：预览确认');
  await shot('step4-preview');

  await evaluate(`document.getElementById('generateBtn').click()`);
  await waitFor(`document.querySelector('.files') !== null`, '步骤 5 渲染', 180000);
  console.log('步骤 5：工程包');
  await shot('step5-result');

  const summary = await evaluate(`(() => {
    const files = [...document.querySelectorAll('.file')].map(f => f.textContent.trim());
    const notices = [...document.querySelectorAll('.notice')].map(n => n.textContent.trim());
    const links = [...document.querySelectorAll('a[href^="/api/download"]')].map(a => a.getAttribute('href'));
    return { fileCount: files.length, files: files.slice(0, 3), notices, links };
  })()`);

  console.log('\n结果：');
  console.log(`  产物条目：${summary.fileCount}`);
  summary.files.forEach((f) => console.log(`    ${f}`));
  console.log(`  下载链接：${summary.links.join(' , ')}`);
  summary.notices.forEach((n) => console.log(`  提示：${n.slice(0, 90)}`));

  ws.close();
  edge.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  console.log('\n浏览器验收完成。');
}

main().catch((error) => {
  console.error('浏览器验收失败：', error.message);
  process.exitCode = 1;
});
