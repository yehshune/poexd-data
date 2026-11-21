import {
  ALL_POE1_JEWELLERY,
  ALL_POE1_WEAPONS,
  ONE_HAND_POE1_WEAPONS,
  TWO_HAND_POE1_WEAPONS,
} from './gear-types.js';

const INCURSION_ARCHITECT_RE =
  /Guatelitzi|Xopec|Tacati|Puhuarte|Matatl|Topotante|Citaqualotl/;

const HELMET_TYPES = [
  'helmet',
  'helmets_str',
  'helmets_dex',
  'helmets_int',
  'helmets_str_dex',
  'helmets_str_int',
  'helmets_dex_int',
  'helmets_ward',
];

const BODY_ARMOUR_TYPES = [
  'body-armour',
  'body_armours_str',
  'body_armours_dex',
  'body_armours_int',
  'body_armours_str_dex',
  'body_armours_str_int',
  'body_armours_dex_int',
  'body_armours_str_dex_int',
];

const GLOVES_TYPES = [
  'gloves',
  'gloves_str',
  'gloves_dex',
  'gloves_int',
  'gloves_str_dex',
  'gloves_str_int',
  'gloves_dex_int',
  'gloves_ward',
];

const BOOTS_TYPES = [
  'boots',
  'boots_str',
  'boots_dex',
  'boots_int',
  'boots_str_dex',
  'boots_str_int',
  'boots_dex_int',
  'boots_ward',
];

const SHIELD_TYPES = [
  'shield',
  'shields_str',
  'shields_dex',
  'shields_int',
  'shields_str_dex',
  'shields_str_int',
  'shields_dex_int',
  'shields_minion',
];

const ALL_ARMOUR_SLOTS = [
  ...HELMET_TYPES,
  ...BODY_ARMOUR_TYPES,
  ...GLOVES_TYPES,
  ...BOOTS_TYPES,
  ...SHIELD_TYPES,
];

const ONE_HAND_CASTER_WEAPONS = ['wand', 'wands_minion', 'sceptre', 'dagger', 'rune-dagger'];
const TWO_HAND_CASTER_WEAPONS = ['staff', 'warstaff'];
const ATTACK_WEAPONS_NO_ROD = ALL_POE1_WEAPONS.filter((w) => w !== 'fishing-rod');
const TWO_HAND_WEAPONS_NO_ROD = TWO_HAND_POE1_WEAPONS.filter((w) => w !== 'fishing-rod');
const MELEE_WEAPONS = ATTACK_WEAPONS_NO_ROD.filter((w) => w !== 'bow' && w !== 'wand');

export function isPoE1IncursionMod(mod: {
  Id?: string | null;
  Name?: string | null;
  Domain?: number;
  GenerationType?: number;
}): boolean {
  if (mod.Domain !== 1) return false;
  if (mod.GenerationType !== 1 && mod.GenerationType !== 2) return false;
  const id = String(mod.Id ?? '');
  if (!id || id.endsWith('Inverted')) return false;
  return INCURSION_ARCHITECT_RE.test(String(mod.Name ?? ''));
}

/**
 * 穿越（神廟）詞綴在 Mods.dat 的 SpawnWeight 全為 0，依官方神廟詞綴規則對應至裝備部位。
 */
