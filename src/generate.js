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

const TEMPLATE = Object.freeze({
  id: '5v-led-indicator',
  title: '5V LED 指示灯小板',
  description: '5V -> 测试点 -> 电阻 -> LED -> 测试点 -> GND',
  defaultName: 'led-indicator'
});

class UserError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

function printHelp() {
  console.log(`用法：
  node src/generate.js --input "5V LED 指示灯板" --out dist [--name led-indicator] [--force]

参数：
  --input <text>       硬件需求描述；默认使用内置的 5V LED 指示灯示例
  --input-file <path>  从 UTF-8 文本文件读取需求
  --out <dir>          输出目录，默认 dist
  --name <name>        项目名；默认 led-indicator
  --force              覆盖同名输出目录和 ZIP
  --help               显示帮助

当前只支持：
  5V LED 指示灯小板（输入中包含 5V/5伏 和 LED/指示灯）
`);
}

function parseArgs(argv) {
  const opts = {
    input: '5V LED 指示灯板',
    inputFile: null,
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
    if (arg === '--input' || arg === '--input-file' || arg === '--out' || arg === '--name') {
      if (i + 1 >= argv.length) throw new UserError(`参数 ${arg} 缺少值`);
      const value = argv[i + 1];
      i += 1;
      if (arg === '--input') opts.input = value;
      if (arg === '--input-file') opts.inputFile = value;
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

function requireSupportedTemplate(input) {
  const compact = input.toLowerCase().replace(/\s+/g, '');
  const has5v = compact.includes('5v') || compact.includes('5.0v') || input.includes('5伏');
  const hasLed = compact.includes('led') || input.includes('指示灯') || input.includes('发光二极管');
  if (!has5v || !hasLed) {
    throw new UserError(
      `当前 MVP 只支持“5V LED 指示灯小板”。收到：${input}\n` +
      '请包含 5V/5伏 和 LED/指示灯，或改用后续版本。'
    );
  }
  return TEMPLATE;
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

function buildLedIndicator(packageDir, projectName, logs) {
  const projectDir = packageDir;

  runUpstream('init.js', [
    '--dir', projectDir,
    '--name', projectName,
    '--board-w', '2400',
    '--board-h', '1600'
  ], logs);

  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', '5V', '--x', '300', '--y', '-300'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '400', '--y', '-300', '--refdes', 'TP1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'RES', '--footprint', 'R0603', '--x', '500', '--y', '-300', '--refdes', 'R1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'LED', '--footprint', 'LED0603', '--x', '700', '--y', '-300', '--refdes', 'D1'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5', '--x', '800', '--y', '-300', '--refdes', 'TP2'
  ], logs);
  runUpstream('add-symbol.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--symbol', 'GND', '--x', '900', '--y', '-300'
  ], logs);

  runUpstream('add-wire.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '300,-300,470,-300', '--net', '5V'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '530,-300,670,-300', '--net', 'LED_A'
  ], logs);
  runUpstream('add-wire.js', [
    '--dir', projectDir, '--sch', 'Schematic1', '--sheet', 'P1',
    '--segs', '730,-300,900,-300', '--net', 'GND'
  ], logs);

  runUpstream('add-footprint.js', [
    '--dir', projectDir, '--pcb', 'PCB1',
    '--symbol', 'RES', '--footprint', 'R0603',
    '--x', '900', '--y', '800', '--refdes', 'R1',
    '--nets', '1:5V,2:LED_A'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', projectDir, '--pcb', 'PCB1',
    '--symbol', 'LED', '--footprint', 'LED0603',
    '--x', '1500', '--y', '800', '--refdes', 'D1',
    '--nets', '1:LED_A,2:GND'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', projectDir, '--pcb', 'PCB1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '500', '--y', '800', '--refdes', 'TP1',
    '--nets', '1:5V'
  ], logs);
  runUpstream('add-footprint.js', [
    '--dir', projectDir, '--pcb', 'PCB1',
    '--symbol', 'TEST_POINT', '--footprint', 'TP0.5',
    '--x', '1900', '--y', '800', '--refdes', 'TP2',
    '--nets', '1:GND'
  ], logs);

  runUpstream('add-track.js', [
    '--dir', projectDir, '--pcb', 'PCB1', '--net', '5V',
    '--layer', '1', '--width', '12',
    '--x1', '500', '--y1', '800', '--x2', '870.3', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', projectDir, '--pcb', 'PCB1', '--net', 'LED_A',
    '--layer', '1', '--width', '10',
    '--x1', '929.7', '--y1', '800', '--x2', '1468.9', '--y2', '800'
  ], logs);
  runUpstream('add-track.js', [
    '--dir', projectDir, '--pcb', 'PCB1', '--net', 'GND',
    '--layer', '1', '--width', '12',
    '--x1', '1531.1', '--y1', '800', '--x2', '1900', '--y2', '800'
  ], logs);

  runUpstream('validate.js', ['--dir', projectDir], logs);
  runUpstream('cleanup.js', ['--dir', projectDir], logs);
  runUpstream('validate.js', ['--dir', projectDir], logs);

  return projectDir;
}

function createBom() {
  return [
    'Designator,Quantity,Value,Footprint,Description,LCSC',
    'TP1,1,TEST_POINT,TP0.5,5V test point,',
    'R1,1,RES,R0603,LED current-limiting resistor,',
    'D1,1,LED,LED0603,5V power indicator LED,',
    'TP2,1,TEST_POINT,TP0.5,GND test point,'
  ].join('\n');
}

function createPackageReadme(projectName) {
  return `# ${projectName}

这是由“嘉立创硬件 Agent MVP”生成的链路验证工程。

## 打开方式

1. 安装 EasyEDA Pro / 嘉立创 EDA 专业版 V4.1+。
2. 打开 \`${projectName}/${projectName}.eprj3\`。
3. 检查原理图和 PCB 中的 R1、D1、5V、GND。

## 当前电路

\`\`\`
5V -> TP1/R1 -> D1 -> TP2/GND
\`\`\`

## 范围说明

- 只验证“需求 -> .eprj3 -> 嘉立创 EDA 可打开”的链路；
- 使用通用 RES/LED 符号和 R0603/LED0603 封装；
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

  const input = readInput(opts, cwd);
  if (!input) throw new UserError('需求描述不能为空');
  requireSupportedTemplate(input);

  const outDir = path.resolve(cwd, opts.out);
  const projectName = slugify(opts.name || TEMPLATE.defaultName, TEMPLATE.defaultName);
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
  const projectDir = buildLedIndicator(packageDir, projectName, logs);

  const bomPath = path.join(packageDir, 'BOM.csv');
  const readmePath = path.join(packageDir, 'README.md');
  writeUtf8(bomPath, createBom());
  writeUtf8(readmePath, createPackageReadme(projectName));

  const manifestPath = path.join(packageDir, 'manifest.json');
  const filesBeforeManifest = listFiles(packageDir);
  const manifest = {
    schemaVersion: '0.1',
    template: TEMPLATE.id,
    title: TEMPLATE.title,
    description: TEMPLATE.description,
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
      '已完成基础连通走线，但没有 Gerber',
      '需要在 EasyEDA Pro V4.1+ 中人工打开验收'
    ]
  };
  writeUtf8(manifestPath, JSON.stringify(manifest, null, 2));

  createZip(packageDir, zipPath);

  console.log('');
  console.log(`生成完成：${path.join(projectDir, `${projectName}.eprj3`)}`);
  console.log(`工程包目录：${packageDir}`);
  console.log(`ZIP：${zipPath}`);
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

main();
