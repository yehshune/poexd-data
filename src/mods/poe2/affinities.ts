export interface PoE2MechanismData {
  essenceModIndices: Set<number>;
  perfectEssenceModIndices?: Set<number>;
  liquidModIndices: Set<number>;
}

export function resolvePoE2Affinities(
  modIndex: number,
  mod: any,
  mechanismData: PoE2MechanismData,
  tradeCategory?: string,
  activeTags: string[] = [],
  isNaturalDrop: boolean = false
): string[] {
  const affs = new Set<string>();

  // 1. 官方 Dat 表格外鍵關聯 (Foreign Table Relations)
  if (mechanismData.perfectEssenceModIndices?.has(modIndex)) {
    affs.add('perfect_essence');
  } else if (mechanismData.essenceModIndices.has(modIndex)) {
    affs.add('essence');
  }
  if (mechanismData.liquidModIndices.has(modIndex)) {
    affs.add('liquid');
  }
  if (mod.GenerationType === 5) {
    affs.add('corrupted');
  }

  // 2. 官方 Trade API 大類判定 (Official Trade Category)
  if (tradeCategory) {
    if (tradeCategory === 'desecrated') {
      affs.add('desecrated');
    } else if (tradeCategory === 'rune') {
      affs.add('socketable');
    } else if (tradeCategory === 'enchant') {
      if (mod.GenerationType !== 5) {
        affs.add('enchant');
      }
    } else if (tradeCategory === 'sanctum') {
      affs.add('sanctum');
    } else if (tradeCategory === 'fractured') {
      affs.add('fractured');
    } else if (tradeCategory === 'crafted') {
      affs.add('crafted');
    }
  }

  // 3. 符文影響力與特殊機制標籤判定 (Rune Warping & Genesis Tree)
  for (const tag of activeTags) {
    const lower = tag.toLowerCase();
    if (lower === 'destruction') {
      affs.add('destruction');
    } else if (lower === 'berserking') {
      affs.add('berserking');
    } else if (lower === 'marksman') {
      affs.add('marksman');
    } else if (lower === 'decay') {
      affs.add('decay');
    } else if (lower === 'chronomancy') {
      affs.add('chronomancy');
    } else if (lower === 'soul') {
      affs.add('soul');
    } else if (lower === 'breach_desecration') {
      affs.add('breach_otherworldly');
    } else if (lower === 'genesis_tree_minion') {
      affs.add('breach_minion');
    } else if (lower === 'genesis_tree_caster') {
      affs.add('breach_caster');
    }
  }

  // 4. 深淵巫妖 / 褻瀆專屬詞綴判定 (Abyss Liches)
  if (mod.Id?.startsWith('AbyssMod')) {
    affs.add('desecrated');
  }

  // 5. 自然掉落詞綴判定
  const isSpecialCraft =
    tradeCategory === 'crafted' ||
    tradeCategory === 'enchant' ||
    tradeCategory === 'sanctum' ||
    tradeCategory === 'desecrated' ||
    mod.GenerationType === 5 ||
    Boolean(mod.Id?.startsWith('AbyssMod'));

  if (isNaturalDrop && !isSpecialCraft) {
    affs.add('normal');
  }

  if (affs.size === 0) {
    affs.add('normal');
  }

  return Array.from(affs);
}
