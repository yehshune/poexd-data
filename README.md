# poexd-data

> 《流亡黯道 1》與《流亡黯道 2》（Path of Exile 1 & 2）官方資料自動化 ETL 提取管線與靜態 CDN 資料庫

`環境要求: Node.js >= 22.0.0` | `套件管理: pnpm >= 12.0.0` | `語言核心: TypeScript` | `開源授權: MIT License`

---

## 專案簡介

**poexd-data** 是一套專為《流亡黯道 1》（PoE 1）與《流亡黯道 2》（PoE 2）設計的高效能資料提取、轉換與組裝管線（ETL Pipeline）。

本專案堅持**免安裝客戶端（Zero Client Required）**與**零網頁爬蟲（Zero Web Scraping）**原則：
- 直接連線至 Grinding Gear Games（GGG）官方 CDN 串流下載底層二進位封包。
- 透過社群 Dat Schema 自動解密 `.dat64` / `.dat` 關聯資料表，建立繁體中文與英文雙語地圖、怪物及詞綴對照。
- 內建 WebAssembly（`texture2ddecoder-wasm`）直接解碼遊戲內 BC7 壓縮規格的 DDS 紋理貼圖，自動裁切匯出透明 PNG 圖示。
- 解析官方語法描述檔（`stat_descriptions.csd`），計算 32-bit MurmurHash2 雜湊值，直接對齊官方市集搜尋 API（Trade API）的 Filter ID。
- 透過 GitHub Actions 自動發布至 `gh-pages` 分支，提供全球開發者穩定的 CDN 靜態資源。

---

## 公開 CDN 產出端點

所有管線產出的資料集均已部署至 GitHub Pages，並可透過全球 jsDelivr CDN 高速取用：

- **jsDelivr 基礎路徑**：`https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/`
- **GitHub Pages 備用路徑**：`https://yehshune.github.io/poexd-data/`

### 常用資料端點清單

| 資料名稱 | 說明 | jsDelivr CDN 存取網址 |
| :--- | :--- | :--- |
| **版本中繼資訊** | PoE 1 與 PoE 2 最新 Patch 版本號與產出時間戳（供客戶端快速快取驗證） | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/version.json` |
| **PoE 2 輿圖地圖** | 包含終局地圖、繁中/英文名稱、首領分類（青銅城塞/灰燼仲裁者等）、Pin 圖示關聯 | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/atlas_maps.json` |
| **PoE 2 輿圖機制** | 輿圖機制名稱、效果描述、關聯圖示代號與特殊狀態（腐化、譫妄迷霧、已淨化、流浪商人等） | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/atlas_content.json` |
| **PoE 2 輿圖圖示** | 自遊戲 BC7 貼圖提取之透明 PNG 圖示（共 36 款，請替換圖示名稱） | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/icons/{IconName}.png` |
| **PoE 2 詞綴階級與屬性總表** | 去重複緊湊結構，含裝備分類、前後綴親和度與按等級預排序之階級數值（不含語系文字） | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/mods-tiers.json` |
| **PoE 2 多語系詞綴分片** | 11 種官方語系（`en`, `zh-TW`, `zh-CN`, `ja`, `ko`, `ru`, `de`, `fr`, `es`, `pt`, `th`）詞綴文字分片 | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/locales/{locale}/stats.json` |
| **PoE 1 詞綴階級與屬性總表** | PoE 1 去重複緊湊詞綴階級與裝備分類總表（不含語系文字） | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe1/mods-tiers.json` |
| **PoE 1 多語系詞綴分片** | PoE 1 之 11 種官方語系詞綴文字分片 | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe1/locales/{locale}/stats.json` |
| **PoE 2 未配對報告** | 詞綴匹配率統計與無法對齊 Trade API 之診斷記錄 | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe2/unmatched-report.json` |
| **PoE 1 未配對報告** | PoE 1 詞綴匹配率統計與未配對詞綴診斷記錄 | `https://cdn.jsdelivr.net/gh/yehshune/poexd-data@gh-pages/poe1/unmatched-report.json` |

