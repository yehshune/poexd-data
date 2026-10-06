export interface PoE1MechanismData {
  essenceModIndices: Set<number>;
  delveModIndices: Set<number>;
}

export function resolvePoE1Affinities(
  modIndex: number,
  mod: any,
  mechanismData: PoE1MechanismData,
  tradeCategory?: string,
  isNaturalDrop: boolean = false,
  spawnWeights: Array<{ tag: string; weight: number }> = []
): string[] {
  const affs = new Set<string>();

  // 1. 官方 Dat 表格外鍵關聯 (Foreign Table Relations)
  if (mechanismData.essenceModIndices.has(modIndex)) {
    affs.add('essence');
  }
  if (mechanismData.delveModIndices.has(modIndex)) {
    affs.add('delve');
  }
  if (mod.GenerationType === 5) {
    affs.add('corrupted');
  }
  if ((mod.Domain === 9 || mod.Domain === 28) && mod.GenerationType !== 5) {
    affs.add('master');
  }

  // 2. 官方 Trade API 大類判定
  if (tradeCategory) {
    if (tradeCategory === 'enchant') {
      affs.add('enchant');
    } else if (tradeCategory === 'fractured') {
      affs.add('fractured');
    } else if (tradeCategory === 'crafted') {
      affs.add('master');
    } else if (tradeCategory === 'veiled') {
      affs.add('veiled');
    } else if (tradeCategory === 'delve') {
      affs.add('delve');
    } else if (tradeCategory === 'sanctum') {
      affs.add('sanctum');
    }
  }

  // 3. 勢力與特殊詞綴判定 (Influence Mods)
  let isInfluence = false;

  // 3.1 優先由權重標籤 (SpawnWeight Tags) 精準判定
  for (const { tag, weight } of spawnWeights) {
    if (weight <= 0) continue;
    const lower = tag.toLowerCase();
    if (lower.endsWith('_shaper') || lower === 'shaper' || lower === 'shaper_item') {
      affs.add('shaper');
      isInfluence = true;
    } else if (lower.endsWith('_elder') || lower === 'elder' || lower === 'elder_item') {
      affs.add('elder');
      isInfluence = true;
    } else if (lower.endsWith('_crusader') || lower === 'crusader') {
      affs.add('crusader');
      isInfluence = true;
    } else if (lower.endsWith('_eyrie') || lower.endsWith('_redeemer') || lower === 'eyrie' || lower === 'redeemer') {
      affs.add('redeemer');
      isInfluence = true;
    } else if (lower.endsWith('_basilisk') || lower.endsWith('_hunter') || lower === 'basilisk' || lower === 'hunter') {
      affs.add('hunter');
      isInfluence = true;
    } else if (lower.endsWith('_adjudicator') || lower.endsWith('_warlord') || lower.endsWith('_conquest') || lower === 'adjudicator' || lower === 'warlord') {
      affs.add('warlord');
      isInfluence = true;
    }
  }

  // 3.2 次之由 Mod.Id 名稱判定 (兜底相容)
  const idLower = (mod.Id || '').toLowerCase();
  if (idLower.includes('elder')) {
    affs.add('elder');
    isInfluence = true;
  } else if (idLower.includes('shaper')) {
    affs.add('shaper');
    isInfluence = true;
  } else if (idLower.includes('crusader')) {
    affs.add('crusader');
    isInfluence = true;
  } else if (idLower.includes('hunter')) {
    affs.add('hunter');
    isInfluence = true;
  } else if (idLower.includes('eyrie') || idLower.includes('redeemer')) {
    affs.add('redeemer');
    isInfluence = true;
  } else if (idLower.includes('conquest') || idLower.includes('warlord')) {
    affs.add('warlord');
    isInfluence = true;
  } else if (idLower.includes('veiled')) {
    affs.add('veiled');
    isInfluence = true;
  }

  // 4. 自然生成詞綴判定
  const isSpecialExclusion =
    isInfluence ||
    mod.Domain === 9 ||
    mod.Domain === 28 ||
    mod.GenerationType === 5 ||
    tradeCategory === 'crafted' ||
    tradeCategory === 'enchant';

  if (isNaturalDrop && !isSpecialExclusion) {
    affs.add('normal');
  }

  if (affs.size === 0) {
    affs.add('normal');
  }

  return Array.from(affs);
}
