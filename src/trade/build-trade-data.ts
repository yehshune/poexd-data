/**
 * 產生市集篩選翻譯與市集漢化資料（`build:trade`）。
 *
 * 輸出（相對於 output/）：
 * - <version>/locales/<locale>/trade-filters.json   各語系官方市集 /data/filters + pseudo stats
 * - locales/<locale>/trade-ui.json                  市集漢化介面字典（zh-TW、zh-CN）
 * - <version>/locales/<locale>/trade-stats.json     市集漢化 stats（zh-TW、zh-CN，另有 en）
 * - <version>/locales/<locale>/trade-static.json    市集漢化 static（zh-TW、zh-CN）
 *
 * en 必須成功（執行期後備語系），否則整批不寫入；其他語系失敗時保留 output/ 內既有檔案並列在摘要。
 * 全部抓取與驗證完成後才寫入：先寫暫存檔，全部成功才逐一改名，避免留下半套資料。
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  GAME_VERSION_ROUTES,
  LOCALE_REALM_HOSTS,
  REQUIRED_LOCALES,
  buildArtifactFromApi,
  buildFiltersUrl,
  buildStaticUrl,
  buildStatsUrl,
  isGameVersion,
  isTradeLocale,
  stableJson,
  validateArtifact,
  type FiltersResponse,
  type GameVersion,
  type StatsResponse,
  type TradeFiltersArtifact,
} from './trade-filter-api.js';
import { recordBatch } from '../publish/batch-log.js';
import type { BatchId } from '../publish/catalog.js';
import {
  MARKET_LOCALES,
  buildStaticArtifact,
  buildStatsArtifact,
  buildUiArtifact,
  getUiDictionaryUrls,
  isMarketLocale,
  validateStaticArtifact,
  validateStatsArtifact,
  validateUiArtifact,
  type TradeDataResponse,
} from './market-translation-api.js';

const REQUEST_INTERVAL_MS = 1000;
const FILTERS_TIMEOUT_MS = 20000;
const MARKET_TIMEOUT_MS = 30000;
const USER_AGENT = 'poexd-data trade data builder (+https://github.com/yehshune/poexd-data)';

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 大型分片不縮排：stats 每個語系可達數百 KB，縮排只會增加打包大小 */
const compactJson = (value: unknown) => `${JSON.stringify(value)}\n`;

async function fetchWithTimeout(url: string, accept: string, timeoutMs: number): Promise<Response> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const fetchJson = async <T>(url: string, timeoutMs: number): Promise<T> =>
  (await fetchWithTimeout(url, 'application/json', timeoutMs)).json() as Promise<T>;

const fetchText = async (url: string, timeoutMs: number): Promise<string> =>
  (await fetchWithTimeout(url, 'application/javascript', timeoutMs)).text();

/** 依序嘗試主網址與備援網址，全部失敗時列出每個網址的原因 */
async function fetchFirstAvailableText(urls: string[]): Promise<string> {
  const reasons: string[] = [];
  for (const url of urls) {
    try {
      return await fetchText(url, MARKET_TIMEOUT_MS);
    } catch (error) {
      reasons.push(`${url}（${describeError(error)}）`);
    }
  }
  throw new Error(reasons.join('；'));
}

export interface PendingWrite {
  /** 相對於輸出目錄的路徑 */
  path: string;
  content: string;
}

export interface TradeBuildResult {
  writes: PendingWrite[];
  /** 抓取失敗、保留既有檔案的項目 */
  failures: string[];
  /** 抓取失敗、沿用上一版的語系 */
  stale: string[];
}

const log = (line: string) => process.stdout.write(`${line}\n`);

// ── 篩選翻譯 ──────────────────────────────────────────────

