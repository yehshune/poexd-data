import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_AFFIX_LOCALES,
  StatDescriptionIndex,
  renderGenericTemplate,
  renderTierKey,
} from '../src/mods/common/stat-descriptions.js';
import {
  buildModsLexiconArtifacts,
  reconstructLegacyModsArtifacts,
} from '../src/mods/common/lexicon-builder.js';

const SAMPLE_MULTILANG_CSD = `
description
\t1 additional_strength
\t1
\t\t# "{0:+d} to [Strength|Strength]"
\tlang "Traditional Chinese"
\t1
\t\t# "{0:+d} [Strength|力量]"
\tlang "Simplified Chinese"
\t1
\t\t# "{0:+d} [Strength|力量(簡)]"
\tlang "Russian"
\t1
\t\t# "{0:+d} к силе"
\tlang "Japanese"
\t1
\t\t# "筋力 {0:+d}"
\tlang "Korean"
\t1
\t\t# "힘 {0:+d}"

description
\t2 local_minimum_added_fire_damage local_maximum_added_fire_damage
\t1
\t\t# # "Adds {0} to {1} Fire Damage"
\tlang "Traditional Chinese"
\t1
\t\t# # "附加 {0} 至 {1} 火焰傷害"
\tlang "Russian"
\t1
\t\t# # "Добавляет от {0} до {1} урона от огня"

description
\t1 base_stun_Threshold_reduction_+%
\t2
\t\t1|# "{0}% reduced Enemy Stun Threshold"
\t\t#|-1 "{0}% increased Enemy Stun Threshold" negate 1
\tlang "Traditional Chinese"
\t2
\t\t1|# "降低 {0}% 敵人暈眩門檻"
\t\t#|-1 "提高 {0}% 敵人暈眩門檻" negate 1
\tlang "Russian"
\t2
\t\t1|# "{0}% снижение порога оглушения врагов"
\t\t#|-1 "{0}% повышение порога оглушения врагов" negate 1

description
\t1 local_physical_damage_+%
\t1
\t\t1|# "{0}% increased Physical Damage"
\tlang "Traditional Chinese"
\t1
\t\t1|# "增加 {0}% 物理傷害"

description
\t1 local_attack_rating
\t1
\t\t1|# "{0:+d} to Accuracy Rating"
\tlang "Traditional Chinese"
\t1
\t\t1|# "{0:+d} 命中值"
`;

