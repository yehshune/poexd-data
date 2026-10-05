# Project Handoff: poexd-data

## 1. 當前狀態與目標 (Status & Goals)
- **已完成**:
  - 詞綴解析管線完全重構：PoE 1 與 PoE 2 獨立分離 (`src/mods/common/`, `src/mods/poe1/`, `src/mods/poe2/`)。
  - 產出檔案分別存放於 `output/poe1/` 與 `output/poe2/`，移除所有舊相容檔與別名。
  - 方案 B 自動分組實作：依據官方 Trade API 類別前綴 (`desecrated`, `rune`, `enchant`, `sanctum`) 及官方 Dat 表格外鍵 (`EssenceMods`, `LiquidEmotionOutcomes`, `SoulCoreStats`, `Essences`, `DelveCraftingModifiers`) 自動精準分類，完全擺脫人工硬編碼。
  - 成功補全符文影響力（索魯德毀滅 9 條、沃拉娜狂戰 30 條、克洛爾射手 28 條、卡特拉衰敗 23 條、烏特雷時空 17 條、梅德偉靈魂 21 條）與創生之樹裂痕飾品（異界 36 條、召喚 68 條、施法 83 條）部位與標籤映射。
  - 命定（Bonded）前綴匹配與 (Local) 防禦屬性正規化：支援 Trade API 官方前綴適配，成功解決命定暴擊率、符文保護等 51 筆詞綴匹配。
  - 未配對報告機制：自動輸出 `output/{ver}/unmatched-report.json`，並整合 CI GitHub Actions `$GITHUB_STEP_SUMMARY` 自動渲染 Markdown 統計與 Top 10 未配對清單。
  - 複合詞綴排序：以 `stat_descriptions` 規則出現順序進行行排序，確保 compound key 與官方遊戲及 Trade 100% 一致。
  - 基底固有詞綴支援：自 `BaseItemTypes` 解析固有詞綴並對應 `ItemClasses` 部位。
  - 情境化詞綴比對機制 (Contextual Resolution)：
    - 保留括號後綴避免 TradeStatIndex Map 鍵值覆蓋衝突（如 Global 覆蓋 Local）。
    - 依 Dat `Stats.dat`（`local_` 前綴）動態偵測 `isLocal`，優先匹配 `(Local)` 官方詞綴。
    - 依裝備部位動態偵測 `context`（如 Charm、Flask、Shields、Staves），優先匹配情境後綴。
    - 語法與單複數常規化：支援 `an additional` ➔ `# additional`、`charges` ➔ `charge`、`arrows` ➔ `arrow`、`duration of bleeding` ➔ `bleeding duration` 等雙向匹配。
  - 成功驗證關鍵修復：
    - PoE 1 局部護甲 (`explicit.stat_1062208444`) 與全域護甲 (`explicit.stat_2866361420`) 精準分離。
    - PoE 2 護符持續時間 (`explicit.stat_2541588185`, `(Charm)`)、流血持續時間 (`explicit.stat_1692879867`)、護符充能 (`explicit.stat_185580205`) 100% 正確匹配。
  - 精華專屬部位映射機制 (Essence Target Categories Mapping)：
    - 自 `EssenceMods.dat` 關聯 `EssenceTargetItemCategories.dat` 與 `ItemClasses.dat`，補全無法自然掉落之精華專屬詞綴部位。
    - 識別 `Essences.dat` 之 `Perfect: true`，將完美精髓專屬詞綴獨立標記為 `affinities: ["perfect_essence"]`，使其在擴充功能側邊欄完美獨立大區展示。
  - Trade 檢索分類優先級校正與嚴格隔離機制：
    - 修復 `findStatId` 跨類別隨機 fallback 問題，指定 `preferredCategories` 時嚴禁 fallback 至其他無關類別。
    - PoE 1 工藝台大師詞綴（`Domain === 10`）嚴格指派 `preferredCategories: ['crafted']`，100% 映射至 `crafted.stat_...`。
    - PoE 1 污染固定詞綴（`GenerationType === 5`）優先指派 `preferredCategories: ['implicit']`，精準匹配至 `implicit.stat_...`。
    - PoE 2 污染詞綴（`GenerationType === 5`）指派 `preferredCategories: ['enchant']`，100% 映射至 `enchant.stat_...`。
    - PoE 2 命定（`bonded`）與符文增幅（`socketable`）嚴格限定 `preferredCategories: ['rune']`，命定優先匹配 `Bonded: ` 前綴，100% 映射至 `rune.stat_...`。
    - 複合詞綴多 ID 解析升級（方案 A）：
      - 徹底移除「拿第一個子詞冒充整條複合詞」的殘缺 ID 邏輯。
      - 官方有合併條目者維持輸出單一 `id`；官方分開者，依序解析所有子詞條並輸出 `ids: string[]`（`id` 設為 undefined 避免前端短路）。
      - `mods-id-data.json` 支援多 ID 反向索引，每個子 ID 均可反向索引該 Tier。
  - 最新轉換指標：
    - PoE 2: 3,439 階級，3,342 映射 (97.2%)，926 範本，1,264 Trade IDs。
    - PoE 1: 3,560 階級，3,385 映射 (95.1%)，712 範本，690 Trade IDs。
- **後續目標**:
  - 在 `PoeXD-Extension` 中適配讀取 `ids` 陣列進行批次/單項多 ID 篩選器派發。
  - 精確提交 Git 變更並發布。

## 2. 關鍵架構決策 (Key Decisions)
- **情境化優先匹配 (Contextual Resolution)**: 決不在 Trade 檢索表建立期全域剝除 `(Local)` 或 `(Charm)` 等後綴，改由查詢時依物品上下文 `{ isLocal, context }` 優先嘗試情境候選鍵，再回退基礎鍵，根治鍵值碰撞問題。
- **方案 B 分類哲學**: 優先由 Trade 官方分類標籤命名空間及 Dat 表格關聯判定屬性親和度 (`affinities`)，兼顧版本自動適應性與零爬蟲純淨度。
- **PoE 1 與 PoE 2 徹底分離**: 資料結構、部位對照、Domain 與欄位名稱完全相異，絕不可混用同一邏輯。
- **純官方 CDN + Trade API (0 爬蟲)**: 資料 100% 來自 GGG Dat 表格與 stat_descriptions，分類與 ID 透過 Trade API 檢索表掛載。
- **Compound 詞綴依規則順序**: 多行詞綴必須依據 `stat_descriptions` 定義順序排定，不可依 Mod 欄位順序。

## 3. 不要踩的坑 (Pitfalls to Avoid)
- **不可在 Windows pwsh 執行包含多行複雜雙引號的 `tsx -e`**: 引號轉義易導致 stdin 永久阻塞。
- **不可假設 PoE 1 與 PoE 2 Dat 表格欄位同名**: PoE 1 為 `StatsKey`/`StatMin`/`StatMax`，PoE 2 為 `Stat`/`StatValue`。
- **不可在 package.json 之 packageManager 或 devEngines.packageManager.version 使用版本範圍符號 (`^`, `~`)**: Corepack 僅接受嚴格精確之 semver 版本號（如 `11.28.4`），否則會拋出 `expected a semver version` 錯誤。
- **不可使用 `git add .`**: 請只暫存與提交本輪修改的檔案。
