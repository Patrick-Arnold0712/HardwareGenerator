# Demo 演示手册

## 当前定位

这是一个受控模板 MVP，不是“任意硬件全自动设计”。当前支持两个固定模板：

| 模板 | 需求文本 | 电路 |
|---|---|---|
| `5v-led-indicator` | 需求：5V LED 指示灯板 | 5V -> TP1/R1 -> D1 -> TP2/GND |
| `rc-low-pass-filter` | 需求：RC 低通滤波器，输入/输出测试点 | TP1 -> R1 -> TP2，C1 对地，TP3 为 GND |

两个原理图都会在画布中显示需求文本，PCB 都包含器件、焊盘和基础连通走线。

## 演示前检查

```powershell
cd E:\程序开发\嘉立创agent
npm test
npm run verify:client
```

两项都通过后再开始正式演示。

## 模板一：5V LED 指示灯板

```powershell
npm run demo:led
```

演示时查看：

- `Schematic1`：需求文本、`TP1`、`R1`、`D1`、`TP2`、`5V`、`GND`；
- `PCB1`：4 个器件、6 个焊盘、`5V`、`LED_A`、`GND` 三条走线。

## 模板二：RC 低通滤波器板

```powershell
npm run demo:rc
```

演示时查看：

- `Schematic1`：需求文本、`TP1`、`R1`、`TP2`、`C1`、`TP3`、`GND`；
- `PCB1`：5 个器件、7 个焊盘、`FILTER_IN`、`FILTER_OUT`、`GND` 三条网络及对应走线。

## 单独生成和验证

```powershell
npm run generate:led
npm run verify:client:led

npm run generate:rc
npm run verify:client:rc
```

## 客户问答

### 能不能设计任意电路？

不能。当前是固定模板链路验证，后续需要增加模板库、器件库和检查规则。

### 能不能直接下单？

不能。当前没有 Gerber、CPL、DRC/DFM 和真实 LCSC 料号映射。

### 这是不是只是截图？

不是。验证脚本会通过嘉立创 V4 CLI 打开 headless 会话，读取真实页面、器件、焊盘、网络和走线长度，并导出截图和 JSON 报告。

### 下一步做什么？

1. 增加更多固定模板；
2. 接入真实器件和封装；
3. 增加 ERC/DRC/DFM；
4. 增加 Gerber/CPL；
5. 再引入自然语言规划和多轮修订。
