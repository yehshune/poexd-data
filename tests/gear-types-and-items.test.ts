import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePoE1GearTypes,
  getPoE1ItemClassGearTypes,
} from '../src/mods/poe1/gear-types.js';
import {
  resolvePoE2GearTypes,
  getPoE2ItemClassGearTypes,
} from '../src/mods/poe2/gear-types.js';
import { SUPPORTED_AFFIX_LOCALES } from '../src/mods/common/stat-descriptions.js';
import { buildItemLexiconShards } from '../src/mods/common/item-lexicon.js';

const FORBIDDEN_ALIAS_KEYS = new Set([
  'claws',
  'daggers',
  'rune_daggers',
  'rune_dagger',
  'wands',
  'sceptres',
  'staves',
  'warstaves',
  'quarterstaves',
  'one_hand_swords',
  'thrusting_one_hand_swords',
  'two_hand_swords',
  'one_hand_axes',
  'two_hand_axes',
  'one_hand_maces',
  'two_hand_maces',
  'bows',
  'crossbows',
  'spears',
  'flails',
  'talismans',
  'fishing_rods',
  'bucklers',
  'focusses',
  'foci',
  'amulets',
  'rings',
  'belts',
  'quivers',
  'life_flasks',
  'mana_flasks',
  'hybrid_flask',
  'utility_flasks',
  'charms',
  'tinctures',
  'crimson-jewel',
  'viridian-jewel',
  'cobalt-jewel',
  'prismatic-jewel',
  'cluster-jewel',
  'large-cluster-jewel',
  'medium-cluster-jewel',
  'small-cluster-jewel',
  'abyss-jewel',
  'murderous-eye-jewel',
  'searching-eye-jewel',
  'hypnotic-eye-jewel',
  'ghastly-eye-jewel',
  'time-lost-ruby',
  'time-lost-emerald',
  'time-lost-sapphire',
  'time-lost-diamond',
  'relics',
  'urn_relic',
  'amphora_relic',
  'vase_relic',
  'seal_relic',
  'coffer_relic',
  'tapestry_relic',
  'incense_relic',
  'breach_tablet',
  'expedition_tablet',
  'delirium_tablet',
  'ritual_tablet',
  'irradiated_tablet',
  'overseer_tablet',
  'abyss_tablet',
  'temple_tablet',
  'waystones_low_tier',
  'waystones_mid_tier',
  'waystones_top_tier',
]);

