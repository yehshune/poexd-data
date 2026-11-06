export const ALL_POE2_WEAPONS = [
  'claw', 'claws',
  'dagger', 'daggers',
  'wand', 'wands',
  'one-hand-sword', 'one_hand_swords',
  'one-hand-axe', 'one_hand_axes',
  'one-hand-mace', 'one_hand_maces',
  'sceptre', 'sceptres',
  'spear', 'spears',
  'flail', 'flails',
  'bow', 'bows',
  'staff', 'staves',
  'two-hand-sword', 'two_hand_swords',
  'two-hand-axe', 'two_hand_axes',
  'two-hand-mace', 'two_hand_maces',
  'quarterstaff', 'quarterstaves',
  'crossbow', 'crossbows',
  'talisman', 'talismans',
];

export const ONE_HAND_POE2_WEAPONS = [
  'claw', 'claws',
  'dagger', 'daggers',
  'wand', 'wands',
  'one-hand-sword', 'one_hand_swords',
  'one-hand-axe', 'one_hand_axes',
  'one-hand-mace', 'one_hand_maces',
  'sceptre', 'sceptres',
  'spear', 'spears',
  'flail', 'flails',
  'talisman', 'talismans',
];

export const TWO_HAND_POE2_WEAPONS = [
  'bow', 'bows',
  'staff', 'staves',
  'two-hand-sword', 'two_hand_swords',
  'two-hand-axe', 'two_hand_axes',
  'two-hand-mace', 'two_hand_maces',
  'quarterstaff', 'quarterstaves',
  'crossbow', 'crossbows',
];

export const ALL_POE2_ARMOUR = [
  'gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int',
  'boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int',
  'body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int',
  'helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int',
  'shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'bucklers',
];

export const ALL_POE2_JEWELLERY = [
  'amulet', 'amulets',
  'ring', 'rings',
  'belt', 'belts',
];

export const POE2_TAG_TO_GEAR_TYPES: Record<string, string[]> = {
  // 通用類別標籤 (Broad Tags)
  weapon: ALL_POE2_WEAPONS,
  one_hand_weapon: ONE_HAND_POE2_WEAPONS,
  two_hand_weapon: TWO_HAND_POE2_WEAPONS,
  melee: ALL_POE2_WEAPONS.filter((w) => !w.includes('bow') && !w.includes('crossbow') && !w.includes('wand')),
  ranged: ['bow', 'bows', 'crossbow', 'crossbows', 'quiver', 'quivers'],
  armour: ALL_POE2_ARMOUR,
  jewellery: ALL_POE2_JEWELLERY,

  // 防具部位通用標籤
  gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  body_armour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int'],
  helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],

  // 武器細分
  claw: ['claw', 'claws'],
  dagger: ['dagger', 'daggers'],
  wand: ['wand', 'wands'],
  sword: ['one-hand-sword', 'one_hand_swords', 'two-hand-sword', 'two_hand_swords'],
  one_hand_sword: ['one-hand-sword', 'one_hand_swords'],
  two_hand_sword: ['two-hand-sword', 'two_hand_swords'],
  axe: ['one-hand-axe', 'one_hand_axes', 'two-hand-axe', 'two_hand_axes'],
  one_hand_axe: ['one-hand-axe', 'one_hand_axes'],
  two_hand_axe: ['two-hand-axe', 'two_hand_axes'],
  mace: ['one-hand-mace', 'one_hand_maces', 'two-hand-mace', 'two_hand_maces'],
  one_hand_mace: ['one-hand-mace', 'one_hand_maces'],
  two_hand_mace: ['two-hand-mace', 'two_hand_maces'],
  sceptre: ['sceptre', 'sceptres'],
  spear: ['spear', 'spears'],
  flail: ['flail', 'flails'],
  bow: ['bow', 'bows'],
  staff: ['staff', 'staves'],
  quarterstaff: ['quarterstaff', 'quarterstaves'],
  crossbow: ['crossbow', 'crossbows'],
  warstaff: ['quarterstaff', 'quarterstaves', 'staff', 'staves'],
  cannon: ['crossbow', 'crossbows'],
  talisman: ['talisman', 'talismans'],

  // 飾品與副手
  amulet: ['amulet', 'amulets'],
  ring: ['ring', 'rings'],
  belt: ['belt', 'belts'],
  quiver: ['quiver', 'quivers'],
  focus: ['focus', 'foci'],
  shield: ['shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'bucklers'],
  str_shield: ['shield', 'shields_str'],
  str_dex_shield: ['shield', 'shields_str_dex', 'bucklers'],
  buckler: ['shield', 'bucklers'],

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
  amulet_elder: ['amulet', 'amulets'],
  gloves_shaper: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  amulet_shaper: ['amulet', 'amulets'],

  // 藥劑與護符
  flask: ['flask'],
  utility_flask: ['charm', 'charms'],
  life_flask: ['life-flask', 'life_flasks', 'flask'],
  mana_flask: ['mana-flask', 'mana_flasks', 'flask'],
  charm: ['charm', 'charms'],

  // 珠寶
  jewel: ['jewel'],
  str_radius_jewel: ['jewel', 'ruby'],
  dex_radius_jewel: ['jewel', 'emerald'],
  int_radius_jewel: ['jewel', 'sapphire'],
  strjewel: ['jewel', 'ruby'],
  dexjewel: ['jewel', 'emerald'],
  intjewel: ['jewel', 'sapphire'],
  radius_jewel: ['jewel', 'diamond'],
  historic_abyss_jewel_1: ['jewel', 'time-lost-ruby'],
  historic_abyss_jewel_2: ['jewel', 'time-lost-emerald'],
  historic_abyss_jewel_3: ['jewel', 'time-lost-sapphire'],
  historic_abyss_jewel_4: ['jewel', 'time-lost-diamond'],

  // 聖物
  relic: ['relic', 'relics'],
  small_sanctum_relic: ['relic', 'urn-relic', 'vase-relic'],
  medium_sanctum_relic: ['relic', 'seal-relic', 'coffer-relic'],
  large_sanctum_relic: ['relic', 'tapestry-relic', 'incense-relic'],

  // 換界石
  low_tier_map: ['waystone-t1', 'waystones_low_tier'],
  mid_tier_map: ['waystone-t2', 'waystones_mid_tier'],
  top_tier_map: ['waystone-t3', 'waystones_top_tier'],

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
    'shield', 'shields_str_dex', 'bucklers',
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
    'shield', 'shields_str_dex', 'bucklers',
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

  // 根據 Domain 特殊補齊
  if (domain === 8) {
    result.add('relic');
    result.add('relics');
  } else if (domain === 11) {
    result.add('jewel');
  }

  for (const { tag, weight } of spawnWeights) {
    if (weight <= 0) continue;
    const lower = tag.toLowerCase();

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
      if (lower.includes('irradiated')) result.add('irradiated-tablet');
      if (lower.includes('overseer')) result.add('overseer-tablet');
      if (lower.includes('abyss')) result.add('abyss-tablet');
      if (lower.includes('temple')) result.add('temple-tablet');
    }
  }

  return Array.from(result);
}

