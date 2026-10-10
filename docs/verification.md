# 验证记录

## 真实客户端环境

- 客户端：嘉立创EDA专业版 `V4.1.71.7a7261be`
- 可执行文件：`D:\lceda-pro-4.1.71\lceda-pro.exe`
- 验证方式：`lceda-pro open --path <工程副本> --headless true`，通过编辑器 API 读取真实工程状态

旧版 `JLCEDA Pro V3.2.149` 只识别 `.eprj`、`.eprj2`、`.elib`，不能用于 `.eprj3` 验证。

## 已通过

- 本地集成测试：`3/3` 通过；
- 官方 `easyeda-eprj3-skill` 上游测试：`121/121` 通过；
- 两个模板均通过工程格式校验：`0 errors, 0 warning(s)`；
- 两个模板均在嘉立创 V4 客户端中真实解析并导出截图。

### 5V LED 指示灯板

- 原理图器件：`TP1`、`R1`、`D1`、`TP2`
- PCB 器件：4 个
- PCB 焊盘：6 个
- 网络：`5V`、`LED_A`、`GND`
- 走线长度：`370.3 mil`、`539.2 mil`、`368.9 mil`
- 验证路径：`dist/led-indicator/verification/`

### RC 低通滤波器板

- 原理图器件：`TP1`、`R1`、`TP2`、`C1`、`TP3`
- PCB 器件：5 个
- PCB 焊盘：7 个
- 网络：`FILTER_IN`、`FILTER_OUT`、`GND`
- 走线长度：`470.3 mil`、`1170.3 mil`、`370 mil`
- 验证路径：`dist/rc-low-pass-filter/verification/`

## 复验命令

```powershell
npm test
npm run verify:client
```

也可以单独验证：

```powershell
npm run verify:client:led
npm run verify:client:rc
```

如果客户端安装在非默认路径，设置：

```powershell
$env:LCEDA_CLI = 'D:\lceda-pro-4.1.71\lceda-pro.exe'
```

## 尚未覆盖

- 未生成 Gerber；
- 未执行 DRC/DFM 或实际打样；
- 未映射真实 LCSC 料号；
- 不承诺电气正确性和量产可制造性。

当前已证明的是“需求 -> `.eprj3` -> 嘉立创 V4 客户端真实解析并渲染”的链路成立，并且两个模板的基础网络都已经在 PCB 上连通。
