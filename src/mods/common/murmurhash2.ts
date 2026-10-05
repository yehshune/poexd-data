/**
 * MurmurHash2 (32-bit) 實作與 GGG Trade Stat Hash 計算
 *
 * GGG 官方 Trade API 的 Stat ID 格式為 `{category}.stat_{hash}`，
 * 其中 hash 數字係由官方對 stat_descriptions.txt 的內部 stat ID 列表執行兩次 MurmurHash2 所產生的 uint32 雜湊值。
 *
 * 演算法規範 (GGG 伺服器端實作):
 *   salt1: 0xC58F1A7B
 *   salt2: 0x02312233
 *   1. 對每個內部 stat ID 字串算 hash1 (seed: salt1)
 *   2. 將所有 hash1 轉為 4-byte Little-Endian 組成位元組陣列
 *   3. 對該位元組陣列算 hash2 (seed: salt2)
 */

export function murmurhash2(buffer: Uint8Array, seed: number): number {
  const m = 0x5bd1e995;
  const r = 24;
  let len = buffer.length;
  let h = (seed ^ len) >>> 0;
  let offset = 0;

  while (len >= 4) {
    let k =
      (buffer[offset] & 0xff) |
      ((buffer[offset + 1] & 0xff) << 8) |
      ((buffer[offset + 2] & 0xff) << 16) |
      ((buffer[offset + 3] & 0xff) << 24);

    k = Math.imul(k, m) >>> 0;
    k = (k ^ (k >>> r)) >>> 0;
    k = Math.imul(k, m) >>> 0;

    h = Math.imul(h, m) >>> 0;
    h = (h ^ k) >>> 0;

    offset += 4;
    len -= 4;
  }

  switch (len) {
    case 3:
      h = (h ^ ((buffer[offset + 2] & 0xff) << 16)) >>> 0;
    case 2:
      h = (h ^ ((buffer[offset + 1] & 0xff) << 8)) >>> 0;
    case 1:
      h = (h ^ (buffer[offset] & 0xff)) >>> 0;
      h = Math.imul(h, m) >>> 0;
  }

  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, m) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;

  return h >>> 0;
}

const encoder = new TextEncoder();

export function computeGggStatHash(
  statIds: string[],
  salt1 = 0xc58f1a7b,
  salt2 = 0x02312233
): number {
  if (statIds.length === 0) return 0;

  const hList: number[] = [];
  for (const id of statIds) {
    const buf = encoder.encode(id);
    hList.push(murmurhash2(buf, salt1));
  }

  const combinedBuf = new Uint8Array(hList.length * 4);
  const view = new DataView(combinedBuf.buffer);
  for (let i = 0; i < hList.length; i++) {
    view.setUint32(i * 4, hList[i], true); // Little-Endian
  }

  return murmurhash2(combinedBuf, salt2);
}
