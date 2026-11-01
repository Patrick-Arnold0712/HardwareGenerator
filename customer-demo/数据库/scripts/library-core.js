'use strict';

// JSON资料盘点。Node18可用；不在这里加载SQLite，不自动批准工程/许可复用。
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const DEFAULT_ROOT = path.resolve(__dirname, '../library');
const KINDS = { components: 'component', reference_designs: 'reference_design', modules: 'module', documents: 'document', validation: 'validation' };
const STATUSES = ['not_downloaded', 'downloaded', 'verified', 'blocked'];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');
const inside = (root, file) => { const r = path.relative(root, file); return r === '' || (!r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r)); };
const validDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

function containedFile(root, file) {
  const absolute = path.resolve(file);
  if (!inside(root, absolute) || !inside(fs.realpathSync(root), fs.realpathSync(absolute))) throw new Error('文件路径越界或链接指向资料目录以外');
  if (!fs.statSync(absolute).isFile()) throw new Error('路径不是普通文件');
  return absolute;
}

function validateItem(item, inputRoot) {
  const errors = [], gaps = [], warnings = [], dependencies = [];
  const r = item.record;
  const gap = (code, message) => gaps.push({ code, message });
  if (!object(r)) return { errors: [item.parseError || 'metadata必须是JSON对象'], gaps, warnings, dependencies, quality: 'incomplete', reusable: false };
  for (const key of ['id', 'kind', 'name', 'status']) if (!text(r[key])) errors.push(`${key}必须为非空字符串`);
  if (r.kind !== KINDS[item.bucket]) errors.push(`kind与目录不一致：${r.kind}`);
  if (!STATUSES.includes(r.status)) errors.push(`status非法：${r.status}`);
  if (!object(r.source)) errors.push('source必须是对象');
  if (!Array.isArray(r.evidence)) errors.push('evidence必须是数组（暂无证据可用空数组）');
  if (r.files !== undefined && !Array.isArray(r.files)) errors.push('files必须是数组');
  if (r.params !== undefined && !object(r.params)) errors.push('params必须是对象');
  for (const key of ['manufacturer', 'mpn', 'lcsc', 'package', 'notes']) if (r[key] !== undefined && typeof r[key] !== 'string') errors.push(`${key}必须是字符串`);
  const source = object(r.source) ? r.source : {};
  for (const key of ['type', 'url', 'revision', 'retrieved_at', 'license']) if (source[key] !== undefined && source[key] !== null && typeof source[key] !== 'string') errors.push(`source.${key}必须是字符串或null`);
  for (const key of ['source_url', 'source_version', 'license']) if (r[key] !== undefined && r[key] !== null && typeof r[key] !== 'string') errors.push(`${key}必须是字符串或null`);
  function alias(top, nested) {
    if (text(r[top]) && text(source[nested]) && r[top] !== source[nested]) errors.push(`${top}与source.${nested}冲突`);
    return text(r[top]) ? r[top] : source[nested];
  }
  const url = alias('source_url', 'url'), revision = alias('source_version', 'revision'), license = alias('license', 'license');
  if (!text(source.type)) gap('source.type.missing', '未说明资料来源类型');
  if (!text(url)) gap('source.url.missing', '缺少可追溯的原始URL');
  else { try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); } catch { errors.push('来源URL必须是无账号密码的http/https地址'); } }
  if (!text(revision)) gap('source.version.missing', '未记录资料版本');
  const moving = /\b(latest|main|master|head|current|stable)\b|未固定|未归档/i;
  if ((moving.test(String(revision || '')) || moving.test(String(url || ''))) && !/[a-f0-9]{40}/i.test(String(revision || ''))) gap('source.version.unpinned', '来源含latest/分支或未固定说明，尚无固定版本证据');
  if (!text(source.retrieved_at)) gap('source.date.missing', '缺少来源取得日期');
  else if (!validDate(source.retrieved_at)) errors.push('source.retrieved_at不是有效YYYY-MM-DD日期');
  const licenseKey = String(license || '').trim().toLowerCase();
  const licenseStatus = !licenseKey || ['unknown', '未知', '待确认'].includes(licenseKey) ? 'unknown' : ['none', 'unlicensed', 'no license'].includes(licenseKey) ? 'unlicensed' : 'declared_only';
  if (licenseStatus !== 'declared_only') { gap(`license.${licenseStatus}`, '许可未知或未授权，不能据此分发/复用'); warnings.push('许可证尚未确认或未声明授权'); }
  if (r.kind === 'component') for (const key of ['manufacturer', 'mpn', 'package']) if (!text(r[key])) gap(`component.${key}.missing`, `器件缺${key}`);
  if (r.validated_conditions !== undefined && !object(r.validated_conditions) && typeof r.validated_conditions !== 'string') errors.push('validated_conditions必须是对象或历史文字说明');
  if (!object(r.validated_conditions) || Object.keys(r.validated_conditions).length === 0) gap('validated_conditions.missing', '缺少结构化适用/验证条件');
  if (r.modifications !== undefined && !Array.isArray(r.modifications)) errors.push('modifications必须是数组（明确未改动可用[]）');
  if (!Array.isArray(r.modifications)) gap('modifications.missing', '尚未记录修改情况，未改动也需明确声明');
  if (r.verification_evidence !== undefined && !Array.isArray(r.verification_evidence)) errors.push('verification_evidence必须是数组');
  if (!Array.isArray(r.verification_evidence) || r.verification_evidence.length === 0) gap('verification_evidence.missing', '缺少可核查工程验证证据');
  if (!Array.isArray(r.evidence) || r.evidence.length === 0) gap('evidence.empty', '没有历史证据说明');
  const seenFiles = new Set();
  function reference(ref, label, engineering = false) {
    if (!object(ref) || !text(ref.path) || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(ref.sha256)) { errors.push(`${label}需path及64位SHA256`); return; }
    const p = ref.path.replace(/\\/g, '/');
    if (path.isAbsolute(p) || /^[a-z]:|^\/|:|(^|\/)\.\.($|\/)/i.test(p)) { errors.push(`${label}文件路径越界/非法`); return; }
    if (ref.bytes !== undefined && (!Number.isSafeInteger(ref.bytes) || ref.bytes < 0)) { errors.push(`${label}.bytes必须是非负安全整数`); return; }
    try {
      const full = containedFile(item.dir, path.resolve(item.dir, p));
      const bytes = fs.readFileSync(full), hash = sha256(bytes);
      if (hash !== ref.sha256.toLowerCase()) errors.push(`${label}文件哈希不匹配：${p}`);
      if (ref.bytes !== undefined && bytes.length !== ref.bytes) errors.push(`${label}文件大小不匹配：${p}`);
      dependencies.push({ path: relative(inputRoot, full), sha256: hash, bytes: bytes.length });
      if (engineering) {
        if (!text(ref.scope)) gap('verification_evidence.scope.missing', '工程证据未声明适用范围');
        if (!['PASS', 'FAIL', 'UNKNOWN'].includes(ref.result)) gap('verification_evidence.result.missing', '工程证据未声明具体检查结果');
      }
    } catch (error) { errors.push(`${label}文件不可核查：${p}（${error.message}）`); }
  }
  for (const [i, file] of (Array.isArray(r.files) ? r.files : []).entries()) {
    if (object(file) && typeof file.path === 'string') { const p = file.path.replace(/\\/g, '/'); if (seenFiles.has(p)) errors.push('files中重复文件路径'); seenFiles.add(p); }
    reference(file, `files[${i}]`);
  }
  for (const [i, evidence] of (Array.isArray(r.evidence) ? r.evidence : []).entries()) {
    if (typeof evidence === 'string') continue;
    if (object(evidence)) reference(evidence, `evidence[${i}]`); else errors.push('evidence条目需文字或本地文件引用对象');
  }
  for (const [i, evidence] of (Array.isArray(r.verification_evidence) ? r.verification_evidence : []).entries()) {
    if (typeof evidence === 'string') { gap('verification_evidence.text_only', '工程证据仅有文字，尚未关联原始文件'); continue; }
    reference(evidence, `verification_evidence[${i}]`, true);
  }
  if (['downloaded', 'verified'].includes(r.status) && (!Array.isArray(r.files) || r.files.length === 0)) gap('files.missing_for_status', '历史下载/verified状态未关联原始文件');
  return { errors, gaps, warnings, dependencies, source: { type: source.type || null, url: url || null, revision: revision || null, license: license || null, retrieved_at: source.retrieved_at || null }, licenseStatus,
    quality: r.status === 'blocked' ? 'blocked' : gaps.length ? 'incomplete' : 'review_required', reusable: false };
}

