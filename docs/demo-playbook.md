# Demo 演示手册

## 一句话定位

这不是“任意需求全自动设计硬件”的演示，而是“需求进入后，自动产出一个能够在嘉立创 EDA 专业版 V4 中打开、解析、渲染并保留基础 PCB 连通的工程”。

## 演示前检查

1. 确认已安装并激活 `LCEDA Pro V4.1+`；
2. 确认旧版 `V3.2.149` 没有占用项目；
3. 在仓库根目录执行一次：

```powershell
npm test
npm run verify:client
```

两项都通过后，再开始正式演示。

## 一键演示

```powershell
cd E:\程序开发\嘉立创agent
npm run demo
```

脚本会依次：

1. 执行 `npm run generate`；
2. 调用嘉立创 V4 客户端做 headless 真实验证；
3. 打开生成的 `led-indicator.eprj3`；
4. 输出 ZIP 和验证截图路径。

如果只想跳过验证、快速打开：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1 -SkipVerify
```

## 现场展示顺序

### 1. 先讲链路

```text
用户需求
-> Agent 识别固定模板
-> 官方 easyeda-eprj3-skill 生成工程
-> 格式校验
-> 嘉立创 V4 真实解析
-> 导出原理图/PCB 截图和 ZIP
```

### 2. 运行生成

```powershell
npm run generate
```

重点讲解：

- 不是手绘模板；
- 所有工程数据都是由脚本生成的；
- 生成结果包含 `.eprj3`、BOM、README 和 manifest。

### 3. 在客户端展示

双击或使用脚本打开：

`dist\led-indicator\led-indicator.eprj3`

在左侧工程树中依次展示：

- `Schematic1`：查看 `TP1`、`R1`、`D1`、`TP2`、`5V`、`GND`；
- `PCB1`：查看 4 个器件、6 个焊盘和 3 条走线；
- 网络：`5V`、`LED_A`、`GND`。

### 4. 展示验证结果

打开：

`dist\led-indicator\verification\result.json`

说明客户端真实读取结果：

- 原理图页面 1 个；
- PCB 1 个；
- 原理图器件 4 个；
- PCB 器件 4 个；
- PCB 焊盘 6 个；
- 网络 3 个；
- 三条网络长度均大于 0。

同时展示：

- `verification\schematic.png`
- `verification\pcb.png`

### 5. 展示交付包

`dist\led-indicator-eprj3.zip`

说明 ZIP 里包含：

- `.eprj3` 工程；
- BOM；
- README；
- manifest；
- 客户端验证截图和结果。

## 建议话术

“现在展示的是一个受控模板 MVP。用户给出一个受限硬件需求，系统先生成结构化的嘉立创工程，再用嘉立创自己的客户端验证它不是一份假文件，而是真实可解析、可渲染、网络已连通的工程。”

“当前模板只覆盖 5V LED 指示灯板，元件使用通用测试点、电阻和 LED，不做真实 LCSC 料号映射，不生成 Gerber，也不承诺量产正确性。下一步是把模板库、真实器件选型和检查链路扩展成产品能力。”

## 客户可能问的问题

### 能不能设计任意电路？

现在不能。当前只能验证固定模板链路。任意电路需要增加模板库、元器件库和验证规则。

### 能不能直接下单？

当前不能。还没有 Gerber、CPL、DRC/DFM 和真实料号映射，不能承诺直接生产。

### 这是不是只是截图？

不是。`npm run verify:client` 会通过 V4 CLI 打开 headless 会话，读取编辑器 API 中的真实页面、器件、焊盘、网络和走线长度，再导出截图和 JSON 报告。

### 下一步做什么？

按优先级扩展：

1. 增加第二个固定模板；
2. 接入真实 LCSC 器件和封装；
3. 增加 ERC/DRC/DFM；
4. 增加 Gerber/CPL 导出；
5. 再引入自然语言规划和多轮修订。
