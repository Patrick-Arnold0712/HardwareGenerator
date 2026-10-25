#!/usr/bin/env node
'use strict';

// 五步向导：想法 -> 澄清 -> 选方案 -> 预览 -> 真实生成工程包
//
// 设计约束（见 docs/prd-gap-analysis.md）：
// 1. 每一步都必须对应真实能力，不做纯前端假动画。
// 2. 无法满足的需求必须显式说明，不能静默套用模板。
// 3. 零 npm 依赖，只用 node: 内置模块。

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const { TEMPLATES, matchTemplates, generate, slugify, partsFor } = require('./generate.js');
const { assertValid } = require('./schema.js');
const { LEVEL_LABELS } = require('./delivery.js');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'contracts', 'jsonschema');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'wizard');
const PORT = Number(process.env.WIZARD_PORT || 7788);
const HOST = '127.0.0.1';

const schemaCache = new Map();
function loadSchema(name) {
  if (!schemaCache.has(name)) {
    schemaCache.set(name, JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${name}.schema.json`), 'utf8')));
  }
  return schemaCache.get(name);
}

// 每一步最多 3 个问题，每个专业问题都必须有「按推荐方案」选项。
const QUESTIONS = Object.freeze([
  {
    id: 'purpose',
    title: '这块板子主要做什么？',
    desc: '决定用哪一套已经验证过的电路。',
    options: [
      { value: 'indicator', label: '亮灯、做提示', sub: '通电就亮，一眼看出有没有电' },
      { value: 'filter', label: '滤掉杂音', sub: '把信号里刺耳的高频噪声去掉' },
      { value: 'auto', label: '我不确定，按推荐方案', sub: '根据你上面说的来判断' }
    ]
  },
  {
    id: 'supply',
    title: '用什么给它供电？',
    desc: '现在这两套电路都是按 5V 设计的。',
    options: [
      { value: '5v', label: '5V 电源', sub: '像手机充电器那种' },
      { value: 'other', label: '别的电压', sub: '3.3V、12V 或者电池' },
      { value: 'auto', label: '我不确定，按推荐方案', sub: '默认按 5V' }
    ]
  },
  {
    id: 'testpoints',
    title: '要不要留测试点？',
    desc: '就是板子上几个小铜点，方便拿万用表量电压。',
    options: [
      { value: 'yes', label: '要留', sub: '每个接口留一个' },
      { value: 'no', label: '不用留', sub: '现在这两套电路没法去掉' },
      { value: 'auto', label: '我不确定，按推荐方案', sub: '默认留着' }
    ]
  }
]);

const CIRCUIT = Object.freeze({
  '5v-led-indicator': '5V -> TP1/R1 -> D1 -> TP2/GND',
  'rc-low-pass-filter': 'TP1 -> R1 -> TP2，C1 对地，TP3 为 GND'
});

// 给普通用户看的一句话解释，避免直接甩工程符号。
const CIRCUIT_PLAIN = Object.freeze({
  '5v-led-indicator': '电源进来，经过一个限流电阻，点亮指示灯，再接回地。',
  'rc-low-pass-filter': '信号从输入端进来，经过一个电阻，再经过一个对地电容，从输出端出去。'
});

// 位号前缀 -> 零件类型（数值现在是 1kΩ、100nF，不能再靠旧代号反查）。
const PART_KIND = Object.freeze({
  R: '电阻',
  C: '电容',
  D: '发光二极管',
  TP: '测试点',
  U: '芯片'
});

const FOOTPRINT_PLAIN = Object.freeze({
  R0603: '贴片电阻 0603',
  C0603: '贴片电容 0603',
  LED0603: '贴片 LED 0603',
  'TP0.5': '直径 0.5mm 焊盘'
});

// 每个零件的用途，用日常语言说明它为什么在这里。
const PART_ROLE = Object.freeze({
  '5v-led-indicator': {
    TP1: '电源接进来的地方',
    R1: '限制流过灯的电流，防止烧坏',
    D1: '通电就亮的指示灯',
    TP2: '接回地（负极）的地方'
  },
  'rc-low-pass-filter': {
    TP1: '信号输入的地方',
    R1: '和电容一起决定滤掉多高的频率',
    TP2: '信号输出的地方',
    C1: '把高频噪声导到地上去',
    TP3: '接地点'
  }
});

const sessions = new Map();

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession() {
  const session = {
    id: newId(),
    createdAt: new Date().toISOString(),
    step: 1,
    idea: '',
    matches: [],
    templateId: null,
    answers: {},
    options: [],
    chosenOptionId: null,
    projectName: null,
    unmet: [],
    result: null
  };
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  const session = sessions.get(String(id || ''));
  if (!session) throw new UserError('会话不存在或已过期，请重新开始。');
  return session;
}

class UserError extends Error {}

function publicSession(session) {
  return {
    id: session.id,
    step: session.step,
    idea: session.idea,
    templateId: session.templateId,
    answers: session.answers,
    chosenOptionId: session.chosenOptionId,
    projectName: session.projectName,
    unmet: session.unmet
  };
}

// ---- 步骤 1 -> 2 ----------------------------------------------------------

function submitIdea(session, rawText, inputMode) {
  const idea = String(rawText || '').trim();
  if (idea.length < 4) throw new UserError('再多说一点：你想让它帮你完成什么？');

  session.idea = idea.slice(0, 600);
  session.matches = matchTemplates(session.idea).map((t) => t.id);
  session.inputMode = inputMode === 'pro' ? 'pro' : 'novice';
  session.answers = {};
  session.options = [];
  session.chosenOptionId = null;
  session.result = null;
  session.step = 2;

  // 用契约约束输入，避免后续流程拿到不完整的需求。
  const brief = {
    schemaVersion: '1.0',
    projectId: session.id,
    ideaText: session.idea,
    inputMode: session.inputMode,
    templateId: session.matches.length ? session.matches[0] : null,
    knownConstraints: {},
    createdAt: new Date().toISOString()
  };
  assertValid(loadSchema('idea-brief'), brief, 'IdeaBrief');
  session.brief = brief;

  return {
    session: publicSession(session),
    questions: QUESTIONS,
    detected: session.matches,
    // 未匹配时明确告知，而不是静默套模板。
    degradation: session.matches.length
      ? null
      : {
        reason: '这句话没有命中任何已验证模板。',
        supported: '当前只支持「5V LED 指示灯」和「RC 低通滤波器」两类。',
        action: '可以在下一步手动指定类别，或换个说法。'
      }
  };
}

// ---- 步骤 2 -> 3 ----------------------------------------------------------

function resolveCandidates(answers) {
  const unmet = [];
  let candidates = [];

  const purpose = answers.purpose || 'auto';
  if (purpose === 'indicator') candidates = ['5v-led-indicator'];
  else if (purpose === 'filter') candidates = ['rc-low-pass-filter'];

  if (answers.supply && answers.supply !== '5v' && answers.supply !== 'auto') {
    unmet.push({
      id: 'supply',
      message: '当前两个模板都固定按 5V 设计，无法生成其他供电电压。'
    });
  }
  if (answers.testpoints === 'no') {
    unmet.push({
      id: 'testpoints',
      message: '当前两个模板都固定包含测试点，无法移除。'
    });
  }

  return { candidates, unmet };
}

function answerQuestions(session, rawAnswers) {
  if (session.step < 2) throw new UserError('请先提交想法。');
  const answers = {};
  for (const question of QUESTIONS) {
    const value = String((rawAnswers || {})[question.id] || 'auto');
    const allowed = question.options.map((o) => o.value);
    answers[question.id] = allowed.includes(value) ? value : 'auto';
  }

  const { candidates, unmet } = resolveCandidates(answers);
  // purpose=auto 时回退到需求文本的匹配结果。
  let ids = candidates.length ? candidates : session.matches;

  session.answers = answers;
  session.unmet = unmet;
  session.options = buildOptions(ids, unmet);
  session.chosenOptionId = null;
  session.result = null;
  session.step = 3;

  return {
    session: publicSession(session),
    options: session.options,
    unmet,
    // 有未满足项时必须摆在用户面前，不能藏在后台。
    notice: unmet.length
      ? '有部分要求当前无法满足，下面会明确标注。'
      : null
  };
}

function buildOptions(templateIds, unmet) {
  const options = [];
  for (const id of templateIds) {
    const template = TEMPLATES[id];
    if (!template) continue;
    options.push({
      id,
      kind: 'template',
      title: template.title,
      subtitle: CIRCUIT_PLAIN[id] || template.description,
      circuit: CIRCUIT[id] || template.description,
      circuitPlain: CIRCUIT_PLAIN[id] || template.description,
      designators: template.expected.schDesignators,
      nets: template.expected.nets,
      parts: partsFor(id).length,
      canGenerate: true,
      reason: '这是当前唯一能真实生成并校验的电路。',
      unmet
    });
  }
  options.push({
    id: 'unsupported',
    kind: 'unsupported',
    title: '自定义电路',
    subtitle: '不套用任何已验证模板',
    circuit: null,
    circuitPlain: null,
    designators: [],
    nets: [],
    parts: 0,
    canGenerate: false,
    reason: '当前版本没有通用电路编译器，无法生成任意电路。选这项会明确告知边界，不会伪造结果。',
    unmet
  });

  // 每个方案都必须满足 SolutionOption 契约，尤其 canGenerate=false 时必须带理由。
  const schema = loadSchema('solution-option');
  for (const option of options) {
    assertValid(schema, option, `SolutionOption(${option.id})`);
  }
  return options;
}

// ---- 步骤 3 -> 4 ----------------------------------------------------------

function chooseOption(session, optionId) {
  if (session.step < 3) throw new UserError('请先回答澄清问题。');
  const option = session.options.find((item) => item.id === optionId);
  if (!option) throw new UserError(`未知方案：${optionId}`);

  session.chosenOptionId = option.id;

  if (!option.canGenerate) {
    session.step = 3;
    return {
      session: publicSession(session),
      blocked: true,
      message: '这个方案无法自动生成。',
      detail: [
        '当前版本只有两个固定模板，没有通用电路编译器。',
        '能真实生成的是：「5V LED 指示灯板」和「RC 低通滤波器板」。',
        '超出这两类的需求需要人工工程介入，不会生成占位文件冒充结果。'
      ],
      alternatives: session.options.filter((o) => o.canGenerate).map((o) => ({ id: o.id, title: o.title }))
    };
  }

  session.templateId = option.id;
  session.step = 4;
  const template = TEMPLATES[option.id];

  return {
    session: publicSession(session),
    preview: {
      templateId: option.id,
      title: template.title,
      circuit: CIRCUIT[option.id],
      requirementText: template.requirementText,
      userIdea: session.idea,
      designators: template.expected.schDesignators,
      nets: template.expected.nets,
      bom: parseBom(partsFor(option.id)),
      bomPlain: parseBomPlain(partsFor(option.id), option.id),
      circuitPlain: CIRCUIT_PLAIN[option.id] || template.description,
      unmet: session.unmet,
      defaultProjectName: template.defaultName
    }
  };
}

function parseBom(parts) {
  return parts.map((part) => ({
    designator: part.refdes,
    value: part.value,
    footprint: part.footprint,
    description: part.description,
    lcsc: part.lcsc || '',
    assembly: part.assembly || 'smd'
  }));
}

// 把 BOM 转成普通用户能读懂的行，并保留原始值供专业模式使用。
function parseBomPlain(parts, templateId) {
  const roles = PART_ROLE[templateId] || {};
  return parseBom(parts).map((row) => ({
    designator: row.designator,
    what: PART_KIND[row.designator.replace(/\d+$/, '')] || row.value,
    size: FOOTPRINT_PLAIN[row.footprint] || row.footprint,
    role: roles[row.designator] || row.description,
    raw: row
  }));
}

// ---- 步骤 4 -> 5（真实生成） ----------------------------------------------

function generateFromSession(session, outRoot, opts = {}) {
  if (session.step < 4) throw new UserError('请先选择方案。');
  if (!session.templateId) throw new UserError('当前方案不可生成。');

  const template = TEMPLATES[session.templateId];
  const rawName = String(opts.projectName || session.projectName || template.defaultName);
  const projectName = slugify(rawName, template.defaultName);
  const outDir = path.join(outRoot, session.id);

  // 需求文本带上用户原话，保证生成物里可追溯。
  const input = session.idea || template.requirementText;

  const generated = generate({
    help: false,
    input,
    inputFile: null,
    template: session.templateId,
    out: outDir,
    name: projectName,
    force: true
  }, ROOT);

  session.projectName = projectName;
  session.step = 5;

  // 读取生成阶段写出的验证证据，让界面展示真实的交付等级与检查结果。
  const bundlePath = path.join(generated.packageDir, 'verification.json');
  const bundle = fs.existsSync(bundlePath)
    ? JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
    : null;

  session.result = {
    projectName,
    templateId: session.templateId,
    title: template.title,
    packageDir: generated.packageDir,
    zipPath: generated.zipPath,
    generatedAt: generated.manifest.generatedAt,
    artifacts: generated.manifest.artifacts,
    verification: generated.manifest.verification,
    limitations: generated.manifest.limitations,
    deliveryStatus: bundle ? bundle.deliveryStatus : null,
    deliveryLabel: bundle ? (LEVEL_LABELS[bundle.deliveryStatus] || bundle.deliveryStatus) : null,
    checks: bundle ? bundle.checks : [],
    unmet: session.unmet
  };

  return { session: publicSession(session), result: session.result };
}

// ---- HTTP ----------------------------------------------------------------

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 256) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new UserError('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new UserError('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendFile(res, file, type, downloadName) {
  const data = fs.readFileSync(file);
  const headers = {
    'content-type': type,
    'content-length': data.length,
    'cache-control': 'no-store'
  };
  if (downloadName) {
    headers['content-disposition'] =
      `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  res.writeHead(200, headers);
  res.end(data);
}

function safeArtifact(session, relative) {
  const base = session.result.packageDir;
  const target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new UserError('非法路径');
  return target;
}

async function handle(req, res, outRoot) {
  const url = new URL(req.url, `http://${HOST}`);
  const route = url.pathname;

  if (req.method === 'GET' && (route === '/' || route === '/index.html')) {
    return sendFile(res, path.join(__dirname, 'wizard', 'index.html'), 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && route === '/api/health') {
    return json(res, 200, { ok: true, templates: Object.keys(TEMPLATES) });
  }

  if (req.method === 'POST' && route === '/api/session') {
    const session = createSession();
    return json(res, 200, { session: publicSession(session) });
  }

  if (req.method === 'POST' && route === '/api/idea') {
    const body = await readBody(req);
    const session = getSession(body.sessionId);
    return json(res, 200, submitIdea(session, body.idea, body.inputMode));
  }

  if (req.method === 'POST' && route === '/api/answers') {
    const body = await readBody(req);
    const session = getSession(body.sessionId);
    return json(res, 200, answerQuestions(session, body.answers));
  }

  if (req.method === 'POST' && route === '/api/choose') {
    const body = await readBody(req);
    const session = getSession(body.sessionId);
    return json(res, 200, chooseOption(session, body.optionId));
  }

  if (req.method === 'POST' && route === '/api/generate') {
    const body = await readBody(req);
    const session = getSession(body.sessionId);
    return json(res, 200, generateFromSession(session, outRoot, { projectName: body.projectName }));
  }

  if (req.method === 'GET' && route.startsWith('/api/download/')) {
    const [, , , id, kind] = route.split('/');
    const session = getSession(id);
    if (!session.result) throw new UserError('还没有生成工程包。');
    if (kind === 'zip') {
      return sendFile(res, session.result.zipPath, 'application/zip', `${session.result.projectName}-eprj3.zip`);
    }
    if (kind === 'eprj3') {
      const file = safeArtifact(session, `${session.result.projectName}.eprj3`);
      return sendFile(res, file, 'application/octet-stream', `${session.result.projectName}.eprj3`);
    }
    throw new UserError('未知下载类型');
  }

  if (req.method === 'GET' && route.startsWith('/api/artifact/')) {
    const [, , , id, ...rest] = route.split('/');
    const session = getSession(id);
    if (!session.result) throw new UserError('还没有生成工程包。');
    const relative = decodeURIComponent(rest.join('/'));
    return sendFile(res, safeArtifact(session, relative), 'text/plain; charset=utf-8');
  }

  return json(res, 404, { error: 'not found' });
}

function createServer(outRoot = DEFAULT_OUT) {
  return http.createServer((req, res) => {
    handle(req, res, outRoot).catch((error) => {
      const status = error instanceof UserError ? 400 : 500;
      if (status === 500) console.error(error);
      json(res, status, { error: error.message || String(error) });
    });
  });
}

function main() {
  const outRoot = DEFAULT_OUT;
  fs.mkdirSync(outRoot, { recursive: true });
  const server = createServer(outRoot);
  server.listen(PORT, HOST, () => {
    console.log('嘉立创硬件 Agent · 五步向导');
    console.log(`地址：http://${HOST}:${PORT}`);
    console.log(`输出目录：${outRoot}`);
    console.log('按 Ctrl+C 停止。');
  });
}

module.exports = {
  QUESTIONS,
  createSession,
  getSession,
  submitIdea,
  answerQuestions,
  chooseOption,
  generateFromSession,
  createServer,
  UserError
};

if (require.main === module) main();
