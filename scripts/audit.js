#!/usr/bin/env node
'use strict';

// 只读审计：把"这个工程到底对不对"变成一条命令。
//
// 做的事：
//   1. 用嘉立创 EDA 专业版 headless 打开工程
//   2. 读真实引脚坐标，检查每个引脚是否真的落在导线/网络旗标上（几何连接检查）
//   3. 跑原理图 DRC + PCB DRC
//   4. 导出客户端 BOM 与网表，检查 Value / 料号是否为空
//
// 只读：不修改工程、不保存文档，因此可以随时对 dist/ 下的产物跑。
// 退出码：0 = 全部通过；1 = 有失败项（便于放进 npm test / CI）。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    project: path.join(ROOT, 'dist', 'led-indicator', 'led-indicator.eprj3'),
    cli: process.env.LCEDA_CLI || '',
    json: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') { opts.project = argv[i + 1]; i += 1; continue; }
    if (arg === '--cli') { opts.cli = argv[i + 1]; i += 1; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--help' || arg === '-h') {
      console.log('用法：node scripts/audit.js [--project <xxx.eprj3>] [--json]');
      process.exit(0);
    }
    throw new Error(`未知参数：${arg}`);
  }
  return opts;
}

function findCli(explicit) {
  const candidates = [
    explicit,
    process.env.LCEDA_CLI,
    'D:\\lceda-pro-4.1.71\\lceda-pro.exe',
    'D:\\lceda-pro\\lceda-pro.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'LCEDA-Pro', 'lceda-pro.exe'),
    'C:\\Program Files\\LCEDA-Pro\\lceda-pro.exe'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('没找到嘉立创 EDA 专业版 4.1+ 的 exe；请设置 LCEDA_CLI。');
}

function runCli(cli, args) {
  const result = spawnSync(cli, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    // 客户端搜索器件时会把系统库缓存写到"当前工作目录"，指向临时目录免得弄脏仓库。
    cwd: os.tmpdir(),
    env: stripElectronEnv()
  });
  if (result.error) throw result.error;
  const output = (result.stdout || '').trim();
  if (!output) throw new Error(`CLI 没有返回 JSON：${args[0]}\n${result.stderr || ''}`);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`CLI 返回的不是 JSON：\n${output.slice(0, 400)}`);
  }
  if (!parsed.ok) throw new Error(`CLI 失败：${args[0]} → ${JSON.stringify(parsed.error || parsed)}`);
  return parsed.value;
}

// 某些 Electron 工具会注入 ELECTRON_RUN_AS_NODE=1，此时 exe 会被当成 Node 解释器。
function stripElectronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

const QUERY = String.raw`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (read, label, timeout = 45000) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      const v = await read();
      if (Array.isArray(v) && v.length) return v;
    } catch (e) { last = e; }
    await sleep(500);
  }
  throw new Error('等待' + label + '超时' + (last ? '：' + last.message : ''));
};

const out = { pins: [], wires: [], flags: [] };

// ---- 原理图 ----
const pages = await waitFor(() => eda.dmt_Schematic.getAllSchematicPagesInfo(), '原理图图页');
await eda.dmt_EditorControl.openDocument(pages[0].uuid);
await sleep(2000);

const comps = await waitFor(() => eda.sch_PrimitiveComponent.getAll(), '原理图器件');
for (const c of comps) {
  const designator = c.getState_Designator ? (c.getState_Designator() || '') : '';
  if (!designator) continue;
  const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(c.getState_PrimitiveId());
  out.pins.push({
    designator,
    net: c.getState_Net ? (c.getState_Net() || null) : null,
    pins: pins.map((p) => ({ number: p.pinNumber, x: p.x, y: p.y, net: p.net || null }))
  });
}

try {
  const wires = await eda.sch_PrimitiveWire.getAll();
  out.wires = wires.map((w) => {
    let line = null;
    try { line = w.getState_Line ? w.getState_Line() : null; } catch { line = null; }
    return { net: w.getState_Net ? (w.getState_Net() || null) : null, line };
  }).filter((w) => Array.isArray(w.line) && w.line.length === 4);
} catch { /* 没有导线时不是错误 */ }

// ---- 原理图 DRC ----
await eda.sch_Document.save();
await sleep(6000);
const schViolations = await eda.sch_Drc.check(true, false, true);
out.schDrc = {
  passed: await eda.sch_Drc.check(true, false, false),
  violations: (schViolations || []).map((v) => ({
    rule: v.rule,
    type: v.type,
    primitives: (v.primitives || []).map((p) => p && p.name)
  }))
};

// ---- 客户端 BOM ----
try {
  const csv = await eda.sch_ManufactureData.getBomFile('BOM', 'csv');
  out.bomCsv = await csv.text();
} catch (e) { out.bomError = String(e && e.message || e); }

// ---- 网表 ----
try {
  const f = await eda.sch_ManufactureData.getNetlistFile('NET', 'Protel2');
  const text = await f.text();
  out.netlist = text;
} catch (e) { out.netlistError = String(e && e.message || e); }

// ---- PCB DRC ----
try {
  const pcbs = await waitFor(() => eda.dmt_Pcb.getAllPcbsInfo(), 'PCB');
  await eda.dmt_EditorControl.openDocument(pcbs[0].uuid);
  await sleep(3000);
  await eda.pcb_Document.save();
  await sleep(6000);
  const pcbViolations = await eda.pcb_Drc.check(true, false, true);
  out.pcbDrc = {
    passed: await eda.pcb_Drc.check(true, false, false),
    violations: (pcbViolations || []).map((v) => ({
      rule: v.rule,
      type: v.type,
      primitives: (v.primitives || []).map((p) => p && p.name)
    }))
  };
} catch (e) { out.pcbDrcError = String(e && e.message || e); }

return out;
`;

