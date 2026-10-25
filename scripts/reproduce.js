#!/usr/bin/env node
'use strict';

// 一条命令复现整个链路，并把每一步的原始输出落盘。
//
// 为什么要有它：任务书 D1–D2 的要求是"他人可以从干净环境运行"，并且要有日志。
// 口头说"我这里能跑"没有意义，能交出 summary.json + 每一步的 log 才算。
//
// 用法：
//   node scripts/reproduce.js                  # 不依赖 EDA 客户端（CI / 陌生环境用这个）
//   node scripts/reproduce.js --with-client    # 额外跑客户端审计（DRC + BOM 回读）
//   node scripts/reproduce.js --out docs/repro/2026-10-24   # 把证据写进仓库

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { withClient: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--with-client') { opts.withClient = true; continue; }
    if (arg === '--out') { opts.out = argv[i + 1]; i += 1; continue; }
    if (arg === '--help' || arg === '-h') {
      console.log('用法：node scripts/reproduce.js [--with-client] [--out <目录>]');
      process.exit(0);
    }
    throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function findClient() {
  const candidates = [
    process.env.LCEDA_CLI,
    'D:\\lceda-pro-4.1.71\\lceda-pro.exe',
    'D:\\lceda-pro\\lceda-pro.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'LCEDA-Pro', 'lceda-pro.exe'),
    'C:\\Program Files\\LCEDA-Pro\\lceda-pro.exe'
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function run(id, title, args, outDir, options = {}) {
  const startedAt = Date.now();
  // npm 在 Windows 上是 .cmd，统一用 process.execPath 直接跑 node，避免 shell 差异。
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    env: { ...process.env, NO_COLOR: '1' }
  });
  const durationMs = Date.now() - startedAt;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const logFile = path.join(outDir, `${String(run.count).padStart(2, '0')}-${id}.log`);
  run.count += 1;

  const body = [
    `# ${title}`,
    `# 命令: node ${args.join(' ')}`,
    `# 退出码: ${result.status}`,
    `# 耗时: ${durationMs}ms`,
    '',
    '--- stdout ---',
    stdout.trim(),
    '',
    '--- stderr ---',
    stderr.trim(),
    ''
  ].join('\n');
  fs.writeFileSync(logFile, body, 'utf8');

  const ok = result.status === 0;
  const tolerated = !ok && options.tolerate === true;
  const mark = ok ? '✓' : tolerated ? '⚠' : '✗';
  console.log(`${mark} ${title}（${durationMs}ms）`);
  if (!ok && !tolerated) {
    const hint = (stderr || stdout).trim().split(/\r?\n/).slice(-6).join('\n  ');
    console.log(`  ${hint}`);
  }
  return {
    id,
    title,
    command: `node ${args.join(' ')}`,
    status: ok ? 'pass' : tolerated ? 'warn' : 'fail',
    exitCode: result.status,
    durationMs,
    log: path.relative(ROOT, logFile)
  };
}
run.count = 1;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, opts.out || path.join('logs', `repro-${stamp()}`));
  fs.mkdirSync(outDir, { recursive: true });

  const client = findClient();
  // 不直接 spawn npm：Windows 上 .cmd 需要 shell，容易带出告警。npm 会把自身版本写进这个环境变量。
  const userAgent = process.env.npm_config_user_agent || '';
  const npmVersion = /npm\/([0-9.]+)/.exec(userAgent);
  const env = {
    node: process.version,
    npm: npmVersion ? npmVersion[1] : '(由 npm 调用时可读到)',
    platform: `${process.platform} ${process.arch}`,
    os: os.release(),
    cwd: ROOT,
    commit: gitCommit(),
    client: client || '(未找到，audit 会跳过)'
  };

  console.log('环境');
  for (const [key, value] of Object.entries(env)) console.log(`  ${key}: ${value}`);
  console.log('');

  const steps = [];
  // Node 24 不接受目录作为 --test 参数（会当成模块路径），这里显式列出测试文件。
  const testFiles = fs.readdirSync(path.join(ROOT, 'test'))
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join('test', name));
  steps.push(run('tests', `本地测试（${testFiles.length} 个文件）`, ['--test', ...testFiles], outDir));
  steps.push(run('smoke', '上游冒烟测试（121 项）', ['vendor/easyeda-eprj3-skill/test/smoke.js'], outDir));
  steps.push(run('gen-led', '生成 5V LED 指示灯板', ['src/generate.js', '--template', '5v-led-indicator', '--input', '5V LED 指示灯板', '--out', 'dist', '--force'], outDir));
  steps.push(run('validate-led', '校验 LED 工程格式', ['vendor/easyeda-eprj3-skill/scripts/validate.js', '--dir', 'dist/led-indicator'], outDir));
  steps.push(run('gen-rc', '生成 RC 低通滤波器板', ['src/generate.js', '--template', 'rc-low-pass-filter', '--input', 'RC 低通滤波器，输入输出测试点', '--out', 'dist', '--force'], outDir));
  steps.push(run('validate-rc', '校验 RC 工程格式', ['vendor/easyeda-eprj3-skill/scripts/validate.js', '--dir', 'dist/rc-low-pass-filter'], outDir));

  if (opts.withClient) {
    if (!client) {
      console.log('! 未找到嘉立创 EDA 客户端，跳过 audit');
      steps.push({ id: 'audit', title: '客户端审计（跳过：未安装客户端）', status: 'skipped' });
    } else {
      steps.push(run('audit-led', '客户端审计：LED 板（已知 2 条未清）', ['scripts/audit.js', '--project', 'dist/led-indicator/led-indicator.eprj3'], outDir, { tolerate: true }));
      steps.push(run('audit-rc', '客户端审计：RC 板（已知 2 条未清）', ['scripts/audit.js', '--project', 'dist/rc-low-pass-filter/rc-low-pass-filter.eprj3'], outDir, { tolerate: true }));
    }
  }

  const failed = steps.filter((step) => step.status === 'fail');
  const summary = {
    generatedAt: new Date().toISOString(),
    ok: failed.length === 0,
    environment: env,
    steps,
    note: opts.withClient
      ? '含客户端审计；audit 退出码 1 表示 DRC/BOM 项未全绿，属于已知问题，不代表链路失败。'
      : '未运行客户端审计（需要安装嘉立创 EDA 专业版 V4.1+）。'
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('');
  console.log(`证据目录：${path.relative(ROOT, outDir)}`);
  const warns = steps.filter((s) => s.status === 'warn').length;
  console.log(`结果：${steps.filter((s) => s.status === 'pass').length} 通过 / ${warns} 已知问题 / ${failed.length} 失败 / ${steps.filter((s) => s.status === 'skipped').length} 跳过`);

  // audit 的退出码 1 是"发现问题"，不是"链路坏了"：只在结构/生成/校验失败时才判整体失败。
  const structuralFailure = steps.some((s) => s.status === 'fail' && !s.id.startsWith('audit-'));
  process.exitCode = structuralFailure ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(`复现失败：${error.message}`);
  process.exitCode = 1;
}
