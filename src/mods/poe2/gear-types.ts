export const ALL_POE2_WEAPONS = [
  'claw',
  'dagger',
  'wand',
  'one-hand-sword',
  'one-hand-axe',
  'one-hand-mace',
  'sceptre',
  'spear',
  'flail',
  'bow',
  'staff',
  'two-hand-sword',
  'two-hand-axe',
  'two-hand-mace',
  'quarterstaff',
  'crossbow',
  'talisman',
];

export const ONE_HAND_POE2_WEAPONS = [
  'claw',
  'dagger',
  'wand',
  'one-hand-sword',
  'one-hand-axe',
  'one-hand-mace',
  'sceptre',
  'spear',
  'flail',
  'talisman',
];

export const TWO_HAND_POE2_WEAPONS = [
  'bow',
  'staff',
  'two-hand-sword',
  'two-hand-axe',
  'two-hand-mace',
  'quarterstaff',
  'crossbow',
];

export const ALL_POE2_ARMOUR = [
  'gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int',
  'boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int',
  'body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int',
  'helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int',
  'shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'buckler',
];

export const ALL_POE2_JEWELLERY = [
  'amulet',
  'ring',
  'belt',
];

/** 換界石詞綴所在的 Mods Domain（區域） */
export const POE2_WAYSTONE_DOMAIN = 6;
/** 深淵（褻瀆）詞綴所在的 Mods Domain：涵蓋裝備、珠寶，以及帶 map 標籤的換界石詞綴 */
export const POE2_ABYSS_DOMAIN = 28;
/** 先驅碑牌（TowerAugmentation）詞綴所在的 Mods Domain */
export const POE2_TABLET_DOMAIN = 34;

export const ALL_POE2_WAYSTONES = ['waystone', 'waystone-t1', 'waystone-t2', 'waystone-t3'];

export const ALL_POE2_TABLETS = [
  'tablet',
  'breach-tablet',
  'expedition-tablet',
  'delirium-tablet',
  'ritual-tablet',
  'irradiated-tablet',
  'overseer-tablet',
  'abyss-tablet',
  'temple-tablet',
];

/** 換界石詞綴的生成標籤：map_key_* 依換界石階級區分，default 適用所有換界石 */
const POE2_WAYSTONE_TAGS: Record<string, string[]> = {
  default: ALL_POE2_WAYSTONES,
  map_key_low: ['waystone', 'waystone-t1'],
  map_key_medium: ['waystone', 'waystone-t2'],
  map_key_high: ['waystone', 'waystone-t3'],
  map_key_highest: ['waystone', 'waystone-t3'],
};

/** 碑牌詞綴的生成標籤：tower_augment_* 依碑牌種類區分，default 適用所有碑牌 */
const POE2_TABLET_TAGS: Record<string, string[]> = {
  default: ALL_POE2_TABLETS,
  tower_augment_breach: ['tablet', 'breach-tablet'],
  tower_augment_expedition: ['tablet', 'expedition-tablet'],
  tower_augment_delirium: ['tablet', 'delirium-tablet'],
  tower_augment_ritual: ['tablet', 'ritual-tablet'],
  tower_augment_abyss: ['tablet', 'abyss-tablet'],
  tower_augment_map_boss: ['tablet', 'overseer-tablet'],
  tower_augment_incursion: ['tablet', 'temple-tablet'],
};

/**
 * 換界石與碑牌詞綴的 default／map 標籤在其他 Domain 代表「所有裝備」，
 * 因此只在對應 Domain 內解析，避免誤判成裝備詞綴。
 */
function resolveDomainScopedTags(
  spawnWeights: ReadonlyArray<{ tag: string; weight: number }>,
  tagTable: Record<string, string[]>,
): string[] {
  const result = new Set<string>();
  for (const { tag, weight } of spawnWeights) {
    if (weight <= 0) continue;
    for (const t of tagTable[tag.toLowerCase()] ?? []) result.add(t);
  }
  return Array.from(result);
}

