import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePoE1Affinities } from '../src/mods/poe1/affinities.js';
import { getPoE1ItemClassGearTypes } from '../src/mods/poe1/gear-types.js';
import { buildVisceraModTypeIndex, VISCERA_PART_KEYS } from '../src/mods/poe1/viscera.js';

const base = (name: string, ...tags: string[]) => ({
  id: `Metadata/Items/Viscera/Viscera${name}`,
  tags,
});

describe('PoE 1 臟器詞綴類別', () => {
  const index = buildVisceraModTypeIndex([
    base('FireFury', 'viscera_arm'),
    base('Oozeback', 'viscera_head'),
    base('BroodPrincess', 'viscera_leg'),
    base('Stranglecharm', 'viscera_body'),
    base('VaalOversoul', 'viscera_arm'),
    base('VaalOversoul2', 'viscera_head'),
  ]);

  it('依怪物名稱對應到基底的部位，並一律帶上 viscera 主類別', () => {
    assert.deepEqual(index.resolve('VisceraModFireFuryLow'), ['viscera', 'viscera_arm']);
    assert.deepEqual(index.resolve('VisceraModOozebackHigh'), ['viscera', 'viscera_head']);
    assert.deepEqual(index.resolve('VisceraModBroodPrincessMed'), ['viscera', 'viscera_leg']);
    assert.deepEqual(index.resolve('VisceraModStranglecharmQueen'), ['viscera', 'viscera_body']);
  });

  it('怪物名稱互為前綴時取最長相符的基底', () => {
    assert.deepEqual(index.resolve('VisceraModVaalOversoul2High'), ['viscera', 'viscera_head']);
    assert.deepEqual(index.resolve('VisceraModVaalOversoulHigh'), ['viscera', 'viscera_arm']);
  });

  it('沒有階級字尾的詞綴也能對應', () => {
    assert.deepEqual(index.resolve('VisceraModFireFury'), ['viscera', 'viscera_arm']);
  });

  it('不是臟器詞綴或找不到基底時回傳 undefined', () => {
    assert.equal(index.resolve('Strength1'), undefined);
    assert.equal(index.resolve('VisceraModUnknownMonsterLow'), undefined);
  });

  it('忽略不在臟器路徑下的基底；沒有部位標籤的基底只帶主類別', () => {
    const other = buildVisceraModTypeIndex([
      { id: 'Metadata/Items/Rings/Ring1', tags: ['viscera_head'] },
      base('NoPart'),
    ]);
    assert.equal(other.resolve('VisceraModRing1Low'), undefined);
    assert.deepEqual(other.resolve('VisceraModNoPartLow'), ['viscera']);
  });

  it('回傳的陣列互不共用，改動不影響之後的查詢', () => {
    index.resolve('VisceraModFireFuryLow')?.push('mutated');
    assert.deepEqual(index.resolve('VisceraModFireFuryLow'), ['viscera', 'viscera_arm']);
  });

  it('怪物名稱含 shaper / elder 的臟器詞綴不會被當成勢力詞綴', () => {
    const mechanisms = { essenceModIndices: new Set<number>(), delveModIndices: new Set<number>() };
    for (const id of ['VisceraModBoneshaperHigh', 'VisceraModElderLow', 'VisceraModHunterMed']) {
      const mod = { Id: id, Domain: 1, GenerationType: 3 };
      assert.deepEqual(resolvePoE1Affinities(0, mod, mechanisms, 'implicit'), ['normal']);
    }
    // 一般裝備詞綴仍依 ID 判定勢力
    const shaperMod = { Id: 'LifeShaper1', Domain: 1, GenerationType: 1 };
    assert.deepEqual(resolvePoE1Affinities(0, shaperMod, mechanisms, 'explicit'), ['shaper']);
  });

  it('部位類別鍵與官方市集子分類對應，物品類別對應到主類別', () => {
    assert.deepEqual(
      [...VISCERA_PART_KEYS].sort(),
      ['viscera_arm', 'viscera_body', 'viscera_head', 'viscera_leg'],
    );
    assert.deepEqual(getPoE1ItemClassGearTypes('Viscera'), ['viscera']);
  });
});
