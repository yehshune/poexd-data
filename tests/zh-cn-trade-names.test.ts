import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignTradeItemNames,
  applyZhCnItemNames,
  convertTradToSimpChinese,
  type TradeItemsResponse,
} from '../src/mods/common/zh-cn-trade-names.js';
import { SUPPORTED_AFFIX_LOCALES } from '../src/mods/common/stat-descriptions.js';
import type { LocaleItemsShard } from '../src/mods/common/types.js';

const response = (entries: TradeItemsResponse['result'][number]['entries']): TradeItemsResponse => ({
  result: [{ id: 'currency', entries }],
});

describe('zh-CN item names from Tencent trade data', () => {
  it('maps exact and similar names, and pairs equal-length gaps between anchors by position', () => {
    const names = alignTradeItemNames({
      international: response([
        { type: 'Chaos Orb' },
        { type: 'Orb of Annulment' },
        { type: 'Exalted Orb' },
      ]),
      tencent: response([{ type: '混沌石' }, { type: '剥离石' }, { type: '崇高石' }]),
      englishToZhTw: new Map([
        ['chaos orb', '混沌石'],
        ['orb of annulment', '撤銷石'],
        ['exalted orb', '崇高石'],
      ]),
    });
    assert.equal(names.get('chaos orb'), '混沌石');
    // 國服譯名與繁中不同：靠兩側錨點依位置配對，而不是逐字轉成「撤销石」
    assert.equal(names.get('orb of annulment'), '剥离石');
    assert.equal(names.get('exalted orb'), '崇高石');
  });

  it('leaves names unmapped when the gap between anchors differs in length', () => {
    const names = alignTradeItemNames({
      international: response([
        { type: 'Chaos Orb' },
        { type: 'Jet Amulet' },
        { type: 'Paua Amulet' },
        { type: 'Exalted Orb' },
      ]),
      tencent: response([{ type: '混沌石' }, { type: '海灵护身符' }, { type: '崇高石' }]),
      englishToZhTw: new Map([
        ['chaos orb', '混沌石'],
        ['jet amulet', '傑特護身符'],
        ['paua amulet', '海靈護身符'],
        ['exalted orb', '崇高石'],
      ]),
    });
    assert.equal(names.get('paua amulet'), '海灵护身符');
    assert.equal(names.has('jet amulet'), false);
  });

  it('never pairs a unique entry with a non-unique entry', () => {
    const names = alignTradeItemNames({
      international: response([{ name: 'Headhunter', type: 'Leather Belt', flags: { unique: true } }]),
      tencent: response([{ type: '皮革腰带' }]),
      englishToZhTw: new Map([['headhunter', '獵首']]),
    });
    assert.equal(names.size, 0);
  });

  it('overlays Tencent names onto the zh-CN shard without mutating input and keeps English fallback', () => {
    const items = (list: string[]): LocaleItemsShard => ({ items: list });
    const base = Object.fromEntries(
      SUPPORTED_AFFIX_LOCALES.map((l) => [l, items(['Chaos Orb', 'Mirror of Kalandra'])]),
    ) as Record<(typeof SUPPORTED_AFFIX_LOCALES)[number], LocaleItemsShard>;
    const next = applyZhCnItemNames(base, new Map([['chaos orb', '混沌石']]));
    assert.deepEqual(next['zh-CN'].items, ['混沌石', 'Mirror of Kalandra']);
    assert.deepEqual(base['zh-CN'].items, ['Chaos Orb', 'Mirror of Kalandra']);
  });

  it('keeps the trad-to-simp converter available for similarity scoring', () => {
    assert.equal(convertTradToSimpChinese('譫妄碑牌'), '谵妄碑牌');
    assert.equal(convertTradToSimpChinese('換界石'), '引路石');
  });
});
