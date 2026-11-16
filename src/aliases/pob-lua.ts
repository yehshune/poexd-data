/**
 * Path of Building 匯出的描述檔（`src/Data/StatDescriptions/*.lua`）解析。
 *
 * 檔案是 `return { ... }` 的純資料 Lua table，只有 table、字串、數字與布林值，
 * 這裡只實作這個子集，不執行任何程式碼。
 */
import { cleanMarkup, normalizeLineFormat } from '../mods/common/stat-descriptions.js';

export type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue };

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\' };

export function parseLuaTable(source: string): LuaValue {
  let i = 0;
  const n = source.length;

  const fail = (message: string): never => {
    throw new Error(`Lua 解析失敗（位置 ${i}）：${message}`);
  };

  const skip = () => {
    while (i < n) {
      const c = source[i];
      if (c === '-' && source[i + 1] === '-') {
        while (i < n && source[i] !== '\n') i++;
      } else if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++;
      } else {
        break;
      }
    }
  };

  const readString = (): string => {
    const quote = source[i++];
    let out = '';
    while (i < n && source[i] !== quote) {
      if (source[i] === '\\') {
        const next = source[i + 1];
        out += ESCAPES[next] ?? next;
        i += 2;
      } else {
        out += source[i++];
      }
    }
    if (i >= n) fail('字串沒有結尾');
    i++;
    return out;
  };

  const readWord = (): string => {
    const start = i;
    while (i < n && /[A-Za-z0-9_.+-]/.test(source[i])) i++;
    if (start === i) fail(`未預期的字元 ${JSON.stringify(source[i])}`);
    return source.slice(start, i);
  };

  const readValue = (): LuaValue => {
    skip();
    const c = source[i];
    if (c === '{') return readTable();
    if (c === '"' || c === "'") return readString();
    const word = readWord();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'nil') return null;
    const number = Number(word);
    if (Number.isNaN(number)) fail(`無法辨識的值 ${word}`);
    return number;
  };

  const readTable = (): LuaValue => {
    i++; // {
    const entries: Array<[string | number, LuaValue]> = [];
    let position = 1;
    for (;;) {
      skip();
      if (source[i] === '}') {
        i++;
        break;
      }
      let key: string | number;
      if (source[i] === '[') {
        i++;
        const keyValue = readValue();
        if (typeof keyValue !== 'string' && typeof keyValue !== 'number') fail('table 鍵必須是字串或數字');
        key = keyValue as string | number;
        skip();
        if (source[i] !== ']') fail('缺少 ]');
        i++;
        skip();
        if (source[i] !== '=') fail('缺少 =');
        i++;
      } else {
        const save = i;
        const word = /[A-Za-z_]/.test(source[i]) ? readWord() : '';
        skip();
        if (word && source[i] === '=' && source[i + 1] !== '=') {
          key = word;
          i++;
        } else {
          i = save;
          key = position++;
        }
      }
      entries.push([key, readValue()]);
      skip();
      if (source[i] === ',' || source[i] === ';') i++;
    }
    const isArray = entries.every(([key], index) => key === index + 1);
    if (isArray) return entries.map(([, value]) => value);
    return Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
  };

  skip();
  if (source.startsWith('return', i)) i += 'return'.length;
  const value = readValue();
  skip();
  if (i < n) fail('table 之後還有多餘內容');
  return value;
}

const NEGATING_HANDLERS = new Set(['negate', 'negate_and_double', 'divide_by_one_hundred_and_negate']);

export interface PobDescription {
  statIds: string[];
  /** 依變體順序的英文模板（與 poexd-data 的 `{0:d}` 格式相同） */
  templates: string[];
}

const isRecord = (value: LuaValue | undefined): value is { [key: string]: LuaValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asList = (value: LuaValue | undefined): LuaValue[] => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  // 混合鍵的 table（例如變體同時有 [1]={k,v} 與 text=）：取數字鍵，依數字排序
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => value[key]);
};

function toTemplate(variant: LuaValue, statCount: number): string | null {
  if (!isRecord(variant) || typeof variant.text !== 'string') return null;
  const negated = new Set<number>();
  for (const handler of asList(variant)) {
    if (!isRecord(handler) || typeof handler.k !== 'string' || !NEGATING_HANDLERS.has(handler.k)) continue;
    const index = Number(handler.v) - 1;
    if (Number.isInteger(index) && index >= 0 && index < statCount) negated.add(index);
  }
  // PoB 已把 `\n` 轉成真的換行；poexd-data 的模板保留描述檔裡字面的 `\n`
  const text = cleanMarkup(variant.text).replace(/\r?\n/g, '\\n');
  return normalizeLineFormat(text, negated, statCount, 0);
}

/** 從解析結果取出每條描述的 stat 與英文模板 */
export function extractPobDescriptions(root: LuaValue): PobDescription[] {
  const descriptions: PobDescription[] = [];
  for (const entry of asList(root)) {
    if (!isRecord(entry)) continue;
    const statIds = asList(entry.stats).filter((id): id is string => typeof id === 'string');
    if (statIds.length === 0) continue;
    // entry[1] 是英文變體清單；PoB 只匯出英文
    const variants = asList(asList(entry)[0]);
    const templates = [
      ...new Set(variants.map((variant) => toTemplate(variant, statIds.length)).filter((t): t is string => !!t)),
    ];
    if (templates.length > 0) descriptions.push({ statIds, templates });
  }
  return descriptions;
}
