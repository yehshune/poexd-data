/**
 * 部署前的驗證閘門：任一項失敗就不部署，gh-pages 維持上一版。
 *
 * 1. 必要檔案都存在。
 * 2. 發布目錄內每個檔案都是可解析的 JSON。
 * 3. 遊戲資料與傭兵資料批次一致（同一 patch、索引對齊）。
 * 4. 與上一版（baseline）相比：檔案不能消失，也不能縮水超過門檻，除非明確允許。
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadGameDataBatch, loadMercenaryBatch, validateGameDataBatch, validateMercenaryBatch } from './batch-validation.js';
import { GAME_VERSIONS, REQUIRED_FILES } from './catalog.js';
import { listCatalogFiles } from './manifest.js';

/** 檔案比上一版小超過這個比例就判定異常 */
export const MAX_SHRINK_RATIO = 0.3;

export interface VerifyOptions {
  /** 上一版發布內容所在目錄；省略時不做縮水與消失檢查 */
  baselineDir?: string;
  /** 允許檔案縮水或消失（例如官方確實移除了大量條目時手動放行） */
  allowShrink?: boolean;
}

export interface SizeChange {
  path: string;
  before: number;
  after: number | null;
}

/** 純函式：比較前後大小，回傳超出門檻的變化（after 為 null 表示檔案消失） */
export function findShrunkFiles(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  maxShrinkRatio = MAX_SHRINK_RATIO,
): SizeChange[] {
  const changes: SizeChange[] = [];
  for (const [path, size] of before) {
    const current = after.get(path);
    if (current === undefined) changes.push({ path, before: size, after: null });
    else if (size > 0 && current < size * (1 - maxShrinkRatio)) changes.push({ path, before: size, after: current });
  }
  return changes;
}

async function sizesOf(rootDir: string): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  for (const path of await listCatalogFiles(rootDir)) sizes.set(path, (await stat(join(rootDir, path))).size);
  return sizes;
}

export async function verifyOutput(outputDir: string, options: VerifyOptions = {}): Promise<string[]> {
  const errors: string[] = [];

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(outputDir, path))) errors.push(`缺少必要檔案 ${path}`);
  }

  const files = await listCatalogFiles(outputDir);
  for (const path of files) {
    try {
      JSON.parse(await readFile(join(outputDir, path), 'utf8'));
    } catch (error) {
      errors.push(`${path} 不是有效的 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const version of GAME_VERSIONS) {
    const game = await loadGameDataBatch(outputDir, version);
    if (game) errors.push(...validateGameDataBatch(game).map((error) => `${version}/game: ${error}`));
    const mercenary = await loadMercenaryBatch(outputDir, version);
    if (mercenary) errors.push(...validateMercenaryBatch(mercenary).map((error) => `${version}/mercenary: ${error}`));
  }

  if (options.baselineDir && existsSync(options.baselineDir)) {
    const changes = findShrunkFiles(await sizesOf(options.baselineDir), await sizesOf(outputDir));
    for (const change of changes) {
      const message =
        change.after === null
          ? `${change.path} 在本次發布中消失（上一版 ${change.before} bytes）`
          : `${change.path} 縮水 ${Math.round((1 - change.after / change.before) * 100)}%（${change.before} → ${change.after} bytes）`;
      if (options.allowShrink) process.stdout.write(`[verify] 已允許：${message}\n`);
      else errors.push(message);
    }
  }

  return errors;
}