function onSegment(px, py, line) {
  const [x1, y1, x2, y2] = line;
  const horizontal = y1 === y2 && py === y1 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2);
  const vertical = x1 === x2 && px === x1 && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
  return horizontal || vertical;
}

function analyze(value) {
  const pins = [];
  for (const comp of value.pins) {
    for (const pin of comp.pins) {
      const connected = value.wires.some((w) => onSegment(pin.x, pin.y, w.line));
      pins.push({
        designator: comp.designator,
        pin: pin.number,
        x: pin.x,
        y: pin.y,
        connected,
        nearestGap: connected ? 0 : nearestGap(pin, value.wires)
      });
    }
  }

  const bomRows = String(value.bomCsv || '').trim().split(/\r?\n/).slice(1);
  const parts = bomRows.map((row) => {
    const cols = row.split('\t');
    return {
      designators: (cols[3] || '').split(',').filter(Boolean),
      quantity: Number(cols[1] || 0),
      comment: cols[2] || '',
      footprint: cols[4] || '',
      value: cols[5] || '',
      mpn: cols[6] || '',
      manufacturer: cols[7] || '',
      supplierPart: cols[8] || ''
    };
  });

  const isBarePad = (p) => p.designators.length > 0 && p.designators.every((d) => /^TP\d+$/i.test(d));
  const assembled = parts.filter((p) => !isBarePad(p));
  const barePads = parts.filter(isBarePad);
  // 测试点是裸焊盘，没有元件可贴，因此不要求"数值 + 料号"；其余器件必须齐全。
  const missingValue = assembled.filter((p) => !p.value);
  const missingSupplier = assembled.filter((p) => !p.supplierPart);
  const floating = pins.filter((p) => !p.connected);

  return {
    pins,
    parts,
    assembledCount: assembled.length,
    barePadCount: barePads.length,
    missingValue,
    missingSupplier,
    floating
  };
}

