export const ALL_POE1_WEAPONS = [
  'claw',
  'dagger',
  'rune-dagger',
  'wand',
  'one-hand-sword',
  'thrusting-one-hand-sword',
  'two-hand-sword',
  'one-hand-axe',
  'two-hand-axe',
  'one-hand-mace',
  'two-hand-mace',
  'sceptre',
  'bow',
  'staff',
  'warstaff',
  'fishing-rod',
];

export const ONE_HAND_POE1_WEAPONS = [
  'claw',
  'dagger',
  'rune-dagger',
  'wand',
  'one-hand-sword',
  'thrusting-one-hand-sword',
  'one-hand-axe',
  'one-hand-mace',
  'sceptre',
];

export const TWO_HAND_POE1_WEAPONS = [
  'bow',
  'staff',
  'warstaff',
  'two-hand-sword',
  'two-hand-axe',
  'two-hand-mace',
  'fishing-rod',
];

export const ALL_POE1_ARMOUR = [
  'gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int',
  'boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int',
  'body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int',
  'helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int',
  'shield', 'shields_str', 'shields_dex', 'shields_int', 'shields_str_dex', 'shields_str_int', 'shields_dex_int',
];

export const ALL_POE1_JEWELLERY = [
  'amulet',
  'ring',
  'belt',
];

export const POE1_DEFAULT_GEAR_TYPES = [
  ...ALL_POE1_WEAPONS,
  ...ALL_POE1_ARMOUR,
  ...ALL_POE1_JEWELLERY,
  'quiver',
];

export const POE1_TAG_TO_GEAR_TYPES: Record<string, string[]> = {
  // 通用類別標籤 (Broad Tags)
  default: POE1_DEFAULT_GEAR_TYPES,
  weapon: ALL_POE1_WEAPONS,
  one_hand_weapon: ONE_HAND_POE1_WEAPONS,
  two_hand_weapon: TWO_HAND_POE1_WEAPONS,
  melee: ALL_POE1_WEAPONS.filter((w) => !w.includes('bow') && !w.includes('wand')),
  ranged: ['bow', 'quiver'],
  armour: ALL_POE1_ARMOUR,
  jewellery: ALL_POE1_JEWELLERY,
  deepwater_pantheon_aspect: POE1_DEFAULT_GEAR_TYPES,
  deepwater_hazard_belt: ['belt'],

  // 防具部位通用標籤
  gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  body_armour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
  helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],

  // 武器
  claw: ['claw'],
  dagger: ['dagger'],
  rune_dagger: ['dagger', 'rune-dagger'],
  wand: ['wand'],
  sword: ['one-hand-sword', 'thrusting-one-hand-sword', 'two-hand-sword'],
  one_hand_sword: ['one-hand-sword', 'thrusting-one-hand-sword'],
  rapier: ['one-hand-sword', 'thrusting-one-hand-sword'],
  two_hand_sword: ['two-hand-sword'],
  axe: ['one-hand-axe', 'two-hand-axe'],
  one_hand_axe: ['one-hand-axe'],
  two_hand_axe: ['two-hand-axe'],
  mace: ['one-hand-mace', 'two-hand-mace'],
  one_hand_mace: ['one-hand-mace'],
  two_hand_mace: ['two-hand-mace'],
  sceptre: ['sceptre'],
  bow: ['bow'],
  staff: ['staff'],
  warstaff: ['staff', 'warstaff'],
  fishing_rod: ['fishing-rod'],
  attack_staff: ['staff', 'warstaff'],
  attack_dagger: ['dagger'],

  // 飾品與副手
  amulet: ['amulet'],
  ring: ['ring'],
  belt: ['belt'],
  quiver: ['quiver'],
  shield: ['shield', 'shields_str', 'shields_dex', 'shields_int', 'shields_str_dex', 'shields_str_int', 'shields_dex_int'],

  // 藥劑與獵魔塗劑
  flask: ['flask'],
  life_flask: ['life-flask', 'flask'],
  mana_flask: ['mana-flask', 'flask'],
  hybrid_flask: ['flask', 'hybrid-flask'],
  utility_flask: ['flask', 'utility-flask'],
  tincture: ['tincture'],

  // 珠寶
  jewel: ['jewel'],
  strjewel: ['jewel', 'crimson_jewel'],
  str_jewel: ['jewel', 'crimson_jewel'],
  dexjewel: ['jewel', 'viridian_jewel'],
  dex_jewel: ['jewel', 'viridian_jewel'],
  intjewel: ['jewel', 'cobalt_jewel'],
  int_jewel: ['jewel', 'cobalt_jewel'],
  prismatic_jewel: ['jewel', 'prismatic_jewel'],
  abyss_jewel: ['jewel', 'abyss_jewel'],
  abyss_jewel_melee: ['jewel', 'murderous_eye_jewel'],
  abyss_jewel_ranged: ['jewel', 'searching_eye_jewel'],
  abyss_jewel_caster: ['jewel', 'hypnotic_eye_jewel'],
  abyss_jewel_summoner: ['jewel', 'ghastly_eye_jewel'],
  expansion_jewel_large: ['jewel', 'large_cluster_jewel'],
  expansion_jewel_medium: ['jewel', 'medium_cluster_jewel'],
  expansion_jewel_small: ['jewel', 'small_cluster_jewel'],

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
    'shield', 'shields_dex',
  ],
  int_armour: [
    'gloves', 'gloves_int',
    'boots', 'boots_int',
    'body-armour', 'body_armours_int',
    'helmet', 'helmets_int',
    'shield', 'shields_int',
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
    'shield', 'shields_dex_int',
  ],
  str_dex_int_armour: [
    'gloves', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int',
    'boots', 'boots_str_dex', 'boots_str_int', 'boots_dex_int',
    'body-armour', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int',
    'helmet', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int',
    'shield', 'shields_str_dex', 'shields_str_int', 'shields_dex_int',
  ],
  ward_armour: [
    'gloves', 'boots', 'body-armour', 'helmet',
  ],

  // 盾牌細分
  str_shield: ['shield', 'shields_str'],
  dex_shield: ['shield', 'shields_dex'],
  int_shield: ['shield', 'shields_int'],
  str_dex_shield: ['shield', 'shields_str_dex'],
  str_int_shield: ['shield', 'shields_str_int'],
  dex_int_shield: ['shield', 'shields_dex_int'],
  focus: ['shield', 'shields_int'],

  // 召喚物裝備標籤
  weapon_can_roll_minion_modifiers: ['wand', 'sceptre'],
  focus_can_roll_minion_modifiers: ['shield', 'shields_int'],
  ring_can_roll_minion_modifiers: ['ring'],
  helmet_can_roll_minion_modifiers: [
    'helmet', 'helmets_str', 'helmets_dex', 'helmets_int',
    'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'
  ],

  // 特殊基底與機制裝備
  unset_ring: ['ring'],
  deepwater_sword: ['two-hand-sword'],
  necropolis_boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  necropolis_gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  necropolis_body_armour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
  necropolis_helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
};

