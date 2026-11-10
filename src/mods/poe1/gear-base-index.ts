/**
 * PoE 1 一般裝備（Domain 1）的逐基底類別判斷。
 *
 * 每個基底依物品種類與屬性標籤對應到類別鍵；詞綴屬於某類別鍵，
 * 若且唯若該類別中至少一個基底能骰出它（生成權重依序取第一個符合的標籤，含勢力變體）。
 */
import { classifyPoE1Base, spawnWeightForTags, type BaseRecord, type SpawnWeight } from './base-profiles.js';

const INFLUENCE_SUFFIXES = ['shaper', 'elder', 'crusader', 'eyrie', 'basilisk', 'adjudicator'];

/**
 * 不在基底 .it 檔、而由特定機制在製作時賦予的情境標籤：
 * necropolis_*（屍體工藝可作用於該部位所有基底）。
 */
const CONTEXT_TAGS_BY_CLASS: Readonly<Record<string, readonly string[]>> = {
  Helmet: ['necropolis_helmet'],
  Gloves: ['necropolis_gloves'],
  Boots: ['necropolis_boots'],
  'Body Armour': ['necropolis_body_armour'],
};

const WEAPON_KEYS_BY_CLASS: Readonly<Record<string, readonly string[]>> = {
  Claw: ['claw'],
  Dagger: ['dagger'],
  'Rune Dagger': ['dagger', 'rune-dagger'],
  Wand: ['wand'],
  'One Hand Sword': ['one-hand-sword'],
  'Thrusting One Hand Sword': ['one-hand-sword', 'thrusting-one-hand-sword'],
  'One Hand Axe': ['one-hand-axe'],
  'One Hand Mace': ['one-hand-mace'],
  Sceptre: ['sceptre'],
  Bow: ['bow'],
  Staff: ['staff'],
  Warstaff: ['staff', 'warstaff'],
  'Two Hand Sword': ['two-hand-sword'],
  'Two Hand Axe': ['two-hand-axe'],
  'Two Hand Mace': ['two-hand-mace'],
  FishingRod: ['fishing-rod'],
  Amulet: ['amulet'],
  Ring: ['ring'],
  Belt: ['belt'],
  Quiver: ['quiver'],
};

const ARMOUR_PREFIX_BY_CLASS: Readonly<Record<string, { main: string; prefix: string }>> = {
  'Body Armour': { main: 'body-armour', prefix: 'body_armours' },
  Helmet: { main: 'helmet', prefix: 'helmets' },
  Gloves: { main: 'gloves', prefix: 'gloves' },
  Boots: { main: 'boots', prefix: 'boots' },
  Shield: { main: 'shield', prefix: 'shields' },
};

/** 屬性標籤 → 子類別後綴；三屬性基底自成類別，避免混入雙屬性子類別 */
const ATTRIBUTE_SUFFIXES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['str_dex_int_armour', ['str_dex_int']],
  ['str_dex_armour', ['str_dex']],
  ['str_int_armour', ['str_int']],
  ['dex_int_armour', ['dex_int']],
  ['str_armour', ['str']],
  ['dex_armour', ['dex']],
  ['int_armour', ['int']],
];

export interface GearBaseEntry {
  readonly keys: readonly string[];
  readonly variants: readonly ReadonlySet<string>[];
}

export function gearKeysForBase(classId: string, name: string, tags: readonly string[]): string[] | null {
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  const classification = classifyPoE1Base(classId, name, tags);
  const special = classification && 'special' in classification ? classification.special : null;

  const armour = ARMOUR_PREFIX_BY_CLASS[classId];
  if (armour) {
    // 魔符（保護）基底是獨立類別，不屬於部位大類
    if (special?.endsWith('_ward')) return [special];
    const attr = ATTRIBUTE_SUFFIXES.find(([tag]) => lower.has(tag));
    const subs = attr ? attr[1].map((s) => `${armour.prefix}_${s}`) : [];
    return [armour.main, ...subs, ...(special ? [special] : [])];
  }

  const weaponKeys = WEAPON_KEYS_BY_CLASS[classId];
  if (weaponKeys) return [...weaponKeys, ...(special ? [special] : [])];
  return null;
}

function influenceVariants(
  tags: ReadonlySet<string>,
  influenceTags: readonly string[] | undefined,
): ReadonlySet<string>[] {
  if (influenceTags) {
    return [tags, ...influenceTags.map((t) => new Set([...tags, t.toLowerCase()]))];
  }
  return [
    tags,
    ...INFLUENCE_SUFFIXES.map((suffix) => new Set([...tags, ...[...tags].map((t) => `${t}_${suffix}`)])),
  ];
}

/** 以（類別鍵, 標籤集合）去重，避免數百個同類基底重複評估 */
export function buildGearBaseIndex(bases: readonly BaseRecord[]): readonly GearBaseEntry[] {
  const unique = new Map<string, GearBaseEntry>();
  for (const base of bases) {
    const keys = gearKeysForBase(base.classId, base.name, base.tags);
    if (!keys) continue;
    const tags = new Set(
      [...(CONTEXT_TAGS_BY_CLASS[base.classId] ?? []), ...base.tags].map((t) => t.toLowerCase()),
    );
    const signature = `${keys.join(',')}|${[...tags].sort().join(',')}|${(base.influenceTags ?? []).join(',')}`;
    if (!unique.has(signature)) {
      unique.set(signature, { keys, variants: influenceVariants(tags, base.influenceTags) });
    }
  }
  return [...unique.values()];
}

export function resolveGearKeysByBases(
  spawnWeights: readonly SpawnWeight[],
  index: readonly GearBaseEntry[],
): string[] {
  const keys = new Set<string>();
  for (const entry of index) {
    if (entry.keys.every((k) => keys.has(k))) continue;
    if (entry.variants.some((tags) => spawnWeightForTags(spawnWeights, tags) > 0)) {
      entry.keys.forEach((k) => keys.add(k));
    }
  }
  return [...keys];
}
