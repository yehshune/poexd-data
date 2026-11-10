/**
 * PoE 1 基底輪廓（Base Profile）：依遊戲規則逐一評估詞綴能否出現在特定基底上。
 *
 * 遊戲規則：詞綴的生成權重清單依序比對，取第一個「基底擁有的標籤」對應的權重；
 * `default` 視為所有基底都擁有。權重 > 0 代表該基底可骰出此詞綴。
 *
 * 用途：
 * 1. 網域輪廓（藥劑、珠寶、深淵珠寶、星團珠寶、劫盜裝備）：類別完全由基底決定。
 * 2. 特殊基底（魔符防具、召喚物法杖／戒指／魔盾、潛能之戒）：在一般部位之外另成類別。
 */

export interface SpawnWeight {
  readonly tag: string;
  readonly weight: number;
}

export interface BaseRecord {
  readonly classId: string;
  readonly name: string;
  readonly tags: readonly string[];
  /** 該物品種類各勢力的標籤（InfluenceTags 表）；未提供時以 `<tag>_<勢力>` 推估 */
  readonly influenceTags?: readonly string[];
}

interface ProfileEntry {
  readonly keys: readonly string[];
  readonly tags: ReadonlySet<string>;
}

export interface PoE1BaseProfiles {
  readonly byDomain: ReadonlyMap<number, readonly ProfileEntry[]>;
  readonly special: ReadonlyMap<string, readonly ReadonlySet<string>[]>;
}

export type BaseClassification = { special: string } | { domain: number; keys: string[] } | null;

export const SPECIAL_BASE_KEYS = [
  'helmets_ward',
  'gloves_ward',
  'boots_ward',
  'wands_minion',
  'rings_minion',
  'unset_ring',
  'shields_minion',
] as const;

const SPECIAL_KEY_SET: ReadonlySet<string> = new Set(SPECIAL_BASE_KEYS);

const INFLUENCE_SUFFIXES = ['shaper', 'elder', 'crusader', 'eyrie', 'basilisk', 'adjudicator'];

const WARD_KEY_BY_CLASS: Readonly<Record<string, string>> = {
  Helmet: 'helmets_ward',
  Gloves: 'gloves_ward',
  Boots: 'boots_ward',
};

/** 特殊基底：優先依基底標籤判斷，名稱清單為舊資料的後備 */
const SPECIAL_RULES: ReadonlyArray<{
  readonly classIds: readonly string[];
  readonly tag: string;
  readonly names: readonly string[];
  readonly key: (classId: string) => string | undefined;
}> = [
  {
    classIds: Object.keys(WARD_KEY_BY_CLASS),
    tag: 'ward_armour',
    names: [],
    key: (classId) => WARD_KEY_BY_CLASS[classId],
  },
  {
    classIds: ['Wand'],
    tag: 'weapon_can_roll_minion_modifiers',
    names: ['Calling Wand', 'Convening Wand'],
    key: () => 'wands_minion',
  },
  {
    classIds: ['Ring'],
    tag: 'ring_can_roll_minion_modifiers',
    names: ['Bone Ring', 'Gloam Ring'],
    key: () => 'rings_minion',
  },
  {
    classIds: ['Ring'],
    tag: 'unset_ring',
    names: ['Unset Ring'],
    key: () => 'unset_ring',
  },
  {
    classIds: ['Shield'],
    tag: 'focus_can_roll_minion_modifiers',
    names: ['Bone Spirit Shield', 'Ivory Spirit Shield', 'Fossilised Spirit Shield'],
    key: () => 'shields_minion',
  },
];

/**
 * BaseItemTypes.TagsKeys 只含基底自己的標籤；部位、武器類型等標籤繼承自物品種類，
 * 在此依物品種類補上（對應遊戲 .it 檔的繼承標籤）。
 */
export const CLASS_IMPLIED_TAGS: Readonly<Record<string, readonly string[]>> = {
  // necropolis_*：屍體工藝可作用於該部位的所有基底
  Helmet: ['armour', 'helmet', 'necropolis_helmet'],
  Gloves: ['armour', 'gloves', 'necropolis_gloves'],
  Boots: ['armour', 'boots', 'necropolis_boots'],
  'Body Armour': ['armour', 'body_armour', 'necropolis_body_armour'],
  Shield: ['armour', 'shield'],
  // 法杖不屬於 ranged（可骰本地攻擊速度、不可骰投射物速度）
  Wand: ['weapon', 'one_hand_weapon', 'onehand', 'wand'],
  Ring: ['jewellery', 'ring'],
  Amulet: ['jewellery', 'amulet'],
  Belt: ['jewellery', 'belt'],
  LifeFlask: ['flask', 'life_flask'],
  ManaFlask: ['flask', 'mana_flask'],
  HybridFlask: ['flask', 'hybrid_flask'],
  UtilityFlask: ['flask', 'utility_flask'],
  UtilityFlaskCritical: ['flask', 'utility_flask', 'critical_utility_flask'],
};

export function fullBaseTags(classId: string, tags: readonly string[]): ReadonlySet<string> {
  return new Set([...(CLASS_IMPLIED_TAGS[classId] ?? []), ...tags].map((t) => t.toLowerCase()));
}

const FLASK_KEY_BY_CLASS: Readonly<Record<string, string>> = {
  LifeFlask: 'life-flask',
  ManaFlask: 'mana-flask',
  HybridFlask: 'hybrid-flask',
  UtilityFlask: 'utility-flask',
  UtilityFlaskCritical: 'utility-flask',
};

const JEWEL_KEY_BY_NAME: Readonly<Record<string, string>> = {
  'Crimson Jewel': 'crimson_jewel',
  'Viridian Jewel': 'viridian_jewel',
  'Cobalt Jewel': 'cobalt_jewel',
  'Prismatic Jewel': 'prismatic_jewel',
};