const INFLUENCE_SUFFIXES = ['shaper', 'elder', 'crusader', 'eyrie', 'basilisk', 'adjudicator'];

export function matchPoE1TagGearTypes(tagLower: string): string[] | undefined {
  if (POE1_TAG_TO_GEAR_TYPES[tagLower]) {
    return POE1_TAG_TO_GEAR_TYPES[tagLower];
  }

  // 匹配 6 大勢力標籤格式 (<gear>_shaper, <gear>_elder 等)
  for (const suffix of INFLUENCE_SUFFIXES) {
    if (tagLower.endsWith(`_${suffix}`)) {
      let basePart = tagLower.slice(0, -(suffix.length + 1));
      if (basePart === '2h_sword') basePart = 'two_hand_sword';
      else if (basePart === '2h_axe') basePart = 'two_hand_axe';
      else if (basePart === '2h_mace') basePart = 'two_hand_mace';
      return POE1_TAG_TO_GEAR_TYPES[basePart];
    }
  }

  return undefined;
}

export function resolvePoE1GearTypes(
  spawnWeights: Array<{ tag: string; weight: number }>,
  domain?: number
): string[] {
  const result = new Set<string>();

  if (domain === 10) {
    result.add('jewel');
    for (const { tag, weight } of spawnWeights) {
      if (weight <= 0) continue;
      const lower = tag.toLowerCase();
      if (lower === 'strjewel' || lower === 'str_jewel') {
        result.add('crimson_jewel');
      } else if (lower === 'dexjewel' || lower === 'dex_jewel') {
        result.add('viridian_jewel');
      } else if (lower === 'intjewel' || lower === 'int_jewel') {
        result.add('cobalt_jewel');
      }
    }
    return Array.from(result);
  } else if (domain === 13) {
    result.add('jewel');
    result.add('abyss_jewel');
    for (const { tag, weight } of spawnWeights) {
      if (weight <= 0) continue;
      const lower = tag.toLowerCase();
      if (lower === 'abyss_jewel_melee') {
        result.add('murderous_eye_jewel');
      } else if (lower === 'abyss_jewel_ranged') {
        result.add('searching_eye_jewel');
      } else if (lower === 'abyss_jewel_caster') {
        result.add('hypnotic_eye_jewel');
      } else if (lower === 'abyss_jewel_summoner') {
        result.add('ghastly_eye_jewel');
      }
    }
    return Array.from(result);
  } else if (domain === 21) {
    result.add('jewel');
    result.add('cluster_jewel');
    result.add('large_cluster_jewel');
    result.add('medium_cluster_jewel');
    result.add('small_cluster_jewel');
    for (const { tag, weight } of spawnWeights) {
      if (weight <= 0) continue;
      const lower = tag.toLowerCase();
      if (lower === 'expansion_jewel_large') {
        result.add('large_cluster_jewel');
      } else if (lower === 'expansion_jewel_medium') {
        result.add('medium_cluster_jewel');
      } else if (lower === 'expansion_jewel_small') {
        result.add('small_cluster_jewel');
      }
    }
    return Array.from(result);
  }

  const defaultWeight = spawnWeights.find((sw) => sw.tag.toLowerCase() === 'default')?.weight ?? 0;

  if (defaultWeight > 0) {
    for (const t of POE1_DEFAULT_GEAR_TYPES) {
      result.add(t);
    }

    for (const { tag, weight } of spawnWeights) {
      const lower = tag.toLowerCase();
      if (lower === 'default') continue;

      const matched = matchPoE1TagGearTypes(lower);
      if (matched) {
        if (weight <= 0) {
          for (const t of matched) result.delete(t);
        } else {
          for (const t of matched) result.add(t);
        }
      }
    }
  } else {
    for (const { tag, weight } of spawnWeights) {
      if (weight <= 0) continue;
      const lower = tag.toLowerCase();

      const matched = matchPoE1TagGearTypes(lower);
      if (matched) {
        for (const t of matched) result.add(t);
      }
    }
  }

  return Array.from(result);
}

