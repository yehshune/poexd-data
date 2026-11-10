/**
 * 解析遊戲 .it 物品定義檔的繼承鏈，取得基底從抽象父類別繼承的標籤。
 *
 * BaseItemTypes.TagsKeys 只含基底自己的標籤；部位（helmet）、武器類型（wand、onehand）、
 * 藥劑類型（utility_flask）等標籤定義在父類別的 .it 檔中。
 */

export interface ParsedItFile {
  readonly parent: string | null;
  readonly tags: readonly string[];
  readonly removedTags: readonly string[];
}

export type ItFileReader = (lowerCasePath: string) => Promise<string | null>;

const EXTENDS_RE = /^\s*extends\s+"([^"]+)"/m;
const TAG_RE = /^\s*tag\s*=\s*"([^"]+)"/gm;
const REMOVE_TAG_RE = /^\s*remove_tag\s*=\s*"([^"]+)"/gm;

export function parseItFile(text: string): ParsedItFile {
  const clean = text.replace(/^﻿/, '');
  const parent = EXTENDS_RE.exec(clean)?.[1] ?? null;
  const tags = [...clean.matchAll(TAG_RE)].map((m) => m[1].toLowerCase());
  const removedTags = [...clean.matchAll(REMOVE_TAG_RE)].map((m) => m[1].toLowerCase());
  return { parent: parent === 'nothing' ? null : parent, tags, removedTags };
}

const MAX_DEPTH = 32;

/** 依繼承鏈收集標籤（父類別先套用，子類別可移除）；以 cache 共用同一父類別的結果 */
export function resolveInheritedTags(
  path: string,
  read: ItFileReader,
  cache: Map<string, Promise<readonly string[]>>,
  depth = 0,
): Promise<readonly string[]> {
  const key = `${path.toLowerCase()}.it`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    if (depth > MAX_DEPTH) return [];
    const text = await read(key);
    if (text == null) return [];
    const parsed = parseItFile(text);
    const inherited = parsed.parent ? await resolveInheritedTags(parsed.parent, read, cache, depth + 1) : [];
    const removed = new Set(parsed.removedTags);
    return [...new Set([...inherited, ...parsed.tags])].filter((t) => !removed.has(t));
  })();
  cache.set(key, pending);
  return pending;
}

export function decodeItBytes(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  const isUtf16 = bytes.length > 1 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || bytes[1] === 0);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(isUtf16 ? 'utf16le' : 'utf8');
}
