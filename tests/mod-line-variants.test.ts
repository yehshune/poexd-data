import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatDescriptionIndex } from '../src/mods/common/stat-descriptions.js';
import { computeGggStatHash } from '../src/mods/common/murmurhash2.js';
import { buildModLineVariants } from '../src/mods/common/mod-line-variants.js';

const MAIN = `
description
\t1 local_attribute_requirements_+%
\t2
\t\t1|# "{0}% increased Attribute Requirements"
\t\t#|-1 "{0}% reduced Attribute Requirements" negate 1
\tlang "Traditional Chinese"
\t2
\t\t1|# "增加 {0}% 能力值需求"
\t\t#|-1 "減少 {0}% 能力值需求" negate 1
\tlang "Simplified Chinese"
\t1
\t\t# "属性需求提高 {0}%"

description
\t2 local_minimum_added_physical_damage local_maximum_added_physical_damage
\t1
\t\t# # "Adds {0} to {1} [Physical|Physical] Damage"
\tlang "Traditional Chinese"
\t1
\t\t# # "附加 {0} - {1} 物理傷害"

description
\t1 not_on_trade
\t1
\t\t# "Hidden {0}"
\tlang "Traditional Chinese"
\t1
\t\t# "隱藏 {0}"
`;

const MAP = `
description
\t1 map_monster_rarity_+%
\t1
\t\t# "Map has {0}% increased Monster Rarity"
\tlang "Traditional Chinese"
\t1
\t\t# "地圖增加 {0}% 怪物稀有度"

description
\t1 local_attribute_requirements_+%
\t1
\t\t# "Shadowed {0}"
\tlang "Traditional Chinese"
\t1
\t\t# "被覆蓋 {0}"
`;

const hashOf = (...ids: string[]) => String(computeGggStatHash(ids));
const ATTR = hashOf('local_attribute_requirements_+%');
const ADDS = hashOf('local_minimum_added_physical_damage', 'local_maximum_added_physical_damage');
const RARITY = hashOf('map_monster_rarity_+%');
const HIDDEN = hashOf('not_on_trade');

const indexes = [StatDescriptionIndex.parse(MAIN), StatDescriptionIndex.parse(MAP)];
const tradeHashes = [ATTR, ADDS, RARITY, '999'];

describe('buildModLineVariants', () => {
  it('每個市集代碼輸出全部變體的英文／譯文模板對（含負向）', () => {
    const lines = buildModLineVariants(indexes, tradeHashes, 'zh-TW');
    assert.deepEqual(lines[ATTR], [
      ['{0:d}% increased Attribute Requirements', '增加 {0:d}% 能力值需求'],
      ['{0:n}% reduced Attribute Requirements', '減少 {0:n}% 能力值需求'],
    ]);
    assert.deepEqual(lines[ADDS], [['Adds {0:d} to {1:d} Physical Damage', '附加 {0:d} - {1:d} 物理傷害']]);
  });

  it('依序查找多份描述檔，先出現的規則優先', () => {
    const lines = buildModLineVariants(indexes, tradeHashes, 'zh-TW');
    assert.deepEqual(lines[RARITY], [['Map has {0:d}% increased Monster Rarity', '地圖增加 {0:d}% 怪物稀有度']]);
    assert.equal(lines[ATTR].length, 2);
  });

  it('不在市集清單、找不到規則或變體數量不同時略過', () => {
    const zhTw = buildModLineVariants(indexes, tradeHashes, 'zh-TW');
    assert.equal(zhTw[HIDDEN], undefined);
    assert.equal(zhTw['999'], undefined);
    const zhCn = buildModLineVariants(indexes, tradeHashes, 'zh-CN');
    assert.equal(zhCn[ATTR], undefined);
  });
});
