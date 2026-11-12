import { computeGggStatHash } from './murmurhash2.js';
import {
  SUPPORTED_AFFIX_LOCALES,
  normalizeLineFormat,
  type StatDescriptionIndex,
  type StatDescriptionRule,
  type SupportedAffixLocale,
} from './stat-descriptions.js';
import type { TradeStatsResponse } from './trade-stats.js';

/**
 * 市集詞綴的標準寫法（每個市集代碼一條，各語系一個模板）。
 *
 * 市集對每個代碼只有一種寫法，正負向由 GGG 逐條決定，無法從描述檔推導
 * （例如能力值需求的詞綴在遊戲裡都是負值，市集卻寫 increased；藥劑充能使用的
 * 第一個變體是 increased，市集卻寫 reduced）。因此以國際服英文市集文字為準，
 * 找出描述檔裡相符的英文變體，各語系再取同一個索引的變體。
 */
export type TradeStatTemplates = Map<string, Partial<Record<SupportedAffixLocale, string>>>;

const STAT_ID_PATTERN = /^[a-z_]+\.stat_(\d+)$/;
const ESCAPED_NEWLINE = '\\n';

/** 比對用的正規化：佔位符統一為 #、去掉正負號、空白與市集獨有的結尾括號（例如 (Local)） */
export function normalizeForTradeMatch(text: string): string {
  return text
    .split(ESCAPED_NEWLINE)
    .join(' ')
    .replace(/\{\d*(?::[^}]*)?\}/g, '#')
    .replace(/[+-]#/g, '#')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/\([^()]*\)$/, '');
}

function indexRulesByHash(index: StatDescriptionIndex): Map<string, StatDescriptionRule> {
  const byHash = new Map<string, StatDescriptionRule>();
  for (const rule of index.getRules()) {
    const hash = String(computeGggStatHash(rule.statIds));
    if (!byHash.has(hash)) byHash.set(hash, rule);
  }
  return byHash;
}

function indexTradeTexts(trade: TradeStatsResponse): Map<string, string> {
  const texts = new Map<string, string>();
  for (const category of trade.result) {
    for (const entry of category.entries) {
      if (!texts.has(entry.id)) texts.set(entry.id, entry.text);
    }
  }
  return texts;
}

function renderLocaleTemplates(
  rule: StatDescriptionRule,
  variantIndex: number
): Partial<Record<SupportedAffixLocale, string>> {
  const englishCount = rule.enVariants.length;
  const templates: Partial<Record<SupportedAffixLocale, string>> = {};
  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    const variants = rule.variantsByLocale.get(locale);
    // 變體數量不同時無法確定對應關係，交給原本的行為處理
    if (!variants || variants.length !== englishCount) continue;
    const variant = variants[variantIndex];
    templates[locale] = normalizeLineFormat(
      variant.format,
      variant.negatedIndices,
      rule.statIds.length,
      0
    );
  }
  return templates;
}

/** 為指定的市集代碼產生各語系的標準寫法；找不到描述規則或相符變體的代碼不會出現在結果中 */
export function buildTradeStatTemplates(
  index: StatDescriptionIndex,
  trade: TradeStatsResponse,
  statIds: Iterable<string>
): TradeStatTemplates {
  const rulesByHash = indexRulesByHash(index);
  const tradeTexts = indexTradeTexts(trade);
  const result: TradeStatTemplates = new Map();

  for (const statId of new Set(statIds)) {
    const hash = statId.match(STAT_ID_PATTERN)?.[1];
    const tradeText = tradeTexts.get(statId);
    const rule = hash ? rulesByHash.get(hash) : undefined;
    if (!tradeText || !rule) continue;

    const target = normalizeForTradeMatch(tradeText);
    const variantIndex = rule.enVariants.findIndex(
      (variant) => normalizeForTradeMatch(variant.format) === target
    );
    if (variantIndex < 0) continue;
    result.set(statId, renderLocaleTemplates(rule, variantIndex));
  }
  return result;
}
