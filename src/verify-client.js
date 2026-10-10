#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    project: path.join(ROOT, 'dist', 'led-indicator', 'led-indicator.eprj3'),
    cli: process.env.LCEDA_CLI || ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      if (i + 1 >= argv.length) throw new Error('--project 缺少路径');
      opts.project = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--cli') {
      if (i + 1 >= argv.length) throw new Error('--cli 缺少路径');
      opts.cli = argv[i + 1];
      i += 1;
      continue;
    }
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
  throw new Error('未找到支持 .eprj3 的 LCEDA Pro 4.1+ CLI。请将 LCEDA_CLI 指向 lceda-pro.exe。');
}

function runCli(cli, args) {
  const result = spawnSync(cli, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`LCEDA CLI 失败：${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  const output = (result.stdout || '').trim();
  if (!output) throw new Error(`LCEDA CLI 没有返回 JSON：${args.join(' ')}`);
  return JSON.parse(output);
}

function tryRunCli(cli, args) {
  try {
    return runCli(cli, args);
  } catch {
    return null;
  }
}

function writeDataUrl(file, dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error(`不是有效的 PNG data URL：${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(match[1], 'base64'));
}

function cleanupTemp(root) {
  const resolved = path.resolve(root);
  const temp = path.resolve(os.tmpdir());
  const relative = path.relative(temp, resolved);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const project = path.resolve(opts.project);
  if (!fs.existsSync(project)) throw new Error(`工程不存在：${project}`);
  const cli = findCli(opts.cli);
  tryRunCli(cli, ['stop']);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-verify-'));
  const sourceRoot = path.dirname(project);
  const verifyRoot = path.join(temp, path.basename(sourceRoot));
  fs.cpSync(sourceRoot, verifyRoot, { recursive: true });
  const verifyProject = path.join(verifyRoot, path.basename(project));
  const opened = runCli(cli, ['open', '--path', verifyProject, '--headless', 'true']);
  if (!opened.ok || !opened.value || !opened.value.sessionId) {
    throw new Error(`打开工程失败：${JSON.stringify(opened)}`);
  }
  const sessionId = opened.value.sessionId;
  const doctor = runCli(cli, ['doctor']);
  if (!doctor.ok || !doctor.value || !doctor.value.connected) {
    throw new Error(`LCEDA Pro 未连接：${JSON.stringify(doctor)}`);
  }
  const version = doctor.value.bridgeVersion || '';
  if (!/^4\./.test(version)) {
    throw new Error(`当前客户端 ${version} 不是要求的 V4，无法验证 .eprj3。`);
  }
  const queryFile = path.join(temp, 'query.js');

  try {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const query = `const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const waitForArray = async (read, label, timeout = 30000) => {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const value = await read();
      if (Array.isArray(value) && value.length) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('等待' + label + '超时' + (lastError ? '：' + lastError.message : ''));
};
const pages = await waitForArray(() => eda.dmt_Schematic.getAllSchematicPagesInfo(), '原理图图页');
const schTab = await eda.dmt_EditorControl.openDocument(pages[0].uuid);
await new Promise((resolve) => setTimeout(resolve, 1000));
await eda.dmt_EditorControl.zoomToAllPrimitives(schTab);
const sch = await waitForArray(() => eda.sch_PrimitiveComponent.getAll(), '原理图器件');
const schNets = await eda.sch_Net.getAllNetsName();
const pcbs = await waitForArray(() => eda.dmt_Pcb.getAllPcbsInfo(), 'PCB');
const pcbTab = await eda.dmt_EditorControl.openDocument(pcbs[0].uuid);
await new Promise((resolve) => setTimeout(resolve, 1000));
await eda.dmt_EditorControl.zoomToAllPrimitives(pcbTab);
const pcb = await waitForArray(() => eda.pcb_PrimitiveComponent.getAll(), 'PCB 器件');
const pads = await waitForArray(() => eda.pcb_PrimitivePad.getAll(), 'PCB 焊盘');
const nets = await waitForArray(() => eda.pcb_Net.getAllNetsName(), 'PCB 网络');
const trackLengths = {};
for (const net of nets) {
  try { trackLengths[net] = await eda.pcb_Net.getNetLength(net); }
  catch { trackLengths[net] = null; }
}
const schematicImage = await blobToDataUrl(await eda.dmt_EditorControl.getCurrentRenderedAreaImage(schTab));
const pcbImage = await blobToDataUrl(await eda.dmt_EditorControl.getCurrentRenderedAreaImage(pcbTab));
return {
  pages: pages.map((p) => ({ name: p.name, uuid: p.uuid })),
  pcbs: pcbs.map((p) => ({ name: p.name, uuid: p.uuid })),
  schDesignators: sch.map((x) => x.designator).filter(Boolean),
  pcbDesignators: pcb.map((x) => x.designator).filter(Boolean),
  pads: pads.map((p) => ({ number: p.number, net: p.net, x: p.x, y: p.y })),
  nets,
  trackLengths,
  schematicImage,
  pcbImage
};`;
    fs.writeFileSync(queryFile, query, 'utf8');
    const result = runCli(cli, ['invoke', '--session', sessionId, '--code-file', queryFile, '--timeout', '120000']);
    if (!result.ok || !result.value) throw new Error(`查询失败：${JSON.stringify(result)}`);
    const value = result.value;

    const manifestPath = path.join(path.dirname(project), 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    const expected = manifest.verification || {
      schDesignators: ['TP1', 'R1', 'D1', 'TP2'],
      pcbDesignators: ['TP1', 'R1', 'D1', 'TP2'],
      nets: ['5V', 'LED_A', 'GND']
    };
    const missingSchematic = expected.schDesignators.filter((d) => !value.schDesignators.includes(d));
    const missingPcb = expected.pcbDesignators.filter((d) => !value.pcbDesignators.includes(d));
    const requiredNets = expected.nets;
    const missingNets = requiredNets.filter((n) => !value.nets.includes(n));
    const deadNets = requiredNets.filter((n) => !(Number(value.trackLengths[n]) > 0));
    if (missingSchematic.length || missingPcb.length || missingNets.length || deadNets.length) {
      throw new Error(JSON.stringify({ missingSchematic, missingPcb, missingNets, deadNets, value }, null, 2));
    }

    const packageDir = path.dirname(project);
    writeDataUrl(path.join(packageDir, 'verification', 'schematic.png'), value.schematicImage);
    writeDataUrl(path.join(packageDir, 'verification', 'pcb.png'), value.pcbImage);
    const report = {
      verifiedAt: new Date().toISOString(),
      template: manifest.template || 'unknown',
      client: { path: cli, version },
      project,
      pages: value.pages,
      pcbs: value.pcbs,
      schDesignators: value.schDesignators,
      pcbDesignators: value.pcbDesignators,
      pads: value.pads,
      nets: value.nets,
      trackLengths: value.trackLengths
    };
    fs.writeFileSync(path.join(packageDir, 'verification', 'result.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ ok: true, project, clientVersion: version, ...report }, null, 2));
  } finally {
    try {
      runCli(cli, ['session', 'close', '--session', sessionId, '--destroy', 'true']);
    } catch {
      // The session may already be closed after a failed render.
    }
    tryRunCli(cli, ['stop']);
    cleanupTemp(temp);
  }
}

main().catch((error) => {
  console.error(`验证失败：${error.stack || error.message}`);
  process.exitCode = 1;
});
