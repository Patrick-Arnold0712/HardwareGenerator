# PRD 差距分析（v0.4.0）

- 对照基线：`客户prd/AI-DIY-Hardware-Platform-Product-Design-v0.4.0.docx`（14 章 + 附录 A，16 张表）
- 参考实现：`客户prd/ai-diy-hardware-platform-p0-v0.4.0.zip`（178 个条目）
- 交互基准：`客户prd/Make-Idea-Hardware-Demo.html`（「造物 MAKE」五步原型）
- 当前代码：本仓库 `jlc-hardware-agent` MVP
- 编写日期：2026-10-22

## 0. 一句话结论

客户 PRD 要的是**产品级平台**（一句话想法 → 电子 + 电源 + 外壳 + 固件 + 装配 + 测试 + 两份文档），
本仓库有且只有一个**真实可跑的执行内核**（需求 → `.eprj3` → 客户端回读验证），
而客户给的参考仓库恰好相反：**控制面完整、执行层全空**（连板子都不画）。

因此差距不是"少写了几个功能"，而是**两边各有一半**：

| | 控制面（流程/契约/门禁） | 执行层（真出工程文件） |
|---|---|---|
| 本仓库 | ❌ 几乎没有 | ✅ 真实，121 项上游测试 + 真实客户端回读背书 |
| 参考仓库 | ✅ 完整（23 Schema / S0-S8 / G0-G4） | ❌ `DryRunCompiler` 只写占位文件 |

**结论：不要整体迁移到 Python 参考仓库，也不要重写执行层。** 以本仓库的 Node 执行内核为底座，
按 PRD 补齐控制面与交互层。理由见第 8 节。

## 1. 判定口径

| 标记 | 含义 |
|---|---|
| ✅ 已有 | 已实现且有自动化或真实客户端证据 |
| 🟡 部分 | 有骨架或局部实现，达不到 PRD 要求 |
| ❌ 缺失 | 完全没有 |
| ⛔ 不做 | 明确出界，或 P0 阶段不打算做 |

"已有"必须能指向具体文件或验证记录；文档里的 TODO、空函数、模拟数据一律不算完成。

## 2. 当前已具备的真实能力（差距分析的基线）

| 能力 | 证据 |
|---|---|
| 需求文本 → 模板选择 | `src/generate.js` `selectTemplate()`，规则匹配 |
| 生成 `.eprj3` 工程 | `vendor/easyeda-eprj3-skill`，2 个模板 |
| 格式校验 | 上游 `validate.js`，`0 errors, 0 warning(s)` |
| 真实客户端回读 | `src/verify-client.js` + 嘉立创 EDA 专业版 `V4.1.71.7a7261be` |
| 自动化测试 | 本地 3/3 + 上游 smoke 121/121 |
| 交付物 | `.eprj3` + `sch/` + `pcb/` + `BOM.csv` + `README.md` + `manifest.json` + ZIP |
| 演示 | `demo/index.html`（静态三栏动画）、`recordings/` 7 段录屏 |

客户端实测数据（`dist/*/verification/result.json`）：

| 模板 | 原理图器件 | PCB 器件 | 焊盘 | 网络 | 走线长度 (mil) |
|---|---|---|---|---|---|
| 5V LED | TP1/R1/D1/TP2 | 4 | 6 | 5V, LED_A, GND | 370.3 / 539.2 / 368.9 |
| RC 低通 | TP1/R1/TP2/C1/TP3 | 5 | 7 | FILTER_IN/OUT/GND | 470.3 / 1170.3 / 370 |

## 3. 逐章差距矩阵

### 第 1 章 产品结论与定位

| PRD 要求 | 现状 | 判定 |
|---|---|---|
| 用户描述想法 → 平台生成电子/电源/外壳/固件/装配/测试/文档 | 只有电子子系统的原理图 + PCB | ❌ |
| 先少量追问补齐条件 | 无追问，一次性规则匹配 | ❌ |
| 给出 2–3 套可比较方案 | 无方案卡 | ❌ |
| 超出边界先给可行性说明再转人工 | 直接报错退出（`exit 2`） | 🟡 |

### 第 2 章 目标用户与核心任务

PRD 定义 4 类用户（创意用户 / Maker / 产品与创业团队 / 工程师），并要求 Novice 与 Pro 双模式。
现状：**无用户概念**，只有 CLI 参数。判定 ❌。

### 第 3 章 五步用户旅程