export function resolvePoE1IncursionGearTypes(modId: string): string[] {
  if (!modId || modId.endsWith('Inverted')) return [];

  // 1. 胸甲限定生命 (Guatelitzi's)
  if (modId.startsWith('IncreasedLifeEnhanced') && modId.includes('BodyMod')) {
    return BODY_ARMOUR_TYPES;
  }
  // 2. 其他防具與飾品生命 (Guatelitzi's)
  if (modId.startsWith('IncreasedLifeEnhanced')) {
    return [...HELMET_TYPES, ...GLOVES_TYPES, ...BOOTS_TYPES, ...SHIELD_TYPES, ...ALL_POE1_JEWELLERY];
  }
  // 3. 魔力 (Xopec's)
  if (modId.startsWith('IncreasedManaEnhanced')) {
    if (modId.includes('Reservation')) return HELMET_TYPES;
    if (modId.includes('Percent')) return [...ALL_ARMOUR_SLOTS, 'ring', 'amulet'];
    return ['ring', 'amulet'];
  }
  // 4. 能量護盾 (Guatelitzi's)
  if (modId.startsWith('IncreasedEnergyShieldEnhanced')) {
    return ALL_ARMOUR_SLOTS;
  }
  // 5. 手套限定攻擊點傷 + 25% 物轉元 (Topotante's)
  if (/^Added(Fire|Cold|Lightning)DamageEnhanced/.test(modId)) {
    return GLOVES_TYPES;
  }
  // 6. 武器物理增傷 + 附加混沌 (Tacati's)
  if (modId.startsWith('LocalIncreasedPhysicalDamageEnhanced')) {
    return ATTACK_WEAPONS_NO_ROD;
  }
  // 7. 武器元素點傷 + 穿透 (Topotante's)
  if (/^LocalAdded(Fire|Cold|Lightning)DamageEnhanced/.test(modId)) {
    return modId.includes('TwoHand') ? TWO_HAND_WEAPONS_NO_ROD : ONE_HAND_POE1_WEAPONS;
  }
  // 8. 鞋子跑速 (Matatl's)
  if (modId.startsWith('MovementVelocityEnhanced')) {
    return BOOTS_TYPES;
  }
  // 9. 插槽陷阱/地雷寶石等級 -> 手套；召喚物寶石等級 -> 頭盔
  if (modId.startsWith('LocalIncreaseSocketedTrapGemLevelEnhanced')) {
    return GLOVES_TYPES;
  }
  if (modId.startsWith('LocalIncreaseSocketedMinionGemLevelEnhanced')) {
    return HELMET_TYPES;
  }
  // 10. 武器攻速 + 混沌點傷 (of Tacati)
  if (modId.startsWith('LocalIncreasedAttackSpeed')) {
    return modId.includes('Ranged') ? ['bow', 'wand'] : MELEE_WEAPONS;
  }
  // 11. 法術 / 陷阱 / 地雷 / 召喚物 / 觸發法術 / 施法速度武器詞綴
  if (
    /^(SpellDamageOn|TrapDamageOn|MineDamageOn|MinionDamageOn|(Fire|Cold|Lightning)DamagePrefixOn|WeaponSpellDamageTriggerSkillOn|TrapThrowSpeed|MineThrowSpeed|TrapCooldownRecoveryAndDuration|MineDetonationSpeedAndDuration|TrapAreaOfEffect|MineAreaOfEffect|MinionAttackAndCastSpeed|MinionDuration|IncreasedCastSpeed)/.test(
      modId
    )
  ) {
    return modId.includes('TwoHand') ? TWO_HAND_CASTER_WEAPONS : ONE_HAND_CASTER_WEAPONS;
  }
  // 12. 生命回復 (of Guatelitzi)
  if (modId.startsWith('LifeRegenerationEnhanced')) {
    return [...ALL_ARMOUR_SLOTS, ...ALL_POE1_JEWELLERY];
  }
  // 13. 抗性 + 物理轉承傷 -> 頭盔；抗性 + 元素偷取 -> 飾品；抗性 + 異常狀態增傷 -> 手套 (of Puhuarte)
  if (/^(Fire|Cold|Lightning)ResistEnhanced/.test(modId)) {
    if (modId.includes('Phys')) return HELMET_TYPES;
    if (modId.includes('Leech')) return ALL_POE1_JEWELLERY;
    if (modId.includes('Ailments')) return GLOVES_TYPES;
  }
  // 14. 混沌抗性 + 減少持續混沌傷 (of Tacati)
  if (modId.startsWith('ChaosResistEnhanced')) {
    return [...ALL_ARMOUR_SLOTS, ...ALL_POE1_JEWELLERY];
  }
  // 15. 中毒 / 混沌增傷 (of Tacati)
  if (modId.startsWith('PoisonDurationEnhanced') || modId.startsWith('ChanceToPoisonEnhanced')) {
    return [...ALL_POE1_JEWELLERY, ...GLOVES_TYPES];
  }
  if (modId.startsWith('PoisonDamageEnhanced') && modId.includes('AttacksMod')) {
    return [...ONE_HAND_POE1_WEAPONS, 'bow'];
  }
  if (modId.startsWith('PoisonDamageEnhanced') && modId.includes('SpellsMod')) {
    return [...ONE_HAND_CASTER_WEAPONS, ...TWO_HAND_CASTER_WEAPONS];
  }

  return [];
}
