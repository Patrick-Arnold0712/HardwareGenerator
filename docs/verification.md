# 验证记录

## 已通过

- 本地集成测试：`2/2` 通过；
- 官方 `easyeda-eprj3-skill` 上游测试：`121/121` 通过；
- 生成后的项目执行 `validate.js`：`0 errors, 0 warning(s)`；
- ZIP 已解压检查，包含索引、原理图、PCB、BOM、README 和 manifest；
- `manifest.json` 记录生成参数、上游版本和每个产物的 SHA-256。

## 尚未通过

- 当前宿主没有安装 EasyEDA Pro / 嘉立创 EDA 专业版 V4.1+，因此没有完成真实客户端打开验证；
- 没有进行 ERC、DRC、DFM、Gerber 或实际打样验证；
- 没有映射真实 LCSC 料号。

真实客户端打开是最终验收的硬门槛。客户端验证完成前，对外只能说“格式已生成并通过结构校验”，不能说“已确认可导入并可投产”。
