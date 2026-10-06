import * as fs from 'fs/promises';
import * as path from 'path';
import { toCdnUrl, FileLoader as BaseFileLoader, type BundleLoader } from 'pathofexile-dat/bundles.js';
import { readDatFile, type DatFile } from 'pathofexile-dat/dat.js';
import { readColumn, getHeaderLength, type Header } from 'pathofexile-dat/dat.js';
import { SCHEMA_URL, type SchemaFile, ValidFor } from 'pathofexile-dat-schema';

export interface NamedHeader extends Header {
  name: string;
}

export class CachingBundleLoader implements BundleLoader {
  private memoryCache = new Map<string, Uint8Array>();

  constructor(
    private cacheDir: string,
    private patchVer: string
  ) {}

  static async create(cacheRoot: string, patchVer: string): Promise<CachingBundleLoader> {
    const cacheDir = path.join(cacheRoot, patchVer);
    await fs.mkdir(cacheDir, { recursive: true });
    return new CachingBundleLoader(cacheDir, patchVer);
  }

  async fetchFile(name: string): Promise<Uint8Array> {
    const cachedMemory = this.memoryCache.get(name);
    if (cachedMemory) return cachedMemory;

    const diskFileName = name.replace(/[/\\:]/g, '@');
    const diskPath = path.join(this.cacheDir, diskFileName);

    try {
      const data = await fs.readFile(diskPath);
      this.memoryCache.set(name, data);
      return data;
    } catch {
      // not on disk, download
    }

    const url = toCdnUrl(this.patchVer, name);
    console.log(`[CDN] 下載 bundle: ${name} ...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`無法從 CDN 下載 bundle: ${name} (${resp.status} ${resp.statusText})`);
    }

    const buf = new Uint8Array(await resp.arrayBuffer());
    await fs.writeFile(diskPath, buf);
    this.memoryCache.set(name, buf);
    return buf;
  }
}

export class PoeDataLoader {
  private static sharedSchema: SchemaFile | null = null;
  private static schemaPromise: Promise<SchemaFile> | null = null;

  constructor(
    public readonly gameVersion: 'poe1' | 'poe2',
    public readonly patchVersion: string,
    public readonly fileLoader: BaseFileLoader<CachingBundleLoader>,
    private readonly cacheRoot: string
  ) {}

  static async create(
    gameVersion: 'poe1' | 'poe2' = 'poe2',
    cacheRoot = path.join(process.cwd(), '.cache')
  ): Promise<PoeDataLoader> {
    const isValidPatch = (ver: unknown): ver is string =>
      typeof ver === 'string' &&
      ver.trim() !== '' &&
      ver.trim().toLowerCase() !== 'error' &&
      /^\d+(\.\d+)+$/.test(ver.trim());

    const isVersionAccessible = async (ver: string): Promise<boolean> => {
      // 1. 若本地已快取 _.index.bin，直接判定可用
      const localIndex = path.join(cacheRoot, 'bundles', ver, '_.index.bin');
      try {
        await fs.access(localIndex);
        return true;
      } catch {
        // 本地無快取
      }

      // 2. 向官方 CDN 發送 HEAD 請求驗證 index 檔案是否存在
      try {
        const url = toCdnUrl(ver, '_.index.bin');
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
        return resp.ok;
      } catch {
        return false;
      }
    };

    console.log(`[CDN] 檢查 ${gameVersion === 'poe1' ? 'PoE 1' : 'PoE 2'} 最新版本 (via poe-versions.obsoleet.org)...`);
    let patchVersion = '';

    // 來源 1: poe-versions.obsoleet.org
    try {
      const verResp = await fetch('https://poe-versions.obsoleet.org', {
        signal: AbortSignal.timeout(5000),
      });
      if (verResp.ok) {
        const verJson = (await verResp.json()) as { poe?: string; poe2?: string };
        const candidate = gameVersion === 'poe1' ? verJson.poe : verJson.poe2;
        if (isValidPatch(candidate) && (await isVersionAccessible(candidate.trim()))) {
          patchVersion = candidate.trim();
        }
      }
    } catch {
      // 忽略錯誤，轉入備用來源
    }

    // 來源 2: ggpk.exposed
    if (!patchVersion) {
      console.log(`[CDN] 嘗試備用來源查詢 ${gameVersion} 最新版本 (via ggpk.exposed)...`);
      try {
        const fallbackParam = gameVersion === 'poe1' ? '1' : '2';
        const fallbackResp = await fetch(`https://ggpk.exposed/version?poe=${fallbackParam}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (fallbackResp.ok) {
          const fallbackUrl = (await fallbackResp.text()).trim();
          const candidate = fallbackUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
          if (isValidPatch(candidate)) {
            if (await isVersionAccessible(candidate)) {
              patchVersion = candidate;
            } else {
              console.warn(`[CDN] 警告：備用來源回傳之版本 ${candidate} 於 CDN 上不可用 (404/失效)。`);
            }
          }
        }
      } catch {
        // 忽略錯誤
      }
    }

    // 來源 3: 本地 output/version.json 歷史紀錄
    if (!patchVersion) {
      try {
        const verJsonFile = path.join(process.cwd(), 'output', 'version.json');
        const verContent = await fs.readFile(verJsonFile, 'utf-8');
        const parsed = JSON.parse(verContent);
        const candidate = parsed?.[gameVersion]?.patchVersion;
        if (isValidPatch(candidate) && (await isVersionAccessible(candidate))) {
          patchVersion = candidate;
          console.warn(`[CDN] 警告：遠端版本伺服器失效或版號過期，回退使用 output/version.json 歷史成功版本: ${patchVersion}`);
        }
      } catch {
        // 忽略
      }
    }

    // 來源 4: 本地 .cache/bundles 目錄歷史快取
    if (!patchVersion) {
      try {
        const bundlesDir = path.join(cacheRoot, 'bundles');
        const entries = await fs.readdir(bundlesDir);
        const validVersions = entries.filter((e) => isValidPatch(e));
        if (validVersions.length > 0) {
          validVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          const prefix = gameVersion === 'poe1' ? '3.' : '4.';
          const matched = validVersions.filter((v) => v.startsWith(prefix));
          for (const ver of [...matched, ...validVersions]) {
            if (await isVersionAccessible(ver)) {
              patchVersion = ver;
              console.warn(`[CDN] 警告：遠端版本伺服器失效或版號過期，回退使用本地 bundles 快取版本: ${patchVersion}`);
              break;
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    if (!patchVersion) {
      throw new Error(`[CDN] 無法取得 ${gameVersion} 有效版本號（所有遠端來源均失效且無可用本地快取）。`);
    }

    console.log(`[CDN] ${gameVersion} 當前版本: ${patchVersion}`);

    const bundleLoader = await CachingBundleLoader.create(path.join(cacheRoot, 'bundles'), patchVersion);
    const fileLoader = await BaseFileLoader.create(bundleLoader);

    return new PoeDataLoader(gameVersion, patchVersion, fileLoader, cacheRoot);
  }

  async getSchema(): Promise<SchemaFile> {
    if (PoeDataLoader.sharedSchema) return PoeDataLoader.sharedSchema;
    if (!PoeDataLoader.schemaPromise) {
      PoeDataLoader.schemaPromise = this.fetchSchemaInternal();
    }
    return PoeDataLoader.schemaPromise;
  }

  private async fetchSchemaInternal(): Promise<SchemaFile> {
    const schemaCachePath = path.join(this.cacheRoot, 'schema.min.json');
    const metaCachePath = path.join(this.cacheRoot, 'schema.meta.json');

    let cachedSchema: SchemaFile | null = null;
    let meta: { etag?: string; lastModified?: string } = {};

    try {
      const cached = await fs.readFile(schemaCachePath, 'utf-8');
      cachedSchema = JSON.parse(cached);
      try {
        meta = JSON.parse(await fs.readFile(metaCachePath, 'utf-8'));
      } catch {
        // 無 meta 檔案
      }
    } catch {
      // 本地無 schema 快取
    }

    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.lastModified) headers['If-Modified-Since'] = meta.lastModified;

    try {
      console.log('[Schema] 檢查 dat-schema 是否有更新 (via GitHub)...');
      const resp = await fetch(SCHEMA_URL, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (resp.status === 304 && cachedSchema) {
        console.log('[Schema] dat-schema 已是最新 (HTTP 304)，使用本地快取。');
        PoeDataLoader.sharedSchema = cachedSchema;
        return cachedSchema;
      }

      if (resp.ok) {
        const json = (await resp.json()) as SchemaFile;
        await fs.mkdir(this.cacheRoot, { recursive: true });
        await fs.writeFile(schemaCachePath, JSON.stringify(json));

        const newMeta: { etag?: string; lastModified?: string } = {};
        const etag = resp.headers.get('etag');
        const lastMod = resp.headers.get('last-modified');
        if (etag) newMeta.etag = etag;
        if (lastMod) newMeta.lastModified = lastMod;
        await fs.writeFile(metaCachePath, JSON.stringify(newMeta));

        console.log(`[Schema] 已下載並更新最新 dat-schema (版本產生時間: ${new Date((json.createdAt || 0) * 1000).toLocaleString()})`);
        PoeDataLoader.sharedSchema = json;
        return json;
      }
    } catch (err) {
      if (cachedSchema) {
        console.warn(`[Schema] 檢查更新失敗 (${err instanceof Error ? err.message : err})，直接使用既有本地快取。`);
        PoeDataLoader.sharedSchema = cachedSchema;
        return cachedSchema;
      }
      throw new Error(`無法取得 dat-schema: ${err instanceof Error ? err.message : err}`);
    }

    if (cachedSchema) {
      PoeDataLoader.sharedSchema = cachedSchema;
      return cachedSchema;
    }

    throw new Error('無法取得 dat-schema');
  }

  async getFile(relPath: string): Promise<Uint8Array | null> {
    return this.fileLoader.tryGetFileContents(relPath);
  }

  async loadTable(
    tableName: string,
    options: {
      language?: 'English' | 'Traditional Chinese';
      basePath?: string;
    } = {}
  ): Promise<Record<string, any>[]> {
    const schema = await this.getSchema();
    const lang = options.language ?? 'English';
    const basePath = options.basePath ?? (this.gameVersion === 'poe1' ? 'Data' : 'Data/Balance');

    const dirPath = lang === 'Traditional Chinese' ? `${basePath}/Traditional Chinese` : basePath;
    const datPath = `${dirPath}/${tableName}.datc64`;

    let fileBytes = await this.fileLoader.tryGetFileContents(datPath);
    if (!fileBytes && lang !== 'English') {
      // fallback to English base if language specific file does not exist
      fileBytes = await this.fileLoader.tryGetFileContents(`${basePath}/${tableName}.datc64`);
    }

    if (!fileBytes) {
      throw new Error(`找不到資料表檔案: ${datPath}`);
    }

    const datFile = readDatFile('.datc64', fileBytes);
    const headers = this.buildHeaders(tableName, datFile, schema);

    const columns = headers.map((header) => ({
      name: header.name,
      data: readColumn(header, datFile),
    }));

    columns.unshift({
      name: '_index',
      data: Array(datFile.rowCount).fill(0).map((_, i) => i),
    });

    const rows: Record<string, any>[] = [];
    for (let i = 0; i < datFile.rowCount; i++) {
      const row: Record<string, any> = {};
      for (const col of columns) {
        row[col.name] = col.data[i];
      }
      rows.push(row);
    }

    return rows;
  }

  private buildHeaders(name: string, datFile: DatFile, schema: SchemaFile): NamedHeader[] {
    const foundByName = schema.tables.filter((s) => s.name === name);
    const targetValidFor = this.gameVersion === 'poe1' ? ValidFor.PoE1 : ValidFor.PoE2;
    const sch = foundByName.find((s) => (s.validFor & targetValidFor) !== 0) ?? foundByName[0];
    if (!sch) {
      throw new Error(`在 dat-schema 中找不到資料表 "${name}"`);
    }

    const headers: NamedHeader[] = [];
    let offset = 0;

    for (const column of sch.columns) {
      const header: NamedHeader = {
        name: column.name || '',
        offset,
        type: {
          array: column.array,
          interval: column.interval,
          integer:
            column.type === 'u16' ? { unsigned: true, size: 2 }
            : column.type === 'u32' ? { unsigned: true, size: 4 }
            : column.type === 'i16' ? { unsigned: false, size: 2 }
            : column.type === 'i32' ? { unsigned: false, size: 4 }
            : column.type === 'enumrow' ? { unsigned: false, size: 4 }
            : column.type === 'array' ? { unsigned: true, size: 1 }
            : undefined,
          decimal: column.type === 'f32' ? { size: 4 } : undefined,
          string: column.type === 'string' ? {} : undefined,
          boolean: column.type === 'bool' ? {} : undefined,
          key:
            column.type === 'row' || column.type === 'foreignrow'
              ? { foreign: column.type === 'foreignrow' }
              : undefined,
        },
      };

      headers.push(header);
      offset += getHeaderLength(header, datFile);
    }

    return headers;
  }
}
