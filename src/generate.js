#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildChecks, buildVerificationBundle, AUTOMATION_CEILING } = require('./delivery.js');
const { assertValid } = require('./schema.js');
const { applyParts } = require('./enrich.js');
const PARTS = require('./parts.json');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'contracts', 'jsonschema');
const VENDOR_ROOT = path.join(ROOT, 'vendor', 'easyeda-eprj3-skill');
const UPSTREAM = Object.freeze({
  repository: 'https://github.com/easyeda/easyeda-eprj3-skill',
  version: '1.7.3',
  commit: '40c94e129df18e94232f8c94260134bfcac6cabf',
  license: 'MIT'
});

const TEMPLATES = Object.freeze({
  '5v-led-indicator': {
    id: '5v-led-indicator',
    title: '5V LED 指示灯小板',
    description: '5V -> TP1/R1 -> D1 -> TP2/GND',
    defaultName: 'led-indicator',
    requirementText: '需求：5V LED 指示灯板',
    expected: {
      schDesignators: ['TP1', 'R1', 'D1', 'TP2'],
      pcbDesignators: ['TP1', 'R1', 'D1', 'TP2'],
      nets: ['5V', 'LED_A', 'GND']
    }
  },
  'rc-low-pass-filter': {
    id: 'rc-low-pass-filter',
    title: 'RC 低通滤波器板',
    description: 'TP1 -> R1 -> TP2，C1 对地，TP3 为 GND',
    defaultName: 'rc-low-pass-filter',
    requirementText: '需求：RC 低通滤波器，输入/输出测试点',
    expected: {
      schDesignators: ['TP1', 'R1', 'TP2', 'C1', 'TP3'],
      pcbDesignators: ['TP1', 'R1', 'TP2', 'C1', 'TP3'],
      nets: ['FILTER_IN', 'FILTER_OUT', 'GND']
    }
  }
});

