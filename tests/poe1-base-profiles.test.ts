import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnWeightForTags,
  classifyPoE1Base,
  fullBaseTags,
  buildPoE1BaseProfiles,
  resolveDomainProfileKeys,
  applySpecialBaseKeys,
  SPECIAL_BASE_KEYS,
} from '../src/mods/poe1/base-profiles.js';

const sw = (pairs: Array<[string, number]>) => pairs.map(([tag, weight]) => ({ tag, weight }));

describe('PoE 1 spawn weight evaluation (first matching tag wins)', () => {
  it('uses the first spawn tag the base carries', () => {
    const weights = sw([
      ['not_int', 0],
      ['default', 500],
    ]);
    assert.equal(spawnWeightForTags(weights, new Set(['jewel', 'not_int'])), 0);
    assert.equal(spawnWeightForTags(weights, new Set(['jewel'])), 500);
  });

  it('treats default as matching every base', () => {
    assert.equal(spawnWeightForTags(sw([['default', 300]]), new Set()), 300);
  });

  it('returns 0 when no spawn tag matches', () => {
    assert.equal(spawnWeightForTags(sw([['ward_armour', 1000]]), new Set(['helmet'])), 0);
  });
});

describe('PoE 1 class-implied tags', () => {
  it('adds slot and flask-type tags inherited from the item class', () => {
    const tags = fullBaseTags('UtilityFlask', ['Expedition_Flask']);
    assert.ok(tags.has('flask'));
    assert.ok(tags.has('utility_flask'));
    assert.ok(tags.has('expedition_flask'));
    assert.ok(fullBaseTags('Helmet', ['ward_armour']).has('helmet'));
  });
});

describe('PoE 1 base classification', () => {
  it('classifies base-specific equipment into its own key', () => {
    assert.deepEqual(classifyPoE1Base('Helmet', 'Runic Helm'), { special: 'helmets_ward' });
    assert.deepEqual(classifyPoE1Base('Gloves', 'Runic Gages'), { special: 'gloves_ward' });
    assert.deepEqual(classifyPoE1Base('Boots', 'Runic Sabatons'), { special: 'boots_ward' });
    assert.deepEqual(classifyPoE1Base('Wand', 'Calling Wand'), { special: 'wands_minion' });
    assert.deepEqual(classifyPoE1Base('Ring', 'Gloam Ring'), { special: 'rings_minion' });
    assert.deepEqual(classifyPoE1Base('Ring', 'Unset Ring'), { special: 'unset_ring' });
    assert.deepEqual(classifyPoE1Base('Shield', 'Fossilised Spirit Shield'), {
      special: 'shields_minion',
    });
    assert.equal(classifyPoE1Base('Wand', 'Driftwood Wand'), null);
    assert.equal(classifyPoE1Base('Helmet', 'Iron Hat'), null);
  });

  it('classifies flask, jewel and heist bases into domain profiles', () => {
    assert.deepEqual(classifyPoE1Base('LifeFlask', 'Divine Life Flask'), {
      domain: 2,
      keys: ['flask', 'life-flask'],
    });
    assert.deepEqual(classifyPoE1Base('UtilityFlask', 'Iron Flask'), {
      domain: 2,
      keys: ['flask', 'iron-flask'],
    });
    assert.deepEqual(classifyPoE1Base('UtilityFlaskCritical', 'Diamond Flask'), {
      domain: 2,
      keys: ['flask', 'utility-flask'],
    });
    assert.deepEqual(classifyPoE1Base('Jewel', 'Prismatic Jewel'), {
      domain: 10,
      keys: ['jewel', 'prismatic_jewel'],
    });
    assert.equal(classifyPoE1Base('Jewel', 'Timeless Jewel'), null);
    assert.deepEqual(classifyPoE1Base('AbyssJewel', 'Ghastly Eye Jewel'), {
      domain: 13,
      keys: ['abyss_jewel', 'ghastly_eye_jewel'],
    });
    assert.deepEqual(classifyPoE1Base('Jewel', 'Medium Cluster Jewel'), {
      domain: 21,
      keys: ['cluster_jewel', 'medium_cluster_jewel'],
    });
    assert.deepEqual(classifyPoE1Base('HeistEquipmentUtility', 'Whisper-woven Cloak'), {
      domain: 23,
      keys: ['heist_equipment', 'heist_cloak'],
    });
  });
});

