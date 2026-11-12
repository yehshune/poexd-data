import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';
import { cleanMarkup } from './stat-descriptions.js';

/**
 * 結果列標籤（市集漢化）：屬性名稱、物品類別、寶石標籤與說明、劫盜名稱等遊戲文字。
 *
 * 英文與譯文取自同一張資料表的同一列（各語系的 dat 列順序相同，以 `_index` 對接）。
 * 沒有佔位符的字串成為標籤（英文 → 譯文），帶佔位符的成為模板（佔位符統一為 `{n}`），
 * 擴充端以英文整行比對後填入數值。
 */
export interface ResultLabels {
  labels: Record<string, string>;
  templates: Array<[string, string]>;
}

type Row = Record<string, unknown>;

export interface ResultLabelSource {
  name: string;
  english: Row[];
  localized: Row[];
  columns: string[];
  /** 數字越小越優先；同一英文有多個譯名時採用優先者 */
  priority?: (row: Row) => number;
}

/** 只產出用戶端有 dat 的市集漢化語系；簡中用戶端資料不在國際服 CDN */
export const RESULT_LABEL_LOCALES: ReadonlyArray<readonly [string, string]> = [['zh-TW', 'Traditional Chinese']];

const MAX_LENGTH = 400;
const PLACEHOLDER = /\{(\d+)(?::[^}]*)?\}/g;

const normalizePlaceholders = (text: string) => text.replace(PLACEHOLDER, '{$1}');

/** 去掉字型標記 `<normal>{{文字}}`，只留文字 */
const stripStyleTags = (text: string) => text.replace(/<[a-z]+>\{\{(.*?)\}\}/gis, '$1');

const placeholderSet = (text: string) =>
  [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort().join(',');

function clean(text: unknown, isLocalized: boolean): string | null {
  if (typeof text !== 'string') return null;
  const cleaned = normalizePlaceholders(stripStyleTags(cleanMarkup(text, isLocalized))).trim();
  if (!cleaned || /[<>]|\{\{/.test(cleaned) || cleaned.length > MAX_LENGTH || !/[A-Za-z]/.test(isLocalized ? 'x' : cleaned)) return null;
  return cleaned;
}

export function buildResultLabels(sources: readonly ResultLabelSource[]): ResultLabels {
  const labels = new Map<string, { text: string; priority: number }>();
  const templates = new Map<string, { text: string; priority: number }>();

  sources.forEach((source, sourceIndex) => {
    const localizedByIndex = new Map(source.localized.map((row) => [row._index, row]));
    for (const row of source.english) {
      const localizedRow = localizedByIndex.get(row._index);
      if (!localizedRow) continue;
      const priority = source.priority?.(row) ?? 1;
      for (const column of source.columns) {
        const english = clean(row[column], false);
        const localized = clean(localizedRow[column], true);
        if (!english || !localized || english === localized) continue;
        const hasPlaceholder = /\{\d+\}/.test(english);
        if (hasPlaceholder) {
          // 換行模板在結果列會拆成多行，無法整行比對
          if (english.includes('\n') || placeholderSet(english) !== placeholderSet(localized)) continue;
        } else if (english.includes('\n')) {
          continue;
        }
        const target = hasPlaceholder ? templates : labels;
        const existing = target.get(english);
        const rank = priority * 100 + sourceIndex;
        if (!existing || rank < existing.priority) target.set(english, { text: localized, priority: rank });
      }
    }
  });

  return {
    labels: Object.fromEntries([...labels].map(([english, { text }]) => [english, text])),
    templates: [...templates].map(([english, { text }]) => [english, text]),
  };
}

/** ClientStrings 依用途排序：物品顯示、市集與技能彈窗優先，其他介面字串最後 */
const CLIENT_STRING_PRIORITY =
  /^(ItemDisplay|ItemPopup|ItemNote|ETradeMarket|MarketPopup|SkillPopup|WeaponClass|JewelRadius|Heist|Sanctum|NumberOf|PercentageOfBase|Time)/;

const SOURCE_TABLES: Record<'poe1' | 'poe2', Array<Omit<ResultLabelSource, 'english' | 'localized'>>> = {
  poe1: [
    { name: 'ClientStrings', columns: ['Text'], priority: (row) => (CLIENT_STRING_PRIORITY.test(String(row.Id)) ? 0 : 2) },
    { name: 'ItemClasses', columns: ['Name'] },
    { name: 'GemTags', columns: ['Tag', 'Name'] },
    { name: 'ActiveSkills', columns: ['DisplayedName', 'Description'] },
    { name: 'GemEffects', columns: ['Name', 'SupportName', 'SupportText'] },
    { name: 'HeistJobs', columns: ['Name'] },
    { name: 'HeistNPCs', columns: ['Name'] },
    { name: 'HeistObjectives', columns: ['Client'] },
    // 劫盜成員全名（如 Huck, the Soldier）在 HeistNPCs 沒有翻譯，NPCs 有
    { name: 'NPCs', columns: ['Name'], priority: () => 3 },
  ],
  poe2: [
    { name: 'ClientStrings', columns: ['Text'], priority: (row) => (CLIENT_STRING_PRIORITY.test(String(row.Id)) ? 0 : 2) },
    { name: 'ItemClasses', columns: ['Name'] },
    { name: 'GemTags', columns: ['Tag', 'Name'] },
    { name: 'ActiveSkills', columns: ['DisplayedName', 'Description'] },
    { name: 'GemEffects', columns: ['Name', 'SupportName', 'SupportText'] },
  ],
};

export async function writeResultLabelArtifacts(
  loader: PoeDataLoader,
  game: 'poe1' | 'poe2',
  outputDir: string,
  patch: string
): Promise<Record<string, { labels: number; templates: number }>> {
  const summary: Record<string, { labels: number; templates: number }> = {};
  for (const [locale, datLanguage] of RESULT_LABEL_LOCALES) {
    const sources: ResultLabelSource[] = [];
    for (const table of SOURCE_TABLES[game]) {
      try {
        const [english, localized] = await Promise.all([
          loader.loadTable(table.name, { language: 'English' }),
          loader.loadTable(table.name, { language: datLanguage }),
        ]);
        sources.push({ ...table, english, localized });
      } catch (error) {
        console.warn(`  [!] 結果列標籤略過 ${table.name}：${(error as Error).message}`);
      }
    }
    const { labels, templates } = buildResultLabels(sources);
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    await fs.writeFile(
      path.join(localeDir, 'result-labels.json'),
      JSON.stringify({ schemaVersion: 1, patch, locale, labels, templates }),
      'utf-8'
    );
    summary[locale] = { labels: Object.keys(labels).length, templates: templates.length };
  }
  return summary;
}
