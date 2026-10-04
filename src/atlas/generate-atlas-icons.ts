import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import sharp from 'sharp';
import { decode_bc7 } from 'texture2ddecoder-wasm';
import type { PoeDataLoader } from '../cdn/loader.js';

export interface AtlasIconRecord {
  destination: string;
  source: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export async function parseUIImages(loader: PoeDataLoader): Promise<AtlasIconRecord[]> {
  const fileBytes = await loader.getFile('Art/UIImages1.txt');
  if (!fileBytes) {
    throw new Error('無法自 CDN 取得 Art/UIImages1.txt');
  }

  const text = Buffer.from(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength).toString('utf16le');
  const lineRegex = /^"([^"]+)"\s+"([^"]+)"\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/gm;
  const records: AtlasIconRecord[] = [];

  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(text)) !== null) {
    const [, destination, source, x1, y1, x2, y2] = match;
    if (destination.includes('AtlasIconContent') || destination.includes('AtlasIconFrame')) {
      records.push({
        destination,
        source,
        x1: parseInt(x1, 10),
        y1: parseInt(y1, 10),
        x2: parseInt(x2, 10),
        y2: parseInt(y2, 10),
      });
    }
  }

  return records;
}

export function extractDds(data: Uint8Array): { width: number; height: number; payload: Uint8Array } {
  let ddsBytes = data;
  // GGG 特有 Brotli 格式: 前 4 bytes 為原始大小 (LE uint32)，其餘為 Brotli 壓縮流
  if (data[0] !== 0x44 || data[1] !== 0x44 || data[2] !== 0x53 || data[3] !== 0x20) { // 不是 "DDS "
    ddsBytes = zlib.brotliDecompressSync(data.subarray(4));
  }

  const view = new DataView(ddsBytes.buffer, ddsBytes.byteOffset, ddsBytes.byteLength);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const fourCC = String.fromCharCode(
    ddsBytes[84],
    ddsBytes[85],
    ddsBytes[86],
    ddsBytes[87]
  );

  // DX10 標頭為 128 + 20 = 148 bytes，普通 DDS 為 128 bytes
  const headerSize = fourCC === 'DX10' ? 148 : 128;
  const payload = ddsBytes.subarray(headerSize);

  return { width, height, payload };
}

export async function buildAtlasIcons(loader: PoeDataLoader, outputDir = path.join(process.cwd(), 'output', 'icons')) {
  await fs.mkdir(outputDir, { recursive: true });

  console.log('[AtlasIcons] 解析 Art/UIImages1.txt 貼圖集定義...');
  const records = await parseUIImages(loader);

  const iconMap = new Map<string, AtlasIconRecord>();
  for (const r of records) {
    const iconName = path.basename(r.destination);
    if (!iconMap.has(iconName)) {
      iconMap.set(iconName, r);
    }
  }

  console.log(`[AtlasIcons] 找到 ${iconMap.size} 個輿圖圖示目標，開始自官方 CDN 下載與解碼 (WASM BC7)...`);

  const textureCache = new Map<string, { width: number; height: number; rgba: Uint8Array }>();
  let successCount = 0;

  for (const [name, record] of iconMap.entries()) {
    try {
      let texture = textureCache.get(record.source);
      if (!texture) {
        let rawData = await loader.getFile(record.source);
        if (!rawData) {
          console.warn(`  [WARN] 找不到貼圖檔案: ${record.source}`);
          continue;
        }

        // 檢查路徑重新導向 (以 '*' 開頭)
        if (rawData[0] === 0x2a) { // '*'
          const redirectPath = Buffer.from(rawData.subarray(1)).toString('utf-8').trim();
          rawData = await loader.getFile(redirectPath);
          if (!rawData) {
            console.warn(`  [WARN] 重定向貼圖檔案不存在: ${redirectPath}`);
            continue;
          }
        }

        const { width, height, payload } = extractDds(rawData);
        const bgra = await decode_bc7(payload, width, height);
        if (!bgra) {
          throw new Error(`BC7 解碼失敗: ${record.source}`);
        }

        // BGRA 轉 RGBA (交換 B 與 R 通道)
        const rgba = new Uint8Array(bgra.buffer, bgra.byteOffset, bgra.byteLength);
        for (let i = 0; i < rgba.length; i += 4) {
          const b = rgba[i];
          rgba[i] = rgba[i + 2];
          rgba[i + 2] = b;
        }

        texture = { width, height, rgba };
        textureCache.set(record.source, texture);
      }

      const cropWidth = record.x2 - record.x1 + 1;
      const cropHeight = record.y2 - record.y1 + 1;
      const outPath = path.join(outputDir, `${name}.png`);

      await sharp(Buffer.from(texture.rgba.buffer, texture.rgba.byteOffset, texture.rgba.byteLength), {
        raw: {
          width: texture.width,
          height: texture.height,
          channels: 4,
        },
      })
        .extract({
          left: record.x1,
          top: record.y1,
          width: cropWidth,
          height: cropHeight,
        })
        .png()
        .toFile(outPath);

      successCount++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
    }
  }

  console.log(`[AtlasIcons] 輿圖圖示生成完畢！共產出 ${successCount}/${iconMap.size} 張透明 PNG 至 ${outputDir}`);
}