describe('PoE 1 domain profile resolution', () => {
  const profiles = buildPoE1BaseProfiles([
    { classId: 'Jewel', name: 'Crimson Jewel', tags: ['jewel', 'not_dex', 'not_int', 'strjewel'] },
    { classId: 'Jewel', name: 'Viridian Jewel', tags: ['jewel', 'not_str', 'not_int', 'dexjewel'] },
    { classId: 'Jewel', name: 'Cobalt Jewel', tags: ['jewel', 'not_dex', 'not_str', 'intjewel'] },
    { classId: 'Jewel', name: 'Prismatic Jewel', tags: ['jewel', 'strjewel', 'dexjewel', 'intjewel'] },
    // 原始標籤與 BaseItemTypes 相同：部位／藥劑類型標籤由物品種類補上
    { classId: 'LifeFlask', name: 'Divine Life Flask', tags: ['not_for_sale'] },
    { classId: 'UtilityFlask', name: 'Granite Flask', tags: [] },
    {
      classId: 'UtilityFlask',
      name: 'Iron Flask',
      tags: ['not_for_sale', 'expedition_flask'],
    },
    { classId: 'Helmet', name: 'Runic Helm', tags: ['not_for_sale', 'ward_armour'] },
    { classId: 'Wand', name: 'Calling Wand', tags: ['weapon_can_roll_minion_modifiers'] },
  ]);

  it('lets prismatic jewels roll what every single-colour jewel can roll', () => {
    const cobaltOnly = resolveDomainProfileKeys(
      sw([
        ['not_int', 0],
        ['default', 500],
      ]),
      10,
      profiles,
    );
    assert.deepEqual(cobaltOnly?.sort(), ['cobalt_jewel', 'jewel', 'prismatic_jewel']);
  });

  it('keeps generic flask mods on life flasks and utility-only mods off them', () => {
    const generic = resolveDomainProfileKeys(sw([['default', 600]]), 2, profiles);
    assert.deepEqual(generic?.sort(), ['flask', 'iron-flask', 'life-flask', 'utility-flask']);

    const utilityOnly = resolveDomainProfileKeys(
      sw([
        ['expedition_flask', 0],
        ['utility_flask', 750],
        ['default', 0],
      ]),
      2,
      profiles,
    );
    assert.deepEqual(utilityOnly?.sort(), ['flask', 'utility-flask']);

    const ironOnly = resolveDomainProfileKeys(
      sw([
        ['expedition_flask', 750],
        ['default', 0],
      ]),
      2,
      profiles,
    );
    assert.deepEqual(ironOnly?.sort(), ['flask', 'iron-flask']);
  });

  it('excludes helmet-incompatible weapon mods from runic helmets', () => {
    const weaponOnly = applySpecialBaseKeys(
      ['wand'],
      sw([
        ['weapon', 1000],
        ['default', 0],
      ]),
      profiles,
    );
    assert.ok(!weaponOnly.includes('helmets_ward'));
    assert.ok(weaponOnly.includes('wands_minion'));
  });

  it('returns undefined for domains without base profiles', () => {
    assert.equal(resolveDomainProfileKeys(sw([['default', 1]]), 1, profiles), undefined);
  });

  it('adds ward keys only for mods a runic base can roll, including influence mods', () => {
    const generic = applySpecialBaseKeys(['helmet', 'helmets_str'], sw([['default', 1000]]), profiles);
    assert.ok(generic.includes('helmets_ward'));

    const wardOnly = applySpecialBaseKeys(
      [],
      sw([
        ['ward_armour', 1000],
        ['default', 0],
      ]),
      profiles,
    );
    assert.deepEqual(wardOnly, ['helmets_ward']);

    const strOnly = applySpecialBaseKeys(
      ['helmet', 'helmets_str', 'helmets_ward'],
      sw([
        ['str_armour', 1000],
        ['default', 0],
      ]),
      profiles,
    );
    assert.ok(!strOnly.includes('helmets_ward'));

    const shaper = applySpecialBaseKeys(
      ['helmet'],
      sw([
        ['helmet_shaper', 500],
        ['default', 0],
      ]),
      profiles,
    );
    assert.ok(shaper.includes('helmets_ward'));
  });

  it('adds minion wand key only for minion-capable wands', () => {
    const minion = applySpecialBaseKeys(
      ['wand'],
      sw([
        ['weapon_can_roll_minion_modifiers', 1000],
        ['default', 0],
      ]),
      profiles,
    );
    assert.ok(minion.includes('wands_minion'));
  });

  it('exposes the special base keys', () => {
    assert.ok(SPECIAL_BASE_KEYS.includes('helmets_ward'));
    assert.ok(!SPECIAL_BASE_KEYS.includes('body_armours_ward' as never));
  });
});