export const POE1_ITEM_CLASS_TO_GEAR_TYPES: Record<string, string[]> = {
  Claw: ['claw'],
  Dagger: ['dagger'],
  RuneDagger: ['dagger', 'rune-dagger'],
  'Rune Dagger': ['dagger', 'rune-dagger'],
  Wand: ['wand'],
  OneHandSword: ['one-hand-sword'],
  'One Hand Sword': ['one-hand-sword'],
  ThrustingOneHandSword: ['one-hand-sword', 'thrusting-one-hand-sword'],
  'Thrusting One Hand Sword': ['one-hand-sword', 'thrusting-one-hand-sword'],
  OneHandAxe: ['one-hand-axe'],
  'One Hand Axe': ['one-hand-axe'],
  OneHandMace: ['one-hand-mace'],
  'One Hand Mace': ['one-hand-mace'],
  Sceptre: ['sceptre'],
  Bow: ['bow'],
  Staff: ['staff'],
  Warstaff: ['staff', 'warstaff'],
  TwoHandSword: ['two-hand-sword'],
  'Two Hand Sword': ['two-hand-sword'],
  TwoHandAxe: ['two-hand-axe'],
  'Two Hand Axe': ['two-hand-axe'],
  TwoHandMace: ['two-hand-mace'],
  'Two Hand Mace': ['two-hand-mace'],
  FishingRod: ['fishing-rod'],
  'Fishing Rod': ['fishing-rod'],
  Amulet: ['amulet'],
  Ring: ['ring'],
  Belt: ['belt'],
  Quiver: ['quiver'],
  Shield: ['shield', 'shields_str', 'shields_dex', 'shields_int', 'shields_str_dex', 'shields_str_int', 'shields_dex_int'],
  Gloves: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
  Boots: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
  BodyArmour: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
  'Body Armour': ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
  Helmet: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
  Flask: ['flask'],
  LifeFlask: ['life-flask', 'flask'],
  'Life Flask': ['life-flask', 'flask'],
  ManaFlask: ['mana-flask', 'flask'],
  'Mana Flask': ['mana-flask', 'flask'],
  HybridFlask: ['flask', 'hybrid-flask'],
  'Hybrid Flask': ['flask', 'hybrid-flask'],
  UtilityFlask: ['flask', 'utility-flask'],
  'Utility Flask': ['flask', 'utility-flask'],
  Tincture: ['tincture'],
  Jewel: ['jewel'],
  AbyssJewel: ['jewel', 'abyss_jewel'],
  'Abyss Jewel': ['jewel', 'abyss_jewel'],
};

