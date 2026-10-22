# 嘉立创硬件 Agent

把一句话硬件需求，变成可在**嘉立创 EDA 专业版 V4.1+** 打开并验证的 `.eprj3` 工程包。

```text
说想法 → 澄清需求 → 选方案 → 真实生成 .eprj3 → 格式校验 → 客户端回读验证 → 下载 ZIP
```

> **这是链路验证版本，不是可直接生产的设计。**
> 不含 Gerber、CPL、外壳 CAD、固件，未做 DRC/DFM，不承诺电气正确性和量产可制造性。

## 快速开始

需要 Node.js 18+，无需安装任何 npm 依赖。

```powershell
git clone <仓库地址>
cd 嘉立创agent
npm test          # 20 项本地测试 + 121 项上游测试
npm run wizard    # 打开 http://127.0.0.1:7788
```

浏览器打开 **http://127.0.0.1:7788**（不要直接双击 HTML 文件，页面需要本地服务）。

## 五步向导

| 步骤 | 你做什么 | 系统做什么 |
|---|---|---|
| 1 | 说想做什么 | 匹配已验证电路 |
| 2 | 回答 3 个问题 | 每题都有「按推荐方案」兜底 |
| 3 | 选方案 | 展示真实器件、网络和零件用途 |
| 4 | 确认 | 显示 BOM 和电路工作原理 |
| 5 | 下载 | 真实生成 9 个文件，跑两次 `validate.js` |

界面面向不懂硬件的普通用户：日常语言提问，零件用中文名并说明「做什么用」，工程符号收在折叠区。右上角可切简单/专业模式。

**向导不做假动画**：每一步都调用真实生成器，无法满足的需求会明确说明，不会静默套用模板或生成占位文件。

## 命令行

```powershell
npm run generate:led    # 5V LED 指示灯板
npm run generate:rc     # RC 低通滤波器板
npm run verify:client   # 真实客户端回读验证（需要嘉立创 EDA V4.1+）
npm run check:browser   # 浏览器级验收，逐步截图
```

## 支持的模板

| 模板 | 需求关键词 | 电路 |
|---|---|---|
| `5v-led-indicator` | `5V`、`LED`、`指示灯` | 5V -> TP1/R1 -> D1 -> TP2/GND |
| `rc-low-pass-filter` | `RC`、`低通`、`滤波` | TP1 -> R1 -> TP2，C1 对地，TP3 为 GND |

## 数据契约

`contracts/jsonschema/` 下有 3 个 JSON Schema，由 `src/schema.js`（零依赖、fail-closed 校验器）在运行时强制校验：

| 契约 | 作用 |
|---|---|
| `IdeaBrief` | 用户原话与已识别约束，未命中模板时 `templateId` 为 `null` |
| `SolutionOption` | 一套实现路线，`canGenerate=false` 时必须带理由 |
| `VerificationBundle` | 验证证据与 `deliveryStatus` 分级 |

交付等级五级：`concept_pack` → `engineering_preview` → `prototype_build_pack` → `verified_product_pack` → `production_release`。

**自动化最高只能声明 `engineering_preview`**，传更高等级会直接抛错。每次生成写出 `verification.json`：未实现的能力标 `not_run`，人工项标 `manual_required`，不允许把没做的事标成 `pass`。

## 项目结构

```text
src/generate.js        工程生成核心（可复用模块 + CLI）
src/wizard.js          五步向导服务端（零依赖 node:http）
src/wizard/index.html  向导界面
src/schema.js          JSON Schema 校验器（fail-closed）
src/delivery.js        交付等级与检查清单
src/verify-client.js   嘉立创客户端回读验证
contracts/jsonschema/  3 个数据契约
vendor/                上游 easyeda-eprj3-skill（MIT，未修改）
docs/                  PRD 差距分析、验证记录、演示手册
```

## 客户端验收

需要嘉立创 EDA 专业版 V4.1+，默认查找 `D:\lceda-pro-4.1.71\lceda-pro.exe`：

```powershell
$env:LCEDA_CLI = 'D:\lceda-pro-4.1.71\lceda-pro.exe'
npm run verify:client
```

> 如果终端里存在 `ELECTRON_RUN_AS_NODE=1`（部分 Electron 工具会注入），
> `lceda-pro.exe` 会被当成 Node 解释器并报 `Cannot find module`。
> 先执行 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。

## 当前边界

- 只支持两个固定模板，不支持任意硬件需求
- 不生成 Gerber、CPL、外壳 CAD、固件
- 不映射真实 LCSC 料号
- 未执行正式 DRC/DFM 和实际打样
- 不承诺电气正确性和量产可制造性

## 许可

MIT。`vendor/` 下第三方代码保留其原有 MIT 许可证，详见 [LICENSE](LICENSE)。
