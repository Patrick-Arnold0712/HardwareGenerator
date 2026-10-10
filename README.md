# 嘉立创硬件 Agent MVP

当前版本验证一条可重复的硬件设计链路：

```text
受限硬件需求 -> 固定模板选择 -> 生成 .eprj3 工程 -> 格式校验 -> 嘉立创 V4 客户端验证 -> ZIP 交付
```

目标不是实现任意硬件全自动设计，而是先证明“需求 -> 工程文件 -> 嘉立创客户端真实解析和渲染”的闭环成立。

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

## 当前边界

- 不支持任意硬件需求；
- 不映射真实 LCSC 料号；
- 未生成 Gerber；
- 未执行正式 DRC/DFM 和实际打样；
- 不承诺电气正确性和量产可制造性。
