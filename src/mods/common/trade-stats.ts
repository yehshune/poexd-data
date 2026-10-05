import * as fs from 'fs/promises';
import * as path from 'path';
import { computeGggStatHash } from './murmurhash2.js';

export interface TradeStatEntry {
  id: string;
  text: string;
  type: string;
}

export interface TradeStatCategory {
  id: string;
  label: string;
  entries: TradeStatEntry[];
}

export interface TradeStatsResponse {
  result: TradeStatCategory[];
}

export interface FindStatOptions {
  preferredCategories?: string[];
  isLocal?: boolean;
  context?: string | string[];
  fuzzyFallback?: boolean;
  fallbackGlobal?: boolean;
  ruleStatIds?: string[][];
}

export interface ResolvedStatIds {
  singleId?: string;
  splitIds?: string[];
  allIds: string[];
}

export function cleanStatString(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\\r\\n|\\r|\\n/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\+\s*/, '')
    .replace(/[+#%]+/g, '#')
    .replace(/#+/g, '#')
    .replace(/[^a-z0-9#()]/g, '')
    .trim();
}

export class TradeStatIndex {
  // category -> cleaned text -> TradeStatEntry
  private indexByCategory = new Map<string, Map<string, TradeStatEntry>>();
  // all categories -> cleaned text -> TradeStatEntry
  private globalIndex = new Map<string, TradeStatEntry>();
  // category -> hash string -> TradeStatEntry
  private indexByHashAndCategory = new Map<string, Map<string, TradeStatEntry>>();
  // all categories -> hash string -> TradeStatEntry
  private globalHashIndex = new Map<string, TradeStatEntry>();

  constructor(public readonly rawData: TradeStatsResponse) {
    this.buildIndex();
  }

  private buildIndex() {
    for (const cat of this.rawData.result || []) {
      const textMap = new Map<string, TradeStatEntry>();
      const hashMap = new Map<string, TradeStatEntry>();

      for (const entry of cat.entries || []) {
        if (!entry.text) continue;
        const cleaned = cleanStatString(entry.text);
        textMap.set(cleaned, entry);
        if (!this.globalIndex.has(cleaned)) {
          this.globalIndex.set(cleaned, entry);
        }

        const num = entry.id.split('_').pop();
        if (num && /^\d+$/.test(num)) {
          hashMap.set(num, entry);
          if (!this.globalHashIndex.has(num)) {
            this.globalHashIndex.set(num, entry);
          }
        }
      }
      this.indexByCategory.set(cat.id, textMap);
      this.indexByHashAndCategory.set(cat.id, hashMap);
    }
  }

  findSingleStatId(
    templateText: string,
    options: FindStatOptions = {}
  ): string | null {
    if (!templateText) return null;

    const preferredCats = options.preferredCategories || ['explicit'];

    const lookupSingle = (cleaned: string): string | null => {
      if (!cleaned) return null;
      for (const cat of preferredCats) {
        const map = this.indexByCategory.get(cat);
        if (map && map.has(cleaned)) {
          return map.get(cleaned)!.id;
        }
      }
      if (options.fallbackGlobal && this.globalIndex.has(cleaned)) {
        return this.globalIndex.get(cleaned)!.id;
      }
      return null;
    };

    const contexts = options.context
      ? Array.isArray(options.context)
        ? options.context.map((c) => c.toLowerCase())
        : [options.context.toLowerCase()]
      : [];

    const isBondedContext = contexts.includes('bonded');

    const resolveCandidate = (rawText: string): string | null => {
      const cleaned = cleanStatString(rawText);
      if (!cleaned) return null;

      // 建立極性變體 (例如 reduced <-> increased)
      const polarityVariants = [cleaned];
      const inv1 = cleaned
        .replace(/reduced/g, 'increased')
        .replace(/less/g, 'more')
        .replace(/slower/g, 'faster');
      if (inv1 !== cleaned) polarityVariants.push(inv1);

      const inv2 = cleaned
        .replace(/increased/g, 'reduced')
        .replace(/more/g, 'less')
        .replace(/faster/g, 'slower');
      if (inv2 !== cleaned && !polarityVariants.includes(inv2)) polarityVariants.push(inv2);

      // 若以 #of 開頭 (例如 #% of damage blocked is recouped as mana)，官方 Trade API 有時會省略 #% of
      const baseVariants: string[] = [];
      for (const p of polarityVariants) {
        baseVariants.push(p);
        if (p.startsWith('#of')) {
          baseVariants.push(p.replace(/^#of/, ''));
        }
      }

      // 建立 Bonded 前綴變體 (符文詞綴)
      const semanticVariants: string[] = [];
      for (const p of baseVariants) {
        if (isBondedContext) {
          if (p.startsWith('bonded')) {
            semanticVariants.push(p);
            semanticVariants.push(p.replace(/^bonded/, ''));
          } else {
            semanticVariants.push(`bonded${p}`);
            semanticVariants.push(p);
          }
        } else {
          semanticVariants.push(p);
          // 若非 bonded 情境，只有本身已帶有 bonded 的文字才嘗試剝除前綴
          if (p.startsWith('bonded')) {
            semanticVariants.push(p.replace(/^bonded/, ''));
          }
        }
      }

      // 依照 Context 與 isLocal 組合候選比對鍵
      // 1. 若 isLocal 為 true，最優先比對 (local)
      if (options.isLocal) {
        for (const v of semanticVariants) {
          const hit = lookupSingle(`${v}(local)`);
          if (hit) return hit;
        }
      }

      // 2. 若有特定情境 (如 charm, flask, shields, staves)，優先比對對應後綴
      if (contexts.length > 0) {
        for (const ctx of contexts) {
          for (const v of semanticVariants) {
            const hit = lookupSingle(`${v}(${ctx})`);
            if (hit) return hit;
          }
        }
      }

      // 3. 一般精確與變體比對
      for (const v of semanticVariants) {
        const hit = lookupSingle(v);
        if (hit) return hit;
      }

      return null;
    };

    return resolveCandidate(templateText);
  }

  resolveStatIds(
    templateText: string,
    options: FindStatOptions = {}
  ): ResolvedStatIds | null {
    if (!templateText) return null;

    // 0. 最高優先級 (GGG 官方底層數學對齊)：若具備內部 stat_descriptions 規則之 statId 陣列，嘗試透過 MurmurHash2 精確解析
    if (options.ruleStatIds && options.ruleStatIds.length > 0) {
      const preferredCats = options.preferredCategories || ['explicit'];
      const lookupHash = (statIds: string[]): string | null => {
        if (!statIds || statIds.length === 0) return null;
        const hash = computeGggStatHash(statIds);
        const hashStr = String(hash);

        for (const cat of preferredCats) {
          const map = this.indexByHashAndCategory.get(cat);
          if (map && map.has(hashStr)) {
            return map.get(hashStr)!.id;
          }
        }
        if (options.fallbackGlobal && this.globalHashIndex.has(hashStr)) {
          return this.globalHashIndex.get(hashStr)!.id;
        }
        return null;
      };

      if (options.ruleStatIds.length === 1) {
        const hitId = lookupHash(options.ruleStatIds[0]);
        if (hitId) {
          return {
            singleId: hitId,
            allIds: [hitId],
          };
        }
      } else {
        const matchedParts: string[] = [];
        for (const lineStatIds of options.ruleStatIds) {
          const hitId = lookupHash(lineStatIds);
          if (hitId) {
            matchedParts.push(hitId);
          } else {
            break;
          }
        }
        if (matchedParts.length === options.ruleStatIds.length && matchedParts.length > 0) {
          return {
            splitIds: matchedParts,
            allIds: matchedParts,
          };
        }
      }
    }

    // 1. 優先嘗試全範本解析 (包含官方複合詞合併條目)
    const fullMatch = this.findSingleStatId(templateText, options);
    if (fullMatch) {
      return {
        singleId: fullMatch,
        allIds: [fullMatch],
      };
    }

    // 2. 若為複合詞 (|||||)，逐一嘗試解析每一個子詞條
    if (templateText.includes('|||||')) {
      const parts = templateText
        .split('|||||')
        .map((p) => p.trim())
        .filter(Boolean);
      const matchedParts: string[] = [];

      for (const part of parts) {
        const partMatch = this.findSingleStatId(part, options);
        if (partMatch) {
          matchedParts.push(partMatch);
        } else {
          // 若有任一子詞條無法解析，則視為無法完整對齊，避免產生殘缺 ID
          return null;
        }
      }

      if (matchedParts.length === parts.length && matchedParts.length > 0) {
        return {
          splitIds: matchedParts,
          allIds: matchedParts,
        };
      }
    }

    return null;
  }

  findStatId(
    templateText: string,
    options: FindStatOptions = {}
  ): string | null {
    const res = this.resolveStatIds(templateText, options);
    return res?.singleId || null;
  }
}

export async function fetchTradeStats(
  gameVersion: 'poe1' | 'poe2',
  cacheDir = path.join(process.cwd(), '.cache')
): Promise<TradeStatIndex> {
  const cacheFile = path.join(cacheDir, `trade_stats_${gameVersion}.json`);
  await fs.mkdir(cacheDir, { recursive: true });

  try {
    const cached = await fs.readFile(cacheFile, 'utf-8');
    const json = JSON.parse(cached) as TradeStatsResponse;
    return new TradeStatIndex(json);
  } catch {
    // 快取不存在，進行網路下載
  }

  const url =
    gameVersion === 'poe2'
      ? 'https://www.pathofexile.com/api/trade2/data/stats'
      : 'https://www.pathofexile.com/api/trade/data/stats';

  console.log(`[TradeAPI] 抓取 ${gameVersion} 官方 Trade Stats (${url})...`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) poexd-data',
    },
  });

  if (!resp.ok) {
    throw new Error(`無法取得 Trade Stats (${resp.status} ${resp.statusText})`);
  }

  const json = (await resp.json()) as TradeStatsResponse;
  await fs.writeFile(cacheFile, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`[TradeAPI] ${gameVersion} Trade Stats 已寫入快取: ${cacheFile}`);

  return new TradeStatIndex(json);
}
