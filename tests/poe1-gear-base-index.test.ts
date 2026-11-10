import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseItFile, resolveInheritedTags } from '../src/mods/poe1/item-inheritance.js';
import {
  buildGearBaseIndex,
  gearKeysForBase,
  resolveGearKeysByBases,
} from '../src/mods/poe1/gear-base-index.js';

const sw = (pairs: Array<[string, number]>) => pairs.map(([tag, weight]) => ({ tag, weight }));

describe('PoE 1 .it inheritance', () => {
  it('parses extends, tags and removed tags', () => {
    const parsed = parseItFile(
      '﻿version 3\nabstract\nextends "Metadata/Items/Armours/AbstractArmour"\n\nBase\n{\n\ttag = "helmet"\n\tremove_tag = "old"\n}\n',
    );
    assert.deepEqual(parsed, {
      parent: 'Metadata/Items/Armours/AbstractArmour',
      tags: ['helmet'],
      removedTags: ['old'],
    });
  });

  it('collects tags through the inheritance chain with caching', async () => {
    const files: Record<string, string> = {
      'metadata/items/armours/helmets/abstracthelmet.it':
        'extends "Metadata/Items/Armours/AbstractArmour"\nBase\n{\n\ttag = "helmet"\n}',
      'metadata/items/armours/abstractarmour.it':
        'extends "nothing"\nBase\n{\n\ttag = "armour"\n\ttag = "old"\n}',
    };
    let reads = 0;
    const read = async (path: string) => {
      reads++;
      return files[path] ?? null;
    };
    const cache = new Map<string, Promise<readonly string[]>>();
    const tags = await resolveInheritedTags('Metadata/Items/Armours/Helmets/AbstractHelmet', read, cache);
    assert.deepEqual([...tags].sort(), ['armour', 'helmet', 'old']);
    await resolveInheritedTags('Metadata/Items/Armours/Helmets/AbstractHelmet', read, cache);
    // 兩個檔案各讀一次；extends "nothing" 是繼承鏈終點，不會再讀檔
    assert.equal(reads, 2);
  });
});

describe('PoE 1 gear base keys', () => {
  it('maps armour bases to slot and attribute keys', () => {
    assert.deepEqual(gearKeysForBase('Helmet', 'Iron Hat', ['str_armour']), ['helmet', 'helmets_str']);
    assert.deepEqual(gearKeysForBase('Shield', 'Twig Spirit Shield', ['int_armour', 'focus']), [
      'shield',
      'shields_int',
    ]);
    // 三屬性基底自成類別，不混入雙屬性子類別
    assert.deepEqual(gearKeysForBase('Body Armour', 'Sacrificial Garb', ['str_dex_int_armour']), [
      'body-armour',
      'body_armours_str_dex_int',
    ]);
  });

  it('keeps runic bases out of the slot categories', () => {
    assert.deepEqual(gearKeysForBase('Helmet', 'Runic Helm', ['ward_armour']), ['helmets_ward']);
  });

  it('adds base-specific keys next to their parent keys', () => {
    assert.deepEqual(gearKeysForBase('Wand', 'Calling Wand', ['weapon_can_roll_minion_modifiers']), [
      'wand',
      'wands_minion',
    ]);
    assert.deepEqual(gearKeysForBase('Ring', 'Unset Ring', ['unset_ring']), ['ring', 'unset_ring']);
    assert.deepEqual(
      gearKeysForBase('Shield', 'Bone Spirit Shield', ['int_armour', 'focus_can_roll_minion_modifiers']),
      ['shield', 'shields_int', 'shields_minion'],
    );
  });

  it('maps weapon classes, including parent keys for sub-types', () => {
    assert.deepEqual(gearKeysForBase('Rune Dagger', 'Skinning Knife', []), ['dagger', 'rune-dagger']);
    assert.deepEqual(gearKeysForBase('Warstaff', 'Iron Staff', []), ['staff', 'warstaff']);
    assert.deepEqual(gearKeysForBase('Thrusting One Hand Sword', 'Rusted Spike', []), [
      'one-hand-sword',
      'thrusting-one-hand-sword',
    ]);
    assert.equal(gearKeysForBase('HiddenItem', 'Random Armour Body', []), null);
  });
});

describe('PoE 1 gear resolution by bases', () => {
  const index = buildGearBaseIndex([
    { classId: 'Wand', name: 'Driftwood Wand', tags: ['weapon', 'onehand', 'one_hand_weapon', 'wand'] },
    { classId: 'Bow', name: 'Crude Bow', tags: ['weapon', 'twohand', 'two_hand_weapon', 'ranged', 'bow'] },
    {
      classId: 'Wand',
      name: 'Calling Wand',
      tags: ['weapon', 'onehand', 'one_hand_weapon', 'wand', 'weapon_can_roll_minion_modifiers'],
    },
    { classId: 'Helmet', name: 'Iron Hat', tags: ['armour', 'helmet', 'str_armour'] },
    { classId: 'Helmet', name: 'Runic Helm', tags: ['armour', 'helmet', 'ward_armour'] },
    {
      classId: 'Two Hand Mace',
      name: 'Driftwood Maul',
      tags: ['weapon', 'twohand', 'mace', 'two_hand_weapon'],
      influenceTags: ['2h_mace_shaper', '2h_mace_elder'],
    },
  ]);

  it('uses the item class influence tags from InfluenceTags', () => {
    const keys = resolveGearKeysByBases(
      sw([
        ['2h_mace_shaper', 0],
        ['mace_shaper', 1000],
        ['default', 0],
      ]),
      index,
    );
    assert.ok(!keys.includes('two-hand-mace'));
    const twoHand = resolveGearKeysByBases(
      sw([
        ['2h_mace_elder', 1000],
        ['default', 0],
      ]),
      index,
    );
    assert.deepEqual(twoHand, ['two-hand-mace']);
  });

  it('respects spawn weight order (first matching tag wins)', () => {
    const keys = resolveGearKeysByBases(
      sw([
        ['bow', 1000],
        ['wand', 1000],
        ['weapon', 0],
        ['default', 0],
      ]),
      index,
    );
    assert.deepEqual(keys.sort(), ['bow', 'wand', 'wands_minion']);
  });

  it('includes influence mods for every base of the slot', () => {
    const keys = resolveGearKeysByBases(
      sw([
        ['helmet_shaper', 500],
        ['default', 0],
      ]),
      index,
    );
    assert.deepEqual(keys.sort(), ['helmet', 'helmets_str', 'helmets_ward']);
  });

  it('limits minion mods to minion-capable bases while keeping the parent key', () => {
    const keys = resolveGearKeysByBases(
      sw([
        ['weapon_can_roll_minion_modifiers', 1000],
        ['default', 0],
      ]),
      index,
    );
    assert.deepEqual(keys.sort(), ['wand', 'wands_minion']);
  });

  it('keeps ward-only mods out of the helmet category', () => {
    const keys = resolveGearKeysByBases(
      sw([
        ['ward_armour', 1000],
        ['default', 0],
      ]),
      index,
    );
    assert.deepEqual(keys, ['helmets_ward']);
  });
});
