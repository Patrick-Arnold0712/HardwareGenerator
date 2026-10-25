# 嘉立创硬件 Agent

将受限硬件需求生成可在嘉立创 EDA 专业版 V4.1+ 打开的 `.eprj3` 工程包。目前只支持 5V LED 指示灯板和 RC 低通滤波器板。

**这是链路验证版本，不是可直接生产的设计。** 规则解析负责选择固定模板，没有接入付费 LLM API。无法满足的需求会明确拒绝，不会生成占位工程。

## 现在到哪一步了

|你关心的事|目前结果|
|---|---|
|能生成LED和RC工程吗|能，在本机独立文件夹里跑通过|
|EDA软件能打开吗|两种模板都能打开，并已保存截图|
|能直接拿去做板吗|还不能，电气检查仍有问题|
|换一台干净电脑也能跑吗|还缺别人实际运行的记录|
|Docker能运行吗|还没有实际运行，只检查了文件范围|
|BOM里有数值和采购编号吗|已经填写部分真实料号，但还没有完成器件全面核对|

已有测试通过不等于电路可靠，也不等于客户已验收。详细记录放在[验证记录](docs/verification.md)。

## 运行旧模板复现

需要 Node.js 18+；本机候选实际使用 Node v24.21.0、npm 11.19.0。核心链路无第三方 npm 依赖，无需 `npm install`。其他版本的环境支持声明不等于逐版本实测。

取得经过文件清单核对的候选源码后，在项目根目录运行：

```powershell
node scripts/reproduce.js
npm test
```

复现脚本顺序执行本地测试、上游测试、LED生成/格式校验、RC生成/格式校验，原始日志和 `summary.json` 写入 `logs/repro-<时间>/`。六步通过证明该次环境的基础链路成功；要满足“他人可从干净环境运行”，还需保留独立操作者、环境与版本记录，不能只看一份 summary。

完整步骤和容器边界见 [复现指南](docs/复现指南.md)。Docker 配置仅经过本次静态范围审阅，尚未实跑；镜像只针对六步基础复现，不提供桌面客户端或所有辅助 npm 命令。

## 向导和命令

```powershell
npm run wizard
npm run generate:led
npm run generate:rc
```

向导地址为 `http://127.0.0.1:7788`，需要本地服务，不能直接双击 HTML。五步流程会真实调用生成器，生成工程、BOM和验证元数据。

额外检查与基础复现分别记录：

```powershell
npm run audit
npm run verify:client
```

两者需要桌面版 LCEDA Pro V4.1+。用 `LCEDA_CLI` 指定实际可执行文件路径；不依赖别人机器的默认安装目录。`verify:client` 会重生成默认输出并管理客户端会话，执行前应保留需留存的产物，并避免同时运行其他客户端任务。回读成功不等于 DRC 通过。

`reproduce.js --with-client` 运行的是额外电气审计；脚本可把已知审计问题记为 warn，即使总退出码为0，也必须查看每步退出码和原始违规，不能宣布全链路电气通过。

本次基线移除了 `library`、`library:build`、`plan:panel` 三个未纳入交付的辅助 npm 入口，相关本地探索文件不随本次同步发布。`check:browser`、`demo*`、`package:client`、`ship` 也未由 BASE 的三条检查全部覆盖：浏览器检查需要额外桌面环境，打包会改输出目录，`ship` 会暂存全部变更并提交推送，未经单独授权不得运行。

## 核对版本时看这里

2026-10-25的BASE-01候选通过了本地27项、上游121项和六步复现。源码清单有1070个文件，SHA256为 `7F330A1E672FEDE8BEF7C34B31BAB516C61C09185B936CE3213F3FB1E0A43653`。该历史验证时的HEAD为 `a031dae`，未包含当时全部工作区源码；它不能单独定位该快照。本次同步版本请使用 `git rev-parse HEAD` 记录，历史测试不冒充本次重新运行。

## 数据和目录

- `src/`：生成器、规则/契约校验、器件参数、向导和客户端回读。
- `test/`、`contracts/jsonschema/`：自动测试与三个 JSON Schema。
- `scripts/reproduce.js`：六步复现；`scripts/audit.js`：电气与BOM审计。
- `vendor/`：保留原版上游及许可证，禁止将实验副本覆盖到此处。

`VerificationBundle` 记录真实检查状态，自动化交付等级最高为 `engineering_preview`；未执行项目不能冒充 pass。生成目录 basename 必须与项目名一致。

当前公开进度见 [项目状态](docs/项目状态.md)。

## 已知缺口

RC临时副本官方同步实验能消除其 Netlist Error，但保存后的文档头会触发原版上游校验器异常；实验补丁尚未接入，原候选没有因此修复。公开问题见 [Issue #2](https://github.com/easyeda/easyeda-eprj3-skill/issues/2) 和[中文补充](https://github.com/easyeda/easyeda-eprj3-skill/issues/2#issuecomment-6396044559)。提交问题不等于上游接受或修复。

不生成 Gerber/CPL、钻孔或外壳CAD，不承诺量产可制造性。ESP32固件与实板实验属于独立后续，不代表生成器已支持 ESP32-S3+BME280 整板，也不影响旧LED/RC本机复现这一受限结论。第三方干净环境验证和客户正式认可仍需单独证据。

## 许可与资料边界

本项目与两份 vendor 仓库保留 MIT 许可证；详见根目录及各 vendor 的 `LICENSE`。独立格式工具可能另有 npm 依赖；顶层零依赖声明仅指核心链路。仓库MIT不自动覆盖客户资料、下载文件或 `license=unknown` 的来源记录。

客户任务书、内嵌计划插件、原始日志截图、实验SDK/vendor副本、构建缓存和交付压缩包不直接纳入Git或Docker上下文。忽略规则不删除已经跟踪的文件；正式版本仍须逐路径审阅，禁止为收尾直接执行 `git add -A`。
