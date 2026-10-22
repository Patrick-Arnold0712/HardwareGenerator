#!/usr/bin/env node
'use strict';

// 一键发布：测试通过后才提交并推送。
// 用法：
//   npm run ship -- "提交说明"
//   npm run ship              # 未提供说明时使用时间戳
//
// 设计原则：测试不过就不提交，避免把坏代码推上去。

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// 不使用 shell:true：它会拼接参数，含空格的提交说明会被拆散，
// 也存在命令注入风险。npm 在 Windows 上是 .cmd，需要单独处理。
const IS_WIN = process.platform === 'win32';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error
  };
}

function runNpm(args) {
  if (IS_WIN) {
    return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args]);
  }
  return run('npm', args);
}

function step(label) {
  console.log(`\n=== ${label} ===`);
}

function main() {
  const message = process.argv.slice(2).join(' ').trim();

  step('1/4 运行测试');
  const test = runNpm(['test']);
  if (test.status !== 0) {
    console.error('测试未通过，已中止发布。');
    console.error(test.stdout);
    console.error(test.stderr);
    process.exitCode = 1;
    return;
  }
  const passLine = test.stdout.split('\n').filter((l) => /pass |checks passed/.test(l)).join(' / ');
  console.log(`测试通过：${passLine || 'ok'}`);

  step('2/4 检查工作区');
  const status = run('git', ['status', '--porcelain']);
  if (status.status !== 0) {
    console.error('无法读取 git 状态。');
    process.exitCode = 1;
    return;
  }
  if (!status.stdout) {
    console.log('没有需要提交的改动，已是最新。');
    return;
  }
  const changed = status.stdout.split('\n').filter(Boolean);
  console.log(`待提交 ${changed.length} 项：`);
  for (const line of changed.slice(0, 20)) console.log(`  ${line}`);
  if (changed.length > 20) console.log(`  ... 还有 ${changed.length - 20} 项`);

  step('3/4 提交');
  const add = run('git', ['add', '-A']);
  if (add.status !== 0) {
    console.error(`git add 失败：${add.stderr}`);
    process.exitCode = 1;
    return;
  }
  const finalMessage = message || `Update ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
  const commit = run('git', ['-c', 'core.safecrlf=false', 'commit', '-m', finalMessage]);
  if (commit.status !== 0) {
    console.error(`git commit 失败：${commit.stderr || commit.stdout}`);
    process.exitCode = 1;
    return;
  }
  console.log(commit.stdout.split('\n')[0]);

  step('4/4 推送');
  const push = run('git', ['push', 'origin', 'HEAD']);
  if (push.status !== 0) {
    console.error(`推送失败：${push.stderr || push.stdout}`);
    console.error('如果是凭证失效，请先运行：gh auth login');
    process.exitCode = 1;
    return;
  }
  console.log(push.stderr || push.stdout);

  const remote = run('git', ['remote', 'get-url', 'origin']);
  const url = remote.stdout.replace(/\.git$/, '');
  console.log(`\n已推送到 ${url}`);

  // 需要交付包时传 --package
  if (process.argv.includes('--package')) {
    step('额外：打包交付物');
    const pack = runNpm(['run', 'package:client']);
    if (pack.status !== 0) {
      console.error(`打包失败：${pack.stderr || pack.stdout}`);
      process.exitCode = 1;
      return;
    }
    const lines = (pack.stdout || '').split('\n').filter((l) => /交付包|大小/.test(l));
    for (const line of lines) console.log(line);
  }

  console.log(`\n仓库地址：${url}`);
}

main();
