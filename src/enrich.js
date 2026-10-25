'use strict';

// 把器件参数（数值 / 型号 / 料号）写进原理图文件。
//
// 为什么要有这一层：上游 add-symbol.js 只能放"符号 + 封装"，写不进 Value、MPN、
// 料号，所以客户端导出的 BOM 里 Value 和 Supplier Part 全是空的。这里在生成完成
// 后补 ATTR 记录（一行一个"字段=值"），客户端打开后 BOM 就能读出真实参数。
//
// 设计约束：
// - 只做最小改动：不重排、不删除已有记录，已有同名 ATTR 用"改值"而不是"再加一条"，
//   否则客户端会报 ATTRMATCHCODE（属性与器件不一致）。
// - 不静默通过：schematic 里有器件在 parts 里找不到，直接抛错。
// - 可复现：ATTR 的 id 由 (parentId, key) 哈希得到，同一份输入生成同样的 id。

const crypto = require('node:crypto');
const fs = require('node:fs');

// 一个器件要写哪些字段，顺序固定。
function attrPairs(part) {
  const pairs = [];
  if (part.value) pairs.push(['Value', part.value]);
  if (part.mpn) pairs.push(['Manufacturer Part', part.mpn]);
  if (part.manufacturer) pairs.push(['Manufacturer', part.manufacturer]);
  if (part.lcsc) {
    pairs.push(['Supplier Part', part.lcsc]);
    pairs.push(['Supplier', 'LCSC']);
  }
  if (part.description) pairs.push(['Description', part.description]);
  return pairs;
}

function stableId(parentId, key) {
  return crypto.createHash('sha1').update(`${parentId}|${key}`).digest('hex').slice(0, 16);
}

// 一行两种写法：{"type":"ATTR",...}||{...payload...}|
// 用 "}||{" 定位分隔点，避免把 payload 里出现的 "||" 当成结构分隔符。
function splitRecord(line) {
  const start = line.indexOf('{"type":"');
  if (start < 0) return null;
  const boundary = line.indexOf('}||{', start);
  if (boundary < 0) return null;
  const headRaw = line.slice(start, boundary + 1);
  const bodyRaw = line.slice(boundary + 3);
  const trimmed = bodyRaw.endsWith('|') ? bodyRaw.slice(0, -1) : bodyRaw;
  let head;
  let body;
  try {
    head = JSON.parse(headRaw);
    body = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return { head, body, prefix: line.slice(0, start), suffix: line.endsWith('|') ? '|' : '' };
}

function serializeRecord(record) {
  return `${record.prefix}${JSON.stringify(record.head)}||${JSON.stringify(record.body)}${record.suffix}`;
}

function maxTicket(lines) {
  let max = 0;
  for (const line of lines) {
    const match = /"ticket":(\d+)/.exec(line);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/**
 * 给原理图文本补齐器件参数。
 * @param {string} text .esch2 文件内容
 * @param {Array<object>} parts 器件清单（含 refdes / value / mpn / lcsc ...）
 * @returns {{text: string, inserted: number, replaced: number, missing: string[]}}
 */
function enrichSchematicText(text, parts) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  // 1. designator -> parentId，以及每个器件最后一条 ATTR 的行号（新记录插在后面）
  const parentByDesignator = new Map();
  const lastAttrLineByParent = new Map();
  const existingByKey = new Map(); // `${parentId}\u0000${key}` -> 行号

  for (let i = 0; i < lines.length; i += 1) {
    const record = splitRecord(lines[i]);
    if (!record || record.head.type !== 'ATTR') continue;
    const parentId = record.body.parentId;
    if (!parentId) continue;
    lastAttrLineByParent.set(parentId, i);
    if (typeof record.body.key === 'string') {
      existingByKey.set(`${parentId}\u0000${record.body.key}`, i);
      if (record.body.key === 'Designator' && record.body.value) {
        parentByDesignator.set(String(record.body.value).trim(), parentId);
      }
    }
  }

  const missing = [];
  let ticket = maxTicket(lines);
  let inserted = 0;
  let replaced = 0;
  let touched = 0;
  // 行号 -> 需要追加在该行之后的新记录
  const pending = new Map();

  for (const part of parts) {
    const refdes = String(part.refdes || '').trim();
    if (!refdes) throw new Error('parts.json 里有器件缺 refdes');
    const parentId = parentByDesignator.get(refdes);
    if (!parentId) {
      missing.push(refdes);
      continue;
    }
    touched += 1;

    for (const [key, value] of attrPairs(part)) {
      const existingLine = existingByKey.get(`${parentId}\u0000${key}`);
      if (existingLine !== undefined) {
        const record = splitRecord(lines[existingLine]);
        if (record && record.body.value !== value) {
          record.body.value = value;
          lines[existingLine] = serializeRecord(record);
          replaced += 1;
        }
        continue;
      }

      ticket += 1;
      const anchor = lastAttrLineByParent.get(parentId);
      const record = {
        prefix: '',
        suffix: '|',
        head: { type: 'ATTR', ticket, id: stableId(parentId, key) },
        body: {
          x: null,
          y: null,
          rotation: null,
          color: null,
          fontFamily: null,
          fontSize: null,
          fontWeight: null,
          italic: null,
          underline: null,
          strikeout: null,
          align: null,
          key,
          value,
          // 不显示成画布文字：既避免和 R1/Value 标签重叠，也不影响 BOM 读数。
          keyVisible: false,
          valueVisible: false,
          fillColor: null,
          parentId,
          zIndex: 1,
          locked: false
        }
      };
      if (!pending.has(anchor)) pending.set(anchor, []);
      pending.get(anchor).push(serializeRecord(record));
      existingByKey.set(`${parentId}\u0000${key}`, -1);
      inserted += 1;
    }
  }

  if (missing.length) {
    throw new Error(
      `原理图里找不到这些器件，无法写参数：${missing.join(', ')}。` +
      '请检查 parts.json 的 refdes 是否与模板一致。'
    );
  }

  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    output.push(lines[i]);
    const extra = pending.get(i);
    if (extra) output.push(...extra);
  }

  return { text: output.join(eol), inserted, replaced, missing };
}

/**
 * 对工程目录里的原理图文件执行补参数。
 * @param {string} schematicPath P1.esch2 的完整路径
 * @param {Array<object>} parts 器件清单
 */
function applyParts(schematicPath, parts) {
  const before = fs.readFileSync(schematicPath, 'utf8');
  const result = enrichSchematicText(before, parts);
  fs.writeFileSync(schematicPath, result.text, 'utf8');
  return { inserted: result.inserted, replaced: result.replaced };
}

module.exports = { enrichSchematicText, applyParts, attrPairs, splitRecord, stableId };