| 步骤 | 系统输出 | 现状 | 判定 |
|---|---|---|---|
| 1 说出想法 | IdeaBrief + 初始风险 | 有 `--input` 文本 | 🟡 |
| 2 回答关键问题 | 可冻结 ProductSpec | 无 | ❌ |
| 3 选择方案 | SolutionOption + 系统框图 | 无 | ❌ |
| 4 预览并调整 | 电子/电源/外壳/固件候选 | 无 | ❌ |
| 5 获取打样包 | PrototypeRelease | 有 ZIP，但无状态分级 | 🟡 |

硬约束（第一屏只有一个必填项、每轮 ≤3 个问题、每个专业问题必须给"我不确定，按推荐方案"）：全部 ❌。

### 第 4 章 极简界面与双模式

| 要求 | 现状 | 判定 |
|---|---|---|
| 5 个页面 × Novice/Pro 双密度 | 无 | ❌ |
| 共用同一 ProductSpec 与版本历史 | 无 | ❌ |
| 自然语言修改 → 变更预览 → 新 Revision | 无 | ❌ |
| 原 Revision 永远可追溯 | 无（每次生成覆盖） | ❌ |

### 第 5 章 产品能力与交付范围（7 个能力域）

| 能力域 | PRD 主要输出 | 现状 | 判定 |
|---|---|---|---|
| 产品定义 | ProductSpec、假设、风险、方案比较 | 无 | ❌ |
| 电子与 PCB | 原理图、PCB、BOM、**CPL、Gerber、STEP** | 原理图/PCB/BOM 有；CPL/Gerber/STEP 无 | 🟡 |
| 电源 | PowerSpec、电源树、预算、保护、测试点 | 无 | ❌ |
| 外壳与机械 | FCStd、STEP、STL、3MF、DXF、爆炸图、紧固件表 | 无 | ❌ |
| 固件 | 源码、锁定依赖、二进制、刷写恢复、测试说明 | 无 | ❌ |
| 集成验证 | VerificationBundle、问题清单、处置记录 | 仅格式校验 + 客户端回读 | 🟡 |
| 交付与制作 | 产品文档、工程文档、原型包、Manifest 与哈希 | Manifest + 哈希已有（`sha256`），两份文档无 | 🟡 |

`dist/` 实测：`*.gbr / *.drl / *.cpl / *.step / *.stl / *.bin / *.uf2` 一个都没有。

### 第 5.1 章 分层交付状态（5 级）

| 状态 | 现状 |
|---|---|
| Concept Pack | 无 |
| Engineering Preview | 🟡 `manifest.json` 的 `limitations[]` 是雏形，但没有状态字段，也没有 UI 呈现 |
| Prototype Build Pack | 无 |
| Verified Product Pack | 无 |
| Production Release | 无 |

判定 ❌。这是**对外承诺的核心防线**，优先级应高于多数功能。

### 第 6 章 P0 支持边界

| PRD 分类 | 现状 | 判定 |
|---|---|---|
| P0 自动支持（USB-C 5V / 认证模组 / I2C·SPI·UART·GPIO·USB2 / 2–4 层 / 3D 打印壳） | 只支持 2 个固定玩具模板 | 🟡 |
| 需人工工程师（充电模块、电机、加热、复杂热设计） | 无分流机制 | ❌ |
| P0 停止自动化（市电、高压、医疗、汽车安全） | 无拦截，只是"匹配不到模板就报错" | 🟡 |

注：现状的"白名单"是隐式的（只认 2 个模板），不是 PRD 要的显式风险分级。

### 第 7 章 方案生成与选择策略

3 条实现路线（现成模块 / 模组+载板 / IC 级定制）、方案卡三取向（最快/均衡/扩展）、
成本必须给区间 + 数量假设 + 数据时间戳、每个方案必须说明扩展空间与锁定点。
现状全部 ❌。参考仓库 `config/component-selection-p0.yaml` 有硬过滤策略可借鉴。

### 第 8 章 开放生态与器件策略

O1–O4 四级准入 + 每项资源分别记录 `tool_license` / `asset_license` / `api_terms` / `redistribution_rights`。
现状 ❌：BOM 的 `LCSC` 列是空的，没有任何许可字段。

参考仓库 `config/approved-product-assets.yaml` + `services/asset_catalog.py` 已有服务端目录实现，可直接借鉴设计。

### 第 9 章 风险分级与人工接管

R0–R3 四级 + 5 条接管触发条件。现状 ❌。

参考仓库 `services/risk_policy.py` + `config/supported-scope.yaml` 有完整实现（`maximum_input_voltage_v: 24`、
`maximum_total_power_w: 30`、`unsupported_for_automatic_release` 列表），这是**最值得优先移植的一块**。

