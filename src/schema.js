'use strict';

// 零依赖 JSON Schema 校验器（draft 2020-12 的受限子集）。
//
// 设计原则：fail-closed。
// - 只支持本仓库 contracts/jsonschema 实际用到的关键字；
// - 遇到未知关键字直接抛错，而不是静默放行；
// - 校验结果给出可读的路径，方便定位。

const SUPPORTED = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'const', 'enum', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'required', 'additionalProperties',
  'properties', 'items', 'minItems', 'anyOf', 'format'
]);

class SchemaError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.path = path || '';
  }
}

/**
 * Schema 自身有问题（未知关键字、坏的 $ref、超范围用法）。
 * 与"数据不合规"是两类错误：前者必须让流程失败，不能被当成校验不通过而静默吞掉。
 */
class SchemaDefinitionError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.path = path || '';
  }
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new SchemaDefinitionError(`只支持本地 $ref，收到：${ref}`);
  const parts = ref.slice(2).split('/');
  let node = root;
  for (const rawPart of parts) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!node || typeof node !== 'object' || !(part in node)) {
      throw new SchemaDefinitionError(`无法解析 $ref：${ref}`);
    }
    node = node[part];
  }
  return node;
}

function assertKnownKeywords(schema, path) {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) {
      // 这是 Schema 自身的问题（写错了或用了没实现的特性），
      // 不是数据不合规，必须直接抛出而不是当作校验失败。
      throw new SchemaDefinitionError(`不支持的 Schema 关键字 "${key}"（fail-closed）`, path);
    }
  }
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function validateNode(root, schema, value, path) {
  assertKnownKeywords(schema, path);

  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref);
    return validateNode(root, target, value, path);
  }

  if (schema.anyOf) {
    const errors = [];
    for (const branch of schema.anyOf) {
      try {
        validateNode(root, branch, value, path);
        return [];
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new SchemaError(`不满足 anyOf 的任一分支（${errors.join('；')}）`, path);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      throw new SchemaError(`期望类型 ${types.join('|')}，实际 ${typeOf(value)}`, path);
    }
  }

  if ('const' in schema && value !== schema.const) {
    throw new SchemaError(`期望常量 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`, path);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    throw new SchemaError(`期望取值之一 ${schema.enum.join(' | ')}，实际 ${JSON.stringify(value)}`, path);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new SchemaError(`长度 ${value.length} 小于最小长度 ${schema.minLength}`, path);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      throw new SchemaError(`长度 ${value.length} 大于最大长度 ${schema.maxLength}`, path);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      throw new SchemaError(`不匹配模式 ${schema.pattern}`, path);
    }
    if (schema.format === 'date-time' && !DATE_TIME.test(value)) {
      throw new SchemaError('不是合法的 date-time', path);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new SchemaError(`数值 ${value} 小于最小值 ${schema.minimum}`, path);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new SchemaError(`数值 ${value} 大于最大值 ${schema.maximum}`, path);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new SchemaError(`数组长度 ${value.length} 小于最小 ${schema.minItems}`, path);
    }
    if (schema.items) {
      value.forEach((item, index) => validateNode(root, schema.items, item, `${path}[${index}]`));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) throw new SchemaError(`缺少必填字段 "${key}"`, path);
      }
    }
    const props = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) {
        validateNode(root, props[key], child, `${path}.${key}`);
      } else if (schema.additionalProperties === false) {
        throw new SchemaError(`不允许的额外字段 "${key}"`, path);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(root, schema.additionalProperties, child, `${path}.${key}`);
      }
    }
  }

  return [];
}

/**
 * 校验一个值是否符合给定 Schema。
 * @param {object} schema 已解析的 Schema 对象
 * @param {unknown} value 待校验的值
 * @returns {{valid: boolean, errors: string[]}}
 * @throws {SchemaDefinitionError} Schema 自身不合法时抛出，不会被当成校验失败
 */
function validate(schema, value) {
  try {
    validateNode(schema, schema, value, '$');
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof SchemaError) return { valid: false, errors: [error.message] };
    throw error;
  }
}

function assertValid(schema, value, label) {
  const result = validate(schema, value);
  if (!result.valid) {
    const name = label || schema.title || 'value';
    throw new SchemaError(`${name} 校验失败：\n  ${result.errors.join('\n  ')}`, '$');
  }
  return value;
}

module.exports = { validate, assertValid, SchemaError, SchemaDefinitionError, SUPPORTED };
