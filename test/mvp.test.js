'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'generate.js');
const VALIDATOR = path.join(ROOT, 'vendor', 'easyeda-eprj3-skill', 'scripts', 'validate.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-agent-test-'));
}

function cleanupTemp(root) {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('generates a validated 5V LED indicator .eprj3 project', () => {
  const tempRoot = makeTempRoot();
  try {
    const outDir = path.join(tempRoot, 'dist');
    const result = spawnSync(process.execPath, [
      CLI,
      '--input', '5V LED 指示灯板',
      '--out', outDir
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const packageDir = path.join(outDir, 'led-indicator');
    const projectDir = packageDir;
    const projectIndex = path.join(projectDir, 'led-indicator.eprj3');
    const zipPath = path.join(outDir, 'led-indicator-eprj3.zip');

    assert.ok(fs.existsSync(projectIndex), 'project index exists');
    assert.ok(fs.existsSync(path.join(projectDir, 'sch', 'Schematic1', 'P1.esch2')), 'schematic exists');
    assert.ok(fs.existsSync(path.join(projectDir, 'pcb', 'PCB1.epcb2')), 'pcb exists');
    assert.ok(fs.existsSync(path.join(packageDir, 'BOM.csv')), 'BOM exists');
    assert.ok(fs.existsSync(path.join(packageDir, 'README.md')), 'README exists');
    assert.ok(fs.existsSync(path.join(packageDir, 'manifest.json')), 'manifest exists');
    assert.ok(fs.statSync(zipPath).size > 0, 'zip exists and is not empty');

    const validation = spawnSync(process.execPath, [VALIDATOR, '--dir', projectDir], { encoding: 'utf8' });
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
    assert.match(validation.stdout, /0 errors/);

    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.template, '5v-led-indicator');
    assert.equal(manifest.upstream.version, '1.7.3');
    assert.ok(manifest.artifacts.some((item) => item.path === 'led-indicator.eprj3'));

    const bom = fs.readFileSync(path.join(packageDir, 'BOM.csv'), 'utf8');
    assert.match(bom, /TP1/);
    assert.match(bom, /R1/);
    assert.match(bom, /D1/);
    assert.match(bom, /TP2/);

    const schematic = fs.readFileSync(path.join(projectDir, 'sch', 'Schematic1', 'P1.esch2'), 'utf8');
    assert.match(schematic, /TP1/);
    assert.match(schematic, /TP2/);
    assert.match(schematic, /需求：5V LED 指示灯板/);

    const pcb = fs.readFileSync(path.join(projectDir, 'pcb', 'PCB1.epcb2'), 'utf8');
    assert.match(pcb, /"netName":"5V"/);
    assert.match(pcb, /"netName":"LED_A"/);
    assert.match(pcb, /"netName":"GND"/);
  } finally {
    cleanupTemp(tempRoot);
  }
});


test('generates a validated RC low-pass filter .eprj3 project', () => {
  const tempRoot = makeTempRoot();
  try {
    const outDir = path.join(tempRoot, 'dist');
    const result = spawnSync(process.execPath, [
      CLI,
      '--template', 'rc-low-pass-filter',
      '--input', 'RC 低通滤波器，输入输出测试点',
      '--out', outDir
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const packageDir = path.join(outDir, 'rc-low-pass-filter');
    const projectDir = packageDir;
    const projectIndex = path.join(projectDir, 'rc-low-pass-filter.eprj3');
    const zipPath = path.join(outDir, 'rc-low-pass-filter-eprj3.zip');

    assert.ok(fs.existsSync(projectIndex), 'project index exists');
    assert.ok(fs.statSync(zipPath).size > 0, 'zip exists and is not empty');

    const validation = spawnSync(process.execPath, [VALIDATOR, '--dir', projectDir], { encoding: 'utf8' });
    assert.equal(validation.status, 0, `${validation.stdout}\n${validation.stderr}`);
    assert.match(validation.stdout, /0 errors/);

    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.template, 'rc-low-pass-filter');
    assert.deepEqual(manifest.verification.nets, ['FILTER_IN', 'FILTER_OUT', 'GND']);

    const bom = fs.readFileSync(path.join(packageDir, 'BOM.csv'), 'utf8');
    for (const value of ['TP1', 'R1', 'TP2', 'C1', 'TP3']) assert.match(bom, new RegExp(value));

    const schematic = fs.readFileSync(path.join(projectDir, 'sch', 'Schematic1', 'P1.esch2'), 'utf8');
    assert.match(schematic, /需求：RC 低通滤波器/);

    const pcb = fs.readFileSync(path.join(projectDir, 'pcb', 'PCB1.epcb2'), 'utf8');
    assert.match(pcb, /"netName":"FILTER_IN"/);
    assert.match(pcb, /"netName":"FILTER_OUT"/);
    assert.match(pcb, /"netName":"GND"/);
  } finally {
    cleanupTemp(tempRoot);
  }
});
test('rejects unsupported hardware requests without creating output', () => {
  const tempRoot = makeTempRoot();
  try {
    const outDir = path.join(tempRoot, 'dist');
    const result = spawnSync(process.execPath, [
      CLI,
      '--input', '设计一个 STM32 最小系统板',
      '--out', outDir
    ], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /无法从需求中选择模板/);
    assert.equal(fs.existsSync(outDir), false);
  } finally {
    cleanupTemp(tempRoot);
  }
});
