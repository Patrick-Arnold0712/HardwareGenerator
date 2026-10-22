'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const wizard = require('../src/wizard.js');

const VALIDATOR = path.join(__dirname, '..', 'vendor', 'easyeda-eprj3-skill', 'scripts', 'validate.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-wizard-test-'));
}

function cleanupTemp(root) {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function runFlow(idea, answers, optionId, root) {
  const session = wizard.createSession();
  const step1 = wizard.submitIdea(session, idea);
  const step2 = wizard.answerQuestions(session, answers);
  const step3 = wizard.chooseOption(session, optionId);
  return { session, step1, step2, step3, root };
}

test('向导：每一步最多 3 个问题，且每题都有「按推荐方案」', () => {
  assert.ok(wizard.QUESTIONS.length <= 3, '每轮问题数不超过 3');
  for (const q of wizard.QUESTIONS) {
    const labels = q.options.map((o) => o.label);
    assert.ok(
      labels.some((label) => label.includes('按推荐方案')),
      `问题 ${q.id} 缺少「按推荐方案」选项`
    );
  }
});

test('向导：未命中模板时明确降级，不静默套用', () => {
  const session = wizard.createSession();
  const result = wizard.submitIdea(session, '我想做一个带 WiFi 的智能花盆');
  assert.deepEqual(result.detected, []);
  assert.ok(result.degradation, '必须返回降级说明');
  assert.match(result.degradation.reason, /没有命中/);
});

test('向导：无法满足的要求会被显式记录，而不是静默忽略', () => {
  const session = wizard.createSession();
  wizard.submitIdea(session, '5V LED 指示灯板');
  const result = wizard.answerQuestions(session, {
    purpose: 'indicator',
    supply: 'other',
    testpoints: 'no'
  });
  const ids = result.unmet.map((item) => item.id).sort();
  assert.deepEqual(ids, ['supply', 'testpoints']);
  assert.ok(result.notice, '必须给出提示');
});

test('向导：选自定义电路会被拒绝并说明边界', () => {
  const session = wizard.createSession();
  wizard.submitIdea(session, '5V LED 指示灯板');
  wizard.answerQuestions(session, { purpose: 'indicator', supply: '5v', testpoints: 'yes' });
  const result = wizard.chooseOption(session, 'unsupported');
  assert.equal(result.blocked, true);
  assert.equal(result.session.step, 3, '被拒绝时不应推进步骤');
  assert.ok(result.alternatives.length > 0, '必须给出可生成替代方案');
  assert.ok(result.detail.some((line) => /不会生成占位文件/.test(line)));
});

test('向导：LED 模板端到端生成真实工程并通过上游校验', () => {
  const root = makeTempRoot();
  try {
    const session = wizard.createSession();
    wizard.submitIdea(session, '我想做一个 5V LED 指示灯板，带测试点，用来确认电源是否正常。');
    wizard.answerQuestions(session, { purpose: 'auto', supply: '5v', testpoints: 'yes' });
    wizard.chooseOption(session, '5v-led-indicator');
    const { result } = wizard.generateFromSession(session, root);

    assert.equal(result.templateId, '5v-led-indicator');
    assert.deepEqual(result.verification.nets, ['5V', 'LED_A', 'GND']);
    assert.ok(fs.existsSync(result.zipPath), 'ZIP 存在');
    assert.ok(fs.statSync(result.zipPath).size > 0, 'ZIP 非空');

    const projectDir = result.packageDir;
    assert.ok(fs.existsSync(path.join(projectDir, 'led-indicator.eprj3')), '工程索引存在');

    // 用户原话必须进入生成物，保证可追溯。
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8'));
    assert.match(manifest.input, /我想做一个 5V LED 指示灯板/);

    const validation = require('node:child_process').spawnSync(
      process.execPath, [VALIDATOR, '--dir', projectDir], { encoding: 'utf8' }
    );
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
    assert.match(validation.stdout, /0 errors/);
  } finally {
    cleanupTemp(root);
  }
});

test('向导：RC 模板端到端生成真实工程并通过上游校验', () => {
  const root = makeTempRoot();
  try {
    const session = wizard.createSession();
    wizard.submitIdea(session, '我想做一个 RC 低通滤波器板，需要输入和输出测试点。');
    wizard.answerQuestions(session, { purpose: 'auto', supply: '5v', testpoints: 'yes' });
    wizard.chooseOption(session, 'rc-low-pass-filter');
    const { result } = wizard.generateFromSession(session, root);

    assert.equal(result.templateId, 'rc-low-pass-filter');
    assert.deepEqual(result.verification.nets, ['FILTER_IN', 'FILTER_OUT', 'GND']);

    const validation = require('node:child_process').spawnSync(
      process.execPath, [VALIDATOR, '--dir', result.packageDir], { encoding: 'utf8' }
    );
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
  } finally {
    cleanupTemp(root);
  }
});

test('向导：未选方案时不允许直接生成', () => {
  const root = makeTempRoot();
  try {
    const session = wizard.createSession();
    wizard.submitIdea(session, '5V LED 指示灯板');
    assert.throws(
      () => wizard.generateFromSession(session, root),
      /请先选择方案/
    );
  } finally {
    cleanupTemp(root);
  }
});

test('向导：HTTP 层跑通完整五步并返回真实产物', async () => {
  const root = makeTempRoot();
  const server = wizard.createServer(root);
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const post = async (p, body) => {
      const res = await fetch(base + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: res.status, data: await res.json() };
    };

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.deepEqual(health.templates.sort(), ['5v-led-indicator', 'rc-low-pass-filter']);

    const created = await post('/api/session', {});
    const sessionId = created.data.session.id;
    assert.ok(sessionId);

    const idea = await post('/api/idea', { sessionId, idea: '我想做一个 5V LED 指示灯板' });
    assert.equal(idea.status, 200);
    assert.deepEqual(idea.data.detected, ['5v-led-indicator']);

    const answers = await post('/api/answers', {
      sessionId,
      answers: { purpose: 'auto', supply: '5v', testpoints: 'yes' }
    });
    assert.equal(answers.status, 200);

    const chosen = await post('/api/choose', { sessionId, optionId: '5v-led-indicator' });
    assert.equal(chosen.status, 200);
    assert.equal(chosen.data.preview.templateId, '5v-led-indicator');

    const generated = await post('/api/generate', { sessionId });
    assert.equal(generated.status, 200);
    assert.ok(generated.data.result.artifacts.length > 0);

    const zip = await fetch(`${base}/api/download/${sessionId}/zip`);
    assert.equal(zip.status, 200);
    const zipBytes = Buffer.from(await zip.arrayBuffer());
    assert.ok(zipBytes.length > 0);
    assert.equal(zipBytes.slice(0, 2).toString(), 'PK', 'ZIP 魔数正确');

    const index = await fetch(`${base}/api/download/${sessionId}/eprj3`);
    assert.equal(index.status, 200);

    const manifestRes = await fetch(`${base}/api/artifact/${sessionId}/manifest.json`);
    assert.equal(manifestRes.status, 200);
    const manifest = JSON.parse(await manifestRes.text());
    assert.equal(manifest.template, '5v-led-indicator');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    cleanupTemp(root);
  }
});

