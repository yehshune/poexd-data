import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_REALM_HOSTS,
  buildArtifactFromApi,
  buildFiltersUrl,
  buildStatsUrl,
  extractPseudoStats,
  validateArtifact,
} from '../src/trade/trade-filter-api.js';

const response = (overrides = {}) => ({
  result: [
    {
      id: 'status_filters',
      filters: [{ id: 'status', option: { options: [{ id: 'online', text: 'Online' }] } }],
    },
    {
      id: 'armour_filters',
      title: 'Armour Filters',
      filters: [
        { id: 'ar', text: 'Armour', tip: 'Includes base value', minMax: true },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, text: `Field ${i}` })),
      ],
    },
    {
      id: 'trade_filters',
      title: 'Trade',
      filters: [
        {
          id: 'sale_type',
          text: 'Sale Type',
          option: {
            options: [
              { id: 'any', text: 'Any' },
              { id: null, text: 'Buyout or Fixed Price' },
              { id: 'unpriced', text: 'No Listed Price' },
            ],
          },
        },
      ],
    },
  ],
  ...overrides,
});

describe('trade filter API artifact', () => {
  it('builds per-locale realm URLs for both game versions', () => {
    assert.equal(buildFiltersUrl('zh-TW', 'poe1'), 'https://pathofexile.tw/api/trade/data/filters');
    assert.equal(buildFiltersUrl('pt', 'poe2'), 'https://br.pathofexile.com/api/trade2/data/filters');
    assert.equal((Object.keys(LOCALE_REALM_HOSTS)).length, 11);
  });

  it('keys groups, fields and options by API id and keeps tips out of labels', () => {
    const artifact = buildArtifactFromApi(response(), { gameVersion: 'poe1', locale: 'en' });
    assert.deepEqual(artifact.groups, { armour_filters: 'Armour Filters', trade_filters: 'Trade' });
    assert.equal(artifact.fields.ar, 'Armour');
    assert.equal(artifact.fields.status, undefined);
    assert.deepEqual(artifact.options.status, { online: 'Online' });
    assert.deepEqual(artifact.options.sale_type, {
      any: 'Any',
      priced: 'Buyout or Fixed Price',
      unpriced: 'No Listed Price',
    });
  });

  it('does not map the null option to priced when priced is listed explicitly', () => {
    const data = response();
    data.result[2].filters[0].option.options = [
      { id: null, text: '任何' },
      { id: 'priced', text: '交易报盘或固定价' },
    ];
    const artifact = buildArtifactFromApi(data, { gameVersion: 'poe1', locale: 'zh-CN' });
    assert.deepEqual(artifact.options.sale_type, { priced: '交易报盘或固定价' });
  });

  it('rejects a non-English locale whose labels are identical to en', () => {
    const en = buildArtifactFromApi(response(), { gameVersion: 'poe1', locale: 'en' });
    const ko = buildArtifactFromApi(response(), { gameVersion: 'poe1', locale: 'ko' });
    assert.throws(() => validateArtifact(ko, en), /網域可能回傳英文/);
    assert.equal(validateArtifact(en), en);
  });

  it('rejects responses without enough fields', () => {
    const artifact = buildArtifactFromApi(
      { result: [{ id: 'a_filters', title: 'A', filters: [] }] },
      {
        gameVersion: 'poe1',
        locale: 'en',
      },
    );
    assert.throws(() => validateArtifact(artifact), /欄位只有 0 個/);
  });

  describe('pseudo stats', () => {
    const statsResponse = {
      result: [
        {
          id: 'pseudo',
          label: 'Pseudo',
          entries: [
            { id: 'pseudo.pseudo_total_life', text: '+# total maximum Life', type: 'pseudo' },
            { id: 'pseudo.pseudo_count_elemental_resistances', text: '# Elemental  Resistances' },
            { id: 'pseudo.pseudo_empty', text: '' },
          ],
        },
        {
          id: 'explicit',
          entries: [{ id: 'explicit.stat_1', text: '# to Spirit', type: 'explicit' }],
        },
      ],
    };

    it('builds the stats URL next to the filters URL', () => {
      assert.equal(buildStatsUrl('zh-CN', 'poe2'), 'https://poe.game.qq.com/api/trade2/data/stats');
    });

    it('keeps only pseudo entries with cleaned text, keyed by full stat id', () => {
      assert.deepEqual(extractPseudoStats(statsResponse), {
        'pseudo.pseudo_total_life': '+# total maximum Life',
        'pseudo.pseudo_count_elemental_resistances': '# Elemental Resistances',
      });
    });

    it('rejects a stats response without a pseudo group', () => {
      assert.throws(() => extractPseudoStats({ result: [] }), /pseudo/);
    });

    it('adds pseudo stats to the artifact when a stats response is given', () => {
      const artifact = buildArtifactFromApi(response(), {
        gameVersion: 'poe2',
        locale: 'en',
        statsResponse,
      });
      assert.equal(artifact.pseudoStats['pseudo.pseudo_total_life'], '+# total maximum Life');
      assert.equal(
        buildArtifactFromApi(response(), { gameVersion: 'poe2', locale: 'en' }).pseudoStats,
        undefined,
      );
    });
  });
});
