import * as fs from 'fs/promises';
import { getPoE1ItemClassGearTypes } from './gear-types.js';

export interface SynthesisImplicitsFile {
  source: string;
  generatedAt: string;
  modCount: number;
  mods: Record<string, string[]>;
}

/**
 * PoE Wiki `synthesis_mods` 內曾改名的舊 Mod ID 對應。
 */
export const SYNTHESIS_MOD_ID_ALIASES: Readonly<Record<string, string>> = {
  SynthesisImplicitMaximumAttackDodge1: 'SynthesisImplicitSpellDamageSuppressed1_',
};

/**
 * 追憶固定詞的裝備類別覆寫：
 * - Dagger / Staff 涵蓋 3.7 拆分後的 Rune Dagger / Warstaff
 * - Jewel / AbyssJewel 各自對應其子類別，避免深淵珠寶追憶詞出現在一般珠寶
 * - Body Armour 補上三屬性衣（Sacrificial Garb）
 */
const SYNTHESIS_ITEM_CLASS_GEAR_TYPES: Readonly<Record<string, string[]>> = {
  Dagger: ['dagger', 'rune-dagger'],
  Staff: ['staff', 'warstaff'],
  Jewel: ['jewel', 'crimson_jewel', 'viridian_jewel', 'cobalt_jewel', 'prismatic_jewel'],
  AbyssJewel: [
    'abyss_jewel',
    'searching_eye_jewel',
    'hypnotic_eye_jewel',
    'murderous_eye_jewel',
    'ghastly_eye_jewel',
  ],
  'Body Armour': [
    ...(getPoE1ItemClassGearTypes('Body Armour') ?? []),
    'body_armours_str_dex_int',
  ],
};

export function isPoE1SynthesisImplicitMod(mod: {
  Id?: string | null;
  Domain?: number;
  GenerationType?: number;
}): boolean {
  return (
    mod.Domain === 1 &&
    mod.GenerationType === 3 &&
    Boolean(mod.Id?.startsWith('Synthesis'))
  );
}

export function resolveSynthesisItemClassesToGearTypes(itemClasses: readonly string[]): string[] {
  const result = new Set<string>();
  for (const rawClass of itemClasses) {
    const itemClass = rawClass.trim();
    if (!itemClass) continue;
    const gearTypes =
      SYNTHESIS_ITEM_CLASS_GEAR_TYPES[itemClass] ??
      getPoE1ItemClassGearTypes(itemClass);
    if (!gearTypes) continue;
    for (const gt of gearTypes) result.add(gt);
  }
  return Array.from(result);
}

export function buildSynthesisModTypesMap(
  modsByItemClasses: Readonly<Record<string, readonly string[]>>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [rawModId, itemClasses] of Object.entries(modsByItemClasses)) {
    const modId = SYNTHESIS_MOD_ID_ALIASES[rawModId] ?? rawModId;
    const gearTypes = resolveSynthesisItemClassesToGearTypes(itemClasses);
    if (gearTypes.length === 0) continue;
    const existing = map.get(modId);
    if (existing) {
      map.set(modId, Array.from(new Set([...existing, ...gearTypes])));
    } else {
      map.set(modId, gearTypes);
    }
  }
  return map;
}

export async function loadPoE1SynthesisImplicitTypes(
  filePath: string
): Promise<Map<string, string[]>> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as SynthesisImplicitsFile;
    if (!parsed || typeof parsed.mods !== 'object' || parsed.mods === null) {
      return new Map();
    }
    return buildSynthesisModTypesMap(parsed.mods);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }
}

const POEWIKI_CARGO_URL = 'https://www.poewiki.net/w/api.php';

export async function fetchPoE1SynthesisImplicitsFromWiki(
  fetchImpl: typeof fetch = fetch
): Promise<SynthesisImplicitsFile> {
  const modToClasses = new Map<string, Set<string>>();
  const limit = 500;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      action: 'cargoquery',
      tables: 'synthesis_mods',
      fields: 'synthesis_mods.item_class_ids__full=item_classes,synthesis_mods.mod_ids__full=mods',
      group_by: 'synthesis_mods.mod_ids__full,synthesis_mods.item_class_ids__full',
      limit: String(limit),
      offset: String(offset),
      format: 'json',
    });

    const resp = await fetchImpl(`${POEWIKI_CARGO_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'poexd-data/1.0 (+https://github.com/yehshune/poexd-data)',
      },
    });
    if (!resp.ok) {
      throw new Error(`無法自 PoE Wiki 取得 synthesis_mods (${resp.status} ${resp.statusText})`);
    }
    const json = (await resp.json()) as {
      cargoquery?: Array<{ title?: { item_classes?: string; mods?: string } }>;
    };
    const rows = json.cargoquery ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const classes = (row.title?.item_classes ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const mods = (row.title?.mods ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const rawModId of mods) {
        const modId = SYNTHESIS_MOD_ID_ALIASES[rawModId] ?? rawModId;
        let classSet = modToClasses.get(modId);
        if (!classSet) {
          classSet = new Set();
          modToClasses.set(modId, classSet);
        }
        for (const cls of classes) classSet.add(cls);
      }
    }

    if (rows.length < limit) break;
    offset += limit;
  }

  const sortedMods: Record<string, string[]> = {};
  for (const modId of Array.from(modToClasses.keys()).sort()) {
    sortedMods[modId] = Array.from(modToClasses.get(modId)!).sort();
  }

  return {
    source: 'https://www.poewiki.net/w/api.php?action=cargoquery&tables=synthesis_mods',
    generatedAt: new Date().toISOString(),
    modCount: Object.keys(sortedMods).length,
    mods: sortedMods,
  };
}
