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

/** 依描述檔順序建立 hash → 規則；同一 hash 以先出現者為準 */
function indexRulesByHash(indexes: readonly StatDescriptionIndex[]): Map<string, StatDescriptionRule> {
  const byHash = new Map<string, StatDescriptionRule>();
  for (const index of indexes) {
    for (const rule of index.getRules()) {
      const hash = String(computeGggStatHash(rule.statIds));
      if (!byHash.has(hash)) byHash.set(hash, rule);
    }
  }
  return byHash;
}

export function buildModLineVariants(
  indexes: readonly StatDescriptionIndex[],
  tradeHashes: Iterable<string>,
  locale: ModLineLocale
): ModLineVariants {
  const rulesByHash = indexRulesByHash(indexes);
  const result: ModLineVariants = {};
  for (const hash of new Set(tradeHashes)) {
    const rule = rulesByHash.get(hash);
    const localized = rule?.variantsByLocale.get(locale);
    // 變體數量不同時無法確定對應關係，保留英文
    if (!rule || !localized || localized.length !== rule.enVariants.length) continue;
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
  const counts = {} as Record<ModLineLocale, number>;
  for (const locale of MOD_LINE_LOCALES) {
    const lines = buildModLineVariants(indexes, hashes, locale);
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
