import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';

/**
 * 天賦名稱表：`locales/<locale>/passive-names.json`，英文天賦名 → 遊戲內譯名。
 *
 * PoeXD-Extension 翻譯 pobb.in 天賦樹用。市集資料只對得到可塗油與星團的核心天賦，
 * 小天賦、專精、關鍵天賦與昇華天賦都要靠遊戲資料表：
 * - `PassiveSkills`：天賦樹（含昇華）的每個節點；輿圖天賦不收（pobb.in 只顯示角色天賦樹）
 * - `Ascendancy`：昇華職業名
 * - `AlternatePassiveSkills`：永恆珠寶改寫後的節點名（只有 PoE 1）
 *
 * 各語系的資料表列序相同，以列序對齊英文與譯文。同一個英文名對到兩種譯文時無法判斷是哪一個，
 * 整筆不收（寧缺勿錯）。只有官方 CDN 有資料表的語系才產出：簡體中文沒有，不從繁中轉換。
 */

export const PASSIVE_NAME_LOCALES: ReadonlyArray<readonly [string, string]> = [['zh-TW', 'Traditional Chinese']];

type Row = Record<string, unknown>;

export interface PassiveNameSource {
  english: readonly Row[];
  localized: readonly Row[];
  /** 名稱欄位 */
  column: string;
  /** 不收的列（例如輿圖天賦） */
  skip?: (row: Row) => boolean;
}

export interface PassiveNamesResult {
  names: Record<string, string>;
  /** 因譯文衝突而不收的英文名 */
  conflicts: string[];
}

const isUsableName = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed !== '' && !trimmed.startsWith('[DNT]') && !trimmed.includes('UNUSED');
};

const hasValue = (value: unknown) =>
  value !== null && value !== undefined && value !== false && value !== '' &&
  !(Array.isArray(value) && value.length === 0);

/** 天賦種類 `SkillType`：0 是角色天賦樹，1 是輿圖天賦樹 */
const ATLAS_SKILL_TYPE = 1;

/** 輿圖天賦：`SkillType` 為輿圖，或輿圖專用欄位（AtlasGroup、AtlasSubTree、AtlasNodeGroup…）有值 */
export const isAtlasPassive = (row: Row): boolean =>
  row.SkillType === ATLAS_SKILL_TYPE ||
  ['AtlasGroup', 'AtlasSubTree', 'AtlasNodeGroup', 'IsRootOfAtlasTree', 'IsAtlasWormhole'].some((column) =>
    hasValue(row[column])
  );

export function buildPassiveNames(sources: readonly PassiveNameSource[]): PassiveNamesResult {
  const names = new Map<string, string>();
  const dropped = new Set<string>();
  for (const source of sources) {
    // 列數不同代表兩份資料表不是同一版，列序對齊不可靠
    if (source.english.length !== source.localized.length) continue;
    source.english.forEach((row, index) => {
      if (source.skip?.(row)) return;
      const english = row[source.column];
      const localized = source.localized[index]?.[source.column];
      if (!isUsableName(english) || !isUsableName(localized)) return;
      const en = english.trim();
      const zh = localized.trim();
      if (en === zh || dropped.has(en)) return;
      const known = names.get(en);
      if (known === undefined) {
        names.set(en, zh);
      } else if (known !== zh) {
        names.delete(en);
        dropped.add(en);
      }
    });
  }
  const sorted = [...names.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { names: Object.fromEntries(sorted), conflicts: [...dropped].sort() };
}

const SOURCE_TABLES: Readonly<Record<'poe1' | 'poe2', ReadonlyArray<{ name: string; skip?: (row: Row) => boolean }>>> = {
  poe1: [
    { name: 'PassiveSkills', skip: isAtlasPassive },
    { name: 'Ascendancy' },
    { name: 'AlternatePassiveSkills' },
  ],
  poe2: [
    { name: 'PassiveSkills', skip: isAtlasPassive },
    { name: 'Ascendancy' },
  ],
};

export async function writePassiveNameArtifacts(
  loader: PoeDataLoader,
  game: 'poe1' | 'poe2',
  outputDir: string,
  patch: string
): Promise<Record<string, { names: number; conflicts: number }>> {
  const summary: Record<string, { names: number; conflicts: number }> = {};
  for (const [locale, datLanguage] of PASSIVE_NAME_LOCALES) {
    const sources: PassiveNameSource[] = [];
    for (const table of SOURCE_TABLES[game]) {
      try {
        const [english, localized] = await Promise.all([
          loader.loadTable(table.name, { language: 'English' }),
          loader.loadTable(table.name, { language: datLanguage }),
        ]);
        sources.push({ english, localized, column: 'Name', skip: table.skip });
      } catch (error) {
        console.warn(`  [!] 天賦名稱表略過 ${table.name}：${(error as Error).message}`);
      }
    }
    const { names, conflicts } = buildPassiveNames(sources);
    if (Object.keys(names).length === 0) {
      throw new Error(`天賦名稱表 (${game} ${locale}) 是空的，資料表可能讀取失敗`);
    }
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    await fs.writeFile(
      path.join(localeDir, 'passive-names.json'),
      JSON.stringify({ schemaVersion: 1, patch, locale, names }),
      'utf-8'
    );
    summary[locale] = { names: Object.keys(names).length, conflicts: conflicts.length };
  }
  return summary;
}
