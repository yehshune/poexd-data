import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPassiveNames, isAtlasPassive } from '../src/mods/common/passive-names.js';

describe('buildPassiveNames', () => {
  it('以列序對齊英文與譯文，略過空名、[DNT]、與英文相同者以及 skip 的列', () => {
    const { names, conflicts } = buildPassiveNames([
      {
        column: 'Name',
        english: [
          { Name: 'Resolute Technique' },
          { Name: 'Life Mastery' },
          { Name: '' },
          { Name: '[DNT] Test' },
          { Name: 'Strength' },
          { Name: 'A Noble Quest', AtlasGroup: 3 },
        ],
        localized: [
          { Name: '堅毅之心' },
          { Name: '生命專精' },
          { Name: '' },
          { Name: '測試' },
          { Name: 'Strength' },
          { Name: '崇高任務' },
        ],
        skip: isAtlasPassive,
      },
      { column: 'Name', english: [{ Name: 'Slayer' }], localized: [{ Name: '處刑者' }] },
    ]);
    assert.deepEqual(names, {
      'Life Mastery': '生命專精',
      'Resolute Technique': '堅毅之心',
      Slayer: '處刑者',
    });
    assert.deepEqual(conflicts, []);
  });

  it('同一個英文名有兩種譯文時整筆不收；相同譯文重複出現不算衝突', () => {
    const { names, conflicts } = buildPassiveNames([
      {
        column: 'Name',
        english: [{ Name: 'Warden' }, { Name: 'Life' }, { Name: 'Life' }],
        localized: [{ Name: '守護者' }, { Name: '生命' }, { Name: '生命' }],
      },
      { column: 'Name', english: [{ Name: 'Warden' }], localized: [{ Name: '守林人' }] },
    ]);
    assert.deepEqual(names, { Life: '生命' });
    assert.deepEqual(conflicts, ['Warden']);
  });

  it('兩份資料表列數不同時整份不收（列序對齊不可靠）', () => {
    const { names } = buildPassiveNames([
      { column: 'Name', english: [{ Name: 'Acrobatics' }, { Name: 'Iron Reflexes' }], localized: [{ Name: '雜技' }] },
    ]);
    assert.deepEqual(names, {});
  });
});

describe('isAtlasPassive', () => {
  it('輿圖欄位有值（含列索引 0）才算輿圖天賦', () => {
    assert.equal(isAtlasPassive({ SkillType: 1 }), true);
    assert.equal(isAtlasPassive({ SkillType: 0 }), false);
    assert.equal(isAtlasPassive({ AtlasGroup: 0 }), true);
    assert.equal(isAtlasPassive({ AtlasSubTree: 2 }), true);
    assert.equal(isAtlasPassive({ AtlasNodeGroup: 'Breach' }), true);
    assert.equal(isAtlasPassive({ AtlasGroup: null, AtlasSubTree: null, IsAtlasWormhole: false, AtlasNodeGroup: '' }), false);
  });
});