describe('Seam 4: Canonical gear-type keys in poexd-data', () => {
  it('resolves PoE 1 tags and item classes exclusively to canonical gear-type keys', () => {
    const sampleTags = [
      'claw',
      'dagger',
      'rune_dagger',
      'wand',
      'sceptre',
      'staff',
      'warstaff',
      'sword',
      'one_hand_sword',
      'rapier',
      'two_hand_sword',
      'axe',
      'mace',
      'bow',
      'fishing_rod',
      'shield',
      'dex_shield',
      'amulet',
      'ring',
      'belt',
      'quiver',
      'life_flask',
      'mana_flask',
      'hybrid_flask',
      'utility_flask',
      'tincture',
      'str_jewel',
      'dex_jewel',
      'int_jewel',
      'prismatic_jewel',
      'expansion_jewel_large',
      'abyss_jewel',
      'abyss_jewel_melee',
    ];

    const resolved = resolvePoE1GearTypes(
      sampleTags.map((tag) => ({ tag, weight: 1000 })),
    );

    for (const key of resolved) {
      assert.equal(
        FORBIDDEN_ALIAS_KEYS.has(key),
        false,
        `PoE 1 resolved forbidden alias key: ${key}`,
      );
    }

    assert.ok(resolved.includes('claw'));
    assert.ok(resolved.includes('rune-dagger'));
    assert.ok(resolved.includes('warstaff'));
    assert.ok(resolved.includes('one-hand-sword'));
    assert.ok(resolved.includes('thrusting-one-hand-sword'));
    assert.ok(resolved.includes('shields_dex'));
    assert.ok(resolved.includes('life-flask'));
    assert.ok(resolved.includes('hybrid-flask'));
    assert.ok(resolved.includes('utility-flask'));
    assert.ok(resolved.includes('crimson_jewel'));
    assert.ok(resolved.includes('large_cluster_jewel'));
    assert.ok(resolved.includes('murderous_eye_jewel'));
    // Ward (保護) 途徑一：獨立子屬性部位隔離驗證
    const wardResolved = resolvePoE1GearTypes([{ tag: 'ward_armour', weight: 1000 }]);
    // 魔符基底只有頭部、手套、鞋子，沒有保護胸甲
    assert.deepEqual(wardResolved.sort(), ['boots_ward', 'gloves_ward', 'helmets_ward']);
    assert.ok(!wardResolved.includes('helmet'));
    assert.ok(!wardResolved.includes('body-armour'));

    // 負權重扣除部位驗證
    const helmetWardOnly = resolvePoE1GearTypes([
      { tag: 'ward_armour', weight: 1000 },
      { tag: 'gloves', weight: 0 },
      { tag: 'boots', weight: 0 },
    ]);
    assert.deepEqual(helmetWardOnly, ['helmets_ward']);

    // 召喚物詞綴只屬於法杖（召喚法杖子類別由基底輪廓補上），不含權杖
    const minionWeapon = resolvePoE1GearTypes([
      { tag: 'weapon_can_roll_minion_modifiers', weight: 1000 },
      { tag: 'default', weight: 0 },
    ]);
    assert.deepEqual(minionWeapon, ['wand']);

    // 擴充 Domain 映射驗證 (地圖、聖物、契約、盜賊裝備、飾品、塗劑)
    assert.deepEqual(resolvePoE1GearTypes([], 5), ['map']);
    assert.deepEqual(resolvePoE1GearTypes([], 7), ['relic']);
    assert.deepEqual(resolvePoE1GearTypes([], 32), ['relic']);
    assert.deepEqual(resolvePoE1GearTypes([], 22), ['contract']);
    assert.deepEqual(resolvePoE1GearTypes([], 23), ['heist_equipment']);
    assert.deepEqual(resolvePoE1GearTypes([], 24), ['trinket']);
    
    assert.deepEqual(resolvePoE1GearTypes([], 34), ['tincture']);

    // 古靈勢力與勢力詞綴 (帶有 default: 0 負權重標籤) 不應被誤刪部位
    const eldritchGloves = resolvePoE1GearTypes([
      { tag: 'gloves', weight: 1000 },
      { tag: 'default', weight: 0 },
    ]);
    assert.ok(eldritchGloves.includes('gloves'));

    const sampleClasses = [
      'Claw',
      'Dagger',
      'Rune Dagger',
      'Wand',
      'Sceptre',
      'Staff',
      'Warstaff',
      'One Hand Sword',
      'Thrusting One Hand Sword',
      'Two Hand Sword',
      'Bow',
      'Amulet',
      'Ring',
      'Belt',
      'Quiver',
      'LifeFlask',
      'HybridFlask',
      'UtilityFlask',
      'Jewel',
      'AbyssJewel',
      'Tincture',
      'Map',
      'Contract',
      'HeistEquipment',
      'Trinket',
      'SanctumRelic',
    ];
    for (const cls of sampleClasses) {
      for (const key of getPoE1ItemClassGearTypes(cls)) {
        assert.equal(
          FORBIDDEN_ALIAS_KEYS.has(key),
          false,
          `PoE 1 item class ${cls} emitted forbidden alias key: ${key}`,
        );
      }
    }
  });

  it('resolves PoE 2 tags and item classes exclusively to canonical gear-type keys', () => {
    const sampleTags = [
      'claw',
      'dagger',
      'wand',
      'sceptre',
      'staff',
      'quarterstaff',
      'one_hand_sword',
      'two_hand_sword',
      'one_hand_axe',
      'two_hand_axe',
      'one_hand_mace',
      'two_hand_mace',
      'bow',
      'crossbow',
      'spear',
      'flail',
      'talisman',
      'fishing_rod',
      'shield',
      'buckler',
      'focus',
      'amulet',
      'ring',
      'belt',
      'quiver',
      'life_flask',
      'mana_flask',
      'charm',
      'radius_jewel',
      'historic_abyss_jewel_1',
      'relic',
      'urn_relic',
      'amphora_relic',
      'vase_relic',
      'seal_relic',
      'coffer_relic',
      'tapestry_relic',
      'incense_relic',
      'breach_tablet',
      'expedition_tablet',
      'delirium_tablet',
      'ritual_tablet',
      'precursor_tablet',
      'overseer_tablet',
      'abyss_tablet',
      'incursion_tablet',
      'waystone',
      'low_tier_map',
      'mid_tier_map',
      'top_tier_map',
    ];

    const resolved = resolvePoE2GearTypes(
      sampleTags.map((tag) => ({ tag, weight: 1000 })),
    );

    for (const key of resolved) {
      assert.equal(
        FORBIDDEN_ALIAS_KEYS.has(key),
        false,
        `PoE 2 resolved forbidden alias key: ${key}`,
      );
    }

    assert.ok(resolved.includes('claw'));
    assert.ok(resolved.includes('quarterstaff'));
    assert.ok(resolved.includes('talisman'));
    assert.ok(resolved.includes('buckler'));
    assert.ok(resolved.includes('focus'));
    assert.ok(resolved.includes('life-flask'));
    assert.ok(resolved.includes('charm'));
    assert.ok(resolved.includes('time_lost_ruby'));
    assert.ok(resolved.includes('urn-relic'));
    assert.ok(resolved.includes('amphora-relic'));
    assert.ok(resolved.includes('incense-relic'));
    assert.ok(resolved.includes('breach-tablet'));
    assert.ok(resolved.includes('irradiated-tablet'));
    assert.ok(resolved.includes('waystone-t1'));
    assert.ok(resolved.includes('waystone-t2'));
    assert.ok(resolved.includes('waystone-t3'));

    const sampleClasses = [
      'Claw',
      'Dagger',
      'Wand',
      'Sceptre',
      'Staff',
      'Quarterstaff',
      'One Hand Sword',
      'Two Hand Sword',
      'Bow',
      'Crossbow',
      'Spear',
      'Flail',
      'Talisman',
      'Buckler',
      'Focus',
      'Amulet',
      'Ring',
      'Belt',
      'Quiver',
      'LifeFlask',
      'ManaFlask',
      'Charm',
      'Relic',
      'UrnRelic',
      'AmphoraRelic',
      'IncenseRelic',
      'TowerAugmentation',
      'Map',
      'Waystone',
    ];
    for (const cls of sampleClasses) {
      for (const key of getPoE2ItemClassGearTypes(cls)) {
        assert.equal(
          FORBIDDEN_ALIAS_KEYS.has(key),
          false,
          `PoE 2 item class ${cls} emitted forbidden alias key: ${key}`,
        );
      }
    }
  });
});