export const POE2_TAG_TO_GEAR_TYPES: Record<string, string[]> = {
  // 通用類別標籤 (Broad Tags)
  weapon: ALL_POE2_WEAPONS,
  one_hand_weapon: ONE_HAND_POE2_WEAPONS,
  two_hand_weapon: TWO_HAND_POE2_WEAPONS,
  melee: ALL_POE2_WEAPONS.filter((w) => !w.includes('bow') && !w.includes('crossbow') && !w.includes('wand')),
  ranged: ['bow', 'crossbow', 'quiver'],
  armour: ALL_POE2_ARMOUR,
  jewellery: ALL_POE2_JEWELLERY,

  // 防具部位通用標籤
  gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  body_armour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int'],
  helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],

  // 武器細分
  claw: ['claw'],
  dagger: ['dagger'],
  wand: ['wand'],
  sword: ['one-hand-sword', 'two-hand-sword'],
  one_hand_sword: ['one-hand-sword'],
  two_hand_sword: ['two-hand-sword'],
  axe: ['one-hand-axe', 'two-hand-axe'],
  one_hand_axe: ['one-hand-axe'],
  two_hand_axe: ['two-hand-axe'],
  mace: ['one-hand-mace', 'two-hand-mace'],
  one_hand_mace: ['one-hand-mace'],
  two_hand_mace: ['two-hand-mace'],
  sceptre: ['sceptre'],
  spear: ['spear'],
  flail: ['flail'],
  bow: ['bow'],
  staff: ['staff'],
  quarterstaff: ['quarterstaff'],
  crossbow: ['crossbow'],
  warstaff: ['quarterstaff', 'staff'],
  cannon: ['crossbow'],
  talisman: ['talisman'],
  fishing_rod: ['fishing-rod'],

  // 飾品與副手
  amulet: ['amulet'],
  ring: ['ring'],
  belt: ['belt'],
  quiver: ['quiver'],
  focus: ['focus'],
  shield: ['shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'buckler'],
  str_shield: ['shield', 'shields_str'],
  str_dex_shield: ['shield', 'shields_str_dex', 'buckler'],
  buckler: ['shield', 'buckler'],

  // 符文影響力標籤 (Rune Warping Influences)
  destruction: ALL_POE2_WEAPONS,
  berserking: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
  marksman: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  decay: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  chronomancy: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  soul: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int'],

  // 創生之樹裂痕飾品 (Genesis Tree Breach Jewellery)
  breach_desecration: ALL_POE2_JEWELLERY,
  genesis_tree_minion: ALL_POE2_JEWELLERY,
  genesis_tree_caster: ALL_POE2_JEWELLERY,

  // 勢力防具與飾品標籤補全
  gloves_elder: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  amulet_elder: ['amulet'],
  gloves_shaper: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  amulet_shaper: ['amulet'],

  // 藥劑與護符
  flask: ['flask'],
  utility_flask: ['charm'],
  life_flask: ['life-flask', 'flask'],
  mana_flask: ['mana-flask', 'flask'],
  charm: ['charm'],

  // 珠寶
  jewel: ['jewel'],
  // *_radius_jewel 標籤只在時迭珠寶底材上（Time-Lost Ruby / Emerald / Sapphire / Diamond），
  // 一般紅玉、翠綠、藍玉、鑽石不會出現範圍詞綴
  str_radius_jewel: ['jewel', 'time_lost_ruby'],
  dex_radius_jewel: ['jewel', 'time_lost_emerald'],
  int_radius_jewel: ['jewel', 'time_lost_sapphire'],
  radius_jewel: ['jewel', 'time_lost_ruby', 'time_lost_emerald', 'time_lost_sapphire', 'time_lost_diamond'],
  strjewel: ['jewel', 'ruby'],
  dexjewel: ['jewel', 'emerald'],
  intjewel: ['jewel', 'sapphire'],
  historic_abyss_jewel_1: ['jewel', 'time_lost_ruby'],
  historic_abyss_jewel_2: ['jewel', 'time_lost_emerald'],
  historic_abyss_jewel_3: ['jewel', 'time_lost_sapphire'],
  historic_abyss_jewel_4: ['jewel', 'time_lost_diamond'],

  // 聖物
  relic: ['relic'],
  small_sanctum_relic: ['relic', 'urn-relic', 'vase-relic'],
  medium_sanctum_relic: ['relic', 'seal-relic', 'coffer-relic'],
  large_sanctum_relic: ['relic', 'tapestry-relic', 'incense-relic'],
  urn_relic: ['relic', 'urn-relic'],
  amphora_relic: ['relic', 'amphora-relic'],
  vase_relic: ['relic', 'vase-relic'],
  seal_relic: ['relic', 'seal-relic'],
  coffer_relic: ['relic', 'coffer-relic'],
  tapestry_relic: ['relic', 'tapestry-relic'],
  incense_relic: ['relic', 'incense-relic'],

  // 換界石
  waystone: ['waystone'],
  low_tier_map: ['waystone-t1'],
  mid_tier_map: ['waystone-t2'],
  top_tier_map: ['waystone-t3'],

  // 防具細分標籤
  str_armour: [
    'gloves', 'gloves_str',
    'boots', 'boots_str',
    'body-armour', 'body_armours_str',
    'helmet', 'helmets_str',
    'shield', 'shields_str',
  ],
  dex_armour: [
    'gloves', 'gloves_dex',
    'boots', 'boots_dex',
    'body-armour', 'body_armours_dex',
    'helmet', 'helmets_dex',
    'shield', 'shields_str_dex', 'buckler',
  ],
  int_armour: [
    'gloves', 'gloves_int',
    'boots', 'boots_int',
    'body-armour', 'body_armours_int',
    'helmet', 'helmets_int',
    'shield', 'shields_str_int',
  ],
  str_dex_armour: [
    'gloves', 'gloves_str_dex',
    'boots', 'boots_str_dex',
    'body-armour', 'body_armours_str_dex',
    'helmet', 'helmets_str_dex',
    'shield', 'shields_str_dex',
  ],
  str_int_armour: [
    'gloves', 'gloves_str_int',
    'boots', 'boots_str_int',
    'body-armour', 'body_armours_str_int',
    'helmet', 'helmets_str_int',
    'shield', 'shields_str_int',
  ],
  dex_int_armour: [
    'gloves', 'gloves_dex_int',
    'boots', 'boots_dex_int',
    'body-armour', 'body_armours_dex_int',
    'helmet', 'helmets_dex_int',
    'shield', 'shields_str_dex', 'buckler',
  ],
  str_dex_int_armour: [
    'body-armour', 'body_armours_str_dex_int',
  ],
};

