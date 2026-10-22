'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validate, assertValid, SchemaError, SchemaDefinitionError } = require('../src/schema.js');
const delivery = require('../src/delivery.js');

const SCHEMA_DIR = path.join(__dirname, '..', 'contracts', 'jsonschema');

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${name}.schema.json`), 'utf8'));
}

const IDEA_BRIEF = loadSchema('idea-brief');
const SOLUTION_OPTION = loadSchema('solution-option');
const VERIFICATION_BUNDLE = loadSchema('verification-bundle');

test('契约：三个 Schema 文件都存在且可解析', () => {
  for (const name of ['idea-brief', 'solution-option', 'verification-bundle']) {
    const file = path.join(SCHEMA_DIR, `${name}.schema.json`);
    assert.ok(fs.existsSync(file), `${name}.schema.json 应存在`);
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(schema.type, 'object');
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0, `${name} 应有必填字段`);
  }
});

test('契约：IdeaBrief 接受合法输入，拒绝缺字段与超长', () => {
  const ok = {
    schemaVersion: '1.0',
    projectId: 'led-indicator',
    ideaText: '我想做一个 5V LED 指示灯板',
    inputMode: 'novice',
    templateId: '5v-led-indicator',
    knownConstraints: { supply: '5V', budget: 300 },
    createdAt: new Date().toISOString()
  };
  assert.equal(validate(IDEA_BRIEF, ok).valid, true);

  // 缺 projectId
  const missing = { ...ok };
  delete missing.projectId;
  assert.equal(validate(IDEA_BRIEF, missing).valid, false);

  // ideaText 超过 600
  assert.equal(validate(IDEA_BRIEF, { ...ok, ideaText: 'x'.repeat(601) }).valid, false);

  // templateId 允许 null（未命中模板时必须能表达）
  assert.equal(validate(IDEA_BRIEF, { ...ok, templateId: null }).valid, true);

  // 额外字段必须被拒绝
  assert.equal(validate(IDEA_BRIEF, { ...ok, extra: 1 }).valid, false);

  // 非法 inputMode
  assert.equal(validate(IDEA_BRIEF, { ...ok, inputMode: 'expert' }).valid, false);
});

test('契约：SolutionOption 的 canGenerate=false 必须带理由', () => {
  const base = {
    id: 'unsupported',
    kind: 'unsupported',
    title: '自定义电路',
    subtitle: '不套用任何已验证模板',
    circuit: null,
    circuitPlain: null,
    designators: [],
    nets: [],
    parts: 0,
    canGenerate: false,
    reason: '当前版本没有通用电路编译器。',
    unmet: []
  };
  assert.equal(validate(SOLUTION_OPTION, base).valid, true);

  // reason 为空字符串必须被拒绝
  assert.equal(validate(SOLUTION_OPTION, { ...base, reason: '' }).valid, false);

  // 缺 reason
  const noReason = { ...base };
  delete noReason.reason;
  assert.equal(validate(SOLUTION_OPTION, noReason).valid, false);

  // parts 为负
  assert.equal(validate(SOLUTION_OPTION, { ...base, parts: -1 }).valid, false);

  // unmet 结构错误
  assert.equal(validate(SOLUTION_OPTION, { ...base, unmet: [{ id: 'x' }] }).valid, false);
});

test('契约：VerificationBundle 的 sha256 必须是 64 位小写十六进制', () => {
  const base = {
    schemaVersion: '1.0',
    projectId: 'led-indicator',
    templateId: '5v-led-indicator',
    deliveryStatus: 'engineering_preview',
    generatedAt: new Date().toISOString(),
    checks: [{
      id: 'format.validate',
      title: '格式校验',
      status: 'pass',
      automated: true
    }],
    artifacts: [{ path: 'a.eprj3', bytes: 10, sha256: 'a'.repeat(64) }],
    limitations: ['链路验证版本']
  };
  assert.equal(validate(VERIFICATION_BUNDLE, base).valid, true);

  // 短哈希
  assert.equal(validate(VERIFICATION_BUNDLE, {
    ...base,
    artifacts: [{ path: 'a.eprj3', bytes: 10, sha256: 'abc' }]
  }).valid, false);

  // 大写哈希
  assert.equal(validate(VERIFICATION_BUNDLE, {
    ...base,
    artifacts: [{ path: 'a.eprj3', bytes: 10, sha256: 'A'.repeat(64) }]
  }).valid, false);

  // limitations 不能为空
  assert.equal(validate(VERIFICATION_BUNDLE, { ...base, limitations: [] }).valid, false);

  // 非法交付等级
  assert.equal(validate(VERIFICATION_BUNDLE, { ...base, deliveryStatus: 'production' }).valid, false);
});

test('契约：自动化不能越级声明交付状态', () => {
  assert.equal(delivery.AUTOMATION_CEILING, 'engineering_preview');
  assert.equal(delivery.assertAutomationCeiling('concept_pack'), 'concept_pack');
  assert.equal(delivery.assertAutomationCeiling('engineering_preview'), 'engineering_preview');

  for (const level of ['prototype_build_pack', 'verified_product_pack', 'production_release']) {
    assert.throws(
      () => delivery.assertAutomationCeiling(level),
      /自动化不能声明/,
      `${level} 应被拒绝`
    );
  }
  assert.throws(() => delivery.assertAutomationCeiling('bogus'), /未知交付等级/);
});

test('契约：检查清单不允许把未做的检查标成 pass', () => {
  const checks = delivery.buildChecks({ validatePassed: true, clientVerified: false });

  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(byId['format.validate'].status, 'pass');
  assert.equal(byId['client.parse'].status, 'not_run', '未跑客户端时必须 not_run');

  // 未实现的能力必须显式标 not_run / manual_required
  for (const id of ['electrical.drc', 'manufacturing.files', 'enclosure.cad', 'firmware.build', 'supply_chain.lcsc']) {
    assert.equal(byId[id].status, 'not_run', `${id} 应为 not_run`);
  }
  assert.equal(byId['physical.first_article'].status, 'manual_required');

  // 任何 not_run 项都不允许标成 automated
  for (const check of checks) {
    if (check.status === 'not_run' || check.status === 'manual_required') {
      assert.equal(check.automated, false, `${check.id} 未执行却标为 automated`);
    }
  }
});

test('契约：构建出的 bundle 能通过自身 Schema 校验', () => {
  const bundle = delivery.buildVerificationBundle({
    projectId: 'led-indicator',
    templateId: '5v-led-indicator',
    generatedAt: new Date().toISOString(),
    checks: delivery.buildChecks({ validatePassed: true, clientVerified: true }),
    artifacts: [{ path: 'led-indicator.eprj3', bytes: 1706, sha256: 'b'.repeat(64) }],
    limitations: ['链路验证版本，不保证可直接生产']
  });
  assertValid(VERIFICATION_BUNDLE, bundle, 'VerificationBundle');
  assert.equal(bundle.deliveryStatus, 'engineering_preview');
});

test('契约：校验器遇到不支持的 Schema 关键字时 fail-closed', () => {
  const weird = { type: 'object', properties: {}, oneOfSomething: [] };
  assert.throws(() => validate(weird, {}), SchemaDefinitionError);
  assert.throws(() => validate(weird, {}), /不支持的 Schema 关键字/);

  // 关键：Schema 自身有问题时不能被当成"数据不合规"返回 valid:false，
  // 否则调用方会误以为只是数据错了，继续带着坏 Schema 往下跑。
  let result;
  try {
    result = validate(weird, {});
  } catch (error) {
    assert.ok(error instanceof SchemaDefinitionError);
  }
  assert.equal(result, undefined);
});

test('契约：生成物必须带 verification.json，且哈希清单口径自洽', () => {
  const os = require('node:os');
  const { generate } = require('../src/generate.js');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jlc-contract-gen-'));
  try {
    const result = generate({
      help: false,
      input: '5V LED 指示灯板',
      inputFile: null,
      template: '5v-led-indicator',
      out: root,
      name: 'led-indicator',
      force: true
    }, path.join(__dirname, '..'));

    const bundlePath = path.join(result.packageDir, 'verification.json');
    assert.ok(fs.existsSync(bundlePath), '必须产出 verification.json');

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    assertValid(VERIFICATION_BUNDLE, bundle, '生成的 VerificationBundle');
    assert.equal(bundle.deliveryStatus, 'engineering_preview');

    // 磁盘文件 = 清单条目 + manifest.json + verification.json
    const onDisk = fs.readdirSync(result.packageDir, { recursive: true })
      .filter((f) => fs.statSync(path.join(result.packageDir, f)).isFile());
    assert.equal(
      onDisk.length,
      bundle.artifacts.length + 2,
      '清单不应包含自身，但磁盘文件数应恰好等于清单数 + 2'
    );

    // 清单里每个哈希都必须是真实哈希
    const crypto = require('node:crypto');
    for (const item of bundle.artifacts) {
      const actual = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(result.packageDir, item.path)))
        .digest('hex');
      assert.equal(item.sha256, actual, `${item.path} 哈希不符`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
