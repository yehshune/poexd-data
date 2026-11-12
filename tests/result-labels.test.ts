import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultLabels, type ResultLabelSource } from '../src/mods/common/result-labels.js';

const clientStrings: ResultLabelSource = {
  name: 'ClientStrings',
  english: [
    { _index: 0, Id: 'ItemDisplayWeaponPhysicalDamage', Text: 'Physical Damage' },
    { _index: 1, Id: 'ItemDisplayChargesConsumptionOnUseNCharges', Text: 'Consumes {0} of {1} Charges on use' },
    { _index: 2, Id: 'OptionsChatFontOptionSmall', Text: 'Small' },
    { _index: 3, Id: 'JewelRadiusSmall', Text: 'Small' },
    { _index: 4, Id: 'ItemDisplayHeistEquipmentUsers', Text: 'This item can be equipped by:\n{0}' },
    { _index: 5, Id: 'Same', Text: 'DPS' },
    { _index: 6, Id: 'Broken', Text: 'Level {0}' },
    { _index: 7, Id: 'Markup', Text: '[Minions|Minions] have {0:+d}% Life' },
    { _index: 8, Id: 'Styled', Text: 'Level {1} <normal>{{({0}%)}}' },
    { _index: 9, Id: 'Raw', Text: '<red>Broken' },
  ],
  localized: [
    { _index: 0, Id: 'ItemDisplayWeaponPhysicalDamage', Text: '物理傷害' },
    { _index: 1, Id: 'ItemDisplayChargesConsumptionOnUseNCharges', Text: '每次使用會從 {1} 充能次數中消耗 {0} 次' },
    { _index: 2, Id: 'OptionsChatFontOptionSmall', Text: '小字' },
    { _index: 3, Id: 'JewelRadiusSmall', Text: '小' },
    { _index: 4, Id: 'ItemDisplayHeistEquipmentUsers', Text: '可裝備者：\n{0}' },
    { _index: 5, Id: 'Same', Text: 'DPS' },
    { _index: 6, Id: 'Broken', Text: '等級' },
    { _index: 7, Id: 'Markup', Text: '[Minions|召喚物]{0:+d}% 生命' },
    { _index: 8, Id: 'Styled', Text: '等級 {1} <normal>{{({0}%)}}' },
    { _index: 9, Id: 'Raw', Text: '<red>壞掉' },
  ],
  columns: ['Text'],
  priority: (row) => (/^(ItemDisplay|JewelRadius)/.test(String(row.Id)) ? 0 : 2),
};

const itemClasses: ResultLabelSource = {
  name: 'ItemClasses',
  english: [{ _index: 0, Name: 'Quarterstaff' }],
  localized: [{ _index: 0, Name: '細杖' }],
  columns: ['Name'],
};

describe('buildResultLabels', () => {
  const result = buildResultLabels([clientStrings, itemClasses]);

  it('沒有佔位符的字串成為標籤，去掉標記、略過與英文相同的', () => {
    assert.equal(result.labels['Physical Damage'], '物理傷害');
    assert.equal(result.labels['Quarterstaff'], '細杖');
    assert.equal(result.labels['DPS'], undefined);
  });

  it('同一英文有多個譯名時以優先序較高者為準', () => {
    assert.equal(result.labels['Small'], '小');
  });

  it('帶佔位符的字串成為模板（統一為 {n}），譯文佔位符不一致或含換行時略過', () => {
    assert.deepEqual(result.templates, [
      ['Consumes {0} of {1} Charges on use', '每次使用會從 {1} 充能次數中消耗 {0} 次'],
      ['Minions have {0}% Life', '召喚物{0}% 生命'],
      ['Level {1} ({0}%)', '等級 {1} ({0}%)'],
    ]);
    assert.equal(result.labels['<red>Broken'], undefined);
  });
});
