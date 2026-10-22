# 嘉立创硬件 Agent MVP

当前版本验证一条可重复的硬件设计链路：

```text
受限硬件需求 -> 固定模板选择 -> 生成 .eprj3 工程 -> 格式校验 -> 嘉立创 V4 客户端验证 -> ZIP 交付
```

目标不是实现任意硬件全自动设计，而是先证明“需求 -> 工程文件 -> 嘉立创客户端真实解析和渲染”的闭环成立。

## 五步向导

除了命令行，还提供一个本地网页向导，把上面的链路包成「说出想法 → 澄清需求 → 选择方案 → 预览确认 → 获取工程包」五步：

```powershell
npm run wizard
# 打开 http://127.0.0.1:7788
```

向导的每一步都调用真实生成器，不是前端假动画：

- 澄清阶段每轮最多 3 个问题，每题都有「我不确定，按推荐方案」；
- 无法满足的要求（如非 5V 供电、去掉测试点）会显式列出，不会静默忽略；
- 需求没命中模板时会明确提示降级，不会悄悄套用模板；
- 选「自定义电路」会被拒绝并说明边界，不生成占位文件；
- 生成阶段真实调用上游脚本，跑两次 `validate.js`，产出 7 个文件并支持下载 ZIP / `.eprj3`。

边界说明见 [docs/prd-gap-analysis.md](docs/prd-gap-analysis.md)。

## 固定模板

| 模板 | 需求关键词 | 电路 |
|---|---|---|
| `5v-led-indicator` | `5V`、`LED`、`指示灯` | 5V -> TP1/R1 -> D1 -> TP2/GND |
| `rc-low-pass-filter` | `RC`、`低通`、`滤波` | TP1 -> R1 -> TP2，C1 对地，TP3 为 GND |

两个模板都包含：

- 原理图需求文本；
- 器件、网络和测试点；
- PCB 器件、焊盘和基础连通走线；
- BOM、manifest、验证截图和 ZIP。

## 使用

```powershell
npm test
npm run wizard
npm run generate:led
npm run generate:rc
npm run verify:client
```

单独验证：

```powershell
npm run verify:client:led
npm run verify:client:rc
```

现场演示：

```powershell
npm run demo:led
npm run demo:rc
```

完整话术和展示顺序见 [docs/demo-playbook.md](docs/demo-playbook.md)。

直接指定模板和需求：

```powershell
node src/generate.js --template 5v-led-indicator --input "5V LED 指示灯板" --out dist --force
node src/generate.js --template rc-low-pass-filter --input "RC 低通滤波器，输入输出测试点" --out dist --force
node src/generate.js --template list
```

## 输出结构

```text
dist/
├── led-indicator/
│   ├── led-indicator.eprj3
│   ├── sch/
│   ├── pcb/
│   ├── BOM.csv
│   ├── README.md
│   ├── manifest.json
│   └── verification/
└── rc-low-pass-filter/
    ├── rc-low-pass-filter.eprj3
    ├── sch/
    ├── pcb/
    ├── BOM.csv
    ├── README.md
    ├── manifest.json
    └── verification/
```

## 客户端验收

客户端自动验收需要嘉立创 EDA 专业版 V4.1+。默认查找：

`D:\lceda-pro-4.1.71\lceda-pro.exe`

如果安装在其他位置，设置：

```powershell
$env:LCEDA_CLI = 'D:\lceda-pro-4.1.71\lceda-pro.exe'
```

`npm run verify:client` 会分别打开两个模板的 headless 会话，读取真实页面、器件、焊盘、网络和走线长度，并导出截图。

> 注意：如果你的终端里存在 `ELECTRON_RUN_AS_NODE=1`（部分 Electron 工具会注入），
> `lceda-pro.exe` 会被当成 Node 解释器执行并报 `Cannot find module`。
> 先执行 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 再跑验收。

向导页面的浏览器级验收（可选，需要本机有 Edge）：

```powershell
node scripts/wizard-browser-check.js
```

会驱动真实浏览器走完五步并逐步截图到 `dist/wizard-steps/`。

## 当前边界

- 只支持两个固定模板，不支持任意硬件需求；
- 不生成 Gerber、CPL、外壳 CAD、固件；
- 不映射真实 LCSC 料号；
- 未执行正式 DRC/DFM 和实际打样；
- 不承诺电气正确性和量产可制造性。

完整的 PRD 对照与后续计划见 [docs/prd-gap-analysis.md](docs/prd-gap-analysis.md)。
