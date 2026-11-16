import * as fs from 'fs/promises';
import * as path from 'path';
import { computeGggStatHash } from './murmurhash2.js';
import {
  normalizeLineFormat,
  StatDescriptionIndex,
  type StatDescriptionRule,
} from './stat-descriptions.js';
import { MOD_LINE_LOCALES, type ModLineLocale, type ModLineVariants } from './mod-line-variants.js';
import {
  detectAllRewording,
  mergeAliases,
  readAliasFile,
  readPublishedEnglish,
  writeAliasFile,
  type StatAliases,
} from './stat-aliases.js';

/**
 * stat 文字目錄，產出兩份（結構都與 mod-lines.json 相同：stat hash → `[英文模板, 譯文模板]`）：
 *
 * - `locales/<locale>/stat-text.json`：完整目錄。物品、天賦與技能描述檔裡的全部規則，讓任何遊戲
 *   文字（市集上沒有的傳奇詞綴、天賦節點、寶石說明）都能從英文找到譯文。供其他專案使用，
 *   不列入發布清單（manifest），PoeXD-Extension 不同步。
 * - `locales/<locale>/stat-text-items.json`：PoeXD-Extension 用。只收物品詞綴的描述檔，並扣掉
 *   mod-lines.json 已有的句子（擴充本來就會載入 mod-lines），兩份合起來就是物品詞綴的全部寫法。
 *
 * 同一 hash 出現在多份描述檔（例如光環技能對同一個 stat 有自己的寫法）時，各份的寫法都收錄，
 * 依描述檔順序排列。
 */
export type StatTextLines = Record<string, Array<[string, string]>>;

export const STAT_TEXT_LOCALES = MOD_LINE_LOCALES;

/** 依優先順序排列；主描述檔在前，同一句英文以先出現者的譯文為準 */
export const STAT_TEXT_FILES: Readonly<Record<'poe1' | 'poe2', readonly string[]>> = {
  poe1: [
    'stat_descriptions',
    'passive_skill_stat_descriptions',
    'passive_skill_aura_stat_descriptions',
    'active_skill_gem_stat_descriptions',
    'gem_stat_descriptions',
    'skill_stat_descriptions',
    'aura_skill_stat_descriptions',
    'banner_aura_skill_stat_descriptions',
    'beam_skill_stat_descriptions',
    'brand_skill_stat_descriptions',
    'buff_skill_stat_descriptions',
    'curse_skill_stat_descriptions',
    'debuff_skill_stat_descriptions',
    'minion_attack_skill_stat_descriptions',
    'minion_skill_stat_descriptions',
    'minion_spell_damage_skill_stat_descriptions',
    'minion_spell_skill_stat_descriptions',
    'offering_skill_stat_descriptions',
    'secondary_debuff_skill_stat_descriptions',
    'single_minion_spell_skill_stat_descriptions',
    'variable_duration_skill_stat_descriptions',
    'tincture_stat_descriptions',
    'graft_stat_descriptions',
    'monster_stat_descriptions',
    'map_stat_descriptions',
    'atlas_stat_descriptions',
    'sanctum_relic_stat_descriptions',
    'heist_equipment_stat_descriptions',
    'expedition_relic_stat_descriptions',
    'leaguestone_stat_descriptions',
    'sentinel_stat_descriptions',
    'primordial_altar_stat_descriptions',
    'chest_stat_descriptions',
  ],
  poe2: [
    'stat_descriptions',
    'passive_skill_stat_descriptions',
    'passive_skill_aura_stat_descriptions',
    'active_skill_gem_stat_descriptions',
    'gem_stat_descriptions',
    'meta_gem_stat_descriptions',
    'skill_stat_descriptions',
    'advanced_mod_stat_descriptions',
    'monster_stat_descriptions',
    'utility_flask_buff_stat_descriptions',
    'map_stat_descriptions',
    'atlas_stat_descriptions',
    'sanctum_relic_stat_descriptions',
    'endgame_map_stat_descriptions',
    'tablet_stat_descriptions',
  ],
};

/** 物品詞綴會用到的描述檔（`stat-text-items.json` 的範圍），須是 STAT_TEXT_FILES 的子集 */
export const STAT_TEXT_ITEM_FILES: Readonly<Record<'poe1' | 'poe2', readonly string[]>> = {
  poe1: ['stat_descriptions', 'tincture_stat_descriptions', 'graft_stat_descriptions'],
  poe2: ['stat_descriptions'],
};

export interface NamedStatIndex {
  /** 描述檔名稱（不含路徑與副檔名） */
  name: string;
  index: StatDescriptionIndex;
}

/** 描述檔在 bundle 裡的路徑；PoE 1 自 3.30 起改為 .csd，舊版仍是 .txt */
export function statTextFileCandidates(version: 'poe1' | 'poe2', name: string): string[] {
  return version === 'poe1'
    ? [`metadata/statdescriptions/${name}.csd`, `metadata/statdescriptions/${name}.txt`]
    : [`data/statdescriptions/${name}.csd`];
}

/** 載入目錄用的全部描述檔；主描述檔必須存在，其餘找不到時略過 */
export async function loadStatTextIndexes(
  version: 'poe1' | 'poe2',
  getFile: (relPath: string) => Promise<Uint8Array | null>
): Promise<NamedStatIndex[]> {
  const indexes: NamedStatIndex[] = [];
  for (const name of STAT_TEXT_FILES[version]) {
    let bytes: Uint8Array | null = null;
    for (const candidate of statTextFileCandidates(version, name)) {
      bytes = await getFile(candidate);
      if (bytes) break;
    }
    if (!bytes) {
      if (name === 'stat_descriptions') throw new Error(`找不到 ${version} 主描述檔 stat_descriptions`);
      console.warn(`  [!] 找不到描述檔 ${name}，略過`);
      continue;
    }
    indexes.push({
      name,
      index: StatDescriptionIndex.parse(
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf16le')
      ),
    });
  }
  return indexes;
}