export const POE2_ITEM_CLASS_TO_GEAR_TYPES: Record<string, string[]> = {
  Claw: ['claw', 'claws'],
  Dagger: ['dagger', 'daggers'],
  Wand: ['wand', 'wands'],
  OneHandSword: ['one-hand-sword', 'one_hand_swords'],
  OneHandAxe: ['one-hand-axe', 'one_hand_axes'],
  OneHandMace: ['one-hand-mace', 'one_hand_maces'],
  Sceptre: ['sceptre', 'sceptres'],
  Spear: ['spear', 'spears'],
  Flail: ['flail', 'flails'],
  Bow: ['bow', 'bows'],
  Staff: ['staff', 'staves'],
  TwoHandSword: ['two-hand-sword', 'two_hand_swords'],
  TwoHandAxe: ['two-hand-axe', 'two_hand_axes'],
  TwoHandMace: ['two-hand-mace', 'two_hand_maces'],
  Quarterstaff: ['quarterstaff', 'quarterstaves'],
  Crossbow: ['crossbow', 'crossbows'],
  Amulet: ['amulet', 'amulets'],
  Ring: ['ring', 'rings'],
  Belt: ['belt', 'belts'],
  Quiver: ['quiver', 'quivers'],
  Focus: ['focus', 'foci'],
  Shield: ['shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'bucklers'],
  Buckler: ['shield', 'bucklers'],
  Gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  Boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  BodyArmour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int', 'body_armours_str_dex_int'],
  Helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
  Flask: ['flask'],
  LifeFlask: ['life-flask', 'life_flasks', 'flask'],
  ManaFlask: ['mana-flask', 'mana_flasks', 'flask'],
  UtilityFlask: ['charm', 'charms'],
  Charm: ['charm', 'charms'],
  Jewel: ['jewel'],
  Relic: ['relic', 'relics'],
  UrnRelic: ['relic', 'urn-relic'],
  VaseRelic: ['relic', 'vase-relic'],
  SealRelic: ['relic', 'seal-relic'],
  CofferRelic: ['relic', 'coffer-relic'],
  TapestryRelic: ['relic', 'tapestry-relic'],
  Warstaff: ['staff', 'staves'],
  Talisman: ['talisman', 'talismans'],
  Waystone: ['waystone-t1', 'waystones_low_tier'],
};

export function getPoE2ItemClassGearTypes(classId: string): string[] | undefined {
  if (!classId) return undefined;
  if (POE2_ITEM_CLASS_TO_GEAR_TYPES[classId]) return POE2_ITEM_CLASS_TO_GEAR_TYPES[classId];
  const normalized = classId.replace(/\s+/g, '');
  if (POE2_ITEM_CLASS_TO_GEAR_TYPES[normalized]) return POE2_ITEM_CLASS_TO_GEAR_TYPES[normalized];
  return undefined;
}
