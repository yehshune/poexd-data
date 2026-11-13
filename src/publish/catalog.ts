/**
 * 發布目錄：哪些檔案列入 manifest、各自屬於哪個一致性批次。
 *
 * 只列 PoeXD-Extension 會用到的檔案；atlas、icons、unmatched-report 不列入。
 * 路徑一律使用 `/` 分隔、相對於輸出目錄。
 */

export const GAME_VERSIONS = ['poe1', 'poe2'] as const;

export type BatchId =
  | `${(typeof GAME_VERSIONS)[number]}/game`
  | 'poe1/mercenary'
  | `${(typeof GAME_VERSIONS)[number]}/trade-filters`
  | 'market';

const LOCALE = '[A-Za-z]{2}(?:-[A-Za-z]{2})?';
const VERSION = '(poe1|poe2)';

const RULES: Array<{ pattern: RegExp; batch: (match: RegExpExecArray) => BatchId }> = [
  { pattern: new RegExp(`^${VERSION}/mods-tiers\\.json$`), batch: (m) => `${m[1]}/game` as BatchId },
  {
    pattern: new RegExp(`^${VERSION}/locales/${LOCALE}/(?:stats|items|mod-lines|result-labels)\\.json$`),
    batch: (m) => `${m[1]}/game` as BatchId,
  },
  { pattern: /^poe1\/mercenary\.json$/, batch: () => 'poe1/mercenary' },
  { pattern: new RegExp(`^poe1/locales/${LOCALE}/mercenary\\.json$`), batch: () => 'poe1/mercenary' },
  {
    pattern: new RegExp(`^${VERSION}/locales/${LOCALE}/trade-filters\\.json$`),
    batch: (m) => `${m[1]}/trade-filters` as BatchId,
  },
  { pattern: new RegExp(`^locales/${LOCALE}/trade-ui\\.json$`), batch: () => 'market' },
  {
    pattern: new RegExp(`^${VERSION}/locales/${LOCALE}/trade-(?:stats|static)\\.json$`),
    batch: () => 'market',
  },
];

/** 回傳檔案所屬批次；不在發布目錄內的檔案回傳 null */
export function batchOf(relativePath: string): BatchId | null {
  const path = relativePath.replace(/\\/g, '/');
  for (const rule of RULES) {
    const match = rule.pattern.exec(path);
    if (match) return rule.batch(match);
  }
  return null;
}

/** 每次發布都必須存在的檔案：缺任何一個都不部署 */
export const REQUIRED_FILES: readonly string[] = Object.freeze(
  GAME_VERSIONS.flatMap((version) => [
    `${version}/mods-tiers.json`,
    `${version}/locales/en/stats.json`,
    `${version}/locales/en/items.json`,
    `${version}/locales/en/trade-filters.json`,
    `${version}/locales/en/trade-stats.json`,
  ]),
);
