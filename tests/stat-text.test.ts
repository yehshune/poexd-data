import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StatDescriptionIndex } from '../src/mods/common/stat-descriptions.js';
import { computeGggStatHash } from '../src/mods/common/murmurhash2.js';
import { buildStatText, subtractModLines, writeStatTextArtifacts } from '../src/mods/common/stat-text.js';
import { detectRewording, mergeAliases } from '../src/mods/common/stat-aliases.js';
import { extractPobDescriptions, parseLuaTable } from '../src/aliases/pob-lua.js';
import { pobEnglishByHash } from '../src/aliases/seed-pob-aliases.js';

const hashOf = (...ids: string[]) => String(computeGggStatHash(ids));
const RARITY = hashOf('item_found_rarity_+%');
const LIFE = hashOf('base_maximum_life');

const description = (statId: string, english: string[], zhTw: string[], header = 'description') => `
${header}
\t1 ${statId}
\t${english.length}
${english.map((line) => `\t\t${line}`).join('\n')}
\tlang "Traditional Chinese"
\t${zhTw.length}
${zhTw.map((line) => `\t\t${line}`).join('\n')}
`;

const MAIN = StatDescriptionIndex.parse(
  description('item_found_rarity_+%', ['# "{0:+d}% to Item Rarity"'], ['# "{0:+d}%物品稀有度"']) +
    description('base_maximum_life', ['# "{0:+d} to maximum Life"'], ['# "{0:+d} 最大生命"'])
);
// PoE 1 技能描述檔：has_identifiers，標頭帶識別名稱；同一個 stat 有自己的寫法
const SKILL = StatDescriptionIndex.parse(
  'has_identifiers\n' +
    description(
      'base_maximum_life',
      ['# "Skill grants {0:+d} to maximum Life"'],
      ['# "技能給予 {0:+d} 最大生命"'],
      'description skill_life'
    )
);

describe('buildStatText', () => {
  it('收錄所有描述檔的規則；同一 hash 的不同寫法依描述檔順序都保留', () => {
    const lines = buildStatText([MAIN, SKILL], 'zh-TW');
    assert.deepEqual(lines[RARITY], [['{0:+d}% to Item Rarity', '{0:+d}%物品稀有度']]);
    assert.deepEqual(lines[LIFE], [
      ['{0:+d} to maximum Life', '{0:+d} 最大生命'],
      ['Skill grants {0:+d} to maximum Life', '技能給予 {0:+d} 最大生命'],
    ]);
  });

  it('沒有該語系譯文的規則略過', () => {
    assert.deepEqual(buildStatText([MAIN], 'zh-CN'), {});
  });
});

describe('subtractModLines', () => {
  it('扣掉 mod-lines 已有的同 hash 同英文句子；扣完沒有句子的 hash 不輸出', () => {
    const lines = buildStatText([MAIN, SKILL], 'zh-TW');
    assert.deepEqual(subtractModLines(lines, { [RARITY]: [['{0:+d}% to Item Rarity', '{0:+d}%物品稀有度']], [LIFE]: [['{0:+d} to maximum Life', 'x']] }), {
      [LIFE]: [['Skill grants {0:+d} to maximum Life', '技能給予 {0:+d} 最大生命']],
    });
  });
});

describe('detectRewording', () => {
  it('增加／減少兩種寫法合併成一個帶正負號的寫法', () => {
    assert.deepEqual(
      detectRewording(
        ['{0:d}% increased Rarity of Items found', '{0:n}% reduced Rarity of Items found'],
        ['{0:+d}% to Item Rarity']
      ),
      [
        ['{0:d}% increased Rarity of Items found', '{0:+d}% to Item Rarity'],
        ['{0:n}% reduced Rarity of Items found', '{0:+d}% to Item Rarity'],
      ]
    );
  });

  it('多個候選時依增加／減少與字詞重疊選擇；佔位符編號不同不配對；沒有改寫時不輸出', () => {
    assert.deepEqual(
      detectRewording(
        ['{0:d}% increased Aura Effect', '{0:n}% reduced Aura Effect'],
        ['{0:d}% increased Aura Magnitudes', '{0:n}% reduced Aura Magnitudes']
      ),
      [
        ['{0:d}% increased Aura Effect', '{0:d}% increased Aura Magnitudes'],
        ['{0:n}% reduced Aura Effect', '{0:n}% reduced Aura Magnitudes'],
      ]
    );
    assert.deepEqual(detectRewording(['Adds {0:d} to {1:d} Damage'], ['{0:d} Damage']), []);
    assert.deepEqual(detectRewording(['{0:d} Damage'], ['{0:d} Damage', 'Other {0:d}']), []);
  });

  it('多個候選且完全沒有共同字詞時不猜', () => {
    assert.deepEqual(detectRewording(['Resonance {0:d}'], ['Alpha {0:d}', 'Beta {0:d}']), []);
  });
});

