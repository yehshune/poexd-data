import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatDescriptionIndex } from '../src/mods/common/stat-descriptions.js';
import { computeGggStatHash } from '../src/mods/common/murmurhash2.js';
import { buildTradeStatTemplates } from '../src/mods/common/trade-stat-templates.js';
import { buildModsLexiconArtifacts } from '../src/mods/common/lexicon-builder.js';
import type { TradeStatsResponse } from '../src/mods/common/trade-stats.js';

// 能力值需求：遊戲詞綴都是負值（顯示「減少」），市集固定寫「增加」
// 藥劑充能使用：第一個變體是 increased，市集卻寫 reduced
const CSD = `
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
\t2
\t\t1|# "属性需求提高 {0}%"
\t\t#|-1 "属性需求降低 {0}%" negate 1

description
\t1 flask_charges_used_+%
\t2
\t\t1|# "{0}% increased Flask Charges used"
\t\t#|-1 "{0}% reduced Flask Charges used" negate 1
\tlang "Traditional Chinese"
\t2
\t\t1|# "增加 {0}% 藥劑充能使用"
\t\t#|-1 "減少 {0}% 藥劑充能使用" negate 1

description
\t1 local_base_evasion_rating
\t1
\t\t# "{0:+d} to [Evasion|Evasion] Rating"
\tlang "Traditional Chinese"
\t1
\t\t# "{0:+d} 閃避值"

description
\t1 only_english_variants
\t2
\t\t1|# "{0}% increased Foo"
\t\t#|-1 "{0}% reduced Foo" negate 1
\tlang "Traditional Chinese"
\t1
\t\t# "增加 {0}% 某物"
`;

const hashOf = (...statIds: string[]) => computeGggStatHash(statIds);
const ATTR = `explicit.stat_${hashOf('local_attribute_requirements_+%')}`;
const FLASK = `explicit.stat_${hashOf('flask_charges_used_+%')}`;
const EVASION = `explicit.stat_${hashOf('local_base_evasion_rating')}`;
const FOO = `explicit.stat_${hashOf('only_english_variants')}`;

const trade = (entries: Array<[string, string]>): TradeStatsResponse => ({
  result: [
    {
      id: 'explicit',
      label: 'Explicit',
      entries: entries.map(([id, text]) => ({ id, text, type: 'explicit' })),
    },
  ],
});

describe('buildTradeStatTemplates（市集詞綴的標準寫法）', () => {
  const index = StatDescriptionIndex.parse(CSD);

  it('依國際服英文市集文字選出相符的變體，各語系取同一個變體', () => {
    const templates = buildTradeStatTemplates(
      index,
      trade([
        [ATTR, '#% increased Attribute Requirements'],
        [FLASK, '#% reduced Flask Charges used'],
      ]),
      [ATTR, FLASK],
    );
    assert.equal(templates.get(ATTR)?.en, '{0:d}% increased Attribute Requirements');
    assert.equal(templates.get(ATTR)?.['zh-TW'], '增加 {0:d}% 能力值需求');
    assert.equal(templates.get(ATTR)?.['zh-CN'], '属性需求提高 {0:d}%');
    // 第二個變體帶 negate：佔位符標成 n，與 tierTemplates 的格式一致
    assert.equal(templates.get(FLASK)?.en, '{0:n}% reduced Flask Charges used');
    assert.equal(templates.get(FLASK)?.['zh-TW'], '減少 {0:n}% 藥劑充能使用');
  });

  it('比對時忽略市集獨有的後綴與正負號', () => {
    const templates = buildTradeStatTemplates(
      index,
      trade([[EVASION, '# to Evasion Rating (Local)']]),
      [EVASION],
    );
    assert.equal(templates.get(EVASION)?.['zh-TW'], '{0:+d} 閃避值');
  });

  it('語系變體數量與英文不同時不產生該語系，避免取錯變體', () => {
    const templates = buildTradeStatTemplates(
      index,
      trade([[FOO, '#% reduced Foo']]),
      [FOO],
    );
    assert.equal(templates.get(FOO)?.en, '{0:n}% reduced Foo');
    assert.equal(templates.get(FOO)?.['zh-TW'], undefined);
  });

  it('沒有相符變體、不在市集或非 stat 代碼時略過', () => {
    const templates = buildTradeStatTemplates(
      index,
      trade([
        [ATTR, 'Something else entirely'],
        ['explicit.stat_1|2', '#% increased Attribute Requirements'],
      ]),
      [ATTR, FLASK, 'explicit.stat_1|2', 'pseudo.pseudo_total_life'],
    );
    assert.equal(templates.size, 0);
  });
});

describe('buildModsLexiconArtifacts 套用市集標準寫法', () => {
  it('statTemplates 改用市集寫法，tierTemplates 維持遊戲寫法', () => {
    const record = {
      generation_type: '1',
      affinities: ['prefix'],
      level: 24,
      values: [['15']],
      params: [-15],
      types: ['gloves'],
      id: ATTR,
      statIds: [ATTR],
      groupKey: '#% reduced attribute requirements',
      templatesByLocale: {
        en: '{0:n}% reduced Attribute Requirements',
        'zh-TW': '減少 {0:n}% 能力值需求',
      } as Record<string, string>,
    };
    const overrides = new Map([
      [ATTR, { en: '{0:d}% increased Attribute Requirements', 'zh-TW': '增加 {0:d}% 能力值需求' }],
    ]);

    const { shardsByLocale } = buildModsLexiconArtifacts([record as never], {
      statTemplateOverrides: overrides,
    });
    const tw = shardsByLocale['zh-TW'];
    assert.equal(tw.templates[tw.statTemplates[ATTR]], '增加 {0:d}% 能力值需求');
    assert.equal(tw.templates[tw.tierTemplates[0]], '減少 {0:n}% 能力值需求');
    // 沒有覆寫的語系維持原本取第一個階級的行為
    const ja = shardsByLocale.ja;
    assert.equal(ja.templates[ja.statTemplates[ATTR]], '{0:n}% reduced Attribute Requirements');
  });
});