describe('Seam 4: Compact icon-free multi-locale item shards in poexd-data', () => {
  it('builds aligned icon-free per-locale item shards across all 11 locales with zh-CN defaulting to English', () => {
    const itemClasses = [
      { _index: 0, Id: 'Belts' },
      { _index: 1, Id: 'Body Armours' },
      { _index: 2, Id: 'Microtransaction' },
    ];
    const baseItemTypesByLocale = {
      en: [
        { _index: 0, Id: 'Metadata/Items/Belts/Belt1', ItemClassesKey: 0, Name: 'Leather Belt' },
        { _index: 1, Id: 'Metadata/Items/Armours/Body1', ItemClassesKey: 1, Name: 'Vaal Regalia' },
        { _index: 2, Id: 'Metadata/Items/Microtransaction/Mtx1', ItemClassesKey: 2, Name: 'Bat Pet' },
        { _index: 3, Id: 'Metadata/Items/Belts/DntBelt', ItemClassesKey: 0, Name: '[DNT] Unused Belt' },
      ],
      'zh-TW': [
        { _index: 0, Id: 'Metadata/Items/Belts/Belt1', ItemClassesKey: 0, Name: '皮革腰帶' },
        { _index: 1, Id: 'Metadata/Items/Armours/Body1', ItemClassesKey: 1, Name: '瓦爾法衣' },
        { _index: 2, Id: 'Metadata/Items/Microtransaction/Mtx1', ItemClassesKey: 2, Name: '蝙蝠寵物' },
        { _index: 3, Id: 'Metadata/Items/Belts/DntBelt', ItemClassesKey: 0, Name: '[DNT] Unused Belt' },
      ],
    };
    const wordsByLocale = {
      en: [
        { _index: 0, Wordlist: 6, Text: 'Headhunter', Text2: 'Headhunter' },
        { _index: 1, Wordlist: 1, Text: 'IgnoredWord', Text2: 'IgnoredWord' },
      ],
      'zh-TW': [
        { _index: 0, Wordlist: 6, Text: '獵首', Text2: '獵首' },
        { _index: 1, Wordlist: 1, Text: '忽略詞', Text2: '忽略詞' },
      ],
    };

    const shards = buildItemLexiconShards({
      version: 'poe1',
      itemClasses,
      baseItemTypesByLocale,
      wordsByLocale,
    });

    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      assert.ok(shards[locale], `missing item shard for ${locale}`);
      assert.ok(Array.isArray(shards[locale].items));
      assert.equal(shards[locale].items.length, 3);
      assert.equal(JSON.stringify(shards[locale]).includes('icon'), false);
    }

    assert.deepEqual(shards.en.items, ['Leather Belt', 'Vaal Regalia', 'Headhunter']);
    assert.deepEqual(shards['zh-TW'].items, ['皮革腰帶', '瓦爾法衣', '獵首']);
    // 官方 dat 無簡中；不可把繁中逐字轉簡體，先以英文佔位，等國服交易資料覆寫
    assert.deepEqual(shards['zh-CN'].items, ['Leather Belt', 'Vaal Regalia', 'Headhunter']);
  });
});

