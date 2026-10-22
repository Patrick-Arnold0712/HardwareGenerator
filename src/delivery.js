'use strict';

// 交付状态与验证证据的构建器。
//
// 关键约束：自动化最高只能声明 engineering_preview。
// 更高的等级必须由人工与实物证据推进，代码里不允许通过参数直接跳级。

const DELIVERY_LEVELS = Object.freeze([
  'concept_pack',
  'engineering_preview',
  'prototype_build_pack',
  'verified_product_pack',
  'production_release'
]);

const AUTOMATION_CEILING = 'engineering_preview';

const LEVEL_LABELS = Object.freeze({
  concept_pack: '概念资料',
  engineering_preview: '工程预览',
  prototype_build_pack: '打样包',
  verified_product_pack: '已验证产品包',
  production_release: '生产发布'
});

/**
 * 自动化只能产出 engineering_preview。
 * 传更高的等级会直接抛错，避免"参数一改就升级"。
 */
function assertAutomationCeiling(level) {
  const index = DELIVERY_LEVELS.indexOf(level);
  if (index === -1) throw new Error(`未知交付等级：${level}`);
  if (index > DELIVERY_LEVELS.indexOf(AUTOMATION_CEILING)) {
    throw new Error(
      `自动化不能声明 ${level}（上限 ${AUTOMATION_CEILING}）。` +
      '更高等级必须由人工与实物证据推进。'
    );
  }
  return level;
}

/**
 * 构建一次生成的标准检查清单。
 * 未执行的检查必须标 not_run，人工项必须标 manual_required，
 * 不允许用 pass 冒充没做的事。
 */
function buildChecks({ validatePassed, clientVerified }) {
  return [
    {
      id: 'format.validate',
      title: '工程文件格式校验通过',
      status: validatePassed ? 'pass' : 'fail',
      automated: true,
      detail: validatePassed
        ? '上游 validate.js 返回 0 errors, 0 warning(s)。'
        : '上游 validate.js 未通过。',
      evidence: ['manifest.json#operations']
    },
    {
      id: 'client.parse',
      title: '嘉立创 EDA 能真实打开并解析',
      status: clientVerified ? 'pass' : 'not_run',
      // 只有真的跑过才能算 automated，否则它只是一个"待执行"的自动化项。
      automated: clientVerified,
      detail: clientVerified
        ? '已通过 V4 客户端 headless 回读器件、焊盘、网络和走线。'
        : '本次未运行客户端验收；需要 npm run verify:client。',
      evidence: clientVerified ? ['verification/result.json'] : []
    },
    {
      id: 'electrical.drc',
      title: 'DRC / DFM 检查',
      status: 'not_run',
      automated: false,
      detail: '当前版本没有接入 DRC/DFM，不能声称电气正确。'
    },
    {
      id: 'manufacturing.files',
      title: 'Gerber / CPL / 钻孔文件',
      status: 'not_run',
      automated: false,
      detail: '当前版本不导出制造文件。'
    },
    {
      id: 'enclosure.cad',
      title: '外壳 CAD',
      status: 'not_run',
      automated: false,
      detail: '当前版本不含外壳设计。'
    },
    {
      id: 'firmware.build',
      title: '固件源码与构建',
      status: 'not_run',
      automated: false,
      detail: '当前版本不含固件。'
    },
    {
      id: 'supply_chain.lcsc',
      title: '真实 LCSC 料号与库存',
      status: 'not_run',
      automated: false,
      detail: 'BOM 未映射真实料号。'
    },
    {
      id: 'physical.first_article',
      title: '首件装配与实测',
      status: 'manual_required',
      automated: false,
      detail: '必须由人工完成并记录证据，自动化无法替代。'
    }
  ];
}

function buildVerificationBundle({ projectId, templateId, generatedAt, checks, artifacts, limitations }) {
  const bundle = {
    schemaVersion: '1.0',
    projectId,
    templateId,
    deliveryStatus: assertAutomationCeiling(AUTOMATION_CEILING),
    generatedAt,
    checks,
    artifacts,
    limitations
  };
  return bundle;
}

module.exports = {
  DELIVERY_LEVELS,
  LEVEL_LABELS,
  AUTOMATION_CEILING,
  assertAutomationCeiling,
  buildChecks,
  buildVerificationBundle
};
