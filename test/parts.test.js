'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { enrichSchematicText, splitRecord } = require('../src/enrich.js');
const PARTS = require('../src/parts.json');

function fixture() {
  return [
    '{"type":"COMPONENT","ticket":1,"id":"c1"}||{"partId":"p1","x":0,"y":0}|',
    '{"type":"ATTR","ticket":2,"id":"a1"}||{"key":"Designator","value":"R1","parentId":"c1"}|',
    '{"type":"ATTR","ticket":3,"id":"a2"}||{"key":"Description","value":"","parentId":"c1"}|',
    ''
  ].join('\n');
}

const R1 = {
  refdes: 'R1',
  value: '1kΩ',
  mpn: '0603WAF1001T5E',
  lcsc: 'C21190',
  manufacturer: 'UNI-ROYAL',
  description: '1kΩ ±1% 0.1W 0603 厚膜电阻'
};

test('parts.json 的每个模板都齐了位号、数值、封装', () => {
  for (const [templateId, parts] of Object.entries(PARTS.templates)) {
    assert.ok(parts.length > 0, `${templateId} 没有器件`);
    for (const part of parts) {
      assert.ok(part.refdes, `${templateId} 有器件缺 refdes`);
      assert.ok(part.value, `${part.refdes} 缺 value`);
      assert.ok(part.footprint, `${part.refdes} 缺 footprint`);
      if (part.assembly !== 'bare_pad') {
        assert.match(part.lcsc || '', /^C\d+$/, `${part.refdes} 的 LCSC 料号格式不对`);
        assert.ok(part.mpn, `${part.refdes} 缺 MPN`);
      }
    }
  }
});

test('补参数会写入 Value、型号、料号，并替换已存在的 Description', () => {
  const result = enrichSchematicText(fixture(), [R1]);
  assert.equal(result.inserted, 5, `插入了 ${result.inserted} 条，期望 5 条（Value/MPN/厂家/料号/供应商）`);
  assert.equal(result.replaced, 1, 'Description 应被替换而不是新增');

  const lines = result.text.split('\n').filter(Boolean);
  const attrs = lines.map(splitRecord).filter((r) => r && r.head.type === 'ATTR').map((r) => r.body);
  const byKey = Object.fromEntries(attrs.map((a) => [a.key, a.value]));

  assert.equal(byKey.Value, '1kΩ');
  assert.equal(byKey['Manufacturer Part'], '0603WAF1001T5E');
  assert.equal(byKey['Supplier Part'], 'C21190');
  assert.equal(byKey.Supplier, 'LCSC');
  assert.equal(byKey.Description, R1.description);
  // 不允许出现重复的 key，否则客户端会报 ATTRMATCHCODE
  assert.equal(attrs.filter((a) => a.key === 'Description').length, 1);
});

test('补参数是幂等的：跑第二次不会再插一遍', () => {
  const once = enrichSchematicText(fixture(), [R1]);
  const twice = enrichSchematicText(once.text, [R1]);
  assert.equal(twice.inserted, 0);
  assert.equal(twice.replaced, 0);
  assert.equal(twice.text, once.text);
});

test('原理图里缺器件时直接报错，不静默跳过', () => {
  assert.throws(
    () => enrichSchematicText(fixture(), [{ refdes: 'R9', value: '1kΩ' }]),
    /找不到这些器件.*R9/s
  );
});
