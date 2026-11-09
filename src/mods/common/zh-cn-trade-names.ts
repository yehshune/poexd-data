import * as fs from 'fs/promises';
import * as path from 'path';
import type { LocaleItemsShard } from './types.js';
import type { SupportedAffixLocale } from './stat-descriptions.js';
import { TRAD_CJK_CHARS, SIMP_CJK_CHARS } from './zh-cn-data.js';

/**
 * 簡體中文物品名來源：國服（騰訊）官方交易 API。
 *
 * GGG 官方 CDN 沒有 `Data/Simplified Chinese/*.datc64`，而國服譯名與繁中譯名經常不同
 * （例如 Orb of Annulment：台服「撤銷石」、國服「剝離石」），因此不能把繁中逐字轉成簡體輸出。
 * 這裡把國際服與國服的 `/api/trade{,2}/data/items` 依分類做序列對齊，
 * 取得「英文名 → 國服簡中名」對照；對不上的條目由呼叫端退回英文。
 *
 * 繁轉簡字表只用來替對齊打相似度分數，絕不直接成為輸出內容。
 */

export interface TradeItemEntry {
  type: string;
  name?: string;
  text?: string;
  disc?: string;
  flags?: { unique?: boolean };
}

export interface TradeItemCategory {
  id: string;
  label?: string;
  entries: TradeItemEntry[];
}

export interface TradeItemsResponse {
  result: TradeItemCategory[];
}

export interface AlignTradeItemNamesInput {
  international: TradeItemsResponse;
  tencent: TradeItemsResponse;
  /** key 為小寫英文名，value 為官方繁中名（來自 GGG dat） */
  englishToZhTw: ReadonlyMap<string, string>;
}

/** 相似度達此門檻的配對視為錨點；錨點之間長度相等的區段才依位置配對 */
export const ANCHOR_SIMILARITY = 0.34;

const POE_ZH_TW_TO_CN_PHRASES: ReadonlyArray<readonly [string, string]> = [['換界石', '引路石']];

const TRAD_TO_SIMP_MAP: ReadonlyMap<string, string> = new Map(
  Array.from(TRAD_CJK_CHARS, (ch, i) => [ch, SIMP_CJK_CHARS[i]] as const),
);

/** 繁轉簡逐字轉換。僅供對齊評分使用，不可當作簡中輸出。 */
export function convertTradToSimpChinese(input: string): string {
  if (!input) return input;
  const phrased = POE_ZH_TW_TO_CN_PHRASES.reduce(
    (text, [tw, cn]) => text.replaceAll(tw, cn),
    input,
  );
  return Array.from(phrased, (ch) => TRAD_TO_SIMP_MAP.get(ch) ?? ch).join('');
}

function bigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < text.length; i++) grams.add(text.slice(i, i + 2));
  return grams;
}

export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size + gb.size === 0) return 0;
  let shared = 0;
  ga.forEach((g) => {
    if (gb.has(g)) shared++;
  });
  return (2 * shared) / (ga.size + gb.size);
}

const entryLabel = (entry: TradeItemEntry): string => entry.name ?? entry.type;

const isUnique = (entry: TradeItemEntry): boolean => entry.flags?.unique === true;

function isStructurallyCompatible(a: TradeItemEntry, b: TradeItemEntry): boolean {
  return (
    Boolean(a.name) === Boolean(b.name) &&
    isUnique(a) === isUnique(b) &&
    (a.disc ?? '') === (b.disc ?? '')
  );
}

type Scorer = (i: number, j: number) => number;

function createScorer(
  intl: readonly TradeItemEntry[],
  cn: readonly TradeItemEntry[],
  englishToZhTw: ReadonlyMap<string, string>,
): Scorer {
  return (i, j) => {
    if (!isStructurallyCompatible(intl[i], cn[j])) return -1;
    const zhTw = englishToZhTw.get(entryLabel(intl[i]).toLowerCase());
    if (!zhTw) return 0.01;
    return diceSimilarity(convertTradToSimpChinese(zhTw), entryLabel(cn[j]));
  };
}

/** 最大化相似度總和的序列對齊，回傳依序排列的配對 [i, j, score] */
function alignSequences(m: number, n: number, score: Scorer): Array<[number, number, number]> {
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = score(i - 1, j - 1);
      const diag = s > 0 ? dp[i - 1][j - 1] + s : -Infinity;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], diag);
    }
  }
  const path: Array<[number, number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const s = score(i - 1, j - 1);
    if (s > 0 && dp[i][j] === dp[i - 1][j - 1] + s) {
      path.push([i - 1, j - 1, s]);
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }
  return path.reverse();
}

/**
 * 錨點直接採用；兩錨點之間若國際服與國服條目數相同，代表兩邊沒有增刪，依位置一一配對。
 * 條目數不同的區段無法確定對應關係，整段放棄（由呼叫端退回英文）。
 */
