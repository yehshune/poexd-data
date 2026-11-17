import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 補回「以天賦節點為參數」但該服市集沒收的 stat。
 *
 * 國際服把「1 個附加的天賦為 X」（`enchant.stat_3599615742|<節點>`）拆成每個節點一條，
 * 國服市集整組都沒有，但同一批節點在國服都有塗油「配置 X」（`enchant.stat_2954116742|<節點>`）。
 * 兩者的參數都是天賦節點，所以：
 * 1. 依遊戲描述檔（`stat-text.json`）的來源句型，從該服塗油文字取出天賦譯名；
 * 2. 套用目標 stat 的句型組出文字。
 * 天賦譯名與句型都是該服官方寫法，不從其他語系轉換；句型或文字對不上時整筆不補。
 */
export interface PassiveNodeStatDerivation {
  /** 要補的 stat 代碼（不含 `|<節點>`） */
  target: string;
  /** 提供天賦譯名的 stat 代碼（不含 `|<節點>`） */
  source: string;
}

export const PASSIVE_NODE_STAT_DERIVATIONS: readonly PassiveNodeStatDerivation[] = [
  { target: 'enchant.stat_3599615742', source: 'enchant.stat_2954116742' },
];

/** stat hash → 譯文句型（只收單一句型、單一參數的規則） */
export type StatTemplates = ReadonlyMap<string, string>;

const PLACEHOLDER = /\{0(?::[^}]*)?\}/g;
const ANY_PLACEHOLDER = /\{\d+(?::[^}]*)?\}/g;

/** `enchant.stat_3599615742` → `3599615742` */
const hashOf = (statId: string) => statId.slice(statId.lastIndexOf('_') + 1);

/** 讀遊戲描述檔產物；檔案不存在時回傳 undefined（例如本機第一次建置） */
export async function loadStatTemplates(outputDir: string, version: string, locale: string): Promise<StatTemplates | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(outputDir, version, 'locales', locale, 'stat-text.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseStatTemplates(JSON.parse(raw));
}

export function parseStatTemplates(data: unknown): StatTemplates {
  const lines = (data as { lines?: unknown } | null)?.lines;
  if (typeof lines !== 'object' || lines === null) throw new Error('stat-text.json 格式錯誤：缺少 lines');
  const templates = new Map<string, string>();
  for (const [hash, rules] of Object.entries(lines as Record<string, unknown>)) {
    if (!Array.isArray(rules) || rules.length !== 1) continue;
    const [pair] = rules;
    if (!Array.isArray(pair) || typeof pair[1] !== 'string') continue;
    if ((pair[1].match(ANY_PLACEHOLDER) ?? []).length !== 1 || (pair[1].match(PLACEHOLDER) ?? []).length !== 1) continue;
    templates.set(hash, pair[1]);
  }
  return templates;
}

const splitTemplate = (template: string): [string, string] => {
  const [prefix, suffix] = template.split(PLACEHOLDER);
  return [prefix, suffix];
};

/** 從來源文字取出參數；前後綴對不上或參數為空時回傳 undefined */
const extractParameter = (text: string, template: string): string | undefined => {
  const [prefix, suffix] = splitTemplate(template);
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return undefined;
  const value = text.slice(prefix.length, text.length - suffix.length).trim();
  return value === '' ? undefined : value;
};

/**
 * 回傳補上之後的新 stats（不改動傳入的物件）與補了幾筆。
 * 只補英文有、該服沒有的 `<target>|<節點>`；對應的來源條目必須是單一文字。
 */
export function fillPassiveNodeStats<T extends string | string[]>(
  stats: Readonly<Record<string, T>>,
  englishIds: Iterable<string>,
  templates: StatTemplates,
  derivations: readonly PassiveNodeStatDerivation[] = PASSIVE_NODE_STAT_DERIVATIONS,
): { stats: Record<string, T | string>; filled: number } {
  const result: Record<string, T | string> = { ...stats };
  let filled = 0;
  const ids = [...englishIds];
  for (const { target, source } of derivations) {
    const targetTemplate = templates.get(hashOf(target));
    const sourceTemplate = templates.get(hashOf(source));
    if (!targetTemplate || !sourceTemplate) continue;
    const [targetPrefix, targetSuffix] = splitTemplate(targetTemplate);
    for (const id of ids) {
      if (!id.startsWith(`${target}|`) || id in result) continue;
      const sourceText = result[`${source}|${id.slice(target.length + 1)}`];
      if (typeof sourceText !== 'string') continue;
      const name = extractParameter(sourceText, sourceTemplate);
      if (!name) continue;
      result[id] = `${targetPrefix}${name}${targetSuffix}`;
      filled++;
    }
  }
  return { stats: result, filled };
}