export function resolvePoE2GearTypes(
  spawnWeights: Array<{ tag: string; weight: number }>,
  domain?: number
): string[] {
  const result = new Set<string>();

  if (domain === POE2_WAYSTONE_DOMAIN) {
    return resolveDomainScopedTags(spawnWeights, POE2_WAYSTONE_TAGS);
  }
  if (domain === POE2_TABLET_DOMAIN) {
    return resolveDomainScopedTags(spawnWeights, POE2_TABLET_TAGS);
  }

  // 根據 Domain 特殊補齊
  if (domain === 8) {
    result.add('relic');
  } else if (domain === 11) {
    result.add('jewel');
  }

  for (const { tag, weight } of spawnWeights) {
    if (weight <= 0) continue;
    const lower = tag.toLowerCase();

    // 深淵詞綴的 map 標籤代表換界石
    if (domain === POE2_ABYSS_DOMAIN && lower === 'map') {
      for (const t of ALL_POE2_WAYSTONES) result.add(t);
      continue;
    }

    // 檢查標籤
    const matched = POE2_TAG_TO_GEAR_TYPES[lower];
    if (matched) {
      for (const t of matched) result.add(t);
    }

    // 石碑標籤匹配 (Breach_Tablet, Expedition_Tablet 等)
    if (lower.includes('tablet')) {
      result.add('tablet');
      if (lower.includes('breach')) result.add('breach-tablet');
      if (lower.includes('expedition')) result.add('expedition-tablet');
      if (lower.includes('delirium')) result.add('delirium-tablet');
      if (lower.includes('ritual')) result.add('ritual-tablet');
      if (lower.includes('irradiated') || lower.includes('precursor')) result.add('irradiated-tablet');
      if (lower.includes('overseer')) result.add('overseer-tablet');
      if (lower.includes('abyss')) result.add('abyss-tablet');
      if (lower.includes('temple') || lower.includes('incursion')) result.add('temple-tablet');
    }
  }

  return Array.from(result);
}

export const POE2_ITEM_CLASS_TO_GEAR_TYPES: Record<string, string[]> = {
  Claw: ['claw'],
  Dagger: ['dagger'],
  Wand: ['wand'],
  OneHandSword: ['one-hand-sword'],
  OneHandAxe: ['one-hand-axe'],
  OneHandMace: ['one-hand-mace'],
  Sceptre: ['sceptre'],
  Spear: ['spear'],
  Flail: ['flail'],
  Bow: ['bow'],
  Staff: ['staff'],
  TwoHandSword: ['two-hand-sword'],
  TwoHandAxe: ['two-hand-axe'],
  TwoHandMace: ['two-hand-mace'],
  Quarterstaff: ['quarterstaff'],
  Crossbow: ['crossbow'],
  FishingRod: ['fishing-rod'],
  Amulet: ['amulet'],
  Ring: ['ring'],
  Belt: ['belt'],
  Quiver: ['quiver'],
  Focus: ['focus'],
  Shield: ['shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'buckler'],
  Buckler: ['shield', 'buckler'],
  Gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  Boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  BodyArmour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int'],
  Helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
  Flask: ['flask'],
  LifeFlask: ['life-flask', 'flask'],
  ManaFlask: ['mana-flask', 'flask'],
  UtilityFlask: ['charm'],
  Charm: ['charm'],
  Jewel: ['jewel'],
  Relic: ['relic'],
  UrnRelic: ['relic', 'urn-relic'],
  AmphoraRelic: ['relic', 'amphora-relic'],
  VaseRelic: ['relic', 'vase-relic'],
  SealRelic: ['relic', 'seal-relic'],
  CofferRelic: ['relic', 'coffer-relic'],
  TapestryRelic: ['relic', 'tapestry-relic'],
  IncenseRelic: ['relic', 'incense-relic'],
  TowerAugmentation: ['tablet'],
  Map: ['waystone'],
  Warstaff: ['staff'],
  Talisman: ['talisman'],
  Waystone: ['waystone', 'waystone-t1'],
};

export function getPoE2ItemClassGearTypes(classId: string): string[] | undefined {
  if (!classId) return undefined;
  if (POE2_ITEM_CLASS_TO_GEAR_TYPES[classId]) return POE2_ITEM_CLASS_TO_GEAR_TYPES[classId];
  const normalized = classId.replace(/\s+/g, '');
  if (POE2_ITEM_CLASS_TO_GEAR_TYPES[normalized]) return POE2_ITEM_CLASS_TO_GEAR_TYPES[normalized];
  return undefined;
}