describe('Seam 1: StatDescriptionIndex multilingual parsing & template rendering', () => {
  it('extracts all language blocks and maps GGG language names to canonical locale codes with English fallback', () => {
    const index = StatDescriptionIndex.parse(SAMPLE_MULTILANG_CSD);
    const rendered = index.renderMod([{ id: 'additional_strength', min: 8, max: 12 }]);
    assert.ok(rendered);

    // Every supported locale has a template
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      assert.ok(rendered.templatesByLocale[locale], `missing template for ${locale}`);
    }

    assert.equal(renderGenericTemplate(rendered.templatesByLocale['en'], 'en'), '# to strength');
    assert.equal(renderTierKey(rendered.templatesByLocale['en'], rendered.params, 'en'), '+(8-12) to strength');

    assert.equal(renderGenericTemplate(rendered.templatesByLocale['zh-TW'], 'zh-TW'), '# 力量');
    assert.equal(renderTierKey(rendered.templatesByLocale['zh-TW'], rendered.params, 'zh-TW'), '+(8-12) 力量');

    assert.equal(renderGenericTemplate(rendered.templatesByLocale['zh-CN'], 'zh-CN'), '# 力量(簡)');
    assert.equal(renderTierKey(rendered.templatesByLocale['zh-CN'], rendered.params, 'zh-CN'), '+(8-12) 力量(簡)');

    assert.equal(renderGenericTemplate(rendered.templatesByLocale['ru'], 'ru'), '# к силе');
    assert.equal(renderTierKey(rendered.templatesByLocale['ru'], rendered.params, 'ru'), '+(8-12) к силе');

    assert.equal(renderGenericTemplate(rendered.templatesByLocale['ja'], 'ja'), '筋力 +#');
    assert.equal(renderTierKey(rendered.templatesByLocale['ja'], rendered.params, 'ja'), '筋力 +(8-12)');

    // German was omitted in SAMPLE_MULTILANG_CSD -> must fall back to English at build time
    assert.equal(renderGenericTemplate(rendered.templatesByLocale['de'], 'de'), '# to Strength');
    assert.equal(renderTierKey(rendered.templatesByLocale['de'], rendered.params, 'de'), '+(8-12) to Strength');
  });

  it('preserves parity across multi-placeholder flat damage, negated variants, and multi-line hybrid (|||||) affixes', () => {
    const index = StatDescriptionIndex.parse(SAMPLE_MULTILANG_CSD);

    // 1. Multi-placeholder flat damage
    const flatFire = index.renderMod([
      { id: 'local_minimum_added_fire_damage', min: 5, max: 10 },
      { id: 'local_maximum_added_fire_damage', min: 15, max: 25 },
    ]);
    assert.ok(flatFire);
    assert.equal(renderGenericTemplate(flatFire.templatesByLocale['zh-TW'], 'zh-TW'), flatFire.template_zh);
    assert.equal(renderTierKey(flatFire.templatesByLocale['zh-TW'], flatFire.params, 'zh-TW'), flatFire.key_zh);
    assert.equal(renderGenericTemplate(flatFire.templatesByLocale['en'], 'en'), flatFire.template);
    assert.equal(renderTierKey(flatFire.templatesByLocale['en'], flatFire.params, 'en'), flatFire.key);
    assert.equal(
      renderTierKey(flatFire.templatesByLocale['ru'], flatFire.params, 'ru'),
      'Добавляет от (5-10) до (15-25) урона от огня'
    );

    // 2. Negated variant
    const stunNeg = index.renderMod([
      { id: 'base_stun_Threshold_reduction_+%', min: -20, max: -10 },
    ]);
    assert.ok(stunNeg);
    assert.equal(stunNeg.key_zh, '提高 (10-20)% 敵人暈眩門檻');
    assert.equal(renderTierKey(stunNeg.templatesByLocale['zh-TW'], stunNeg.params, 'zh-TW'), stunNeg.key_zh);
    assert.equal(renderTierKey(stunNeg.templatesByLocale['en'], stunNeg.params, 'en'), stunNeg.key);
    assert.equal(
      renderTierKey(stunNeg.templatesByLocale['ru'], stunNeg.params, 'ru'),
      '(10-20)% повышение порога оглушения врагов'
    );

    // 3. Multi-line hybrid (|||||)
    const hybrid = index.renderMod([
      { id: 'local_physical_damage_+%', min: 40, max: 49 },
      { id: 'local_attack_rating', min: 50, max: 80 },
    ]);
    assert.ok(hybrid);
    assert.equal(hybrid.key_zh, '增加 (40-49)% 物理傷害|||||+(50-80) 命中值');
    assert.equal(hybrid.template_zh, '增加 #% 物理傷害|||||# 命中值');
    assert.equal(renderGenericTemplate(hybrid.templatesByLocale['zh-TW'], 'zh-TW'), hybrid.template_zh);
    assert.equal(renderTierKey(hybrid.templatesByLocale['zh-TW'], hybrid.params, 'zh-TW'), hybrid.key_zh);
    assert.equal(renderGenericTemplate(hybrid.templatesByLocale['en'], 'en'), hybrid.template);
    assert.equal(renderTierKey(hybrid.templatesByLocale['en'], hybrid.params, 'en'), hybrid.key);
  });

  it('builds unified mods-tiers.json and 11 locales/{locale}/stats.json shards with 100% legacy reconstruction parity', () => {
    const index = StatDescriptionIndex.parse(SAMPLE_MULTILANG_CSD);
    const rStr1 = index.renderMod([{ id: 'additional_strength', min: 13, max: 17 }])!;
    const rStr2 = index.renderMod([{ id: 'additional_strength', min: 8, max: 12 }])!;
    const rFire = index.renderMod([
      { id: 'local_minimum_added_fire_damage', min: 5, max: 10 },
      { id: 'local_maximum_added_fire_damage', min: 15, max: 25 },
    ])!;
    const rHybrid = index.renderMod([
      { id: 'local_physical_damage_+%', min: 40, max: 49 },
      { id: 'local_attack_rating', min: 50, max: 80 },
    ])!;

    const collected = [
      {
        modId: 'Strength2',
        affinities: ['normal'],
        generation_type: '2',
        level: 11,
        values: rStr1.values,
        params: rStr1.params,
        types: ['helmet', 'gloves'],
        id: 'explicit.stat_str',
        ids: ['explicit.stat_str'],
        statIds: ['explicit.stat_str', 'implicit.stat_str'],
        groupKey: rStr1.template,
        templatesByLocale: rStr1.templatesByLocale,
        legacyKey: rStr1.key,
        legacyKeyZh: rStr1.key_zh,
        legacyTemplateZh: rStr1.template_zh,
      },
      {
        modId: 'Strength1',
        affinities: ['normal'],
        generation_type: '2',
        level: 1,
        values: rStr2.values,
        params: rStr2.params,
        types: ['helmet', 'gloves'],
        id: 'explicit.stat_str',
        ids: ['explicit.stat_str'],
        statIds: ['explicit.stat_str'],
        groupKey: rStr2.template,
        templatesByLocale: rStr2.templatesByLocale,
        legacyKey: rStr2.key,
        legacyKeyZh: rStr2.key_zh,
        legacyTemplateZh: rStr2.template_zh,
      },
      {
        modId: 'AddedFire1',
        affinities: ['normal', 'essence'],
        generation_type: '1',
        level: 8,
        values: rFire.values,
        params: rFire.params,
        types: ['one-hand-sword', 'bow'],
        id: 'explicit.stat_fire_dmg',
        ids: ['explicit.stat_fire_dmg'],
        statIds: ['explicit.stat_fire_dmg'],
        groupKey: rFire.template,
        templatesByLocale: rFire.templatesByLocale,
        legacyKey: rFire.key,
        legacyKeyZh: rFire.key_zh,
        legacyTemplateZh: rFire.template_zh,
      },
      {
        modId: 'HybridPhysAcc1',
        affinities: ['normal'],
        generation_type: '1',
        level: 20,
        values: rHybrid.values,
        params: rHybrid.params,
        types: ['one-hand-sword', 'bow'],
        id: undefined,
        ids: ['explicit.stat_phys', 'explicit.stat_acc'],
        statIds: ['explicit.stat_phys', 'explicit.stat_acc'],
        groupKey: rHybrid.template,
        templatesByLocale: rHybrid.templatesByLocale,
        legacyKey: rHybrid.key,
        legacyKeyZh: rHybrid.key_zh,
        legacyTemplateZh: rHybrid.template_zh,
      },
    ];

    const { modsTiers, shardsByLocale } = buildModsLexiconArtifacts(collected);

    // 2 identical type combinations deduplicated into typeTable of length 2
    assert.equal(modsTiers.typeTable.length, 2);
    assert.deepEqual(modsTiers.typeTable[0], ['helmet', 'gloves']);
    assert.deepEqual(modsTiers.typeTable[1], ['one-hand-sword', 'bow']);

    // 3 unique groups
    assert.equal(modsTiers.groups.length, 3);
    assert.equal(modsTiers.tiers.length, 4);

    // All 11 locale shards present
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      const shard = shardsByLocale[locale];
      assert.ok(shard, `missing shard for ${locale}`);
      assert.equal(shard.tierTemplates.length, modsTiers.tiers.length);
      assert.ok(typeof shard.statTemplates['explicit.stat_str'] === 'number');
    }

    // Reconstruct legacy modsData & modsIdData from modsTiers + en + zh-TW shards
    const { modsData, modsIdData } = reconstructLegacyModsArtifacts(
      modsTiers,
      shardsByLocale['en'],
      shardsByLocale['zh-TW']
    );

    // Strength1 (level 1) must be sorted before Strength2 (level 11)
    assert.equal(modsData['# to strength'].length, 2);
    assert.equal(modsData['# to strength'][0].level, '1');
    assert.equal(modsData['# to strength'][0].key, '+(8-12) to strength');
    assert.equal(modsData['# to strength'][0].key_zh, '+(8-12) 力量');
    assert.equal(modsData['# to strength'][0].template_zh, '# 力量');
    assert.equal(modsData['# to strength'][1].level, '11');

    // modsIdData['explicit.stat_str'] has both tiers sorted by level
    assert.equal(modsIdData['explicit.stat_str'].length, 2);
    assert.equal(modsIdData['explicit.stat_str'][0].level, '1');
    assert.equal(modsIdData['explicit.stat_str'][1].level, '11');

    // Hybrid mod indexed under both split IDs
    assert.equal(modsIdData['explicit.stat_phys'].length, 1);
    assert.equal(modsIdData['explicit.stat_acc'].length, 1);
    assert.equal(
      modsIdData['explicit.stat_phys'][0].key_zh,
      '增加 (40-49)% 物理傷害|||||+(50-80) 命中值'
    );
  });
});