function nearestGap(pin, wires) {
  let best = Infinity;
  for (const w of wires) {
    const [x1, y1, x2, y2] = w.line;
    const dx = Math.max(Math.min(x1, x2) - pin.x, 0, pin.x - Math.max(x1, x2));
    const dy = Math.max(Math.min(y1, y2) - pin.y, 0, pin.y - Math.max(y1, y2));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return Number.isFinite(best) ? best : null;
}

function drcSummary(drc) {
  const list = (drc && drc.violations) || [];
  const errors = list.filter((v) => v.type === 'error').length;
  const warnings = list.length - errors;
  return {
    passed: Boolean(drc && drc.passed),
    total: list.length,
    errors,
    warnings,
    rules: list.map((v) => `${v.rule || '未命名'}(${v.type || '?'})`).join(', ')
  };
}

function report(project, value) {
  const a = analyze(value);
  const sch = drcSummary(value.schDrc);
  const pcb = drcSummary(value.pcbDrc);
  const checks = [
    {
      id: 'sch.drc',
      title: '原理图 DRC 0 违规',
      pass: sch.passed,
      detail: value.schDrcError || (sch.total === 0
        ? '0 条'
        : `${sch.total} 条（error ${sch.errors} / warn ${sch.warnings}）：${sch.rules}`)
    },
    {
      id: 'pcb.drc',
      title: 'PCB DRC 0 违规',
      pass: pcb.passed,
      detail: value.pcbDrcError || (pcb.total === 0
        ? '0 条'
        : `${pcb.total} 条（error ${pcb.errors} / warn ${pcb.warnings}）：${pcb.rules}`)
    },
    {
      id: 'sch.pin_connected',
      title: '原理图引脚全部落在导线上',
      pass: a.floating.length === 0,
      detail: a.floating.length === 0
        ? `${a.pins.length} 个引脚全部有线`
        : `${a.floating.length} 个引脚浮空：${a.floating.map((p) => `${p.designator}.${p.pin}@(${p.x},${p.y}) 最近导线 ${p.nearestGap}mil`).join('；')}`
    },
    {
      id: 'bom.value',
      title: 'BOM 每个贴片器件都有 Value',
      pass: a.missingValue.length === 0 && a.assembledCount > 0,
      detail: a.assembledCount === 0
        ? 'BOM 里没有贴片器件'
        : a.missingValue.length === 0
          ? `${a.assembledCount}/${a.assembledCount} 个贴片器件都有数值${a.barePadCount ? `（${a.barePadCount} 个裸焊盘测试点豁免）` : ''}`
          : `${a.missingValue.length} 行缺 Value：${a.missingValue.map((p) => p.designators.join('/')).join(', ')}`
    },
    {
      id: 'bom.supplier_part',
      title: 'BOM 每个贴片器件都有供应商料号',
      pass: a.missingSupplier.length === 0 && a.assembledCount > 0,
      detail: a.assembledCount === 0
        ? 'BOM 里没有贴片器件'
        : a.missingSupplier.length === 0
          ? `${a.assembledCount}/${a.assembledCount} 个贴片器件都有 LCSC 料号${a.barePadCount ? `（${a.barePadCount} 个裸焊盘测试点豁免）` : ''}`
          : `${a.missingSupplier.length} 行缺料号：${a.missingSupplier.map((p) => p.designators.join('/')).join(', ')}`
    }
  ];

  return {
    project,
    auditedAt: new Date().toISOString(),
    pass: checks.every((c) => c.pass),
    checks,
    drc: { sch, pcb },
    bom: a.parts,
    pins: a.pins
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const project = path.resolve(opts.project);
  if (!fs.existsSync(project)) throw new Error(`工程不存在：${project}`);
  const cli = findCli(opts.cli);

  // 复制到临时目录再审计：DRC 需要 save()，不应改动被审计的产物。
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-audit-'));
  const sourceRoot = path.dirname(project);
  const copyRoot = path.join(temp, path.basename(sourceRoot));
  fs.cpSync(sourceRoot, copyRoot, { recursive: true });
  const copyProject = path.join(copyRoot, path.basename(project));

  let sessionId = null;
  try {
    runCli(cli, ['stop']);
    const opened = runCli(cli, ['open', '--path', copyProject.split(path.sep).join('/'), '--headless', 'true']);
    sessionId = opened.sessionId;
    if (!sessionId) throw new Error(`打开工程失败：${JSON.stringify(opened)}`);
    // 编辑器把文档树灌进内存需要时间；立刻 invoke 会读到空图页列表。
    await(new Promise((r) => setTimeout(r, 4000)));

    const doctor = runCli(cli, ['doctor']);
    if (!doctor.connected) throw new Error('客户端未连接');
    if (!/^4\./.test(doctor.bridgeVersion || '')) {
      throw new Error(`需要 V4 客户端，当前 ${doctor.bridgeVersion || '未知'}`);
    }

    const codeFile = path.join(temp, 'audit-query.js');
    fs.writeFileSync(codeFile, QUERY, 'utf8');
    const value = runCli(cli, [
      'invoke', '--session', sessionId, '--code-file', codeFile.split(path.sep).join('/'),
      '--timeout', '240000', '--ext-uuid', 'eda'
    ]);

    const result = { ...report(project, value), client: { path: cli, version: doctor.bridgeVersion } };
    const outFile = path.join(path.dirname(project), 'verification', 'audit.json');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`审计：${project}`);
      for (const check of result.checks) {
        console.log(`${check.pass ? '✓' : '✗'} ${check.title}\n    ${check.detail}`);
      }
      console.log(`\n${result.pass ? '全部通过' : '有失败项'} → ${outFile}`);
    }
    process.exitCode = result.pass ? 0 : 1;
  } finally {
    if (sessionId) {
      try { runCli(cli, ['session', 'close', '--session', sessionId, '--destroy', 'true']); } catch { /* ignore */ }
    }
    try { runCli(cli, ['stop']); } catch { /* ignore */ }
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`审计失败：${error.message}`);
  process.exitCode = 1;
});