describe('PoE 2 waystone and tablet mod domains', () => {
  it('maps waystone tier tags to the matching waystone tier', () => {
    assert.deepEqual(
      resolvePoE2GearTypes([{ tag: 'map_key_low', weight: 1 }], 6).sort(),
      ['waystone', 'waystone-t1'],
    );
    assert.deepEqual(
      resolvePoE2GearTypes([{ tag: 'map_key_highest', weight: 1 }], 6).sort(),
      ['waystone', 'waystone-t3'],
    );
  });

  it('treats generic waystone tags as every waystone tier', () => {
    const all = ['waystone', 'waystone-t1', 'waystone-t2', 'waystone-t3'];
    assert.deepEqual(resolvePoE2GearTypes([{ tag: 'default', weight: 1 }], 6).sort(), all);
    assert.deepEqual(
      resolvePoE2GearTypes(
        [
          { tag: 'map', weight: 1 },
          { tag: 'default', weight: 0 },
        ],
        28,
      ).sort(),
      all,
    );
  });

  it('keeps resolving abyss jewel and gear mods as before', () => {
    const resolved = resolvePoE2GearTypes([{ tag: 'jewel', weight: 1 }], 28);
    assert.ok(resolved.includes('jewel'));
    assert.ok(!resolved.some((t) => t.startsWith('waystone')));
  });

  it('maps tower augment tags to the matching tablet type', () => {
    assert.deepEqual(
      resolvePoE2GearTypes([{ tag: 'tower_augment_breach', weight: 1 }], 34).sort(),
      ['breach-tablet', 'tablet'],
    );
    assert.deepEqual(
      resolvePoE2GearTypes([{ tag: 'tower_augment_map_boss', weight: 1 }], 34).sort(),
      ['overseer-tablet', 'tablet'],
    );
    assert.deepEqual(
      resolvePoE2GearTypes([{ tag: 'tower_augment_incursion', weight: 1 }], 34).sort(),
      ['tablet', 'temple-tablet'],
    );
  });

  it('treats the default tag on tablet mods as every tablet type', () => {
    const resolved = resolvePoE2GearTypes([{ tag: 'default', weight: 1 }], 34);
    assert.ok(resolved.includes('tablet'));
    assert.ok(resolved.includes('ritual-tablet'));
    assert.ok(!resolved.some((t) => t.startsWith('waystone')));
  });

  it('does not leak waystone or tablet types into gear domains', () => {
    const resolved = resolvePoE2GearTypes([{ tag: 'map_key_low', weight: 1 }], 1);
    assert.ok(!resolved.some((t) => t.startsWith('waystone') || t.endsWith('tablet')));
  });
});
