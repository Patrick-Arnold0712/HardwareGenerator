'use strict';

// 回归守卫：导线端点必须落在引脚的电连接点（中心 ±20mil），不能是 ±30。
//
// 背景：上游 SKILL.md 说两脚器件引脚尖端在中心 ±30，真机回读是 ±20。按 ±30 画线，
// 每根线都短 10mil，肉眼看不出来、validate.js 也不报，只有客户端 DRC 会报
// CHECKFLOATPIN / SHOWFLOATING。这个测试把"线短了"挡在提交之前。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'generate.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-wires-test-'));
}

function cleanup(root) {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

// 从 .esch2 里取出所有 LINE 记录的两个端点。
function lineEndpoints(file) {
  const points = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const boundary = line.indexOf('}||{');
    if (boundary < 0 || !line.includes('"type":"LINE"')) continue;
    let body;
    try { body = JSON.parse(line.slice(boundary + 3, line.endsWith('|') ? -1 : undefined)); } catch { continue; }
    if (typeof body.startX !== 'number') continue;
    points.push([body.startX, body.startY], [body.endX, body.endY]);
  }
  return points;
}

function generate(templateId, input) {
  const outDir = path.join(makeTempRoot(), 'dist');
  const result = spawnSync(process.execPath, [
    CLI, '--template', templateId, '--input', input, '--out', outDir
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return outDir;
}

test('LED 板的导线端点落在 ±20mil 的引脚上，且测试点串在线上', () => {
  const outDir = generate('5v-led-indicator', '5V LED 指示灯板');
  try {
    const points = lineEndpoints(path.join(outDir, 'led-indicator', 'sch', 'Schematic1', 'P1.esch2'));
    const xs = new Set(points.map(([x]) => x));

    for (const wrong of [470, 530, 670, 730]) {
      assert.equal(xs.has(wrong), false, `出现了 ±30 的旧端点 ${wrong}，说明线又画短了 10mil`);
    }
    for (const right of [480, 520, 680, 720]) {
      assert.ok(xs.has(right), `缺少落在引脚上的端点 ${right}`);
    }
    assert.ok(points.every(([, y]) => y === -300), 'LED 板的导线应保持在同一水平线上');
  } finally {
    cleanup(path.dirname(outDir));
  }
});

test('RC 板的导线端点落在 R1 与 C1 的引脚上', () => {
  const outDir = generate('rc-low-pass-filter', 'RC 低通滤波器');
  try {
    const points = lineEndpoints(path.join(outDir, 'rc-low-pass-filter', 'sch', 'Schematic1', 'P1.esch2'));
    const xs = new Set(points.map(([x]) => x));
    const ys = new Set(points.map(([, y]) => y));

    for (const wrong of [470, 530, 670, 730]) {
      assert.equal(xs.has(wrong), false, `出现了 ±30 的旧端点 ${wrong}`);
    }
    for (const right of [480, 520]) assert.ok(xs.has(right), `缺少端点 ${right}`);
    // C1 在 (700,-400) 竖直放置，上下引脚在 -380 / -420
    assert.ok(ys.has(-380), '缺少 C1 上引脚端点 -380');
    assert.ok(ys.has(-420), '缺少 C1 下引脚端点 -420');
  } finally {
    cleanup(path.dirname(outDir));
  }
});
