/**
 * 發布前的批次一致性驗證。
 *
 * mods-tiers.json、locales/<locale>/stats.json 與 items.json 以索引互相對齊，必須整批來自同一次建置；
 * mod-lines.json、result-labels.json 也屬於同一批（patch 相同）。
 * mercenary.json 與 locales/<locale>/mercenary.json（僅 poe1）自成一批。
 *
 * 由 PoeXD-Extension 的 scripts/sync-game-data.mjs 搬移而來，規則不變。
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Json = any;

export interface GameDataBatch {
  modsTiers: Json;
  stats: Record<string, Json>;
  items: Record<string, Json>;
  modLines?: Record<string, Json>;
  resultLabels?: Record<string, Json>;
}

export interface MercenaryBatch {
  data: Json;
  names: Record<string, Json>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 檢查一個版本的整批分片是否一致；回傳錯誤訊息陣列（空陣列表示一致） */
export function validateGameDataBatch(batch: GameDataBatch): string[] {
  const errors: string[] = [];
  const patch = batch.modsTiers?.patch;
  const tierCount = batch.modsTiers?.tiers?.length;
  if (!patch) errors.push('mods-tiers.json 缺少 patch');
  if (!Number.isInteger(tierCount)) errors.push('mods-tiers.json 缺少 tiers');

  for (const [locale, shard] of Object.entries(batch.stats)) {
    if (shard?.patch !== patch) {
      errors.push(`stats.json (${locale}) patch ${shard?.patch ?? '缺少'} ≠ ${patch}`);
    }
    if (shard?.tierTemplates?.length !== tierCount) {
      errors.push(`stats.json (${locale}) tierTemplates ${shard?.tierTemplates?.length} 筆 ≠ tiers ${tierCount} 筆`);
    }
  }

  const enItems = batch.items.en?.items?.length;
  if (Object.keys(batch.items).length > 0 && !Number.isInteger(enItems)) {
    errors.push('缺少 en/items.json，無法檢查物品分片對齊');
  }
  for (const [locale, shard] of Object.entries(batch.items)) {
    if (shard?.patch !== patch) {
      errors.push(`items.json (${locale}) patch ${shard?.patch ?? '缺少'} ≠ ${patch}`);
    }
    if (shard?.items?.length !== enItems) {
      errors.push(`items.json (${locale}) ${shard?.items?.length} 筆 ≠ en ${enItems} 筆`);
    }
  }
  const localeShards: Array<[string, Record<string, Json> | undefined, (shard: Json) => boolean]> = [
    ['mod-lines.json', batch.modLines, (shard) => isObject(shard.lines)],
    ['result-labels.json', batch.resultLabels, (shard) => isObject(shard.labels) && Array.isArray(shard.templates)],
  ];
  for (const [file, shards, hasValidBody] of localeShards) {
    for (const [locale, shard] of Object.entries(shards ?? {})) {
      if (shard?.patch !== patch) {
        errors.push(`${file} (${locale}) patch ${shard?.patch ?? '缺少'} ≠ ${patch}`);
      }
      if (shard?.schemaVersion !== 1 || shard?.locale !== locale || !hasValidBody(shard)) {
        errors.push(`${file} (${locale}) 語系或格式不符`);
      }
    }
  }
  return errors;
}

/** 檢查傭兵資料批次；回傳錯誤訊息陣列（空陣列表示一致） */
export function validateMercenaryBatch(batch: MercenaryBatch): string[] {
  const errors: string[] = [];
  const patch = batch.data?.patch;
  if (!patch) errors.push('mercenary.json 缺少 patch');
  const lengths: Record<string, unknown> = {
    builds: batch.data?.builds?.length,
    skills: batch.data?.skills?.length,
    supports: batch.data?.supports?.length,
  };
  for (const [key, length] of Object.entries(lengths)) {
    if (!Number.isInteger(length) || length === 0) errors.push(`mercenary.json 缺少 ${key}`);
  }
  if (!batch.names.en) errors.push('缺少 en/mercenary.json');
  for (const [locale, shard] of Object.entries(batch.names)) {
    if (shard?.patch !== patch) {
      errors.push(`mercenary.json (${locale}) patch ${shard?.patch ?? '缺少'} ≠ ${patch}`);
    }
    for (const [key, length] of Object.entries(lengths)) {
      if (shard?.[key]?.length !== length) {
        errors.push(`mercenary.json (${locale}) ${key} ${shard?.[key]?.length} 筆 ≠ ${length} 筆`);
      }
    }
  }
  return errors;
}

async function readJsonIfExists(path: string): Promise<Json | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listLocales(versionDir: string): Promise<string[]> {
  const dir = join(versionDir, 'locales');
  if (!existsSync(dir)) return [];
  return readdir(dir);
}

/** 從輸出目錄讀取一個版本的遊戲資料批次；沒有 mods-tiers.json 時回傳 null */
export async function loadGameDataBatch(outputDir: string, version: string): Promise<GameDataBatch | null> {
  const versionDir = join(outputDir, version);
  const modsTiers = await readJsonIfExists(join(versionDir, 'mods-tiers.json'));
  if (!modsTiers) return null;
  const batch: Required<GameDataBatch> = { modsTiers, stats: {}, items: {}, modLines: {}, resultLabels: {} };
  const files: Array<[keyof Omit<GameDataBatch, 'modsTiers'>, string]> = [
    ['stats', 'stats.json'],
    ['items', 'items.json'],
    ['modLines', 'mod-lines.json'],
    ['resultLabels', 'result-labels.json'],
  ];
  for (const locale of await listLocales(versionDir)) {
    for (const [key, file] of files) {
      const shard = await readJsonIfExists(join(versionDir, 'locales', locale, file));
      if (shard) batch[key][locale] = shard;
    }
  }
  return batch;
}

/** 從輸出目錄讀取傭兵資料批次；沒有 mercenary.json 時回傳 null */
export async function loadMercenaryBatch(outputDir: string, version: string): Promise<MercenaryBatch | null> {
  const versionDir = join(outputDir, version);
  const data = await readJsonIfExists(join(versionDir, 'mercenary.json'));
  if (!data) return null;
  const names: Record<string, Json> = {};
  for (const locale of await listLocales(versionDir)) {
    const shard = await readJsonIfExists(join(versionDir, 'locales', locale, 'mercenary.json'));
    if (shard) names[locale] = shard;
  }
  return { data, names };
}