// 器件参数的唯一来源是 src/parts.json：BOM、原理图 ATTR、交付说明都从这里生成。
function partsFor(templateId) {
  const list = PARTS.templates[templateId];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`src/parts.json 里没有模板 ${templateId} 的器件清单，不能生成 BOM。`);
  }
  return list;
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildBom(templateId) {
  const header = [
    'Designator', 'Quantity', 'Value', 'Footprint', 'Description',
    'LCSC', 'MPN', 'Manufacturer', 'Assembly'
  ];
  const rows = partsFor(templateId).map((part) => [
    part.refdes,
    '1',
    part.value || '',
    part.footprint || '',
    part.description || '',
    part.lcsc || '',
    part.mpn || '',
    part.manufacturer || '',
    part.assembly || 'smd'
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

class UserError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

function printTemplates() {
  console.log('可用模板：');
  for (const template of Object.values(TEMPLATES)) {
    console.log(`- ${template.id}: ${template.title} (${template.description})`);
  }
}

function printHelp() {
  console.log(`用法：
  node src/generate.js --input "5V LED 指示灯板" --out dist [--template 5v-led-indicator] [--name led-indicator] [--force]
  node src/generate.js --input "RC 低通滤波器" --out dist [--template rc-low-pass-filter] [--force]

参数：
  --input <text>        硬件需求描述；默认使用内置的 5V LED 指示灯示例
  --input-file <path>   从 UTF-8 文本文件读取需求
  --template <id>       显式选择模板；传入 list 时列出所有模板
  --out <dir>           输出目录，默认 dist
  --name <name>         项目名；默认使用模板的固定名称
  --force               覆盖同名输出目录和 ZIP
  --help                显示帮助

当前模板：
  5v-led-indicator    5V LED 指示灯小板
  rc-low-pass-filter  RC 低通滤波器板
`);
}

function parseArgs(argv) {
  const opts = {
    input: '5V LED 指示灯板',
    inputFile: null,
    template: null,
    out: 'dist',
    name: null,
    force: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--force') {
      opts.force = true;
      continue;
    }
    if (arg === '--input' || arg === '--input-file' || arg === '--template' || arg === '--out' || arg === '--name') {
      if (i + 1 >= argv.length) throw new UserError(`参数 ${arg} 缺少值`);
      const value = argv[i + 1];
      i += 1;
      if (arg === '--input') opts.input = value;
      if (arg === '--input-file') opts.inputFile = value;
      if (arg === '--template') opts.template = value;
      if (arg === '--out') opts.out = value;
      if (arg === '--name') opts.name = value;
      continue;
    }
    if (!arg.startsWith('-')) {
      opts.input = arg;
      continue;
    }
    throw new UserError(`未知参数：${arg}`);
  }

  return opts;
}

function readInput(opts, cwd) {
  if (!opts.inputFile) return opts.input.trim();
  const inputPath = path.resolve(cwd, opts.inputFile);
  return fs.readFileSync(inputPath, 'utf8').trim();
}

function slugify(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

// 返回所有命中的模板，顺序即优先级。向导用它判断需求是否歧义。
function matchTemplates(input) {
  const text = String(input || '');
  const compact = text.toLowerCase().replace(/\s+/g, '');
  const hits = [];

  if (compact.includes('rc') || compact.includes('filter') || text.includes('低通') || text.includes('滤波')) {
    hits.push(TEMPLATES['rc-low-pass-filter']);
  }

  const has5v = compact.includes('5v') || compact.includes('5.0v') || text.includes('5伏');
  const hasLed = compact.includes('led') || text.includes('指示灯') || text.includes('发光二极管');
  if (has5v && hasLed) hits.push(TEMPLATES['5v-led-indicator']);

  return hits;
}

function selectTemplate(input, explicitId) {
  if (explicitId) {
    const template = TEMPLATES[explicitId];
    if (!template) throw new UserError(`未知模板：${explicitId}\n使用 --template list 查看可用模板。`);
    return template;
  }

  const hits = matchTemplates(input);
  if (hits.length) return hits[0];

  throw new UserError(
    `无法从需求中选择模板：${input}\n` +
    '请使用 5V/5伏 + LED/指示灯，或 RC/低通/滤波器。'
  );
}

function ensureInside(parent, child) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  const relative = path.relative(parentResolved, childResolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return childResolved;
  }
  throw new Error(`拒绝操作输出目录之外的路径：${childResolved}`);
}

function removeInside(parent, child) {
  const target = ensureInside(parent, child);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function writeUtf8(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function runUpstream(script, args, logs) {
  const scriptPath = path.join(VENDOR_ROOT, 'scripts', script);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: VENDOR_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (stdout.trim()) process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);

  logs.push({
    script,
    args,
    status: result.status,
    stdout: stdout.trim(),
    stderr: stderr.trim()
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`上游脚本失败：${script} (exit ${result.status})`);
  }
}

// 原理图里"引脚的电连接点"离元件中心多远（mil）。
//
// 上游 SKILL.md 写的是 ±30，但真实客户端用 getAllPinsByPrimitiveId 回读出来是 ±20：
// 引脚长 10mil，起点在 ±20，尖端朝外。按 ±30 画线，每根线都短 10mil —— 肉眼看不出来，
// validate.js 也查不出，只有客户端 DRC 会报 CHECKFLOATPIN/SHOWFLOATING。
// 依据见 docs/进度.md 与 dist/*/verification/audit.json。
const PIN_OFFSET = 20;

// 画一根导线。共用一个函数是为了让"端点必须落在引脚上"这件事只有一处实现。
function addWire(packageDir, segs, net, logs) {
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', segs, '--net', net
  ], logs);
}

function initProject(packageDir, projectName, logs) {
  runUpstream('init.js', [
    '--dir', packageDir,
    '--name', projectName,
    '--board-w', '2400',
    '--board-h', '1600'
  ], logs);
}

function addRequirementText(packageDir, template, logs) {
  runUpstream('add-text.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--value', template.requirementText,
    '--x', '600', '--y', '-180',
    '--size', '14', '--align', 'CENTER_MIDDLE'
  ], logs);
}

