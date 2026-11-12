import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSingularVariants } from '../src/mods/common/merge-singular-variants.js';
import type { CollectedModTierRecord } from '../src/mods/common/lexicon-builder.js';
import {
  buildClusterPassiveCountRecords,
  clusterSizeTypesFromModId,
} from '../src/mods/poe1/cluster-jewels.js';

const record = (over: Partial<CollectedModTierRecord>): CollectedModTierRecord => ({
  modId: 'X',
  affinities: ['cluster'],
  generation_type: '3',
  level: 1,
  values: [],
  params: [1],
  types: ['cluster_jewel'],
  id: 'explicit.stat_4079888060',
  statIds: ['explicit.stat_4079888060'],
  groupKey: '',
  templatesByLocale: { en: '', 'zh-TW': '' } as CollectedModTierRecord['templatesByLocale'],
  ...over,
});

describe('mergeSingularVariants', () => {
  // 取自 3.29：數值 1 時遊戲用單數句（沒有佔位符），市集代碼相同
  const singular = record({
    modId: 'JewelExpansionJewelNodesMedium',
    params: [1],
    values: [],
    groupKey: '1 added passive skill is a jewel socket',
    templatesByLocale: { en: '1 Added Passive Skill is a Jewel Socket', 'zh-TW': '1 個附加的天賦為珠寶插槽' } as any,
  });
  const plural = record({
    modId: 'JewelExpansionJewelNodesLarge2___',
    params: [2],
    values: [['2']],
    groupKey: '# added passive skills are jewel sockets',
    templatesByLocale: { en: '{0} Added Passive Skills are Jewel Sockets', 'zh-TW': '{0} 個附加的天賦為珠寶插槽' } as any,
  });
  const notable = record({
    modId: 'AfflictionNotableIronBreaker',
    id: 'explicit.stat_3258653591',
    statIds: ['explicit.stat_3258653591'],
    groupKey: '1 added passive skill is iron breaker',
  });

  it('同一市集代碼的單數句併入帶 # 的分組，數值由 params 補上', () => {
    const [merged, keptPlural, keptNotable] = mergeSingularVariants([singular, plural, notable]);
    assert.equal(merged.groupKey, plural.groupKey);
    assert.deepEqual(merged.templatesByLocale, plural.templatesByLocale);
    assert.deepEqual(merged.values, [['1']]);
    assert.equal(merged.modId, singular.modId);
    assert.equal(keptPlural, plural);
    assert.equal(keptNotable, notable);
  });

  it('不修改原本的紀錄', () => {
    mergeSingularVariants([singular, plural]);
    assert.equal(singular.groupKey, '1 added passive skill is a jewel socket');
    assert.deepEqual(singular.values, []);
  });

  it('佔位符數量與 params 對不上時不合併', () => {
    const twoParams = record({ ...singular, params: [1, 3] });
    assert.equal(mergeSingularVariants([twoParams, plural])[0], twoParams);
  });
});

describe('clusterSizeTypesFromModId', () => {
  it('沒有出現權重的星團詞以詞綴 ID 的尺寸決定類別', () => {
    assert.deepEqual(clusterSizeTypesFromModId('JewelExpansionJewelNodesLarge2___'), [
      'cluster_jewel',
      'large_cluster_jewel',
    ]);
    assert.deepEqual(clusterSizeTypesFromModId('JewelExpansionJewelNodesMedium'), [
      'cluster_jewel',
      'medium_cluster_jewel',
    ]);
    assert.equal(clusterSizeTypesFromModId('JewelExpansionPassiveNodesUnique__1'), null);
  });
});

describe('buildClusterPassiveCountRecords', () => {
  // 取自 3.29.3.6 PassiveTreeExpansionJewels
  const bases = [
    { size: 'Small', min: 2, max: 3 },
    { size: 'Medium', min: 4, max: 6 },
    { size: 'Large', min: 8, max: 12 },
  ];
  const render = (min: number, max: number) => ({
    template: 'adds # passive skills',
    templatesByLocale: { en: 'Adds {0} Passive Skills', 'zh-TW': '附加 {0} 個天賦' } as any,
    values: [min === max ? [String(min)] : [String(min), String(max)]],
    params: [min === max ? [min] : [min, max]],
  });

  it('每種尺寸一筆附魔階級，數值為底材的天賦數範圍', () => {
    const records = buildClusterPassiveCountRecords(bases, render, 'enchant.stat_3086156145');
    assert.equal(records.length, 3);
    const large = records.find((r) => r.types.includes('large_cluster_jewel'))!;
    assert.deepEqual(large.types, ['cluster_jewel', 'large_cluster_jewel']);
    assert.deepEqual(large.values, [['8', '12']]);
    assert.deepEqual(large.params, [[8, 12]]);
    assert.equal(large.id, 'enchant.stat_3086156145');
    assert.deepEqual(large.affinities, ['enchant']);
    assert.equal(large.groupKey, 'adds # passive skills');
  });
});
