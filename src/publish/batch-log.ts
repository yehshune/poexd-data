/**
 * 批次建置紀錄（output/batches.json）。
 *
 * 每個建置目標完成後記下自己的批次資訊；部署時隨 output/ 一起發布，下次建置會沿用，
 * 所以只重建部分目標時，其他批次的紀錄維持上一版。manifest 由這份紀錄組出 `batches`。
 */
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BatchId } from './catalog.js';

export const BATCH_LOG_FILE = 'batches.json';

export interface BatchRecord {
  readonly builtAt: string;
  /** 遊戲資料批次的 patch 版號 */
  readonly patch?: string;
  /** 本次抓取失敗、沿用上一版的語系 */
  readonly staleLocales?: readonly string[];
}

export type BatchLog = Readonly<Partial<Record<BatchId, BatchRecord>>>;

export async function readBatchLog(outputDir: string): Promise<BatchLog> {
  const path = join(outputDir, BATCH_LOG_FILE);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${BATCH_LOG_FILE} 格式錯誤`);
  }
  return parsed as BatchLog;
}

/** 回傳加入新紀錄後的新物件，不修改傳入的紀錄 */
export function withBatchRecord(log: BatchLog, id: BatchId, record: BatchRecord): BatchLog {
  const normalized: BatchRecord = {
    builtAt: record.builtAt,
    ...(record.patch ? { patch: record.patch } : {}),
    ...(record.staleLocales && record.staleLocales.length > 0
      ? { staleLocales: [...record.staleLocales].sort() }
      : {}),
  };
  return { ...log, [id]: normalized };
}

export async function recordBatch(outputDir: string, id: BatchId, record: Omit<BatchRecord, 'builtAt'> & { builtAt?: string }) {
  const log = await readBatchLog(outputDir);
  const next = withBatchRecord(log, id, { ...record, builtAt: record.builtAt ?? new Date().toISOString() });
  const path = join(outputDir, BATCH_LOG_FILE);
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}
