import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillPassiveNodeStats, parseStatTemplates } from '../src/trade/passive-node-stats.js';

const TEMPLATES = parseStatTemplates({
  lines: {
    '3599615742': [['1 added passive skill is {0:d}', '其中 1 个增加的天赋为 {0:d}']],
    '2954116742': [['Allocates {0:d}', '配置 {0:d}']],
  },
});

describe('parseStatTemplates', () => {
  it('只收單一規則、單一參數的句型', () => {
    const templates = parseStatTemplates({
      lines: {
        a: [['Allocates {0:d}', '配置 {0:d}']],
        b: [['x {0}', 'x {0}'], ['y {0}', 'y {0}']],
        c: [['{0} to {1}', '{0} 至 {1}']],
        d: [['No value', '沒有參數']],
      },
    });
    assert.deepEqual([...templates.keys()], ['a']);
  });

  it('缺少 lines 時拋錯', () => {
    assert.throws(() => parseStatTemplates({}), /缺少 lines/);
  });
});

describe('fillPassiveNodeStats', () => {
  it('用同節點的塗油譯名與目標句型補回缺少的條目', () => {
    const stats = { 'enchant.stat_2954116742|37425': '配置 娴熟涂抹' };
    const { stats: result, filled } = fillPassiveNodeStats(
      stats,
      ['enchant.stat_2954116742|37425', 'enchant.stat_3599615742|37425'],
      TEMPLATES,
    );
    assert.equal(filled, 1);
    assert.equal(result['enchant.stat_3599615742|37425'], '其中 1 个增加的天赋为 娴熟涂抹');
    assert.equal('enchant.stat_3599615742|37425' in stats, false, '不改動傳入的物件');
  });

  it('既有條目不覆蓋', () => {
    const { stats, filled } = fillPassiveNodeStats(
      { 'enchant.stat_2954116742|1': '配置 甲', 'enchant.stat_3599615742|1': '官方原文' },
      ['enchant.stat_3599615742|1'],
      TEMPLATES,
    );
    assert.equal(filled, 0);
    assert.equal(stats['enchant.stat_3599615742|1'], '官方原文');
  });

  it('沒有來源條目、來源有多種寫法或句型對不上時不補', () => {
    const { stats, filled } = fillPassiveNodeStats(
      {
        'enchant.stat_2954116742|2': ['配置 甲', '配置 乙'],
        'enchant.stat_2954116742|3': 'Allocates Acrimony',
      },
      ['enchant.stat_3599615742|1', 'enchant.stat_3599615742|2', 'enchant.stat_3599615742|3'],
      TEMPLATES,
    );
    assert.equal(filled, 0);
    assert.deepEqual(Object.keys(stats).filter((id) => id.startsWith('enchant.stat_3599615742')), []);
  });

  it('缺少句型時整組略過', () => {
    const { filled } = fillPassiveNodeStats(
      { 'enchant.stat_2954116742|1': '配置 甲' },
      ['enchant.stat_3599615742|1'],
      new Map(),
    );
    assert.equal(filled, 0);
  });
});
