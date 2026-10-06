export interface PoE1MechanismData {
  essenceModIndices: Set<number>;
  delveModIndices: Set<number>;
}

export function resolvePoE1Affinities(
  modIndex: number,
  mod: any,
  mechanismData: PoE1MechanismData,
  tradeCategory?: string,
  isNaturalDrop: boolean = false
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
  const idLower = (mod.Id || '').toLowerCase();
  let isInfluence = false;
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