describe('mergeAliases', () => {
  const current = new Map([[RARITY, ['{0:+d}% to Item Rarity']]]);

  it('沿著別名接到現行寫法；舊寫法已是現行寫法或接不到現行寫法的移除', () => {
    const merged = mergeAliases(
      [
        { [RARITY]: [['Oldest {0:d}', 'Older {0:d}']] },
        {
          [RARITY]: [
            ['Older {0:d}', '{0:+d}% to Item Rarity'],
            ['{0:+d}% to Item Rarity', 'Something {0:d}'],
            ['Dead end {0:d}', 'Gone {0:d}'],
          ],
        },
      ],
      current
    );
    assert.deepEqual(merged, {
      [RARITY]: [
        ['Older {0:d}', '{0:+d}% to Item Rarity'],
        ['Oldest {0:d}', '{0:+d}% to Item Rarity'],
      ],
    });
  });

  it('忽略格式不符的項目', () => {
    assert.deepEqual(mergeAliases([{ [RARITY]: [[1, 2]] as never, x: 'bad' as never }], current), {});
  });
});

describe('writeStatTextArtifacts：每次建置記錄改寫', () => {
  it('比對上一版發布的英文，與回補檔、上一版別名合併後寫出', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stat-text-'));
    try {
      await mkdir(join(dir, 'locales', 'zh-TW'), { recursive: true });
      await writeFile(
        join(dir, 'locales', 'zh-TW', 'stat-text.json'),
        JSON.stringify({
          schemaVersion: 1,
          patch: 'old',
          locale: 'zh-TW',
          lines: {
            [RARITY]: [['{0:d}% increased Rarity of Items found', '增加 {0:d}% 物品稀有度']],
            [LIFE]: [['{0:+d} to maximum Life', '{0:+d} 最大生命']],
          },
        })
      );
      await writeFile(
        join(dir, 'stat-aliases.json'),
        JSON.stringify({ schemaVersion: 1, patch: 'old', aliases: { [LIFE]: [['{0:+d} to Life', '{0:+d} to maximum Life']] } })
      );
      const seedFile = join(dir, 'seed.json');
      await writeFile(
        seedFile,
        JSON.stringify({ schemaVersion: 1, patch: 'seed', aliases: { [RARITY]: [['Ancient {0:d}', '{0:d}% increased Rarity of Items found']] } })
      );

      const result = await writeStatTextArtifacts(
        dir,
        'poe1',
        [
          { name: 'stat_descriptions', index: MAIN },
          { name: 'skill_stat_descriptions', index: SKILL },
        ],
        { 'zh-TW': { [RARITY]: [['{0:+d}% to Item Rarity', '{0:+d}%物品稀有度']] }, 'zh-CN': {} },
        'new',
        seedFile
      );
      assert.deepEqual(result.counts, { 'zh-TW': 2, 'zh-CN': 0 });
      assert.deepEqual(result.itemCounts, { 'zh-TW': 1, 'zh-CN': 0 });
      assert.equal(result.rewordedCount, 1);

      const aliases = JSON.parse(await readFile(join(dir, 'stat-aliases.json'), 'utf8'));
      assert.equal(aliases.patch, 'new');
      assert.deepEqual(aliases.aliases, {
        [RARITY]: [
          ['{0:d}% increased Rarity of Items found', '{0:+d}% to Item Rarity'],
          ['Ancient {0:d}', '{0:+d}% to Item Rarity'],
        ],
        [LIFE]: [['{0:+d} to Life', '{0:+d} to maximum Life']],
      });
      const text = JSON.parse(await readFile(join(dir, 'locales', 'zh-TW', 'stat-text.json'), 'utf8'));
      assert.equal(text.patch, 'new');
      assert.deepEqual(text.lines[RARITY], [['{0:+d}% to Item Rarity', '{0:+d}%物品稀有度']]);
      assert.equal(text.lines[LIFE].length, 2);
      // 擴充用：只收物品描述檔，扣掉 mod-lines 已有的句子
      const items = JSON.parse(await readFile(join(dir, 'locales', 'zh-TW', 'stat-text-items.json'), 'utf8'));
      assert.equal(items.patch, 'new');
      assert.deepEqual(items.lines, { [LIFE]: [['{0:+d} to maximum Life', '{0:+d} 最大生命']] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stat-text-passives.json 只收天賦描述檔，扣掉 mod-lines 與 stat-text-items 已有的句子', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stat-text-'));
    const KEYSTONE = hashOf('keystone_chaos_inoculation');
    const PASSIVE = StatDescriptionIndex.parse(
      description('base_maximum_life', ['# "{0:+d} to maximum Life"'], ['# "{0:+d} 最大生命"']) +
        description(
          'keystone_chaos_inoculation',
          ['# "Maximum Life becomes 1, Immune to Chaos Damage"'],
          ['# "最大生命變為 1，免疫混沌傷害"']
        )
    );
    try {
      const result = await writeStatTextArtifacts(
        dir,
        'poe1',
        [
          { name: 'stat_descriptions', index: MAIN },
          { name: 'passive_skill_stat_descriptions', index: PASSIVE },
        ],
        { 'zh-TW': { [RARITY]: [['{0:+d}% to Item Rarity', '{0:+d}%物品稀有度']] }, 'zh-CN': {} },
        'new',
        join(dir, 'missing.json')
      );
      assert.deepEqual(result.passiveCounts, { 'zh-TW': 1, 'zh-CN': 0 });
      const passives = JSON.parse(await readFile(join(dir, 'locales', 'zh-TW', 'stat-text-passives.json'), 'utf8'));
      assert.equal(passives.patch, 'new');
      assert.equal(passives.locale, 'zh-TW');
      assert.deepEqual(passives.lines, {
        [KEYSTONE]: [['Maximum Life becomes 1, Immune to Chaos Damage', '最大生命變為 1，免疫混沌傷害']],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('第一次建置（沒有上一版）只寫出回補檔的別名', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stat-text-'));
    try {
      const result = await writeStatTextArtifacts(
        dir,
        'poe2',
        [{ name: 'stat_descriptions', index: MAIN }],
        { 'zh-TW': {}, 'zh-CN': {} },
        'new',
        join(dir, 'missing.json')
      );
      assert.equal(result.rewordedCount, 0);
      assert.equal(result.aliasCount, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const POB_LUA = `-- This file is automatically generated, do not edit!
return {
	[1]={
		[1]={
			[1]={
				limit={ [1]={ [1]=1, [2]="#" } },
				text="{0}% increased Rarity of Items found"
			},
			[2]={
				[1]={ k="negate", v=1 },
				limit={ [1]={ [1]="#", [2]=-1 } },
				text="{0}% reduced Rarity of Items found"
			}
		},
		stats={ [1]="item_found_rarity_+%" }
	},
	[2]={
		[1]={
			[1]={ limit={ [1]={ [1]="#", [2]="#" } }, text="Line \\"one\\"\\nLine two {0}" }
		},
		stats={ [1]="base_maximum_life" }
	},
	["Skip"]=true
}`;

describe('PoB 描述檔', () => {
  it('解析 Lua table 子集：陣列、具名欄位、混合鍵、跳脫字元與註解', () => {
    assert.deepEqual(parseLuaTable('return { 1, -2.5, "a\\"b", x = true, [3] = nil }'), {
      '1': 1,
      '2': -2.5,
      '3': null,
      x: true,
    });
    assert.deepEqual(parseLuaTable('{ "a", "b" }'), ['a', 'b']);
    assert.throws(() => parseLuaTable('{ 1 } extra'));
    assert.throws(() => parseLuaTable('{ "unterminated }'));
  });

  it('取出 stat 與英文模板：套用取負，換行保留成字面的 \\n', () => {
    assert.deepEqual(extractPobDescriptions(parseLuaTable(POB_LUA)), [
      {
        statIds: ['item_found_rarity_+%'],
        templates: ['{0:d}% increased Rarity of Items found', '{0:n}% reduced Rarity of Items found'],
      },
      { statIds: ['base_maximum_life'], templates: ['Line "one"\\nLine two {0:d}'] },
    ]);
  });

  it('依 hash 整理，可直接與現行模板比對出別名', () => {
    const previous = pobEnglishByHash(POB_LUA);
    assert.deepEqual(previous.get(RARITY), [
      '{0:d}% increased Rarity of Items found',
      '{0:n}% reduced Rarity of Items found',
    ]);
    assert.equal(detectRewording(previous.get(RARITY)!, ['{0:+d}% to Item Rarity']).length, 2);
  });
});
