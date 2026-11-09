import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_STAT_TOKENS, buildContentTokens, intrinsicContentIds, isDeadlyMapBoss } from '../src/atlas/content-tokens.js';

const statIdsWithDisplayStats = (): string[] => {
  const ids = Array.from({ length: 200 }, (_, i) => `stat_${i}`);
  DISPLAY_STAT_TOKENS.forEach(({ statId }, i) => {
    ids[150 + i] = statId;
  });
  return ids;
};

const rows = [
  { Id: 'PowerfulMapBoss', Name: 'Powerful Map Boss', Stats: [10] },
  { Id: 'Breach', Name: 'Breach', Stats: [11] },
  { Id: 'Delirium', Name: 'Delirium', Stats: [12] },
  { Id: 'Ritual', Name: 'Ritual', Stats: [13] },
  { Id: 'Incursion', Name: 'Vaal Beacons', Stats: [14] },
  { Id: 'Abyss', Name: 'Abyss', Stats: [15, 16] },
  { Id: 'BreachCity', Name: '[DNT] Breach City', Stats: [20] },
  { Id: 'BreachHive', Name: 'Breach Hive', Stats: [20] },
  { Id: 'HildaHuntBoss', Name: 'Great Beast', Stats: [10, 30] },
  { Id: 'GrandExpedition', Name: 'Grand Expedition', Stats: [] },
];

describe('atlas content tokens', () => {
  it('derives each row token from its first stat plus one', () => {
    const tokens = buildContentTokens(rows, statIdsWithDisplayStats());
    assert.deepEqual(tokens.get('100'), [11]);
    assert.equal(tokens.get('105')?.[0], 16);
    assert.equal(tokens.has('109'), false);
  });

  it('lets the first visible row claim a shared token and skips hidden rows', () => {
    const tokens = buildContentTokens(rows, statIdsWithDisplayStats());
    assert.equal(tokens.has('106'), false);
    assert.deepEqual(tokens.get('107'), [21]);
    assert.equal(tokens.has('108'), false);
  });

  it('resolves display stats by stat id, including the special Grand Mirror entry', () => {
    const tokens = buildContentTokens(rows, statIdsWithDisplayStats());
    assert.deepEqual(tokens.get('102'), [13, 151]);
    assert.deepEqual(tokens.get('104'), [15, 154]);
    assert.deepEqual(tokens.get('1007'), [156]);
  });

  it('fails when a display stat disappears', () => {
    const ids = statIdsWithDisplayStats().filter((id) => id !== 'map_delirium_has_giga_mirror');
    assert.throws(() => buildContentTokens(rows, ids), /map_delirium_has_giga_mirror/);
  });

  it('fails when a display stat target row disappears', () => {
    assert.throws(
      () => buildContentTokens(rows.filter((row) => row.Id !== 'Ritual'), statIdsWithDisplayStats()),
      /Ritual/,
    );
  });
});

describe('intrinsic map content', () => {
  it('maps EndgameMaps.MapContent rows to atlas_content ids', () => {
    assert.deepEqual(intrinsicContentIds([72]), [172]);
    assert.deepEqual(intrinsicContentIds([66, 73]), [166, 173]);
  });

  it('ignores missing or malformed content', () => {
    assert.deepEqual(intrinsicContentIds(undefined), []);
    assert.deepEqual(intrinsicContentIds([null, -1, 1.5, 'x']), []);
  });
});

describe('deadly map boss', () => {
  it('covers arbiter, pinnacle and uber boss maps', () => {
    assert.equal(isDeadlyMapBoss('MapMothersoul_Female', new Set(['arbiter', 'arbiter_of_divinity'])), true);
    assert.equal(isDeadlyMapBoss('ExpeditionSubArea_MedvedBoss', new Set(['pinnacle_boss'])), true);
    assert.equal(isDeadlyMapBoss('MapUberBoss_JadeCitadel', new Set(['lineage'])), true);
    assert.equal(isDeadlyMapBoss('MapUberBoss_Monolith', new Set(['pinnacle_boss', 'quest'])), true);
  });

  it('excludes quest copies and ordinary or league boss maps', () => {
    assert.equal(isDeadlyMapBoss('MapMothersoul_Female_Quest', new Set(['arbiter', 'quest'])), false);
    assert.equal(isDeadlyMapBoss('MapUberBoss_IronCitadel_Quest', new Set(['quest'])), false);
    assert.equal(isDeadlyMapBoss('ChayulaLeague_TowerBoss', new Set()), false);
    assert.equal(isDeadlyMapBoss('MapAlpineRidge', new Set(['tower'])), false);
  });
});