### 輿圖圖示範例清單（`poe2/icons/`）

- 裂痕機制：`AtlasIconContentBreach.png`
- 譫妄迷霧：`AtlasIconContentDelirium.png`
- 深淵機制：`AtlasIconContentAbyss.png`
- 祭祀神壇：`AtlasIconContentRitual.png`
- 探險遺跡：`AtlasIconContentExpedition.png`
- 腐化區域：`AtlasIconContentCorruption.png`
- 傳奇地圖：`AtlasIconContentUniqueMap.png`
- 輿圖外框：`AtlasIconFrameSpecial.png`

---

## 系統架構與運作流程

```text
[ GGG 官方 CDN ] ────────► [ CachingBundleLoader (記憶體 + 磁碟快取) ]
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
        【輿圖與圖示管線 (PoE 2)】                 【詞綴與市集管線 (PoE 1 & 2)】
        • Dat64 關聯表格解析                      • CSD 語法描述與條件規則解析
          - EndgameMaps, WorldAreas (中/英)        • 裝備部位與標籤分類 (gear-types)
          - MapPins, MonsterVarieties             • MurmurHash2 雜湊運算
        • UIImages1 座標定位                       • GGG Trade API 官方過濾器對齊
        • Brotli 解壓 + DDS BC7 Wasm 解碼          • 匯出 mods-tiers.json (純結構與數值)
        • Sharp 匯出 36 款透明 PNG 圖示             • 匯出 locales/{locale}/stats.json (11 語系)
                 │                                         │
                 └────────────────────┬────────────────────┘
                                      ▼
                      【本地產出目錄 ./output/】
                       ├── version.json
                       ├── poe1/ (mods-tiers, locales/*/stats, unmatched)
                       └── poe2/ (atlas_maps, atlas_content, icons/, mods-tiers, locales/*/stats)
                                      │
                                      ▼
                      【自動化部署 (GitHub Actions)】
                       推送到 gh-pages 分支 ──► 全球 jsDelivr CDN
```

### 核心運作機制說明

1. **版本自動偵測與 CDN 串流快取 (`src/cdn/loader.ts`)**：
   - 啟動時向版本服務與 GGG CDN HEAD 發送探測，精準取得 PoE 1 與 PoE 2 的最新發布版號。
   - 具備記憶體與本地磁碟（`.cache/bundles/<版號>/`）兩級快取，已下載之二進位 bundle 不重複耗費網路頻寬。

2. **PoE 2 輿圖與 WebAssembly 紋理解密 (`src/atlas/`)**：
   - 同步載入英文與繁體中文語系之 `WorldAreas` 與 `EndgameMaps`，處理首領區域對照（如灰燼仲裁者青銅城塞等特殊機制地圖）。
   - 解析 `Art/UIImages1.txt` 取得精靈圖座標，針對 GGG 特有的 Brotli 封包進行解壓，並使用 `texture2ddecoder-wasm` 解碼 BC7 區塊壓縮紋理，透過 `sharp` 裁剪並輸出乾淨的透明 PNG 圖示。

3. **雙版本詞綴與 Trade API 映射 (`src/mods/`)**：
   - 透過正規表達式與 AST 解析 `stat_descriptions.csd` 中的參數型態與範圍。
   - 解決複雜詞綴歸屬（包含前綴、後綴、工藝、精髓、液態情感、符文石與獵魔勢技能等）。
   - 以 MurmurHash2 算法計算 GGG 屬性 32-bit Hash，與官方 Trade API `/data/stats` 建立 100% 絕對關聯。

---

## 產出目錄結構

建置完成後，所有檔案將產出於根目錄的 `./output` 資料夾：

