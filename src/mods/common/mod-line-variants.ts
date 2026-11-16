import * as fs from 'fs/promises';
import * as path from 'path';
import { computeGggStatHash } from './murmurhash2.js';
import {
  normalizeLineFormat,
  type StatDescriptionIndex,
  type StatDescriptionRule,
  type StatRuleVariant,
} from './stat-descriptions.js';
import type { TradeStatsResponse } from './trade-stats.js';

/**
 * 結果列詞綴的遊戲寫法（市集漢化第 4 階段）。
 *
 * 每個市集代碼（`<category>.stat_<hash>` 的 hash）輸出描述檔中全部變體的
 * `[英文模板, 譯文模板]`。擴充端以英文模板比對結果列的英文整句、擷取數值，
 * 再填入同一個變體的譯文模板；英文句子本身已經決定了用哪個變體（含正負向），
 * 所以不需要在執行期判斷條件。
 */
export type ModLineVariants = Record<string, Array<[string, string]>>;

/** 只產出市集漢化支援的語系 */
export const MOD_LINE_LOCALES = ['zh-TW', 'zh-CN'] as const;
export type ModLineLocale = (typeof MOD_LINE_LOCALES)[number];

const STAT_ID_PATTERN = /^[a-z_]+\.stat_(\d+)$/;

function formatVariant(variant: StatRuleVariant, rule: StatDescriptionRule): string {
  return normalizeLineFormat(variant.format, variant.negatedIndices, rule.statIds.length, 0);
}

/** 依描述檔順序建立 hash → 規則（同一 hash 可能出現在多份描述檔） */
function indexRulesByHash(indexes: readonly StatDescriptionIndex[]): Map<string, StatDescriptionRule[]> {
  const byHash = new Map<string, StatDescriptionRule[]>();
  for (const index of indexes) {
    for (const rule of index.getRules()) {
      const hash = String(computeGggStatHash(rule.statIds));
      byHash.set(hash, [...(byHash.get(hash) ?? []), rule]);
    }
  }
  return byHash;
}

/** 比對用骨架：數值與佔位符換成 #，忽略換行、大小寫與市集結尾的括號標記 */
export function textSkeleton(text: string): string {
  return text
    .replace(/\\n|\n/g, ' ')
    .replace(/\s*\([^()]*\)\s*$/, '')
    .replace(/[+-]?\{\d+:\+?[dn]\}|[+-]?#|[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 該語系的變體與英文一一對應（數量相同）才能產出句型對 */
function isUsable(rule: StatDescriptionRule, locale: ModLineLocale): boolean {
  return rule.variantsByLocale.get(locale)?.length === rule.enVariants.length;
}

/**
 * 同一 hash 有多條規則時（例如主描述檔與地圖描述檔撞 hash），在該語系可用的規則中選英文寫法
 * 與市集文字相符的那條；沒有市集文字或都不相符時，以先出現的可用規則為準。
 */
function pickRule(
  rules: readonly StatDescriptionRule[] | undefined,
  tradeTexts: readonly string[] | undefined,
  locale: ModLineLocale
): StatDescriptionRule | undefined {
  const usable = (rules ?? []).filter((rule) => isUsable(rule, locale));
  if (usable.length <= 1 || !tradeTexts?.length) return usable[0];
  const wanted = new Set(tradeTexts.map(textSkeleton));
  return (
    usable.find((rule) => rule.enVariants.some((variant) => wanted.has(textSkeleton(formatVariant(variant, rule))))) ??
    usable[0]
  );
}

export function buildModLineVariants(
  indexes: readonly StatDescriptionIndex[],
  tradeHashes: Iterable<string>,
  locale: ModLineLocale,
  /** hash → 國際服市集的英文文字，用來在多條規則間挑選 */
  tradeTexts?: ReadonlyMap<string, readonly string[]>
): ModLineVariants {
  const rulesByHash = indexRulesByHash(indexes);
  const result: ModLineVariants = {};
  for (const hash of new Set(tradeHashes)) {
    // 變體數量不同的規則無法確定對應關係，不採用；沒有可用規則時保留英文
    const rule = pickRule(rulesByHash.get(hash), tradeTexts?.get(hash), locale);
    const localized = rule?.variantsByLocale.get(locale);
    if (!rule || !localized) continue;
    const seen = new Set<string>();
    const pairs: Array<[string, string]> = [];
    rule.enVariants.forEach((variant, i) => {
      const pair: [string, string] = [formatVariant(variant, rule), formatVariant(localized[i], rule)];
      const key = pair.join('\u0000');
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(pair);
    });
    result[hash] = pairs;
  }
  return result;
}

/** 市集 /data/stats 裡出現過的所有 hash（不分類別） */
export function collectTradeHashes(trade: TradeStatsResponse): Set<string> {
  const hashes = new Set<string>();
  for (const category of trade.result) {
    for (const entry of category.entries) {
      const hash = entry.id.match(STAT_ID_PATTERN)?.[1];
      if (hash) hashes.add(hash);
    }
  }
  return hashes;
}

/** hash → 市集文字（同一 hash 可能在多個類別出現） */
export function collectTradeTexts(trade: TradeStatsResponse): Map<string, string[]> {
  const texts = new Map<string, string[]>();
  for (const category of trade.result) {
    for (const entry of category.entries) {
      const hash = entry.id.match(STAT_ID_PATTERN)?.[1];
      if (!hash || typeof entry.text !== 'string') continue;
      const known = texts.get(hash) ?? [];
      if (!known.includes(entry.text)) texts.set(hash, [...known, entry.text]);
    }
  }
  return texts;
}

/** 依序載入描述檔；找不到的檔案略過（主描述檔除外，由呼叫端保證） */
export async function loadStatDescriptionIndexes(
  getFile: (relPath: string) => Promise<Uint8Array | null>,
  parse: (text: string) => StatDescriptionIndex,
  relPaths: readonly string[]
): Promise<StatDescriptionIndex[]> {
  const indexes: StatDescriptionIndex[] = [];
  for (const relPath of relPaths) {
    const bytes = await getFile(relPath);
    if (!bytes) {
      console.warn(`  [!] 找不到描述檔 ${relPath}，略過`);
      continue;
    }
    indexes.push(parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf16le')));
  }
  return indexes;
}

export async function writeModLineArtifacts(
  outputDir: string,
  indexes: readonly StatDescriptionIndex[],
  trade: TradeStatsResponse,
  patch: string
): Promise<Record<ModLineLocale, number>> {
  const hashes = collectTradeHashes(trade);
  const tradeTexts = collectTradeTexts(trade);
  const counts = {} as Record<ModLineLocale, number>;
  for (const locale of MOD_LINE_LOCALES) {
    const lines = buildModLineVariants(indexes, hashes, locale, tradeTexts);
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    await fs.writeFile(
      path.join(localeDir, 'mod-lines.json'),
      JSON.stringify({ schemaVersion: 1, patch, locale, lines }),
      'utf-8'
    );
    counts[locale] = Object.keys(lines).length;
  }
  return counts;
}