### 第 10 章 Golden Product

PRD 指定 USB-C 桌面温湿度提醒器（65×45×22 mm，RP2040 或 ESP32-C3，含屏幕窗/通风孔/安装柱）。
现状是两个玩具模板，与 Golden Product 无任何关系。判定 ❌。

### 第 11 章 指标与验收（8 项指标）

| 指标 | P0 目标 | 现状 |
|---|---|---|
| 首个有效方案时间 | < 10 分钟 | 未度量 |
| 澄清负担 | ≤ 7 个关键问题 | 无澄清流程 |
| 用户理解率 | 80% 测试用户 | 未度量 |
| 自动覆盖率 | 关键工件 100% 自动生成 | 电子子系统部分满足 |
| 一次装配成功 | 3 个 Golden Product | 无实物 |
| 跨域一致性 | Pin Map/开孔/安装孔/功耗/BOM 无冲突 | 无跨域，无从谈一致性 |
| 可复现性 | 同 Revision 生成相同 Manifest 和哈希 | 🟡 `generatedAt` 时间戳会导致哈希不同，需处理 |
| 发布安全 | 非发布状态无法触发制造写操作 | 无状态机 |

判定 ❌（仅可复现性 🟡，且当前实现并不满足）。

### 第 12–13 章 路线图、团队、商业模式

组织与商业内容，非代码差距。⛔ 不适用。唯一需要注意的是第 13 章"运营的核心资产是经实物验证的
跨域能力库、失败案例、制造反馈"——这决定了长期应建设 **Verified Component / Golden Block /
Product Template 三类可追溯库**，而不是继续堆模板。

### 第 14 章 主要风险（6 条）

| 风险 | 现状缓解 |
|---|---|
| 用户误以为所有产品都能自动完成 | 🟡 README / AGENTS.md 有边界声明 |
| "开源"概念混乱 | ❌ 无许可字段 |
| 外壳与 PCB 装不起来 | ❌ 无外壳 |
| 成本库存过期 | ❌ 无成本数据 |
| 固件能编译但行为不符 | ❌ 无固件 |
| 过早接入一键下单 | ✅ 本仓库完全没有下单能力 |

### 附录 A 页面字段与术语（6 个对象）

`IdeaBrief` / `ProductSpec` / `SolutionOption` / `EngineeringDesign` / `VerificationBundle` /
`PrototypeRelease` —— 现状一个都没有。判定 ❌。

全仓库 grep 不到 `IdeaBrief`、`ProductSpec`、`SolutionOption`、`PrototypeRelease` 任何一个词。

## 4. 数据契约差距

参考仓库有 **23 个 JSON Schema + 17 个校验示例**，本仓库 **0 个**。

| 契约 | 参考仓库 | 本仓库 |
|---|---|---|
| DesignSpec | ✅ 19 KB schema | ❌（`manifest.json` 是自造格式） |
| DesignIR | ✅ | ❌ |
| ElectricalNetlist | ✅ | ❌ |
| BlockManifest | ✅ | ❌ |
| VerificationReport | ✅ | 🟡 `verification/result.json` |
| ReleaseManifest | ✅ | ❌ |
| ProductSpec / PowerSpec / EnclosureSpec / FirmwareSpec | ✅ | ❌ |
| PipelineRunState / 状态机 | ✅ | ❌ |

**这是最大的结构性差距**：没有契约就没有版本、没有门禁、没有可复现性，也无法做跨域一致性检查。

## 5. 技术栈现状

| 项 | 本仓库 | 参考仓库 | 本机 |
|---|---|---|---|
| 语言 | Node.js 18+ | Python 3.12 | Node v24.21.0 / Python 3.12.14 都可用 |
| 依赖 | 0 个 npm 依赖 | fastapi/pydantic/pyyaml/uvicorn | 均**未安装**，无 `.venv` |
| 测试 | `node:test` 3 个 | pytest 20 个文件 | — |
| EDA | EasyEDA Pro `.eprj3`（真实可用） | KiCad 10.0.7（digest `TO_BE_PINNED`，未接） | KiCad **未安装** |

参考仓库的 `config/toolchain-lock.yaml` 中 `kicad.version: "10.0.7"` 但
`container_digest: TO_BE_PINNED_AFTER_IMAGE_BUILD`，`freerouting` 全部为 `TO_BE_SELECTED`。
即参考仓库的 KiCad 链路**从未真正跑通过**。

## 6. 硬冲突项（需要决策）