export function getPoE1ItemClassGearTypes(classId: string): string[] | undefined {
  if (POE1_ITEM_CLASS_TO_GEAR_TYPES[classId]) {
    return POE1_ITEM_CLASS_TO_GEAR_TYPES[classId];
  }
  const clean = classId.replace(/[\s_-]+/g, '');
  if (POE1_ITEM_CLASS_TO_GEAR_TYPES[clean]) {
    return POE1_ITEM_CLASS_TO_GEAR_TYPES[clean];
  }
  return undefined;
}

export function resolveRecombinatorSpecialGearTypes(modId: string): string[] {
  // 1. 球數上限：限定戒指 (Rings)
  if (
    modId.includes('MaximumEnduranceCharge') ||
    modId.includes('MaximumFrenzyCharge') ||
    modId.includes('MaximumPowerCharge')
  ) {
    return ['ring'];
  }

  // 2. 藥劑效果：限定腰帶 (Belts)
  if (modId.includes('MagicUtilityFlaskEffect')) {
    return ['belt'];
  }

  // 3. 屬性附加攻擊點傷：限定鞋子 (Boots: 力量->力量鞋、敏捷->閃避鞋、智慧->能量護盾鞋)
  if (modId.includes('FireDamageToAttacksPerStrength')) {
    return ['boots', 'boots_str'];
  }
  if (modId.includes('ColdDamageToAttacksPerDexterity')) {
    return ['boots', 'boots_dex'];
  }
  if (modId.includes('LightningDamageToAttacksPerIntelligence')) {
    return ['boots', 'boots_int'];
  }

  // 4. 輔助寶石等級：限定手套 (Gloves: 賦予->力量手、增幅->閃避手、啟蒙->能量護盾手)
  if (modId.includes('SupportedByLevelFourEmpower')) {
    return ['gloves', 'gloves_str'];
  }
  if (modId.includes('SupportedByLevelFourEnhance')) {
    return ['gloves', 'gloves_dex'];
  }
  if (modId.includes('SupportedByLevelFourEnlighten')) {
    return ['gloves', 'gloves_int'];
  }

  // 5. 插槽觸發雙倍傷害：限定武器 (Weapons)
  if (modId.includes('TriggerSkillsDoubleDamage')) {
    return ALL_POE1_WEAPONS;
  }

  // 6. 光環效果：限定項鍊 (Amulets)
  if (modId.includes('AuraEffect')) {
    return ['amulet'];
  }

  // 7. 異常狀態轉化：限定頭盔 (Helmets)
  if (
    modId.includes('AllFireDamageCanShock') ||
    modId.includes('AllColdDamageCanIgnite') ||
    modId.includes('AllLightningDamageCanFreeze')
  ) {
    return ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'];
  }

  // 8. 標記效果：限定箭袋 (Quivers)
  if (modId.includes('MarkEffect')) {
    return ['quiver'];
  }

  // 9. 秘能波動效果：限定法系武器 (Caster Weapons: Wand, Sceptre, Rune Dagger, Staff)
  if (modId.includes('ArcaneSurgeEffect1H')) {
    return ['wand', 'sceptre', 'rune-dagger'];
  }
  if (modId.includes('ArcaneSurgeEffect2H')) {
    return ['staff'];
  }

  // 10. 猛攻效果：限定弓、爪、劍、斧
  if (modId.includes('OnslaughtEffect1H')) {
    return [
      'claw',
      'one-hand-sword',
      'thrusting-one-hand-sword',
      'one-hand-axe',
    ];
  }
  if (modId.includes('OnslaughtEffect2H')) {
    return [
      'bow',
      'two-hand-sword',
      'two-hand-axe',
    ];
  }

  // 11. 戰吼嘲諷增傷：限定近戰武器 (Melee Weapons)
  if (modId.includes('IncreasedDamageVsWarcryTauntedEnemies1H')) {
    return [
      'claw',
      'dagger',
      'rune-dagger',
      'one-hand-sword',
      'thrusting-one-hand-sword',
      'one-hand-axe',
      'one-hand-mace',
      'sceptre',
    ];
  }
  if (modId.includes('IncreasedDamageVsWarcryTauntedEnemies2H')) {
    return [
      'two-hand-sword',
      'two-hand-axe',
      'two-hand-mace',
      'staff',
      'warstaff',
    ];
  }

  // 12. 基石天賦：限定身體護甲 (Body Armours)
  if (modId.includes('Keystone')) {
    return [
      'body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int',
      'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'
    ];
  }

  return [];
}

export function resolveHarvestQualityGearTypes(modId: string): string[] {
  if (modId.startsWith('HarvestAlternateWeaponQuality')) {
    return ALL_POE1_WEAPONS;
  }
  if (modId.startsWith('HarvestAlternateArmourQuality')) {
    return [
      'body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int',
      'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'
    ];
  }
  return [];
}