function pairCategory(
  intl: readonly TradeItemEntry[],
  cn: readonly TradeItemEntry[],
  englishToZhTw: ReadonlyMap<string, string>,
): Array<[TradeItemEntry, TradeItemEntry]> {
  const score = createScorer(intl, cn, englishToZhTw);
  const anchors = alignSequences(intl.length, cn.length, score).filter(
    ([, , s]) => s >= ANCHOR_SIMILARITY,
  );
  const bounds: Array<[number, number]> = [
    [-1, -1],
    ...anchors.map(([i, j]): [number, number] => [i, j]),
    [intl.length, cn.length],
  ];
  const pairs: Array<[TradeItemEntry, TradeItemEntry]> = anchors.map(([i, j]) => [intl[i], cn[j]]);
  for (let q = 0; q + 1 < bounds.length; q++) {
    const [i0, j0] = bounds[q];
    const [i1, j1] = bounds[q + 1];
    const gap = i1 - i0 - 1;
    if (gap <= 0 || gap !== j1 - j0 - 1) continue;
    for (let r = 1; r <= gap; r++) {
      if (score(i0 + r, j0 + r) >= 0) pairs.push([intl[i0 + r], cn[j0 + r]]);
    }
  }
  return pairs;
}

export function alignTradeItemNames(input: AlignTradeItemNamesInput): Map<string, string> {
  const names = new Map<string, string>();
  const cnById = new Map(input.tencent.result.map((c) => [c.id, c.entries]));
  for (const category of input.international.result) {
    const cnEntries = cnById.get(category.id);
    if (!cnEntries) continue;
    for (const [intl, cn] of pairCategory(category.entries, cnEntries, input.englishToZhTw)) {
      const key = entryLabel(intl).toLowerCase();
      const value = entryLabel(cn).trim();
      if (value && !names.has(key)) names.set(key, value);
    }
  }
  return names;
}

/** 以國服名稱覆寫 zh-CN 分片，對不上的保留原值（英文）。回傳新物件，不修改輸入。 */
export function applyZhCnItemNames(
  shards: Readonly<Record<SupportedAffixLocale, LocaleItemsShard>>,
  zhCnByEnglish: ReadonlyMap<string, string>,
): Record<SupportedAffixLocale, LocaleItemsShard> {
  const zhCnItems = shards.en.items.map(
    (enName, i) => zhCnByEnglish.get(enName.toLowerCase()) ?? shards['zh-CN'].items[i],
  );
  return { ...shards, 'zh-CN': { ...shards['zh-CN'], items: zhCnItems } };
}

const TRADE_ITEMS_URLS = {
  poe1: {
    international: 'https://www.pathofexile.com/api/trade/data/items',
    tencent: 'https://poe.game.qq.com/api/trade/data/items',
  },
  poe2: {
    international: 'https://www.pathofexile.com/api/trade2/data/items',
    tencent: 'https://poe.game.qq.com/api/trade2/data/items',
  },
} as const;

function isTradeItemsResponse(value: unknown): value is TradeItemsResponse {
  const result = (value as TradeItemsResponse | null)?.result;
  return Array.isArray(result) && result.every((c) => typeof c?.id === 'string' && Array.isArray(c.entries));
}

/** 下載交易物品資料；成功時寫入快取，失敗時回退舊快取，兩者皆無則回傳 null。 */
async function fetchTradeItems(url: string, cacheFile: string): Promise<TradeItemsResponse | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) poexd-data' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const json: unknown = await resp.json();
    if (!isTradeItemsResponse(json)) throw new Error('回應格式不符');
    await fs.writeFile(cacheFile, JSON.stringify(json), 'utf-8');
    return json;
  } catch (err) {
    try {
      const cached: unknown = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
      console.warn(`[TradeAPI] 抓取 ${url} 失敗 (${String(err)})，改用舊快取: ${cacheFile}`);
      return isTradeItemsResponse(cached) ? cached : null;
    } catch {
      console.warn(`[TradeAPI] 抓取 ${url} 失敗 (${String(err)})，且無可用快取`);
      return null;
    }
  }
}

/**
 * 取得「小寫英文名 → 國服簡中名」對照。任一來源無法取得時回傳空表，
 * zh-CN 分片會整份退回英文，但不中斷整體建置。
 */
export async function fetchZhCnTradeItemNames(
  gameVersion: 'poe1' | 'poe2',
  englishToZhTw: ReadonlyMap<string, string>,
  cacheDir = path.join(process.cwd(), '.cache'),
): Promise<Map<string, string>> {
  await fs.mkdir(cacheDir, { recursive: true });
  const urls = TRADE_ITEMS_URLS[gameVersion];
  const [international, tencent] = await Promise.all([
    fetchTradeItems(urls.international, path.join(cacheDir, `trade_items_${gameVersion}_international.json`)),
    fetchTradeItems(urls.tencent, path.join(cacheDir, `trade_items_${gameVersion}_tencent.json`)),
  ]);
  if (!international || !tencent) {
    console.warn(`[TradeAPI] ${gameVersion} 缺少交易物品資料，zh-CN 物品名將退回英文`);
    return new Map();
  }
  return alignTradeItemNames({ international, tencent, englishToZhTw });
}
