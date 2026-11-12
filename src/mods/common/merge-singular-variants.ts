import type { CollectedModTierRecord } from './lexicon-builder.js';

const PLACEHOLDER_COUNT = (template: string) => (template.match(/#/g) ?? []).length;

const paramValue = (param: CollectedModTierRecord['params'][number]): string[] => {
  if (typeof param === 'number') return [String(Math.abs(param))];
  const [min, max = min] = param;
  const low = Math.min(Math.abs(min), Math.abs(max));
  const high = Math.max(Math.abs(min), Math.abs(max));
  return low === high ? [String(low)] : [String(low), String(high)];
};

/**
 * 數值為 1 時遊戲改用沒有佔位符的單數句（「1 Added Passive Skill is a Jewel Socket」），
 * 會自成一組、沒有數值。市集代碼相同且另有帶 # 的分組時，把單數句併入該組並由 params 補上數值。
 */
export function mergeSingularVariants(
  records: ReadonlyArray<CollectedModTierRecord>
): CollectedModTierRecord[] {
  const pluralById = new Map<string, CollectedModTierRecord>();
  for (const rec of records) {
    if (rec.id && !rec.groupKey.includes('|||||') && PLACEHOLDER_COUNT(rec.groupKey) > 0 && !pluralById.has(rec.id)) {
      pluralById.set(rec.id, rec);
    }
  }
  return records.map((rec) => {
    if (!rec.id || rec.groupKey.includes('#') || rec.groupKey.includes('|||||')) return rec;
    const plural = pluralById.get(rec.id);
    if (!plural || PLACEHOLDER_COUNT(plural.groupKey) !== rec.params.length) return rec;
    return {
      ...rec,
      groupKey: plural.groupKey,
      templatesByLocale: plural.templatesByLocale,
      values: rec.params.map(paramValue),
    };
  });
}