const SAMPLE_VALUE_HANDLERS_CSD = `
description
\t1 allies_in_presence_life_regeneration_rate_per_minute
\t1
\t\t# "[Allies|Allies] in your [Presence|Presence] Regenerate {0} Life per second" per_minute_to_per_second 1
\tlang "Traditional Chinese"
\t1
\t\t# "[Presence|範圍]內的[Allies|友軍]每秒再生 {0} 生命" per_minute_to_per_second 1

description
\t1 base_skill_effect_duration
\t1
\t\t# "Base duration is {0} seconds" milliseconds_to_seconds 1

description
\t1 chance_%_to_drop_additional_ancient_orb
\t1
\t\t1|# "{0}% chance to drop an additional Ancient Orb" divide_by_ten_1dp_if_required 1

description
\t1 life_leech_permyriad
\t1
\t\t1|# "{0}% of Damage Leeched as Life" divide_by_one_hundred 1 reminderstring ReminderTextLifeLeech

description
\t1 attack_speed_+%_halved
\t2
\t\t1|# "{0}% increased Attack Speed"
\t\t#|-1 "{0}% reduced Attack Speed" negate_and_double 1

description
\t1 life_regeneration_rate_per_minute_threshold
\t2
\t\t1|59 "Regenerate {0} Life per second (low)" per_minute_to_per_second 1
\t\t60|# "Regenerate {0} Life per second" per_minute_to_per_second 1
`;

