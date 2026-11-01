globalThis.THERM_SNAPSHOT = {
  "version": "public-metadata-20261101-r1",
  "exported_at": "2026-11-01T03:40:51.057Z",
  "records_sha256": "98ce25861eae0764d4e9e2a94eeaa8b8f2c54e16635e2dc1fa8f38674d3c15d1",
  "source_core_sha256": "6824e091ab5ba44260f41d7e4f5ff6ee98fe1fe53622d5044bc19f3418d46eff",
  "notice": "公开元数据快照；不是实时SQLite；第三方原文许可不随项目MIT变更；不包含原文或客户材料",
  "records": [
    {
      "id": "component:bosch:BME280",
      "name": "Bosch BME280 裸芯片（不含GY模块或开发板）",
      "kind": "component",
      "mpn": "BME280",
      "source_url": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
      "source_revision": "BST-BME280-DS001-24 cover revision 1.24 February 2024; driver commit c90d419492e26dd95586598a794e65eb2760753a",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{\"entity_type\":\"bare_sensor_ic\",\"params\":{\"supply_vdd_v\":{\"min\":1.71,\"max\":3.6,\"source\":\"datasheet PDF page 8 Table 1; VDD ripple max 50 mVpp\"}}}"
    },
    {
      "id": "component:diodes:AP2112K-3.3TRG1",
      "name": "Diodes AP2112K-3.3TRG1 3.3V LDO 候选",
      "kind": "component",
      "mpn": "AP2112K-3.3TRG1",
      "source_url": "https://www.diodes.com/datasheet/download/AP2112.pdf",
      "source_revision": "PDF version pending independent page review",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{\"entity_type\":\"power-regulator\",\"params\":{}}"
    },
    {
      "id": "component:gct:USB4085-GF-A",
      "name": "GCT USB4085-GF-A USB-C 插座候选",
      "kind": "component",
      "mpn": "USB4085-GF-A",
      "source_url": "https://gct.co/files/specs/usb4085-spec.pdf",
      "source_revision": "PDF version pending independent page review",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{\"entity_type\":\"usb-c-receptacle\",\"params\":{}}"
    },
    {
      "id": "component:lcsc:C21190",
      "name": "1kΩ ±1% 0.1W 0603 厚膜电阻",
      "kind": "component",
      "mpn": "0603WAF1001T5E",
      "source_url": null,
      "source_revision": null,
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{\"params\":{}}"
    },
    {
      "id": "component:module:GY-BME280",
      "name": "GY-BME280 温湿度/气压模块（型号待实测确认）",
      "kind": "component",
      "mpn": "GY-BME280",
      "source_url": null,
      "source_revision": null,
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{\"params\":{}}"
    },
    {
      "id": "document:espressif:esp-idf-zh",
      "name": "ESP-IDF 编程指南（官方简体中文，ESP32-S3）",
      "kind": "document",
      "mpn": null,
      "source_url": "https://docs.espressif.com/projects/esp-idf/zh_CN/latest/esp32s3/",
      "source_revision": "latest（未固定版本，读到具体章节时要记下页面上的版本号）",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{}"
    },
    {
      "id": "document:espressif:hw-design-guidelines-zh",
      "name": "ESP32-S3 硬件设计指南（官方简体中文）",
      "kind": "document",
      "mpn": null,
      "source_url": "https://docs.espressif.com/projects/esp-hardware-design-guidelines/zh_CN/latest/esp32s3/",
      "source_revision": "latest（未固定版本）",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{}"
    },
    {
      "id": "document:github:esp-labs-web",
      "name": "esp-labs-web：ESP32-S3 实验台教学网站（React）",
      "kind": "document",
      "mpn": null,
      "source_url": null,
      "source_revision": null,
      "license": "none",
      "quality_status": "blocked",
      "reusable": 0,
      "raw_json": "{}"
    },
    {
      "id": "reference_design:espressif:esp32-s3-devkitc-1-v1.1",
      "name": "Espressif ESP32-S3-DevKitC-1 v1.1 官方参考资料",
      "kind": "reference_design",
      "mpn": null,
      "source_url": "https://github.com/espressif/esp-dev-kits/blob/bd4d4ac18657e73583af3d7c0b0a23c3cddf3735/docs/en/esp32-s3-devkitc-1/user_guide_v1.1.rst",
      "source_revision": "ESP32-S3-DevKitC-1 v1.1; esp-dev-kits commit bd4d4ac18657e73583af3d7c0b0a23c3cddf3735; schematic PDF 20221130; PCB layout PDF 20220429",
      "license": "unknown",
      "quality_status": "incomplete",
      "reusable": 0,
      "raw_json": "{}"
    }
  ]
};