function buildLedIndicator(packageDir, projectName, template, logs) {
  // 布局坐标（mil，y 向上）。所有连线端点都由这些常量推导，不写死数字。
  const Y = -300;
  const TP1_X = 400;
  const R1_X = 500;
  const D1_X = 700;
  const TP2_X = 800;
  const FLAG_X = { left: 300, right: 900 };

  initProject(packageDir, projectName, logs);
  addRequirementText(packageDir, template, logs);

  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', '5V', '--x', '300', '--y', '-300'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '400', '--y', '-300', '--refdes', 'TP1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'RES', '--footprint', 'R0603', '--x', '500', '--y', '-300', '--refdes', 'R1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'LED', '--footprint', 'LED0603', '--x', '700', '--y', '-300', '--refdes', 'D1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '800', '--y', '-300', '--refdes', 'TP2'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'GND', '--x', '900', '--y', '-300'
  ], logs);

  // 连线：端点落在引脚电连接点（中心 ±PIN_OFFSET），并且把测试点当"中间站"串进线路，
  // 而不是让导线从测试点身上穿过去。穿过去会留下一个 T 型接点，客户端报 SHOWDANDLING。
  addWire(packageDir, `${FLAG_X.left},${Y},${TP1_X},${Y}`, '5V', logs);
  addWire(packageDir, `${TP1_X},${Y},${R1_X - PIN_OFFSET},${Y}`, '5V', logs);
  addWire(packageDir, `${R1_X + PIN_OFFSET},${Y},${D1_X - PIN_OFFSET},${Y}`, 'LED_A', logs);
  addWire(packageDir, `${D1_X + PIN_OFFSET},${Y},${TP2_X},${Y}`, 'GND', logs);
  addWire(packageDir, `${TP2_X},${Y},${FLAG_X.right},${Y}`, 'GND', logs);

  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1',
    '--symbol', 'RES', '--footprint', 'R0603',
    '--x', '900', '--y', '800', '--refdes', 'R1',
    '--nets', '1:5V,2:LED_A'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1',
    '--symbol', 'LED', '--footprint', 'LED0603',
    '--x', '1500', '--y', '800', '--refdes', 'D1',
    '--nets', '1:LED_A,2:GND'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '500', '--y', '800', '--refdes', 'TP1',
    '--nets', '1:5V'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '1900', '--y', '800', '--refdes', 'TP2',
    '--nets', '1:GND'
  ], logs);

  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', '5V',
    '--layer', '1', '--width', '12',
    '--x1', '500', '--y1', '800', '--x2', '870.3', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'LED_A',
    '--layer', '1', '--width', '10',
    '--x1', '929.7', '--y1', '800', '--x2', '1468.9', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'GND',
    '--layer', '1', '--width', '12',
    '--x1', '1531.1', '--y1', '800', '--x2', '1900', '--y2', '800'
  ], logs);
}

function buildRcLowPassFilter(packageDir, projectName, template, logs) {
  // 布局坐标（mil，y 向上）。测试点串在线路里，不做 T 型接点。
  const Y = -300;
  const TP1_X = 300;
  const R1_X = 500;
  const TP2_X = 700;
  const C1_Y = -400;
  const TP3_Y = -500;
  const GND_Y = -600;

  initProject(packageDir, projectName, logs);
  addRequirementText(packageDir, template, logs);

  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '300', '--y', '-300', '--refdes', 'TP1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'RES', '--footprint', 'R0603', '--x', '500', '--y', '-300', '--refdes', 'R1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '700', '--y', '-300', '--refdes', 'TP2'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'CAP', '--footprint', 'C0603', '--x', '700', '--y', '-400', '--refdes', 'C1', '--rotation', '90'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '700', '--y', '-500', '--refdes', 'TP3'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'GND', '--x', '700', '--y', '-600'
  ], logs);

  addWire(packageDir, `${TP1_X},${Y},${R1_X - PIN_OFFSET},${Y}`, 'FILTER_IN', logs);
  addWire(packageDir, `${R1_X + PIN_OFFSET},${Y},${TP2_X},${Y}`, 'FILTER_OUT', logs);
  addWire(packageDir, `${TP2_X},${Y},${TP2_X},${C1_Y + PIN_OFFSET}`, 'FILTER_OUT', logs);
  addWire(packageDir, `${TP2_X},${C1_Y - PIN_OFFSET},${TP2_X},${TP3_Y}`, 'GND', logs);
  addWire(packageDir, `${TP2_X},${TP3_Y},${TP2_X},${GND_Y}`, 'GND', logs);

  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '400', '--y', '800', '--refdes', 'TP1', '--nets', '1:FILTER_IN'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--symbol', 'RES', '--footprint', 'R0603',
    '--x', '900', '--y', '800', '--refdes', 'R1', '--nets', '1:FILTER_IN,2:FILTER_OUT'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '1800', '--y', '800', '--refdes', 'TP2', '--nets', '1:FILTER_OUT'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--symbol', 'CAP', '--footprint', 'C0603',
    '--x', '1200', '--y', '1100', '--refdes', 'C1', '--nets', '1:FILTER_OUT,2:GND'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '1600', '--y', '1100', '--refdes', 'TP3', '--nets', '1:GND'
  ], logs);

  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'FILTER_IN',
    '--layer', '1', '--width', '10',
    '--x1', '400', '--y1', '800', '--x2', '870.3', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'FILTER_OUT',
    '--layer', '1', '--width', '10',
    '--x1', '929.7', '--y1', '800', '--x2', '1800', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'FILTER_OUT',
    '--layer', '1', '--width', '10',
    '--x1', '1170', '--y1', '800', '--x2', '1170', '--y2', '1100'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', packageDir, '--pcb', 'PCB1', '--net', 'GND',
    '--layer', '1', '--width', '10',
    '--x1', '1230', '--y1', '1100', '--x2', '1600', '--y2', '1100'
  ], logs);
}

