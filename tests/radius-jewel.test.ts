import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRadiusJewelWrapper,
  buildRadiusJewelWrappers,
  radiusJewelKind,
} from '../src/mods/poe2/radius-jewel.js';
import { resolvePoE2GearTypes } from '../src/mods/poe2/gear-types.js';
import {
  SUPPORTED_AFFIX_LOCALES,
  type RenderedModResult,
  type SupportedAffixLocale,
} from '../src/mods/common/stat-descriptions.js';

const wrappers = buildRadiusJewelWrappers({
  en: {
    small: 'Small Passive Skills in Radius also grant {0}',
    notable: 'Notable Passive Skills in Radius also grant {0}',
  },
  'zh-TW': {
    small: '範圍內小型天賦也會賦予 {0}',
    notable: '範圍內核心天賦也會賦予 {0}',
  },
});

function renderedParryDamage(): RenderedModResult {
  const templatesByLocale = {} as Record<SupportedAffixLocale, string>;
  for (const locale of SUPPORTED_AFFIX_LOCALES) templatesByLocale[locale] = '{0:d}% increased Parry Damage';
  templatesByLocale['zh-TW'] = '增加{0:d}%招架傷害';
  return {
    key: '(2-3)% increased parry damage',
    key_zh: '增加(2-3)%招架傷害',
    template: '#% increased parry damage',
    template_zh: '增加#%招架傷害',
    values: [['2', '3']],
    params: [[2, 3]],
    templatesByLocale,
    ruleStatIds: [['parry_damage_+%']],
  };
}

describe('radius jewel mods', () => {
  it('maps RadiusJewelType 1 / 2 to small / notable and leaves other values as ordinary mods', () => {
    assert.equal(radiusJewelKind(1), 'small');
    assert.equal(radiusJewelKind(2), 'notable');
    assert.equal(radiusJewelKind(3), null);
    assert.equal(radiusJewelKind(undefined), null);
  });

  it('builds wrappers per locale: zh-CN converts from zh-TW, missing locales fall back to English', () => {
    assert.equal(wrappers.small['zh-CN'], '范围内小型天赋也会赋予 {0}');
    assert.equal(wrappers.notable.ja, 'Notable Passive Skills in Radius also grant {0}');
    assert.throws(() => buildRadiusJewelWrappers({ 'zh-TW': { small: '{0}', notable: '{0}' } }));
  });

  it('wraps every rendered field so the template resolves to the official radius trade stat', () => {
    const base = renderedParryDamage();
    const snapshot = structuredClone(base);
    const wrapped = applyRadiusJewelWrapper(base, 1, wrappers);

    assert.equal(wrapped.template, 'small passive skills in radius also grant #% increased parry damage');
    assert.equal(wrapped.key, 'small passive skills in radius also grant (2-3)% increased parry damage');
    assert.equal(wrapped.template_zh, '範圍內小型天賦也會賦予 增加#%招架傷害');
    assert.equal(wrapped.key_zh, '範圍內小型天賦也會賦予 增加(2-3)%招架傷害');
    assert.equal(wrapped.templatesByLocale.en, 'Small Passive Skills in Radius also grant {0:d}% increased Parry Damage');
    assert.equal(wrapped.templatesByLocale['zh-TW'], '範圍內小型天賦也會賦予 增加{0:d}%招架傷害');
    assert.deepEqual(wrapped.values, base.values);
    assert.deepEqual(base, snapshot, 'input must not be mutated');
  });

  it('uses the notable wrapper for type 2 and returns ordinary mods unchanged', () => {
    const base = renderedParryDamage();
    assert.equal(
      applyRadiusJewelWrapper(base, 2, wrappers).template,
      'notable passive skills in radius also grant #% increased parry damage',
    );
    assert.equal(applyRadiusJewelWrapper(base, 3, wrappers), base);
  });

  it('wraps each line of a multi-line mod', () => {
    const base = { ...renderedParryDamage(), template: 'a #|||||b #' };
    assert.equal(
      applyRadiusJewelWrapper(base, 1, wrappers).template,
      'small passive skills in radius also grant a #|||||small passive skills in radius also grant b #',
    );
  });

  it('resolves radius jewel spawn tags to Time-Lost jewels instead of ordinary jewels', () => {
    const resolve = (tag: string) => resolvePoE2GearTypes([{ tag, weight: 1 }], 11).sort();
    assert.deepEqual(resolve('dex_radius_jewel'), ['jewel', 'time_lost_emerald']);
    assert.deepEqual(resolve('str_radius_jewel'), ['jewel', 'time_lost_ruby']);
    assert.deepEqual(resolve('int_radius_jewel'), ['jewel', 'time_lost_sapphire']);
    assert.deepEqual(resolve('radius_jewel'), [
      'jewel',
      'time_lost_diamond',
      'time_lost_emerald',
      'time_lost_ruby',
      'time_lost_sapphire',
    ]);
    assert.deepEqual(resolve('dexjewel'), ['emerald', 'jewel']);
  });
});