describe('stat_descriptions trailing value handlers', () => {
  const index = StatDescriptionIndex.parse(SAMPLE_VALUE_HANDLERS_CSD);

  it('converts per_minute_to_per_second (1386-1740 -> 23.1-29) in params, values, keys and locale templates', () => {
    const rendered = index.renderMod([
      { id: 'allies_in_presence_life_regeneration_rate_per_minute', min: 1386, max: 1740 },
    ]);
    assert.ok(rendered);
    assert.deepEqual(rendered.params, [[23.1, 29]]);
    assert.deepEqual(rendered.values, [['23.1', '29']]);
    assert.equal(rendered.key, 'allies in your presence regenerate (23.1-29) life per second');
    assert.equal(rendered.key_zh, '範圍內的友軍每秒再生 (23.1-29) 生命');
    assert.equal(renderTierKey(rendered.templatesByLocale['en'], rendered.params, 'en'), rendered.key);
    assert.equal(renderTierKey(rendered.templatesByLocale['zh-TW'], rendered.params, 'zh-TW'), rendered.key_zh);
    assert.equal(rendered.template, 'allies in your presence regenerate # life per second');

    const t1 = index.renderMod([
      { id: 'allies_in_presence_life_regeneration_rate_per_minute', min: 1746, max: 1980 },
    ]);
    assert.deepEqual(t1?.params, [[29.1, 33]]);
  });

  it('converts milliseconds_to_seconds, divide_by_ten_1dp_if_required and divide_by_one_hundred', () => {
    const duration = index.renderMod([{ id: 'base_skill_effect_duration', min: 1250, max: 2500 }]);
    assert.deepEqual(duration?.params, [[1.25, 2.5]]);
    assert.equal(duration?.key, 'base duration is (1.25-2.5) seconds');

    const orb = index.renderMod([{ id: 'chance_%_to_drop_additional_ancient_orb', min: 5, max: 5 }]);
    assert.deepEqual(orb?.params, [[0.5]]);
    assert.deepEqual(orb?.values, [['0.5']]);

    const leech = index.renderMod([{ id: 'life_leech_permyriad', min: 20, max: 40 }]);
    assert.deepEqual(leech?.params, [[0.2, 0.4]]);
    assert.equal(leech?.key, '(0.2-0.4)% of damage leeched as life');
  });

  it('applies negate_and_double as negation plus x2 while keeping templates in sync', () => {
    const rendered = index.renderMod([{ id: 'attack_speed_+%_halved', min: -10, max: -5 }]);
    assert.ok(rendered);
    assert.deepEqual(rendered.params, [[-20, -10]]);
    assert.deepEqual(rendered.values, [['10', '20']]);
    assert.equal(rendered.key, '(10-20)% reduced attack speed');
    assert.equal(renderTierKey(rendered.templatesByLocale['en'], rendered.params, 'en'), rendered.key);
  });

  it('matches variant conditions against raw (unconverted) values', () => {
    const low = index.renderMod([{ id: 'life_regeneration_rate_per_minute_threshold', min: 30, max: 30 }]);
    assert.equal(low?.key, 'regenerate 0.5 life per second (low)');
    const high = index.renderMod([{ id: 'life_regeneration_rate_per_minute_threshold', min: 120, max: 120 }]);
    assert.equal(high?.key, 'regenerate 2 life per second');
  });
});