function addPcbRequirementText(packageDir, template, logs) {
  runUpstream('add-pcb-text.js', [
    '--dir', packageDir,
    '--pcb', 'PCB1',
    '--value', template.requirementText,
    '--x', '1200',
    '--y', '1400',
    '--layer', '3',
    '--size', '45',
    '--angle', '0',
    '--origin', '4'
  ], logs);
}
function createPackageReadme(projectName, template, input) {
  const circuit = template.id === '5v-led-indicator'
    ? '5V -> TP1/R1 -> D1 -> TP2/GND'
    : 'TP1 -> R1 -> TP2，C1 对地，TP3 为 GND';
  const parts = partsFor(template.id);
  const rows = parts.map((part) => {
    const buy = part.assembly === 'bare_pad' ? '裸焊盘，不贴片' : `${part.lcsc}（${part.mpn}）`;
    return `| ${part.refdes} | ${part.value} | ${part.footprint} | ${part.role} | ${buy} |`;
  });
  return `# ${projectName}

这是由“嘉立创硬件 Agent”生成的工程包（链路验证版本）。

## 需求

${template.requirementText}

原始需求文本：${input}

## 打开方式

1. 安装 EasyEDA Pro / 嘉立创 EDA 专业版 V4.1+。
2. 打开 \`${projectName}.eprj3\`。
3. 在原理图和 PCB 中检查器件、网络和基础走线；BOM 里的 Value 与料号由工程内的器件属性直接导出。

## 当前电路

\`\`\`
${circuit}
\`\`\`

## 器件清单

| 位号 | 数值 | 封装 | 作用 | 采购 |
|---|---|---|---|---|
${rows.join('\n')}

## 范围说明

- 器件参数与 LCSC 料号来自嘉立创 EDA 系统库（已用 \`lib_Device.search\` 校验），但**未经过实单采购验证**；
- 已完成基础连通走线，但**没有跑过 DRC**，也没有 Gerber、坐标文件和 DFM；
- 没有做原型打样与实测，不承诺电气正确性和可量产性；
- 生产前必须由硬件工程师检查，并完成首件实测。

生成工具：easyeda-eprj3-skill ${UPSTREAM.version} (${UPSTREAM.commit})。
`;
}

function listFiles(root) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  walk(root);
  return files.sort();
}

