globalThis.ConditionSnapshot = {
  "data": {
    "version": "BME280-conditional-public-r2-20261101-r1",
    "record_id": "component:bosch:BME280",
    "record_revision": "LIB-02H-20261101-r1",
    "source": {
      "url": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
      "revision": "BST-BME280-DS001-24 cover revision 1.24 February 2024",
      "license": "unknown"
    },
    "capture_identity": {
      "date": "2026-11-01",
      "record_version": "LIB-02H-20261101-r1",
      "basis": "Previously captured conditional source metadata; Table 4 pages 11-12; not a live fetch or new PDF review"
    },
    "temperature_sensor": {
      "operating_range_c": {
        "min": -40,
        "max": 85,
        "condition": "Operational range of internal temperature sensor; not an accuracy guarantee",
        "page": 11,
        "table": "Table 4"
      },
      "full_accuracy_range_c": {
        "min": 0,
        "max": 65,
        "condition": "Full accuracy operating range; use condition-specific absolute accuracy rows",
        "page": 11,
        "table": "Table 4"
      },
      "absolute_accuracy_c": [
        {
          "temperature_condition_c": {
            "at": 25
          },
          "typical_magnitude_c": 0.5,
          "page": 11,
          "table": "Table 4",
          "symbol": "AT,25",
          "column": "Typ"
        },
        {
          "temperature_condition_c": {
            "min": 0,
            "max": 65
          },
          "typical_magnitude_c": 0.5,
          "page": 12,
          "table": "Table 4 (continued)",
          "symbol": "AT,full",
          "column": "Typ",
          "footnote": 7
        },
        {
          "temperature_condition_c": {
            "min": -20,
            "max": 0
          },
          "typical_magnitude_c": 1.25,
          "page": 12,
          "table": "Table 4 (continued)",
          "symbol": "AT,ext",
          "column": "Typ",
          "footnotes": [
            7,
            8
          ],
          "guarantee": "target_value_not_guaranteed"
        },
        {
          "temperature_condition_c": {
            "min": -40,
            "max": -20
          },
          "typical_magnitude_c": 1.5,
          "page": 12,
          "table": "Table 4 (continued)",
          "symbol": "AT,ext",
          "column": "Typ",
          "footnotes": [
            7,
            9
          ],
          "guarantee": "target_value_not_guaranteed"
        }
      ],
      "measurement_caveat": {
        "page": 12,
        "footnote": 7,
        "text": "Internal temperature reading depends on PCB temperature, sensor self-heating and ambient temperature; typically above ambient."
      },
      "review_status": "agent_page_visual_crosscheck_pending_hardware_engineer"
    }
  },
  "snapshot_sha256": "3ad599c884aedab51d96843e417df0de928ff7ef586960ac35370392a0edf1f9",
  "exported_at": "2026-11-01T04:43:06.891Z"
};
