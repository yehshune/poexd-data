# poexd-data

Path of Exile (PoE 1 / PoE 2) 遊戲資料解析與自動化匯出工具。基於 TypeScript 與 `dat-schema`，直接自官方 CDN 提取遊戲資料並轉換為結構化 JSON 與圖示資產。

---

## 產出資料 (位於 `output/`)

| 檔案路徑 | 說明 |
| `version.json` | 當前遊戲 Patch 版本與資料生成時間戳 (供客戶端快速比對) |
| `atlas_maps.json` | 輿圖地圖名稱、標籤、頭目與中英雙語對照 |
| `atlas_content.json` | 輿圖機制內容、效果描述、圖示名稱與特殊狀態 |
| `icons/` | 輿圖地圖機制透明 PNG 圖示 |
| `mods2-id-data.json` | PoE 2 詞綴階級表 (依官方 Trade Stat ID 索引) |
| `mods-id-data.json` | PoE 1 詞綴階級表 (依官方 Trade Stat ID 索引) |
| `mods2-data.json` | PoE 2 詞綴屬性範本與數值區間資料 |
| `mods-data.json` | PoE 1 詞綴屬性範本與數值區間資料 |

---

## 使用方式

```bash
# 安裝依賴
pnpm install

# 執行完整資料生成
pnpm run build

# 僅生成輿圖資料
pnpm run build:atlas
```

---

## 自動化與 CDN 存取

GitHub Actions (`.github/workflows/deploy.yml`) 支援定時排程與手動觸發，構建完成後將自動發布至 `gh-pages` 分支。

### CDN 端點 (jsDelivr)

* **版本中繼資訊** (極速檢查)：
  `https://cdn.jsdelivr.net/gh/<owner>/poexd-data@gh-pages/version.json`
* **輿圖地圖**：
  `https://cdn.jsdelivr.net/gh/<owner>/poexd-data@gh-pages/atlas_maps.json`
* **輿圖機制**：
  `https://cdn.jsdelivr.net/gh/<owner>/poexd-data@gh-pages/atlas_content.json`
* **PoE 2 詞綴**：
  `https://cdn.jsdelivr.net/gh/<owner>/poexd-data@gh-pages/mods2-id-data.json`
* **輿圖圖示**：
  `https://cdn.jsdelivr.net/gh/<owner>/poexd-data@gh-pages/icons/{IconName}.png`

---

## License

本專案採用 [MIT License](LICENSE)。

*This project is not affiliated with, funded, or endorsed by Grinding Gear Games in any way. Path of Exile, Path of Exile 2, and all associated assets are trademarks or registered trademarks of Grinding Gear Games.*
