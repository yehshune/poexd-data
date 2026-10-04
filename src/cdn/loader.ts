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
  private schema: SchemaFile | null = null;

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
    console.log(`[CDN] 檢查 ${gameVersion === 'poe1' ? 'PoE 1' : 'PoE 2'} 最新版本 (via poe-versions.obsoleet.org)...`);
    let patchVersion = '';
    try {
      const verResp = await fetch('https://poe-versions.obsoleet.org');
      const verJson = (await verResp.json()) as { poe: string; poe2: string };
      patchVersion = gameVersion === 'poe1' ? verJson.poe : verJson.poe2;
    } catch {
      const fallbackParam = gameVersion === 'poe1' ? '1' : '2';
      const fallbackResp = await fetch(`https://ggpk.exposed/version?poe=${fallbackParam}`);
      const fallbackUrl = (await fallbackResp.text()).trim();
      patchVersion = fallbackUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
    }
    console.log(`[CDN] ${gameVersion} 當前版本: ${patchVersion}`);

    const bundleLoader = await CachingBundleLoader.create(path.join(cacheRoot, 'bundles'), patchVersion);
    const fileLoader = await BaseFileLoader.create(bundleLoader);

    return new PoeDataLoader(gameVersion, patchVersion, fileLoader, cacheRoot);
  }

  async getSchema(): Promise<SchemaFile> {
    if (this.schema) return this.schema;

    const schemaCachePath = path.join(this.cacheRoot, 'schema.min.json');
    try {
      const cached = await fs.readFile(schemaCachePath, 'utf-8');
      this.schema = JSON.parse(cached);
      return this.schema!;
    } catch {
      // fetch schema
    }

    console.log('[Schema] 下載最新 dat-schema...');
    const resp = await fetch(SCHEMA_URL);
    if (!resp.ok) throw new Error(`無法取得 dat-schema: ${resp.statusText}`);
    const json = (await resp.json()) as SchemaFile;
    await fs.mkdir(this.cacheRoot, { recursive: true });
    await fs.writeFile(schemaCachePath, JSON.stringify(json));
    this.schema = json;
    return this.schema;
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