| # | 冲突 | 说明 |
|---|---|---|
| C1 | `AGENTS.md` 写「不实现 Web UI」，PRD 第 3/4 章要求五步 Web 界面 | 需澄清：禁止的是"产品级 SaaS 界面（用户系统/数据库/多租户）"，还是禁止任何 HTML 界面 |
| C2 | `AGENTS.md` 写「不接入付费 LLM API」，PRD 第 11 章 T1–T5 模型路由 | 当前规则解析可满足 P0 演示；参考仓库也把全部模型绑定设为 `enabled=false` |
| C3 | 参考仓库以 KiCad 为规范 EDA（ADR-0001），本仓库以 EasyEDA Pro 为唯一可验证目标 | 客户 PRD 从未要求 KiCad；`eprj3` 才是本仓库唯一有真实客户端证据的格式 |
| C4 | PRD 要求"一句话想法"自由输入，现状只能匹配 2 个模板 | 自由输入 + 固定模板 = 必须显式降级并说明，否则就是欺骗 |

C1 与 C4 直接影响下一步实现方式，必须先定。

## 7. 明确不做（建议写入边界）

- ⛔ Gerber / CPL / 钻孔文件导出（PRD 第 5 章要求，但 P0 无能力，且 AGENTS.md 已排除）
- ⛔ 自动布线、DRC/DFM 全量检查
- ⛔ 外壳 CAD（FreeCAD/STEP/STL/3MF/DXF）
- ⛔ 固件源码与二进制
- ⛔ 一键下单、报价、支付
- ⛔ 用户系统、数据库、多租户、OIDC
- ⛔ 真实 LCSC 料号与库存

以上若客户坚持，属于**新立项**，不在当前仓库范围内。

## 8. 技术路线建议

**保留 Node 执行内核，按 PRD 补控制面。**

理由：

1. 执行层是最难重建的资产。`.eprj3` 生成 + 121 项上游测试 + 真实客户端回读（含器件/焊盘/网络/走线
   长度实测），参考仓库一个都没有。
2. 参考仓库的 KiCad 链路从未跑通（digest 未固定、无 CLI 证据），迁移过去等于放弃唯一已验证的产出路径。
3. PRD 第 11 章要求"可复现性"，Node 侧零依赖 + 确定性生成更容易达成。
4. 参考仓库的价值在**契约与策略设计**，不在运行时。其 23 个 Schema、风险策略、S0–S8 状态机、
   门禁逻辑可以**按需移植为 Node 实现或 JSON 配置**，不必连 Python 运行时一起搬。

不建议的做法：把 Python 参考仓库直接跑起来当主链路（执行层是空的），或把两套代码库合并（双运行时、双测试栈）。

## 9. 执行顺序建议

按"能对外演示的真实闭环"排序，而不是按 PRD 章节顺序：

| 阶段 | 内容 | 产出 | 状态 |
|---|---|---|---|
| P0-1 | 五步向导垂直切片：想法 → 3 个问题 → 选方案 → 真实生成 → 下载 | 可操作页面 + 真实 `.eprj3` | **进行中** |
| P0-2 | 补齐最小契约：`IdeaBrief` / `SolutionOption` / `VerificationBundle`，并引入 `deliveryStatus` 分级字段 | JSON Schema + 校验 | 待做 |
| P0-3 | 移植风险分级 R0–R3 与显式白名单（参考 `risk_policy.py` / `supported-scope.yaml`） | 拦截规则 + 测试 | 待做 |
| P0-4 | 双模式（Novice/Pro）与 Revision 版本历史 | 版本化存储 | 待做 |
| P0-5 | Golden Product 逼近：新增一个接近"温湿度提醒器"的固定模板 | 第 3 个模板 | 待做 |

**P0-1 是本轮目标**，其余为后续。

## 10. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 把"向导"做成纯前端假动画（如现有 `demo/index.html`） | 客户一眼识破，信任崩塌 | 向导每一步必须调用真实生成器，页面显示真实 manifest 与真实文件 |
| 用"一句话想法"包装固定模板 | 未匹配需求被静默套用模板 | 未匹配时必须显式降级提示，并把用户原话写入需求文本与 manifest |
| 过早承诺外壳/固件 | 交付违约 | 在 UI 与文档中固定标注"当前不含" |
| 无契约就加功能 | 无法回归、无法复现 | P0-2 优先于任何新功能 |

---

**维护约定**：本文件是后续开发的基准。PRD 或代码任一方变化时同步更新，并保持"判定必须可追溯到文件或验证记录"。