const formatVariant = (rule: StatDescriptionRule, variant: StatDescriptionRule['enVariants'][number]) =>
  normalizeLineFormat(variant.format, variant.negatedIndices, rule.statIds.length, 0);

export function buildStatText(indexes: readonly StatDescriptionIndex[], locale: ModLineLocale): StatTextLines {
  const result: StatTextLines = {};
  const seen = new Map<string, Set<string>>();
  for (const index of indexes) {
    for (const rule of index.getRules()) {
      const localized = rule.variantsByLocale.get(locale);
      // 變體數量不同時無法確定對應關係
      if (!localized || localized.length !== rule.enVariants.length) continue;
      const hash = String(computeGggStatHash(rule.statIds));
      const englishSeen = seen.get(hash) ?? new Set<string>();
      seen.set(hash, englishSeen);
      rule.enVariants.forEach((variant, i) => {
        const english = formatVariant(rule, variant);
        if (englishSeen.has(english)) return;
        englishSeen.add(english);
        (result[hash] ??= []).push([english, formatVariant(rule, localized[i])]);
      });
    }
  }
  return result;
}

/** 扣掉 mod-lines 已有的句子（同一 hash、同一句英文）；扣完沒有句子的 hash 不輸出 */
export function subtractModLines(lines: StatTextLines, modLines: ModLineVariants): StatTextLines {
  const result: StatTextLines = {};
  for (const [hash, pairs] of Object.entries(lines)) {
    const known = new Set((modLines[hash] ?? []).map(([english]) => english));
    const remaining = pairs.filter(([english]) => !known.has(english));
    if (remaining.length > 0) result[hash] = remaining;
  }
  return result;
}

/** 目錄裡每個 hash 的英文模板 */
export function englishOf(lines: StatTextLines): Map<string, string[]> {
  return new Map(Object.entries(lines).map(([hash, pairs]) => [hash, pairs.map(([english]) => english)]));
}

/** 追蹤英文改寫所用的語系：上一版與這一版都取這個語系目錄裡的英文模板來比對 */
const TRACKING_LOCALE: ModLineLocale = 'zh-TW';

export interface StatTextResult {
  /** 完整目錄的 hash 數 */
  counts: Record<ModLineLocale, number>;
  /** stat-text-items.json 的 hash 數 */
  itemCounts: Record<ModLineLocale, number>;
  /** 發布的別名總數（hash × 舊模板） */
  aliasCount: number;
  /** 這次建置新偵測到的改寫數 */
  rewordedCount: number;
}

/**
 * 寫出各語系的 stat-text.json、stat-text-items.json 與 `<version>/stat-aliases.json`。
 *
 * 寫入前先讀上一版完整的 stat-text.json（CI 建置前會把上一版發布內容還原到輸出目錄），
 * 比對出這一版被改寫的英文；再與回補檔、上一版的別名合併。
 */
export async function writeStatTextArtifacts(
  outputDir: string,
  version: 'poe1' | 'poe2',
  indexes: readonly NamedStatIndex[],
  modLines: Readonly<Record<ModLineLocale, ModLineVariants>>,
  patch: string,
  seedAliasFile: string
): Promise<StatTextResult> {
  const trackingFile = path.join(outputDir, 'locales', TRACKING_LOCALE, 'stat-text.json');
  const aliasFile = path.join(outputDir, 'stat-aliases.json');
  const previousEnglish = await readPublishedEnglish(trackingFile);
  const previousAliases = await readAliasFile(aliasFile);
  const seedAliases = await readAliasFile(seedAliasFile);

  const all = indexes.map(({ index }) => index);
  const itemNames = new Set(STAT_TEXT_ITEM_FILES[version]);
  const items = indexes.filter(({ name }) => itemNames.has(name)).map(({ index }) => index);

  const counts = {} as Record<ModLineLocale, number>;
  const itemCounts = {} as Record<ModLineLocale, number>;
  let current = new Map<string, string[]>();
  for (const locale of STAT_TEXT_LOCALES) {
    const lines = buildStatText(all, locale);
    const itemLines = subtractModLines(buildStatText(items, locale), modLines[locale] ?? {});
    if (locale === TRACKING_LOCALE) current = englishOf(lines);
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    for (const [file, body] of [
      ['stat-text.json', lines],
      ['stat-text-items.json', itemLines],
    ] as const) {
      await fs.writeFile(
        path.join(localeDir, file),
        JSON.stringify({ schemaVersion: 1, patch, locale, lines: body }),
        'utf-8'
      );
    }
    counts[locale] = Object.keys(lines).length;
    itemCounts[locale] = Object.keys(itemLines).length;
  }

  const reworded = previousEnglish ? detectAllRewording(previousEnglish, current) : {};
  const aliases = mergeAliases([seedAliases, previousAliases, reworded], current);
  await writeAliasFile(aliasFile, patch, aliases);
  const total = (value: StatAliases) => Object.values(value).reduce((sum, pairs) => sum + pairs.length, 0);
  return { counts, itemCounts, aliasCount: total(aliases), rewordedCount: total(reworded) };
}
