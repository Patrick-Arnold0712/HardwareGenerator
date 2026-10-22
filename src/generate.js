#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
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
    },
    bom: [
      'Designator,Quantity,Value,Footprint,Description,LCSC',
      'TP1,1,TEST_POINT,TP0.5,5V test point,',
      'R1,1,RES,R0603,LED current-limiting resistor,',
      'D1,1,LED,LED0603,5V power indicator LED,',
      'TP2,1,TEST_POINT,TP0.5,GND test point,'
    ]
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
    },
    bom: [
      'Designator,Quantity,Value,Footprint,Description,LCSC',
      'TP1,1,TEST_POINT,TP0.5,Filter input test point,',
      'R1,1,RES,R0603,Series resistor,',
      'TP2,1,TEST_POINT,TP0.5,Filter output test point,',
      'C1,1,CAP,C0603,Shunt capacitor,',
      'TP3,1,TEST_POINT,TP0.5,Ground test point,'
    ]
  }
});

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

  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '300,-300,470,-300', '--net', '5V'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '530,-300,670,-300', '--net', 'LED_A'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '730,-300,900,-300', '--net', 'GND'
  ], logs);

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

  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '300,-300,470,-300', '--net', 'FILTER_IN'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '530,-300,700,-300', '--net', 'FILTER_OUT'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '700,-300,700,-370', '--net', 'FILTER_OUT'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', packageDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '700,-430,700,-600', '--net', 'GND'
  ], logs);

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
  return `# ${projectName}

这是由“嘉立创硬件 Agent MVP”生成的链路验证工程。

## 需求

${template.requirementText}

原始需求文本：${input}

## 打开方式

1. 安装 EasyEDA Pro / 嘉立创 EDA 专业版 V4.1+。
2. 打开 \`${projectName}.eprj3\`。
3. 在原理图和 PCB 中检查器件、网络和基础走线。

## 当前电路

\`\`\`
${circuit}
\`\`\`

## 范围说明

- 只验证“需求 -> .eprj3 -> 嘉立创 EDA 可打开”的链路；
- 使用通用 RES、CAP、LED、TEST_POINT 符号和 0603/TP0.5 封装；
- 没有 LCSC 料号映射；
- 已完成基础连通走线，但没有 Gerber、DFM 或量产正确性保证；
- 生产前必须由硬件工程师检查和修改。

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
  runUpstream('validate.js', ['--dir', packageDir], logs);
  runUpstream('cleanup.js', ['--dir', packageDir], logs);
  runUpstream('validate.js', ['--dir', packageDir], logs);

  const bomPath = path.join(packageDir, 'BOM.csv');
  const readmePath = path.join(packageDir, 'README.md');
  writeUtf8(bomPath, template.bom.join('\n'));
  writeUtf8(readmePath, createPackageReadme(projectName, template, input));

  const manifestPath = path.join(packageDir, 'manifest.json');
  const filesBeforeManifest = listFiles(packageDir);
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
    artifacts: artifactEntries(packageDir, filesBeforeManifest),
    operations: logs.map((entry) => ({
      script: entry.script,
      args: entry.args.map((arg) => manifestArg(arg, packageDir)),
      status: entry.status
    })),
    limitations: [
      '链路验证版本，不保证可直接生产',
      '没有 LCSC 料号映射',
      '已完成基础连通走线，但没有 Gerber 和 DFM',
      '需要在 EasyEDA Pro V4.1+ 中人工打开验收'
    ]
  };
  writeUtf8(manifestPath, JSON.stringify(manifest, null, 2));

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
  parseArgs
};

if (require.main === module) main();