function loadSchema(name) {
  const file = path.join(SCHEMA_DIR, `${name}.schema.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function artifactEntries(packageDir, files) {
  return files.map((file) => {
    const stat = fs.statSync(file);
    return {
      path: path.relative(packageDir, file).split(path.sep).join('/'),
      bytes: stat.size,
      sha256: sha256(file)
    };
  });
}

function manifestArg(value, packageDir) {
  const resolved = path.resolve(value);
  const relative = path.relative(packageDir, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return relative.split(path.sep).join('/') || '.';
  }
  return value;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createZip(packageDir, zipPath) {
  if (process.platform === 'win32') {
    const command = `Compress-Archive -LiteralPath ${psQuote(packageDir)} -DestinationPath ${psQuote(zipPath)} -Force`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`创建 ZIP 失败：${result.stderr || result.stdout}`);
    }
    return;
  }

  const result = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', path.dirname(packageDir), path.basename(packageDir)], {
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`创建 ZIP 失败：${result.stderr || result.stdout}`);
  }
}

function generate(opts, cwd) {
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.template === 'list') {
    printTemplates();
    return;
  }

  const input = readInput(opts, cwd);
  if (!input) throw new UserError('需求描述不能为空');
  const template = selectTemplate(input, opts.template);

  const outDir = path.resolve(cwd, opts.out);
  const projectName = slugify(opts.name || template.defaultName, template.defaultName);
  const packageDir = ensureInside(outDir, path.join(outDir, projectName));
  const zipPath = ensureInside(outDir, path.join(outDir, `${projectName}-eprj3.zip`));

  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(packageDir) || fs.existsSync(zipPath)) {
    if (!opts.force) {
      throw new UserError(`输出已存在：${packageDir}\n使用 --force 覆盖，或指定新的 --name。`);
    }
    removeInside(outDir, packageDir);
    removeInside(outDir, zipPath);
  }

  fs.mkdirSync(packageDir, { recursive: true });
  const logs = [];
  if (template.id === '5v-led-indicator') {
    buildLedIndicator(packageDir, projectName, template, logs);
  } else {
    buildRcLowPassFilter(packageDir, projectName, template, logs);
  }
  addPcbRequirementText(packageDir, template, logs);
  // 上游 add-symbol 只放符号和封装，写不进 Value / 型号 / 料号；这里补齐后再校验。
  const enrich = applyParts(path.join(packageDir, 'sch', 'Schematic1', 'P1.esch2'), partsFor(template.id));
  runUpstream('validate.js', ['--dir', packageDir], logs);
  runUpstream('cleanup.js', ['--dir', packageDir], logs);
  runUpstream('validate.js', ['--dir', packageDir], logs);

  const bomPath = path.join(packageDir, 'BOM.csv');
  const readmePath = path.join(packageDir, 'README.md');
  writeUtf8(bomPath, buildBom(template.id));
  writeUtf8(readmePath, createPackageReadme(projectName, template, input));

  const manifestPath = path.join(packageDir, 'manifest.json');
  // 哈希清单只覆盖"产物"，不覆盖会引用自身的元数据文件：
  // - manifest.json 无法包含自己的哈希（自引用）；
  // - verification.json 同理，它记录的是产物哈希。
  // 这两个文件的存在与作用在 README 中说明，避免让人误以为清单漏了东西。
  const payloadFiles = listFiles(packageDir);
  const payloadArtifacts = artifactEntries(packageDir, payloadFiles);
  const manifest = {
    schemaVersion: '0.1',
    template: template.id,
    title: template.title,
    description: template.description,
    requirementText: template.requirementText,
    verification: template.expected,
    input,
    projectName,
    generatedAt: new Date().toISOString(),
    upstream: UPSTREAM,
    projectIndex: `${projectName}.eprj3`,
    artifacts: payloadArtifacts,
    artifactScope: 'payload',
    artifactScopeNote: '不含 manifest.json 与 verification.json：这两个文件记录的是产物哈希，无法包含自身。',
    operations: logs.map((entry) => ({
      script: entry.script,
      args: entry.args.map((arg) => manifestArg(arg, packageDir)),
      status: entry.status
    })),
    parts: partsFor(template.id),
    enrich,
    limitations: [
      '链路验证版本，不保证可直接生产',
      '器件参数与 LCSC 料号已写入工程，但未经实单采购验证',
      '已完成基础连通走线，但没有跑 DRC、没有 Gerber 和 DFM',
      '未做原型打样与实测',
      '需要在 EasyEDA Pro V4.1+ 中人工打开验收'
    ]
  };
  writeUtf8(manifestPath, JSON.stringify(manifest, null, 2));

  // 生成符合 VerificationBundle 契约的验证证据。
  const limitations = manifest.limitations;
  const bundle = buildVerificationBundle({
    projectId: projectName,
    templateId: template.id,
    generatedAt: manifest.generatedAt,
    checks: buildChecks({
      validatePassed: true,
      clientVerified: false,
      lcscMapped: partsFor(template.id).filter((part) => part.lcsc).length
    }),
    artifacts: payloadArtifacts,
    limitations
  });
  assertValid(loadSchema('verification-bundle'), bundle, 'VerificationBundle');
  writeUtf8(path.join(packageDir, 'verification.json'), JSON.stringify(bundle, null, 2));

  createZip(packageDir, zipPath);

  console.log('');
  console.log(`生成完成：${path.join(packageDir, `${projectName}.eprj3`)}`);
  console.log(`模板：${template.title}`);
  console.log(`工程包目录：${packageDir}`);
  console.log(`ZIP：${zipPath}`);

  return { template, projectName, packageDir, zipPath, manifest };
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    generate(opts, process.cwd());
  } catch (error) {
    const exitCode = error instanceof UserError ? error.exitCode : 1;
    console.error(`错误：${error.message}`);
    process.exitCode = exitCode;
  }
}

module.exports = {
  TEMPLATES,
  UPSTREAM,
  UserError,
  matchTemplates,
  selectTemplate,
  slugify,
  generate,
  parseArgs,
  partsFor,
  buildBom
};

if (require.main === module) main();
