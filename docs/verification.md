# 验证记录

## 真实客户端环境

- 客户端：嘉立创EDA专业版 `V4.1.71.7a7261be`
- 可执行文件：`D:\lceda-pro-4.1.71\lceda-pro.exe`
- 验证方式：`lceda-pro open --path <工程> --headless true`，再通过编辑器 API 读取真实工程状态

旧版 `JLCEDA Pro V3.2.149` 只识别 `.eprj`、`.eprj2`、`.elib`，不能用于 `.eprj3` 验证。

## 已通过

- 本地集成测试：`2/2` 通过；
- 官方 `easyeda-eprj3-skill` 上游测试：`121/121` 通过；
- 工程格式校验：`0 errors, 0 warning(s)`；
- 客户端解析出 `1` 个原理图图页和 `1` 个 PCB；
- 原理图器件：`TP1`、`R1`、`D1`、`TP2`，另有 `5V` 和 `GND` 电源标识；
- PCB 器件：`TP1`、`R1`、`D1`、`TP2`；
- PCB 焊盘：`6` 个；
- PCB 网络：`5V`、`LED_A`、`GND`；
- 网络走线长度：`5V=370.3 mil`、`LED_A=539.2 mil`、`GND=368.9 mil`；
- 客户端导出的原理图和 PCB 渲染图已保存到 `dist/led-indicator/verification/`。

## 复验命令

```powershell
npm test
npm run verify:client
```

`npm run verify:client` 会重新生成工程，调用 V4 CLI 打开 headless 会话，读取真实器件/焊盘/网络/走线数据，并导出验证截图。

如果客户端安装在非默认路径，设置：

```powershell
$env:LCEDA_CLI = 'D:\lceda-pro-4.1.71\lceda-pro.exe'
```

## 尚未覆盖

- 未生成 Gerber；
- 未执行 DRC/DFM 或实际打样；
- 未映射真实 LCSC 料号；
- 不承诺电气正确性和量产可制造性。

当前已证明的是“需求 -> `.eprj3` -> 嘉立创 V4 客户端真实解析并渲染”的链路成立，并且基础网络已经在 PCB 上连通。
