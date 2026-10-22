#!/usr/bin/env node
'use strict';

// 打包给客户的交付物。
//
// 原则：
// 1. 只用 dist/ 下的干净产物，不打包历次测试残留（dist/wizard/ 是临时会话目录）。
// 2. 打包前必须重新生成并校验，避免把过期文件发给客户。
// 3. 输出到 deliver/，该目录不入库。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'deliver');
const IS_WIN = process.platform === 'win32';

function run(command, args) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
}

function runNpm(args) {
  if (IS_WIN) {
    return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args]);
  }
  return run('npm', args);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function zipDir(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
  // 关键：在 sourceDir 的父目录里压缩 sourceDir 内的内容，
  // 否则压缩包里会多出一层目录名，客户解压后看到的是 deliver/ 而不是文件本身。
  const result = IS_WIN
    ? run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Compress-Archive -Path '${path.join(sourceDir, '*')}' -DestinationPath '${zipPath}' -Force`
    ])
    : run('zip', ['-r', zipPath, '.'], { cwd: sourceDir });
  if (result.status !== 0) {
    throw new Error(`压缩失败：${result.stderr || result.stdout}`);
  }
}

function main() {
  console.log('=== 1/5 清理旧交付物 ===');
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  ensureDir(OUT);
  console.log(`输出目录：${OUT}`);

  console.log('\n=== 2/5 重新生成两个模板 ===');
  for (const script of ['generate:led', 'generate:rc']) {
    const result = runNpm([`run`, script]);
    const ok = /生成完成/.test(result.stdout || '');
    if (!ok) {
      throw new Error(`${script} 失败：\n${result.stdout}\n${result.stderr}`);
    }
    console.log(`  ${script} 完成`);
  }

  // 生成会重建工程目录，之前的验证截图会被清掉，所以这里必须重跑一次客户端回读。
  console.log('\n=== 2b/5 客户端回读验证 ===');
  const clientAvailable = fs.existsSync(process.env.LCEDA_CLI || 'D:\\lceda-pro-4.1.71\\lceda-pro.exe');
  if (!clientAvailable) {
    console.log('  跳过：未找到嘉立创 EDA 客户端，交付包将不含验证截图');
  } else {
    // ELECTRON_RUN_AS_NODE 会让 lceda-pro.exe 被当成 Node 解释器执行。
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const project of ['led-indicator', 'rc-low-pass-filter']) {
      const result = spawnSync(process.execPath, [
        path.join(ROOT, 'src', 'verify-client.js'),
        '--project', path.join(DIST, project, `${project}.eprj3`)
      ], { cwd: ROOT, encoding: 'utf8', env });
      const ok = /"ok": true/.test(result.stdout || '');
      if (!ok) {
        throw new Error(`${project} 客户端验证失败：\n${result.stdout}\n${result.stderr}`);
      }
      console.log(`  ${project} 回读通过`);
    }
  }

  console.log('\n=== 3/5 收集交付物 ===');
  const projects = [
    { dir: 'led-indicator', zip: 'led-indicator-eprj3.zip' },
    { dir: 'rc-low-pass-filter', zip: 'rc-low-pass-filter-eprj3.zip' }
  ];

  for (const project of projects) {
    const zipSource = path.join(DIST, project.zip);
    if (!fs.existsSync(zipSource)) throw new Error(`缺少 ${project.zip}`);
    copyFile(zipSource, path.join(OUT, project.zip));

    // 每个工程附上验证证据，方便客户核对。
    const verification = path.join(DIST, project.dir, 'verification');
    if (fs.existsSync(verification)) {
      const target = path.join(OUT, 'verification', project.dir);
      ensureDir(target);
      for (const file of fs.readdirSync(verification)) {
        copyFile(path.join(verification, file), path.join(target, file));
      }
    }
    console.log(`  ${project.zip}`);
  }

  // 截图
  const shots = path.join(DIST, 'wizard-steps');
  if (fs.existsSync(shots)) {
    const target = path.join(OUT, 'screenshots');
    ensureDir(target);
    for (const file of fs.readdirSync(shots)) {
      copyFile(path.join(shots, file), path.join(target, file));
    }
    console.log(`  screenshots/ (${fs.readdirSync(shots).length} 张)`);
  } else {
    console.log('  警告：未找到界面截图，可先运行 npm run check:browser');
  }

  // 交付说明
  const doc = path.join(ROOT, 'docs', '客户交付说明.md');
  if (fs.existsSync(doc)) {
    copyFile(doc, path.join(OUT, '交付说明.md'));
    console.log('  交付说明.md');
  }

  console.log('\n=== 4/5 打包 ===');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const finalZip = path.join(ROOT, `HardwareGenerator-交付包-${stamp}.zip`);
  zipDir(OUT, finalZip);

  console.log('\n=== 5/5 完成 ===');
  const size = fs.statSync(finalZip).size;
  console.log(`交付包：${finalZip}`);
  console.log(`大小：${(size / 1024).toFixed(1)} KB`);

  // 列出包内条目，便于核对
  const listing = run('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem;` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${finalZip}');` +
    `$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()`
  ]);
  if (listing.status === 0 && listing.stdout.trim()) {
    console.log('\n包内条目：');
    for (const line of listing.stdout.trim().split('\n')) {
      console.log(`  ${line.trim()}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`\n打包失败：${error.message}`);
  process.exitCode = 1;
}