async function buildFiltersForVersion(version: GameVersion, locales: string[]): Promise<TradeBuildResult> {
  const artifacts: Record<string, TradeFiltersArtifact> = {};
  const failures: string[] = [];
  const stale: string[] = [];
  for (const locale of locales) {
    const url = buildFiltersUrl(locale, version);
    try {
      const filtersResponse = await fetchJson<FiltersResponse>(url, FILTERS_TIMEOUT_MS);
      await sleep(REQUEST_INTERVAL_MS);
      const statsResponse = await fetchJson<StatsResponse>(buildStatsUrl(locale, version), FILTERS_TIMEOUT_MS);
      const artifact = buildArtifactFromApi(filtersResponse, { gameVersion: version, locale, statsResponse });
      artifacts[locale] = validateArtifact(artifact, artifacts.en);
      const fieldCount = Object.keys(artifact.fields).length;
      const pseudoCount = Object.keys(artifact.pseudoStats ?? {}).length;
      log(`  filters ${version} ${locale.padEnd(5)} ✓ ${fieldCount} 個欄位、${pseudoCount} 個 pseudo`);
    } catch (error) {
      const reason = describeError(error);
      if (REQUIRED_LOCALES.includes(locale)) {
        throw new Error(`${version} ${locale} 為必要語系，抓取失敗：${reason}（${url}）`);
      }
      failures.push(`filters ${version} ${locale}: ${reason}`);
      stale.push(locale);
      log(`  filters ${version} ${locale.padEnd(5)} ✗ ${reason}，保留既有檔案`);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  const writes = Object.entries(artifacts).map(([locale, artifact]) => ({
    path: join(version, 'locales', locale, 'trade-filters.json'),
    content: stableJson(artifact),
  }));
  return { writes, failures, stale };
}

// ── 市集漢化 ──────────────────────────────────────────────

async function buildUiWrites(locales: string[]): Promise<TradeBuildResult> {
  const writes: PendingWrite[] = [];
  const failures: string[] = [];
  const stale: string[] = [];
  for (const locale of locales) {
    try {
      const artifact = validateUiArtifact(
        buildUiArtifact(await fetchFirstAvailableText(getUiDictionaryUrls(locale)), { locale }),
      );
      writes.push({ path: join('locales', locale, 'trade-ui.json'), content: compactJson(artifact) });
      log(`  ui      ${locale.padEnd(5)} ✓ ${Object.keys(artifact.strings).length} 個字串`);
    } catch (error) {
      failures.push(`ui ${locale}: ${describeError(error)}`);
      stale.push(locale);
      log(`  ui      ${locale.padEnd(5)} ✗ ${describeError(error)}，保留既有檔案`);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  return { writes, failures, stale };
}

async function fetchMarketEnglish(version: GameVersion) {
  try {
    const statsResponse = await fetchJson<TradeDataResponse>(buildStatsUrl('en', version), MARKET_TIMEOUT_MS);
    await sleep(REQUEST_INTERVAL_MS);
    const staticResponse = await fetchJson<TradeDataResponse>(buildStaticUrl('en', version), MARKET_TIMEOUT_MS);
    await sleep(REQUEST_INTERVAL_MS);
    return {
      statsResponse,
      staticResponse,
      statsArtifact: buildStatsArtifact(statsResponse, { gameVersion: version, locale: 'en' }),
      staticArtifact: buildStaticArtifact(staticResponse, { gameVersion: version, locale: 'en' }),
    };
  } catch (error) {
    throw new Error(`${version} en 為必要語系，抓取失敗：${describeError(error)}`);
  }
}

async function buildMarketForVersion(version: GameVersion, locales: string[]): Promise<TradeBuildResult> {
  const english = await fetchMarketEnglish(version);
  const writes: PendingWrite[] = [
    {
      path: join(version, 'locales', 'en', 'trade-stats.json'),
      content: compactJson(validateStatsArtifact(english.statsArtifact)),
    },
  ];
  const failures: string[] = [];
  const stale: string[] = [];
  for (const locale of locales) {
    try {
      const statsResponse = await fetchJson<TradeDataResponse>(buildStatsUrl(locale, version), MARKET_TIMEOUT_MS);
      await sleep(REQUEST_INTERVAL_MS);
      const staticResponse = await fetchJson<TradeDataResponse>(buildStaticUrl(locale, version), MARKET_TIMEOUT_MS);
      const options = { gameVersion: version, locale };
      const stats = validateStatsArtifact(
        buildStatsArtifact(statsResponse, { ...options, englishResponse: english.statsResponse }),
        english.statsArtifact,
      );
      const statics = validateStaticArtifact(
        buildStaticArtifact(staticResponse, { ...options, englishResponse: english.staticResponse }),
        english.staticArtifact,
      );
      const dir = join(version, 'locales', locale);
      writes.push(
        { path: join(dir, 'trade-stats.json'), content: compactJson(stats) },
        { path: join(dir, 'trade-static.json'), content: compactJson(statics) },
      );
      const covered = Object.keys(stats.stats).length;
      const total = Object.keys(english.statsArtifact.stats).length;
      const staticCount = Object.values(statics.entries).reduce((sum, group) => sum + Object.keys(group).length, 0);
      log(
        `  market  ${version} ${locale.padEnd(5)} ✓ stats ${covered}/${total}（${Math.round((covered / total) * 100)}%）、static ${staticCount} 筆`,
      );
    } catch (error) {
      failures.push(`market ${version} ${locale}: ${describeError(error)}`);
      stale.push(locale);
      log(`  market  ${version} ${locale.padEnd(5)} ✗ ${describeError(error)}，保留既有檔案`);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
  return { writes, failures, stale };
}

// ── 寫入 ─────────────────────────────────────────────────

/** 先把所有內容寫成暫存檔，全部成功後才改名；任一步失敗就清掉暫存檔，不動既有檔案 */
export async function commitWrites(outputDir: string, writes: PendingWrite[]): Promise<void> {
  const staged: Array<{ temp: string; target: string }> = [];
  try {
    for (const write of writes) {
      const target = join(outputDir, write.path);
      const temp = `${target}.tmp-${process.pid}`;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temp, write.content, 'utf8');
      staged.push({ temp, target });
    }
  } catch (error) {
    await Promise.all(staged.map(({ temp }) => rm(temp, { force: true })));
    throw error;
  }
  for (const { temp, target } of staged) await rename(temp, target);
}

// ── 進入點 ───────────────────────────────────────────────

export interface TradeBuildOptions {
  /** 篩選翻譯的語系；省略為全部。en 一律包含 */
  locales?: string[];
  versions?: string[];
  /** 略過市集漢化介面字典 */
  skipUi?: boolean;
  /** 只建置其中一部分 */
  parts?: Array<'filters' | 'market'>;
}

export function parseTradeArgs(argv: string[]): TradeBuildOptions {
  const locales: string[] = [];
  let versions: string[] | undefined;
  let skipUi = false;
  const parts: Array<'filters' | 'market'> = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--locale') locales.push(argv[++i]);
    else if (arg === '--version') versions = [argv[++i]];
    else if (arg === '--skip-ui') skipUi = true;
    else if (arg === '--only') {
      const part = argv[++i];
      if (part !== 'filters' && part !== 'market') throw new Error(`未知的 --only：${part}`);
      parts.push(part);
    } else throw new Error(`未知參數：${arg}`);
  }
  return {
    ...(locales.length > 0 ? { locales } : {}),
    ...(versions ? { versions } : {}),
    skipUi,
    ...(parts.length > 0 ? { parts } : {}),
  };
}

export async function buildTradeData(outputDir: string, options: TradeBuildOptions = {}): Promise<TradeBuildResult> {
  const versions = options.versions ?? Object.keys(GAME_VERSION_ROUTES);
  for (const version of versions) {
    if (!isGameVersion(version)) throw new Error(`不支援的遊戲版本：${version}`);
  }
  const requested = options.locales ?? Object.keys(LOCALE_REALM_HOSTS);
  for (const locale of requested) {
    if (!isTradeLocale(locale)) throw new Error(`不支援的語系：${locale}`);
  }
  // en 永遠要抓：它是後備語系，也用來偵測其他網域是否回傳英文
  const filterLocales = [...new Set(['en', ...requested])];
  // 市集漢化只處理請求中屬於目標語系的部分；沒指定語系時處理全部目標語系
  const marketLocales = options.locales ? requested.filter(isMarketLocale) : [...MARKET_LOCALES];
  const parts = new Set(options.parts ?? ['filters', 'market']);

  // 篩選翻譯與市集漢化是互不相依的一致性批次：各自整批寫入，一批失敗不影響另一批
  // records：整批寫入成功後要記錄的批次與其沿用上一版的語系
  const batches: Array<{
    name: string;
    run: () => Promise<{ results: TradeBuildResult[]; records: Array<[BatchId, string[]]> }>;
  }> = [];
  if (parts.has('filters')) {
    batches.push({
      name: 'filters',
      run: async () => {
        const results: TradeBuildResult[] = [];
        const records: Array<[BatchId, string[]]> = [];
        for (const version of versions as GameVersion[]) {
          const result = await buildFiltersForVersion(version, filterLocales);
          results.push(result);
          records.push([`${version}/trade-filters`, result.stale]);
        }
        return { results, records };
      },
    });
  }
  if (parts.has('market')) {
    batches.push({
      name: 'market',
      run: async () => {
        const results: TradeBuildResult[] = [];
        if (!options.skipUi) results.push(await buildUiWrites(marketLocales));
        for (const version of versions as GameVersion[]) {
          results.push(await buildMarketForVersion(version, marketLocales));
        }
        const stale = [...new Set(results.flatMap((result) => result.stale))];
        return { results, records: [['market', stale]] };
      },
    });
  }

  const writes: PendingWrite[] = [];
  const failures: string[] = [];
  const batchErrors: string[] = [];
  for (const batch of batches) {
    try {
      const { results, records } = await batch.run();
      const batchWrites = results.flatMap((result) => result.writes);
      await commitWrites(outputDir, batchWrites);
      for (const [id, staleLocales] of records) await recordBatch(outputDir, id, { staleLocales });
      writes.push(...batchWrites);
      failures.push(...results.flatMap((result) => result.failures));
    } catch (error) {
      batchErrors.push(`${batch.name}: ${describeError(error)}`);
      log(`[trade] ${batch.name} 整批未寫入：${describeError(error)}`);
    }
  }

  log(`[trade] 已更新 ${writes.length} 個檔案`);
  if (failures.length > 0) log(`[trade] 未更新（保留既有檔案）：\n  - ${failures.join('\n  - ')}`);
  if (batchErrors.length > 0) throw new Error(`[trade] 必要資料抓取失敗：${batchErrors.join('；')}`);
  return { writes, failures, stale: [] };
}
