# 嘉立创硬件 Agent MVP

当前版本只验证一条链路：

```text
受限硬件需求 -> 固定模板选择 -> 官方 easyeda-eprj3-skill -> 格式校验 -> ZIP
```

目标不是实现全自动硬件设计，而是先证明可以生成一个由 EasyEDA Pro V4.1+ 打开的 `.eprj3` 工程。

## 支持范围

当前只支持：

> 5V LED 指示灯小板：5V -> 电阻 -> LED -> GND。

输入中包含 `5V`/`5伏` 和 `LED`/`指示灯` 即可生成。其他需求会明确拒绝，不猜测、不编造。

## 使用

```powershell
npm test
npm run generate
```

也可以指定输入和输出目录：

```powershell
node src/generate.js --input "5V LED 指示灯板" --out dist --force
```

生成结果：

```text
dist/
├── led-indicator/
│   ├── led-indicator.eprj3
│   ├── sch/
│   ├── pcb/
│   ├── BOM.csv
│   ├── README.md
│   └── manifest.json
└── led-indicator-eprj3.zip
```

打开方式：

1. 安装 EasyEDA Pro / 嘉立创 EDA 专业版 V4.1+；
2. 打开 `dist/led-indicator/led-indicator.eprj3`；
3. 检查原理图、PCB 器件和网络；
4. 该版本未做布线、Gerber、LCSC 料号映射和制造正确性验证。

## 验收标准

- `npm test` 通过；
- 上游 `validate.js` 返回 `0 errors`；
- 输出 ZIP 包含完整 `.eprj3` 目录、BOM、说明和 manifest；
- 在 EasyEDA Pro V4.1+ 中实际打开并确认原理图与 PCB 可见；
- 最终文字说明明确注明“链路验证版本，不可直接投产”。

## 复用与许可证

本项目复用：

- [easyeda/easyeda-eprj3-skill](https://github.com/easyeda/easyeda-eprj3-skill)，版本 `1.7.3`，提交 `40c94e129df18e94232f8c94260134bfcac6cabf`，MIT；
- [easyeda/easyeda-format-skill](https://github.com/easyeda/easyeda-format-skill)，提交 `9e42727cc4cf13a8e442140e8e7794ae94d5f41b`，MIT。

上游代码保留在 `vendor/` 中，便于审计和离线运行。详见 `docs/upstream-analysis.md`。