const CLUSTER_KEY_BY_NAME: Readonly<Record<string, string>> = {
  'Large Cluster Jewel': 'large_cluster_jewel',
  'Medium Cluster Jewel': 'medium_cluster_jewel',
  'Small Cluster Jewel': 'small_cluster_jewel',
};

const ABYSS_KEY_BY_NAME: Readonly<Record<string, string>> = {
  'Murderous Eye Jewel': 'murderous_eye_jewel',
  'Searching Eye Jewel': 'searching_eye_jewel',
  'Hypnotic Eye Jewel': 'hypnotic_eye_jewel',
  'Ghastly Eye Jewel': 'ghastly_eye_jewel',
};

const HEIST_KEY_BY_CLASS: Readonly<Record<string, string>> = {
  HeistEquipmentWeapon: 'heist_gear',
  HeistEquipmentTool: 'heist_tool',
  HeistEquipmentUtility: 'heist_cloak',
  HeistEquipmentReward: 'heist_brooch',
};

export function spawnWeightForTags(
  spawnWeights: readonly SpawnWeight[],
  baseTags: ReadonlySet<string>,
): number {
  for (const { tag, weight } of spawnWeights) {
    const lower = tag.toLowerCase();
    if (lower === 'default' || baseTags.has(lower)) return weight;
  }
  return 0;
}

function classifyDomainBase(classId: string, name: string): BaseClassification {
  const flaskKey = FLASK_KEY_BY_CLASS[classId];
  if (flaskKey) {
    return { domain: 2, keys: ['flask', name === 'Iron Flask' ? 'iron-flask' : flaskKey] };
  }
  if (classId === 'Jewel' && JEWEL_KEY_BY_NAME[name]) {
    return { domain: 10, keys: ['jewel', JEWEL_KEY_BY_NAME[name]] };
  }
  if (classId === 'Jewel' && CLUSTER_KEY_BY_NAME[name]) {
    return { domain: 21, keys: ['cluster_jewel', CLUSTER_KEY_BY_NAME[name]] };
  }
  if (classId === 'AbyssJewel' && ABYSS_KEY_BY_NAME[name]) {
    return { domain: 13, keys: ['abyss_jewel', ABYSS_KEY_BY_NAME[name]] };
  }
  const heistKey = HEIST_KEY_BY_CLASS[classId];
  if (heistKey) {
    return { domain: 23, keys: ['heist_equipment', heistKey] };
  }
  return null;
}

export function classifyPoE1Base(
  classId: string,
  name: string,
  tags: readonly string[] = [],
): BaseClassification {
  const lowerTags = new Set(tags.map((t) => t.toLowerCase()));
  for (const rule of SPECIAL_RULES) {
    if (!rule.classIds.includes(classId)) continue;
    const isRunicFallback = rule.tag === 'ward_armour' && name.startsWith('Runic ');
    if (lowerTags.has(rule.tag) || rule.names.includes(name) || isRunicFallback) {
      const key = rule.key(classId);
      if (key) return { special: key };
    }
  }
  return classifyDomainBase(classId, name);
}

export function buildPoE1BaseProfiles(bases: readonly BaseRecord[]): PoE1BaseProfiles {
  const byDomain = new Map<number, ProfileEntry[]>();
  const special = new Map<string, ReadonlySet<string>[]>();

  for (const base of bases) {
    const classification = classifyPoE1Base(base.classId, base.name, base.tags);
    if (!classification) continue;
    const tags = fullBaseTags(base.classId, base.tags);
    if ('special' in classification) {
      special.set(classification.special, [...(special.get(classification.special) ?? []), tags]);
    } else {
      const list = byDomain.get(classification.domain) ?? [];
      byDomain.set(classification.domain, [...list, { keys: classification.keys, tags }]);
    }
  }
  return { byDomain, special };
}

/** 網域完全由基底決定時回傳類別鍵；該網域沒有基底輪廓時回傳 undefined */
export function resolveDomainProfileKeys(
  spawnWeights: readonly SpawnWeight[],
  domain: number,
  profiles: PoE1BaseProfiles,
): string[] | undefined {
  const entries = profiles.byDomain.get(domain);
  if (!entries) return undefined;
  const keys = new Set<string>();
  for (const entry of entries) {
    if (spawnWeightForTags(spawnWeights, entry.tags) > 0) {
      entry.keys.forEach((k) => keys.add(k));
    }
  }
  return [...keys];
}

function withInfluenceVariants(tags: ReadonlySet<string>): ReadonlySet<string>[] {
  return [
    tags,
    ...INFLUENCE_SUFFIXES.map(
      (suffix) => new Set([...tags, ...[...tags].map((t) => `${t}_${suffix}`)]),
    ),
  ];
}

function canSpawnOnAny(spawnWeights: readonly SpawnWeight[], tagSets: readonly ReadonlySet<string>[]) {
  return tagSets.some((tags) =>
    withInfluenceVariants(tags).some((variant) => spawnWeightForTags(spawnWeights, variant) > 0),
  );
}

/** 以特殊基底的實際標籤重新決定特殊類別鍵（其餘部位鍵維持不變） */
export function applySpecialBaseKeys(
  types: readonly string[],
  spawnWeights: readonly SpawnWeight[],
  profiles: PoE1BaseProfiles,
): string[] {
  const result = types.filter((t) => !SPECIAL_KEY_SET.has(t));
  for (const [key, tagSets] of profiles.special) {
    if (canSpawnOnAny(spawnWeights, tagSets)) result.push(key);
  }
  return result;
}

export function isSpecialBaseKey(key: string): boolean {
  return SPECIAL_KEY_SET.has(key);
}