function scanLibrary(root = DEFAULT_ROOT) {
  root = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(root).isDirectory()) throw new Error('资料根目录不是目录');
  const items = [];
  for (const bucket of Object.keys(KINDS)) {
    const dir = path.join(root, bucket);
    if (!fs.existsSync(dir)) continue;
    if (!inside(root, fs.realpathSync(dir)) || !fs.statSync(dir).isDirectory()) throw new Error(`资料分类目录越界或非法：${bucket}`);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const recordDir = path.join(dir, entry.name), file = path.join(recordDir, 'metadata.json');
      const item = { bucket, file, dir: recordDir, relativePath: relative(root, file), record: null, metadataSha256: null, metadataBytes: null };
      try { const bytes = fs.readFileSync(containedFile(root, file)); item.metadataSha256 = sha256(bytes); item.metadataBytes = bytes.length; item.record = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
      catch (error) { item.parseError = error.message; }
      Object.assign(item, validateItem(item, root)); items.push(item);
    }
  }
  const ids = new Map();
  for (const item of items) if (item.record && text(item.record.id)) {
    const prior = ids.get(item.record.id);
    if (prior) { item.errors.push(`id重复：${item.record.id}`); prior.errors.push(`id重复：${item.record.id}`); } else ids.set(item.record.id, item);
  }
  const inputs = items.flatMap((i) => [{ path: i.relativePath, sha256: i.metadataSha256, bytes: i.metadataBytes }, ...i.dependencies]).sort((a, b) => a.path.localeCompare(b.path));
  return { root, items, inputs, fingerprint: sha256(Buffer.from(JSON.stringify(inputs))) };
}

