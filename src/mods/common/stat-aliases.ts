import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 舊英文寫法別名（`<version>/stat-aliases.json`）。
 *
 * GGG 改寫英文時（例如 3.30 把 `#% increased Rarity of Items found` 改成 `+#% to Item Rarity`），
 * 之前匯出的物品文字仍是舊寫法，用新的模板對不到。這份檔案記錄每個 stat hash 的
 * `[舊英文模板, 現行英文模板]`，與語系無關：使用端以現行模板在 stat-text.json 找到譯文，
 * 再讓舊寫法也對到同一個譯文。
 *
 * 來源有二：一次性從 Path of Building Community（MIT）歷次匯出的描述檔回補（`data/stat-aliases/`），
 * 以及每次建置時比對上一版發布的英文模板，自動記下被改寫的句子。
 */
export type StatAliases = Record<string, Array<[legacy: string, current: string]>>;

export interface StatAliasFile {
  schemaVersion: 1;
  patch: string;
  aliases: StatAliases;
}

const PLACEHOLDER = /\{(\d+):\+?([dn])\}/g;
const WORD = /[a-z]+/g;

/** 佔位符的編號（排序後） */
const placeholderIndices = (template: string) =>
  [...template.matchAll(PLACEHOLDER)]
    .map((match) => match[1])
    .sort()
    .join(',');

/** 佔位符的編號與取負與否 */
const placeholderKinds = (template: string) =>
  [...template.matchAll(PLACEHOLDER)]
    .map((match) => `${match[1]}${match[2]}`)
    .sort()
    .join(',');

function wordSimilarity(left: string, right: string): number {
  const words = (text: string) => new Set(text.replace(PLACEHOLDER, ' ').toLowerCase().match(WORD) ?? []);
  const a = words(left);
  const b = words(right);
  const shared = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

/**
 * 同一個 hash 前後兩版的英文模板，找出被改寫的句子：`[舊模板, 新模板]`。
 *
 * 舊模板只對到佔位符編號相同的新模板；有多個候選時先比取負與否（增加／減少），再比字詞重疊。
 * 新模板只有一個時，所有被移除的舊模板都對到它（例如增加、減少兩種寫法合併成 `+#%`）；
 * 有多個候選又完全沒有共同字詞時不猜。
 */
export function detectRewording(
  previous: readonly string[],
  current: readonly string[]
): Array<[string, string]> {
  const removed = previous.filter((template) => !current.includes(template));
  const added = current.filter((template) => !previous.includes(template));
  if (removed.length === 0 || added.length === 0) return [];
  return removed.flatMap((old): Array<[string, string]> => {
    const sameIndices = added.filter((template) => placeholderIndices(template) === placeholderIndices(old));
    if (sameIndices.length === 0) return [];
    if (sameIndices.length === 1) return [[old, sameIndices[0]]];
    const sameKinds = sameIndices.filter((template) => placeholderKinds(template) === placeholderKinds(old));
    const pool = sameKinds.length > 0 ? sameKinds : sameIndices;
    const scored = pool
      .map((template) => ({ template, score: wordSimilarity(old, template) }))
      .sort((left, right) => right.score - left.score);
    if (pool.length > 1 && scored[0].score === 0) return [];
    return [[old, scored[0].template]];
  });
}

/** 每個 hash 前後兩版的改寫 */
export function detectAllRewording(
  previous: ReadonlyMap<string, readonly string[]>,
  current: ReadonlyMap<string, readonly string[]>
): StatAliases {
  const result: StatAliases = {};
  for (const [hash, templates] of previous) {
    const now = current.get(hash);
    if (!now) continue;
    const pairs = detectRewording(templates, now);
    if (pairs.length > 0) result[hash] = pairs;
  }
  return result;
}

/**
 * 合併多份別名並對齊現行模板：舊模板若已是現行寫法就移除；目標若又被改寫，
 * 沿著同一個 hash 的別名接到最新寫法；接不到現行寫法的別名移除。輸出依 hash 排序。
 */
export function mergeAliases(
  sources: readonly StatAliases[],
  current: ReadonlyMap<string, readonly string[]>
): StatAliases {
  const combined = new Map<string, Map<string, string>>();
  for (const source of sources) {
    for (const [hash, pairs] of Object.entries(source)) {
      if (!Array.isArray(pairs)) continue;
      const byLegacy = combined.get(hash) ?? new Map<string, string>();
      combined.set(hash, byLegacy);
      for (const pair of pairs) {
        if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') continue;
        // 後面的來源較新，覆蓋同一個舊模板
        byLegacy.set(pair[0], pair[1]);
      }
    }
  }

  const result: StatAliases = {};
  for (const hash of [...combined.keys()].sort()) {
    const now = current.get(hash) ?? [];
    const byLegacy = combined.get(hash)!;
    const pairs: Array<[string, string]> = [];
    for (const [legacy, target] of byLegacy) {
      if (now.includes(legacy)) continue;
      let resolved = target;
      const visited = new Set<string>([legacy]);
      while (!now.includes(resolved) && byLegacy.has(resolved) && !visited.has(resolved)) {
        visited.add(resolved);
        resolved = byLegacy.get(resolved)!;
      }
      if (now.includes(resolved)) pairs.push([legacy, resolved]);
    }
    if (pairs.length > 0) result[hash] = pairs.sort((left, right) => left[0].localeCompare(right[0]));
  }
  return result;
}

async function readJson(file: string): Promise<unknown> {
  if (!existsSync(file)) return undefined;
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 讀取別名檔的 `aliases`；不存在或格式不符時回傳空物件 */
export async function readAliasFile(file: string): Promise<StatAliases> {
  const data = await readJson(file);
  return isRecord(data) && isRecord(data.aliases) ? (data.aliases as StatAliases) : {};
}

/** 上一版發布的 stat-text.json 裡每個 hash 的英文模板；沒有時回傳 undefined */
export async function readPublishedEnglish(file: string): Promise<Map<string, string[]> | undefined> {
  const data = await readJson(file);
  if (!isRecord(data) || !isRecord(data.lines)) return undefined;
  const result = new Map<string, string[]>();
  for (const [hash, pairs] of Object.entries(data.lines)) {
    if (!Array.isArray(pairs)) continue;
    const english = pairs.flatMap((pair) => (Array.isArray(pair) && typeof pair[0] === 'string' ? [pair[0]] : []));
    if (english.length > 0) result.set(hash, english);
  }
  return result;
}

export async function writeAliasFile(file: string, patch: string, aliases: StatAliases): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body: StatAliasFile = { schemaVersion: 1, patch, aliases };
  await fs.writeFile(file, JSON.stringify(body), 'utf-8');
}
