# Project Handoff: poexd-data

## 1. 當前狀態與目標 (Status & Goals)
- **已完成**:
  - 全新 TypeScript / Node.js 資料管線倉庫已建立（`C:\Users\zxcvb\Desktop\poexd-data`）。
  - 直連 GGG 官方 PoE 2 CDN (`4.5.5.4`) 與 `dat-schema` 解析。
  - 輿圖資料生成器 (`atlas_maps.json`, `atlas_content.json`) 100% 驗證完成，輸出比對與原 Python 產出完全一致。
  - 圖示 (36 張透明 PNG) 與基準詞綴階級資料庫 (`mods2-id-data.json`, `mods-id-data.json`) 均已就緒於 `output/`。
  - GitHub Actions 自動化部署管線已配置 (`.github/workflows/deploy.yml` 發布至 `gh-pages`)。
- **後續目標**:
  - 使用者將本倉庫推送至 GitHub (`yehshune/poexd-data`)。
  - 下游專案 (`PoeXD`, `PoeXD-Extension`) 切換為透過 jsDelivr CDN 讀取。

## 2. 關鍵架構決策 (Key Decisions)
- **放棄 Python/repoe**: 應用棧統一為 TS/pnpm，擺脫 Poetry 與未維護的 Python 套件。
- **即時版本查詢來源**: GGG CDN 的真實版本必須使用 `https://poe-versions.obsoleet.org`，不要依賴 `ggpk.exposed`（可能存在快取延遲）。
- **Node.js Wasm Fetch 處理**: Node.js 內建 fetch 對 `file://` 協議不支援，已在 `src/bootstrap.ts` 建立全域代理攔截，確保 `pathofexile-dat` wasm 模組正常載入。

## 3. 不要踩的坑 (Pitfalls to Avoid)
- **不要直接引用 `ggpk.exposed/version?poe=2`**: 曾因其未即時更新至 4.5.5.4 導致 CDN 404。
- **不要在未引入 `bootstrap.ts` 前靜態 import `pathofexile-dat/dat.js`**: ESM 靜態宣告會在模組最前被評估，必須在 bootstrap 完成後透過 dynamic import 載入。
