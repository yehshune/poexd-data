import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMercenaryData, buildMercenaryLocaleNames } from '../src/mods/poe1/mercenary.js';

const tables = {
  supportFamilies: [{ Id: 'Chain' }],
  supportCounts: [{ Id: 'Low' }, { Id: 'Medium' }, { Id: 'High' }, { Id: 'None' }],
  supports: [
    { HASH16: 11, Name: 'Lesser Chain', Tier: 1, SupportFamily: 0 },
    { HASH16: 12, Name: 'Chain', Tier: 2, SupportFamily: 0 },
    { HASH16: 13, Name: 'Gilded Return', Tier: 3, SupportFamily: null },
    { HASH16: 99, Name: 'Not On Trade', Tier: 3, SupportFamily: null },
  ],
  skills: [
    { HASH16: 1, Name: 'Do Nothing', SupportCount: 3, PossibleSupports: [] },
    { HASH16: 2, Name: 'Spark', SupportCount: 2, PossibleSupports: [0, 1, 2, 3, 1] },
    { HASH16: 3, Name: 'Flame Dash', SupportCount: 0, PossibleSupports: [2] },
    { HASH16: 4, Name: 'Haste', SupportCount: 3, PossibleSupports: [] },
  ],
  builds: [
    { Id: 'WitchSpark', Name: 'Stormhand', IsInfamous: false, Skills1: [1], Skills2: [1, 0], Skills2Count: 2, Skills3: [2, 3], Skills3Count: 1 },
    { Id: 'WitchSparkNoble', Name: 'Infamous Stormhand', IsInfamous: true, Skills1: [1], Skills2: [], Skills2Count: 0, Skills3: [2], Skills3Count: 1 },
    { Id: 'Unreleased', Name: 'Unreleased', IsInfamous: false, Skills1: [], Skills2: [], Skills2Count: 0, Skills3: [], Skills3Count: 0 },
  ],
};
const statIds = new Set([
  'mercenary.skill_2', 'mercenary.skill_3', 'mercenary.skill_4',
  'mercenary.support_11', 'mercenary.support_12', 'mercenary.support_13',
]);
const warrantTypes = new Set(['WitchSpark', 'WitchSparkNoble']);

describe('PoE 1 mercenary data', () => {
  const result = buildMercenaryData('3.29.0', tables, statIds, warrantTypes);

  it('keeps only skills and supports known to the official trade site', () => {
    assert.deepEqual(result.data.skills.map((s) => s.tradeId), ['mercenary.skill_2', 'mercenary.skill_3', 'mercenary.skill_4']);
    assert.deepEqual(result.data.supports.map((s) => s.tradeId), ['mercenary.support_11', 'mercenary.support_12', 'mercenary.support_13']);
    assert.deepEqual(result.dropped.skills, ['Do Nothing']);
  });

  it('maps support tier, family and skill slot level', () => {
    assert.deepEqual(result.data.supports[0], { tradeId: 'mercenary.support_11', tier: 1, family: 'Chain' });
    assert.equal(result.data.supports[2].family, null);
    assert.deepEqual(result.data.skills[0], { tradeId: 'mercenary.skill_2', slots: 'high', supports: [0, 1, 2] });
    assert.equal(result.data.skills[2].slots, 'none');
  });

  it('remaps build skill pools to output indices and drops builds missing from trade', () => {
    assert.deepEqual(result.data.builds[0], {
      tradeType: 'WitchSpark', infamous: false, core: [0], main: [0], mainCount: 2, utility: [1, 2], utilityCount: 1,
    });
    assert.equal(result.data.builds[1].infamous, true);
    assert.deepEqual(result.dropped.builds, ['Unreleased']);
  });

  it('aligns localized names by dat row and falls back to English', () => {
    const localized = {
      builds: [{ Name: '風暴之手' }, { Name: '' }],
      skills: [{}, { Name: '電球' }, {}, {}],
      supports: [{ Name: '次級連鎖' }],
    };
    const names = buildMercenaryLocaleNames('3.29.0', result.rows, tables, localized);
    assert.deepEqual(names, {
      patch: '3.29.0',
      builds: ['風暴之手', 'Infamous Stormhand'],
      skills: ['電球', 'Flame Dash', 'Haste'],
      supports: ['次級連鎖', 'Chain', 'Gilded Return'],
    });
  });
});
