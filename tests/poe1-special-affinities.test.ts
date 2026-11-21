import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePoE1Affinities } from '../src/mods/poe1/affinities.js';
import { buildPoE1AspectCraftedRecords } from '../src/mods/poe1/bestiary-aspects.js';
import { isPoE1IncursionMod, resolvePoE1IncursionGearTypes } from '../src/mods/poe1/incursion.js';

describe('PoE 1 穿越、獸獵勢技能與糾纏詞綴', () => {
  const mechanisms = {
    essenceModIndices: new Set<number>(),
    delveModIndices: new Set<number>(),
  };

  it('穿越（神廟）詞綴正確對應裝備部位與 incursion affinity，並略過 Inverted', () => {
    const bodyMod = {
      Id: 'IncreasedLifeEnhancedBodyMod___',
      Name: "Guatelitzi's",
      Domain: 1,
      GenerationType: 1,
    };
    assert.equal(isPoE1IncursionMod(bodyMod), true);
    assert.ok(resolvePoE1IncursionGearTypes(bodyMod.Id).includes('body-armour'));
    assert.equal(resolvePoE1IncursionGearTypes(bodyMod.Id).includes('gloves'), false);
    assert.deepEqual(
      resolvePoE1Affinities(0, bodyMod, mechanisms, 'explicit', false, []),
      ['incursion']
    );

    const glovesMod = {
      Id: 'ColdResistEnhancedLevel50ModAilments',
      Name: 'of Puhuarte',
      Domain: 1,
      GenerationType: 2,
    };
    assert.equal(isPoE1IncursionMod(glovesMod), true);
    assert.ok(resolvePoE1IncursionGearTypes(glovesMod.Id).includes('gloves'));

    const inverted = {
      Id: 'LifeRegenerationEnhancedLevel50ModInverted',
      Name: 'of Guatelitzi',
      Domain: 1,
      GenerationType: 2,
    };
    assert.equal(isPoE1IncursionMod(inverted), false);
    assert.deepEqual(resolvePoE1IncursionGearTypes(inverted.Id), []);
  });

  it('死靈工藝（NecropolisCrafting*）歸類至 haunted 且不混入 normal', () => {
    const hauntedMod = {
      Id: 'NecropolisCraftingAllResistancesWithChaos',
      Name: 'of Haunting',
      Domain: 1,
      GenerationType: 2,
    };
    assert.deepEqual(
      resolvePoE1Affinities(1, hauntedMod, mechanisms, 'explicit', true, [
        { tag: 'ring', weight: 100 },
      ]),
      ['haunted']
    );
  });

  it('獸獵 / 神君勢技能工藝（AspectCrafted）可建構等級階級並對應市集代碼', () => {
    const fakeTradeStats = {
      resolveStatIds(template: string) {
        if (template === 'grants level # aspect of the cat') {
          return { singleId: 'explicit.effect_771254875', allIds: ['explicit.effect_771254875'] };
        }
        if (template === 'grants level # aspect of the brine king') {
          return { singleId: 'explicit.effect_3963374775', allIds: ['explicit.effect_3963374775'] };
        }
        return null;
      },
    } as any;

    const records = buildPoE1AspectCraftedRecords(
      [
        { Id: 'GrantsCatAspectCrafted', Domain: 1, GenerationType: 2, Level: 1 },
        { Id: 'GrantsCatAspectCrafted30', Domain: 1, GenerationType: 2, Level: 1 },
        { Id: 'GrantsBrineKingAspectCrafted', Domain: 42, GenerationType: 2, Level: 1 },
        { Id: 'Strength1', Domain: 1, GenerationType: 2, Level: 1 },
      ],
      fakeTradeStats
    );

    assert.equal(records.length, 3);
    assert.deepEqual(records[0].affinities, ['bestiary']);
    assert.deepEqual(records[0].params, [20]);
    assert.equal(records[0].id, 'explicit.effect_771254875');
    assert.equal(records[0].templatesByLocale['zh-TW'], '獲得等級 {0} 的傲貓祝福技能');

    assert.deepEqual(records[1].params, [30]);
    assert.equal(records[2].id, 'explicit.effect_3963374775');
  });
});
