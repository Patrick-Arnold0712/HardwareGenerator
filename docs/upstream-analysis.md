# GitHub 项目复用分析

检索日期：2026-10-10。

## 选型结论

主路线选择官方离线生成工具，不依赖正在运行的 EDA 客户端。

## 候选项目

| 项目 | 结论 | 原因 |
|---|---|---|
| [easyeda/easyeda-eprj3-skill](https://github.com/easyeda/easyeda-eprj3-skill) | 采用 | 直接生成 `.eprj3`，Node.js 18+，MIT，官方示例和冒烟测试完整 |
| [easyeda/easyeda-format-skill](https://github.com/easyeda/easyeda-format-skill) | 采用为格式参考 | 官方格式、JSON Schema 和验证脚本 |
| [zhoushoujianwork/easyeda-agent](https://github.com/zhoushoujianwork/easyeda-agent) | 暂不接入 | 能力完整，但强依赖 EasyEDA Pro 客户端、连接器和 daemon，成本高于当前 MVP |
| [oaslananka/easyeda-mcp-pro](https://github.com/oaslananka/easyeda-mcp-pro) | 排除 | 当前为 PolyForm Noncommercial，商业化需要单独授权 |
| [easyeda/easyeda-viewer](https://github.com/easyeda/easyeda-viewer) | 后续可选 | 可用于浏览器预览，但会让 MVP 增加前端构建和依赖 |
| [edcs/kicad-yaml](https://github.com/edcs/kicad-yaml) | 排除 | 依赖 KiCad 10，项目较新，且仍需处理到嘉立创格式的转换 |
| [circuit-synth/kicad-sch-api](https://github.com/circuit-synth/kicad-sch-api) | 排除 | 主要面向 KiCad 7/8，不能直接保证嘉立创导入 |
| [uPesy/easyeda2kicad.py](https://github.com/uPesy/easyeda2kicad.py) | 排除 | AGPL-3.0，且只负责元件库转换，不负责工程生成 |

## 上游使用约束

`easyeda-eprj3-skill` 的后续脚本通过目录 basename 查找 `<name>.eprj3`。因此 `init.js --name` 必须与项目目录 basename 一致，否则 `add-symbol.js`、`add-wire.js` 等会查找错误的索引文件。

本项目的生成器固定使用：

```text
<package-dir>/<project-name>/<project-name>.eprj3
```

## 已知风险

- 当前宿主未安装 EasyEDA Pro，无法完成真实客户端打开验证；
- 官方脚本解决的是文件格式和结构，不保证电路本身正确或可制造；
- 当前模板只使用内置通用符号和封装，不映射真实 LCSC 料号；
- 后续如需复杂器件、数据手册解析、真实选型或自动布线，应切换到 `easyeda-agent` 或单独立项。