test('向导：HTTP 层拒绝路径穿越与未知会话', async () => {
  const root = makeTempRoot();
  const server = wizard.createServer(root);
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const unknown = await fetch(`${base}/api/download/not-a-session/zip`);
    assert.equal(unknown.status, 400);
    assert.match((await unknown.json()).error, /会话不存在/);

    const created = await fetch(`${base}/api/session`, { method: 'POST' });
    const { session } = await created.json();

    // 未生成前访问产物
    const early = await fetch(`${base}/api/artifact/${session.id}/manifest.json`);
    assert.equal(early.status, 400);
    assert.match((await early.json()).error, /还没有生成工程包/);

    // 注入一个指向临时目录的产物根，专门验证路径守卫本身
    const fakeDir = path.join(root, 'fake-package');
    fs.mkdirSync(fakeDir, { recursive: true });
    fs.writeFileSync(path.join(fakeDir, 'manifest.json'), '{"ok":true}');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'should-not-be-reachable');
    wizard.getSession(session.id).result = { packageDir: fakeDir, projectName: 'fake' };

    // 合法访问仍然可用
    const ok = await fetch(`${base}/api/artifact/${session.id}/manifest.json`);
    assert.equal(ok.status, 200);

    // 路径穿越必须被拒绝
    const escape = await fetch(
      `${base}/api/artifact/${session.id}/${encodeURIComponent('../../secret.txt')}`
    );
    assert.equal(escape.status, 400);
    assert.match((await escape.json()).error, /非法路径/);

    // 绝对路径穿越同样拒绝
    const absolute = await fetch(
      `${base}/api/artifact/${session.id}/${encodeURIComponent('C:\\Windows\\win.ini')}`
    );
    assert.equal(absolute.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    cleanupTemp(root);
  }
});
