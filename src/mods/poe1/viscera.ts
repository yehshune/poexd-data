/**
 * PoE 1 臟器（Viscera，3.30 新增）的詞綴類別判斷。
 *
 * 臟器詞綴（`VisceraMod<怪物><階級>`）屬於 Domain 1，但沒有出現權重，也不在
 * `BaseItemTypes.Implicit_ModsKeys` 裡，無法用一般裝備的標籤評估找到所屬基底。
 * 詞綴與基底（`Metadata/Items/Viscera/Viscera<怪物>`）以怪物名稱對應，部位則寫在基底的
 * `viscera_head` / `viscera_arm` / `viscera_body` / `viscera_leg` 標籤。
 */

export const VISCERA_ITEM_CLASS = 'Viscera';
export const VISCERA_GEAR_TYPE = 'viscera';

const BASE_ID_PREFIX = 'Metadata/Items/Viscera/Viscera';
const MOD_ID_PREFIX = 'VisceraMod';

/** 基底部位標籤 → 類別鍵（與官方市集的 viscera.head 等子分類一一對應） */
const PART_KEY_BY_TAG: Readonly<Record<string, string>> = Object.freeze({
  viscera_head: 'viscera_head',
  viscera_arm: 'viscera_arm',
  viscera_body: 'viscera_body',
  viscera_leg: 'viscera_leg',
});

export const VISCERA_PART_KEYS: readonly string[] = Object.freeze(Object.values(PART_KEY_BY_TAG));

export interface VisceraBase {
  /** `BaseItemTypes.Id` */
  readonly id: string;
  readonly tags: readonly string[];
}

export interface VisceraModTypeIndex {
  /** 回傳臟器詞綴的類別鍵（`viscera` 加上部位）；不是臟器詞綴或找不到基底時回傳 undefined */
  resolve(modId: string): string[] | undefined;
}

/**
 * 由臟器基底建立「詞綴 ID → 類別鍵」的查詢。
 * 怪物名稱可能互為前綴（例如 `VaalOversoul` 與 `VaalOversoul2`），所以取最長相符的基底。
 */
export function buildVisceraModTypeIndex(bases: readonly VisceraBase[]): VisceraModTypeIndex {
  const typesByKey = new Map<string, string[]>();
  for (const base of bases) {
    if (!base.id.startsWith(BASE_ID_PREFIX)) continue;
    const key = base.id.slice(BASE_ID_PREFIX.length);
    if (!key) continue;
    const parts = base.tags.map((tag) => PART_KEY_BY_TAG[tag]).filter((part) => !!part);
    typesByKey.set(key, [VISCERA_GEAR_TYPE, ...new Set(parts)]);
  }
  const keysByLength = [...typesByKey.keys()].sort((a, b) => b.length - a.length);

  return {
    resolve(modId) {
      if (!modId.startsWith(MOD_ID_PREFIX)) return undefined;
      const rest = modId.slice(MOD_ID_PREFIX.length);
      const key = keysByLength.find((candidate) => rest.startsWith(candidate));
      return key ? [...typesByKey.get(key)!] : undefined;
    },
  };
}
