import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { resolvePoE1Affinities } from '../src/mods/poe1/affinities.js';
import {
  buildSynthesisModTypesMap,
  isPoE1SynthesisImplicitMod,
  loadPoE1SynthesisImplicitTypes,
  resolveSynthesisItemClassesToGearTypes,
} from '../src/mods/poe1/synthesis.js';

describe('PoE 1 追憶固定詞綴 (Synthesis Implicits)', () => {
  it('將 Dagger / Staff / Jewel / AbyssJewel / Body Armour 對應到完整裝備子類別', () => {
    assert.deepEqual(resolveSynthesisItemClassesToGearTypes(['Dagger']), ['dagger', 'rune-dagger']);
    assert.deepEqual(resolveSynthesisItemClassesToGearTypes(['Staff']), ['staff', 'warstaff']);
    assert.deepEqual(resolveSynthesisItemClassesToGearTypes(['Jewel']), [
      'jewel',
      'crimson_jewel',
      'viridian_jewel',
      'cobalt_jewel',
      'prismatic_jewel',
    ]);
    assert.deepEqual(resolveSynthesisItemClassesToGearTypes(['AbyssJewel']), [
      'abyss_jewel',
      'searching_eye_jewel',
      'hypnotic_eye_jewel',
      'murderous_eye_jewel',
      'ghastly_eye_jewel',
    ]);
    assert.ok(
      resolveSynthesisItemClassesToGearTypes(['Body Armour']).includes('body_armours_str_dex_int')
    );
  });

  it('套用舊 Mod ID 別名並去重裝備類別', () => {
    const map = buildSynthesisModTypesMap({
      SynthesisImplicitMaximumAttackDodge1: ['Boots', 'Shield'],
    });
    const types = map.get('SynthesisImplicitSpellDamageSuppressed1_');
    assert.ok(types);
    assert.ok(types.includes('boots'));
    assert.ok(types.includes('shield'));
  });

  it('正確判定追憶固定詞綴的 affinity 為 synthesis 且不含 normal', () => {
    const mechanisms = {
      essenceModIndices: new Set<number>(),
      delveModIndices: new Set<number>(),
    };
    const synthMod = { Id: 'SynthesisImplicitLife1', Domain: 1, GenerationType: 3 };
    assert.equal(isPoE1SynthesisImplicitMod(synthMod), true);
    assert.deepEqual(
      resolvePoE1Affinities(0, synthMod, mechanisms, 'implicit', false, []),
      ['synthesis']
    );

    const mapSynthMod = { Id: 'SynthesisUniqueMapsMod_', Domain: 5, GenerationType: 3 };
    assert.equal(isPoE1SynthesisImplicitMod(mapSynthMod), false);
    assert.deepEqual(
      resolvePoE1Affinities(1, mapSynthMod, mechanisms, 'explicit', false, []),
      ['normal']
    );
  });

  it('靜態資料檔 data/synthesis-implicits/poe1.json 可正常載入且覆蓋主要裝備類別', async () => {
    const filePath = path.join(process.cwd(), 'data', 'synthesis-implicits', 'poe1.json');
    const map = await loadPoE1SynthesisImplicitTypes(filePath);
    assert.ok(map.size > 1000, `預期至少 1000 筆追憶詞綴，實際 ${map.size}`);

    const lifeTypes = map.get('SynthesisImplicitLife1');
    assert.ok(lifeTypes && lifeTypes.includes('body-armour') && lifeTypes.includes('helmet'));

    const trinketLifeTypes = map.get('SynthesisImplicitPercentLifeTrinket1__');
    assert.ok(
      trinketLifeTypes &&
        trinketLifeTypes.includes('ring') &&
        trinketLifeTypes.includes('amulet') &&
        trinketLifeTypes.includes('belt')
    );

    const jewelTypes = map.get('SynthesisImplicitLifeJewel1');
    assert.ok(jewelTypes && jewelTypes.includes('jewel') && jewelTypes.includes('abyss_jewel'));
  });
});