```text
output/
├── version.json                     # 當前 PoE 1 與 PoE 2 Patch 版本及建置時間戳
├── poe1/
│   ├── mods-tiers.json              # PoE 1 詞綴階級與屬性緊湊總表（不含語系文字）
│   ├── locales/{locale}/stats.json  # PoE 1 11 種官方語系詞綴文字分片
│   └── unmatched-report.json        # PoE 1 未配對詞綴清單與診斷報告
└── poe2/
    ├── atlas_maps.json              # PoE 2 輿圖地圖資料庫（含中英雙語、標籤、頭目）
    ├── atlas_content.json           # PoE 2 輿圖機制與特殊效果狀態
    ├── icons/                       # PoE 2 輿圖機制與外框透明 PNG 圖示（共 36 款）
    ├── mods-tiers.json              # PoE 2 詞綴階級與屬性緊湊總表（不含語系文字）
    ├── locales/{locale}/stats.json  # PoE 2 11 種官方語系詞綴文字分片
    └── unmatched-report.json        # PoE 2 未配對詞綴清單與診斷報告
```

---

## 本地建置與操作指南

### 環境需求

- **Node.js**: `>= 22.0.0`
- **pnpm**: `>= 12.0.0`

### 安裝步驟

```bash
# 複製儲存庫
git clone https://github.com/yehshune/poexd-data.git
cd poexd-data

# 安裝依賴套件
pnpm install
```

### 建置指令

```bash
# 執行完整管線（包含 PoE 2 輿圖、Wasm 圖示提取、PoE 1 與 PoE 2 詞綴）
pnpm run build

# 僅提取 PoE 2 輿圖地圖、機制與 BC7 圖示
pnpm run build:atlas

# 僅解析 PoE 1 與 PoE 2 裝備詞綴並對齊 Trade API 雜湊
pnpm run build:mods

# 完整重新建置別名
pnpm run build:all
```

---

## 資料結構範例

### 1. `output/version.json`
```json
{
  "poe1": {
    "patchVersion": "3.29.3.3"
  },
  "poe2": {
    "patchVersion": "4.5.5.4"
  },
  "generatedAt": "2026-10-06T04:03:18.557Z"
}
```

### 2. `output/poe2/atlas_maps.json`（輿圖地圖節錄）
```json
{
  "MapUberBoss_CopperCitadel": {
    "id": "MapUberBoss_CopperCitadel",
    "name": "The Copper Citadel",
    "nameZh": "青銅城塞",
    "isUnique": true,
    "isHideout": false,
    "bossCategory": "Arbiter of Ash",
    "pinId": "EndgameAtlasPinCitadelCopper",
    "areaLevel": 82
  }
}
```

### 3. `output/poe2/mods-tiers.json` 與 `output/poe2/locales/{locale}/stats.json`
```json
{
  "typeTable": ["amulet", "body-armour", "ring"],
  "groups": {
    "IncreasedLife": {
      "statIds": ["maximum_life"],
      "id": "explicit.stat_3299347043",
      "tiers": [
        {
          "modId": "Strength1",
          "name": "Hale",
          "level": 1,
          "generation_type": 1,
          "params": [[10, 19]],
          "types": [0, 1, 2],
          "affinities": ["normal"]
        }
      ]
    }
  }
}
```

---

## 自動化部署與 CI/CD

專案已配置 GitHub Actions 工作流（`.github/workflows/deploy.yml`）：
- 當推送符合版號格式的 Tag（如 `v1.0.0`）或由維護者手動點擊 `workflow_dispatch` 時觸發。
- 自動在 Ubuntu 容器中安裝 Node.js 與 pnpm、拉取最新官方封包建置全量資料，並將 `./output` 資料夾部署至 `gh-pages` 分支。
- 部署完成後，全球 CDN（jsDelivr）將於數分鐘內同步最新版本內容。

---

## 授權條款與版權聲明

- **原始碼授權**：本專案採用 [MIT License](LICENSE) 條款開源。
- **遊戲版權歸屬**：《流亡黯道》（Path of Exile）與《流亡黯道 2》（Path of Exile 2）之所有遊戲資料、文字、貼圖與註冊商標均屬於 [Grinding Gear Games](https://www.grindinggear.com/)（GGG）所有。本專案為第三方獨立開源資料處理管線，與 Grinding Gear Games 無官方隸屬關係。
