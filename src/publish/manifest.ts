/**
 * 產生 output/manifest.json：發布目錄內每個檔案的 sha256、大小、所屬批次與格式版本。
 *
 * 用戶端（PoeXD-Extension 的 data:sync，以及之後的執行期遠端更新）依此驗證下載內容，
 * 並以批次為單位整批採用。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readBatchLog, type BatchLog } from './batch-log.js';
import { batchOf, type BatchId } from './catalog.js';

export const MANIFEST_FILE = 'manifest.json';
export const MANIFEST_VERSION = 1;

export interface ManifestFile {
  batch: BatchId;
  sha256: string;
  bytes: number;
  /** 檔案自身的頂層 schemaVersion；沒有時省略 */
  schema?: number;
}

export interface Manifest {
  manifestVersion: number;
  generatedAt: string;
  sourceCommit?: string;
  games: Record<string, { patchVersion: string }>;
  batches: BatchLog;
  files: Record<string, ManifestFile>;
}

/** 依路徑排序列出目錄下所有檔案（相對路徑，`/` 分隔） */
export async function listFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(relative(rootDir, full).replace(/\\/g, '/'));
    }
  };
  if (existsSync(rootDir)) await walk(rootDir);
  return result.sort();
}

/** 列出發布目錄內的檔案 */
export async function listCatalogFiles(rootDir: string): Promise<string[]> {
  return (await listFiles(rootDir)).filter((path) => batchOf(path) !== null);
}

const readSchemaVersion = (content: Buffer): number | undefined => {
  // 只看檔頭，避免為了讀一個欄位解析數 MB 的 JSON
  const head = content.subarray(0, 256).toString('utf8');
  const match = /^\{\s*"schemaVersion"\s*:\s*(\d+)/.exec(head);
  return match ? Number(match[1]) : undefined;
};

export async function describeFile(rootDir: string, path: string): Promise<ManifestFile> {
  const batch = batchOf(path);
  if (!batch) throw new Error(`${path} 不在發布目錄內`);
  const content = await readFile(join(rootDir, path));
  const schema = readSchemaVersion(content);
  return {
    batch,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: content.length,
    ...(schema !== undefined ? { schema } : {}),
  };
}

async function readGames(outputDir: string): Promise<Manifest['games']> {
  const path = join(outputDir, 'version.json');
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const games: Manifest['games'] = {};
  for (const version of ['poe1', 'poe2']) {
    const patchVersion = parsed?.[version]?.patchVersion;
    if (typeof patchVersion === 'string' && patchVersion) games[version] = { patchVersion };
  }
  return games;
}

export async function buildManifest(
  outputDir: string,
  { sourceCommit, now = new Date() }: { sourceCommit?: string; now?: Date } = {},
): Promise<Manifest> {
  const files: Record<string, ManifestFile> = {};
  for (const path of await listCatalogFiles(outputDir)) files[path] = await describeFile(outputDir, path);
  const log = await readBatchLog(outputDir);
  // 只保留實際有檔案的批次紀錄
  const present = new Set(Object.values(files).map((file) => file.batch));
  const batches = Object.fromEntries(
    Object.entries(log).filter(([id]) => present.has(id as BatchId)),
  ) as BatchLog;
  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: now.toISOString(),
    ...(sourceCommit ? { sourceCommit } : {}),
    games: await readGames(outputDir),
    batches,
    files,
  };
}

export async function writeManifest(outputDir: string, manifest: Manifest): Promise<void> {
  const path = join(outputDir, MANIFEST_FILE);
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}