function preview(library) {
  const records = library.items.map((i) => ({ id: i.record && i.record.id || null, kind: i.record && i.record.kind || null, name: i.record && i.record.name || null,
    historical_status: i.record && i.record.status || null, quality_status: i.quality, reusable: false, license_status: i.licenseStatus || 'unknown', path: i.relativePath, metadata_sha256: i.metadataSha256,
    source: i.source || null, errors: i.errors, gaps: i.gaps, warnings: i.warnings }));
  return { format: 'HG-library-preview-v1', source_root: library.root, source_fingerprint: library.fingerprint, valid: records.length > 0 && records.every((i) => i.errors.length === 0),
    count: records.length, errors: records.reduce((n, i) => n + i.errors.length, 0), gaps: records.reduce((n, i) => n + i.gaps.length, 0), reusable_count: 0,
    scope: 'metadata/file integrity only; no engineering or license approval; local pre-migration index', records };
}

function assertValid(library) {
  const report = preview(library);
  if (!report.valid) throw new Error(`结构校验未通过，拒绝导入：${report.errors}个错误，${report.count}条记录（空库也不导入）`);
}

function parseArgs(argv) {
  const opts = { command: 'check', root: DEFAULT_ROOT, out: null, db: null };
  let i = 0;
  if (argv[0] && !argv[0].startsWith('--')) { opts.command = argv[0]; i++; }
  for (; i < argv.length; i++) {
    if (argv[i] === '--help') { opts.command = 'help'; continue; }
    const key = { '--root': 'root', '--out': 'out', '--db': 'db' }[argv[i]];
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Object.assign(new Error(`未知参数或缺值：${argv[i]}`), { exitCode: 2 });
    if (opts[`seen_${key}`]) throw Object.assign(new Error(`参数重复：${argv[i]}`), { exitCode: 2 });
    opts[key] = path.resolve(argv[++i]); opts[`seen_${key}`] = true;
  }
  return opts;
}

function outputJson(report, out) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (out) fs.writeFileSync(out, json, { flag: 'wx' });
  process.stdout.write(json);
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.command === 'help') { console.log('check / list / preview [--root library] [--out 新报告.json]\nimport（build别名）--out 新索引.sqlite [--root library]\nverify --db 新索引.sqlite [--root library] [--out 新回查报告.json]\ncheck/list/preview需Node18+；import/verify需支持node:sqlite的Node22+。不会覆盖旧库，不批准复用。'); return; }
  if (!['check', 'list', 'preview', 'import', 'build', 'verify'].includes(opts.command)) throw Object.assign(new Error(`未知命令：${opts.command}`), { exitCode: 2 });
  if (['import', 'build'].includes(opts.command) && !opts.out) throw Object.assign(new Error('必须显式指定 --out 新索引.sqlite；拒绝默认覆盖library/library.sqlite'), { exitCode: 2 });
  if (opts.command === 'verify' && !opts.db) throw Object.assign(new Error('verify需要--db索引路径'), { exitCode: 2 });
  if (opts.db && opts.command !== 'verify') throw Object.assign(new Error('--db仅用于verify'), { exitCode: 2 });
  if (opts.out && ['check', 'list'].includes(opts.command)) throw Object.assign(new Error('check/list不写文件；报告请用preview --out'), { exitCode: 2 });
  const library = scanLibrary(opts.root), report = preview(library);
  if (opts.command === 'preview') { outputJson(report, opts.out); if (!report.valid) process.exitCode = 1; return; }
  if (['check', 'list'].includes(opts.command)) {
    console.table(report.records.map((r) => ({ id: r.id, 历史状态: r.historical_status, 盘点状态: r.quality_status, 缺口: r.gaps.length, 结构错误: r.errors.length, 可复用: false })));
    if (opts.command === 'check') for (const r of report.records) for (const message of [...r.errors, ...r.gaps.map((g) => g.message)]) console.log(`${r.id || r.path}: ${message}`);
    console.log(`记录${report.count}条；结构错误${report.errors}；缺口${report.gaps}；可复用0（本工具不批准复用）`);
    if (!report.valid) process.exitCode = 1; return;
  }
  assertValid(library);
  const index = require('./library-index');
  if (opts.command === 'verify') { const result = index.verifyIndex(library, opts.db); outputJson(result, opts.out); if (!result.valid) process.exitCode = 1; }
  else outputJson(index.importIndex(library, opts.out));
}

module.exports = { scanLibrary, preview, assertValid, validateItem, containedFile, sha256, validDate, parseArgs, main, inside };
