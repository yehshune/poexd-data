import type { PoeDataLoader } from '../../cdn/loader.js';
import {
  SUPPORTED_AFFIX_LOCALES,
  cleanMarkup,
  type RenderedModResult,
  type SupportedAffixLocale,
} from '../common/stat-descriptions.js';
import { DAT_LANGUAGE_BY_LOCALE } from '../common/item-lexicon.js';
import { convertTradToSimpChinese } from '../common/zh-cn-trade-names.js';

/**
 * 範圍珠寶詞綴（時迭珠寶）。
 *
 * 範圍詞綴與一般珠寶詞綴共用同一個 stat（例如 `parry_damage_+%`），差別只在 Mods 表的
 * `RadiusJewelType`：遊戲顯示時再套上「範圍內的小型／核心天賦也會賦予 {0}」，官方市集也是另一個 stat id。
 * 不套用的話，範圍詞綴會被當成一般詞綴，和一般詞綴的階級混在一起。
 */
export const RADIUS_JEWEL_TYPES = {
  /** 範圍內的小型天賦也會賦予 */
  small: 1,
  /** 範圍內的核心天賦也會賦予 */
  notable: 2,
} as const;

type RadiusJewelKind = keyof typeof RADIUS_JEWEL_TYPES;

const WRAPPER_STRING_IDS: Readonly<Record<RadiusJewelKind, string>> = {
  small: 'ModStatJewelAddToSmall',
  notable: 'ModStatJewelAddToNotable',
};

const PLACEHOLDER = '{0}';
const LINE_SEPARATOR = '|||||';

/** 各語系的外框句型，例如 `Small Passive Skills in Radius also grant {0}` */
export type RadiusJewelWrappers = Readonly<
  Record<RadiusJewelKind, Readonly<Record<SupportedAffixLocale, string>>>
>;

export function radiusJewelKind(radiusJewelType: unknown): RadiusJewelKind | null {
  if (radiusJewelType === RADIUS_JEWEL_TYPES.small) return 'small';
  if (radiusJewelType === RADIUS_JEWEL_TYPES.notable) return 'notable';
  return null;
}

/**
 * 由各語系 ClientStrings 組出外框句型。
 * 簡中用戶端資料不在國際服 CDN，以繁中轉簡；其他缺漏的語系退回英文。
 */
export function buildRadiusJewelWrappers(
  textsByLocale: Partial<Record<SupportedAffixLocale, Partial<Record<RadiusJewelKind, string>>>>
): RadiusJewelWrappers {
  const build = (kind: RadiusJewelKind): Record<SupportedAffixLocale, string> => {
    const english = textsByLocale.en?.[kind];
    if (!english?.includes(PLACEHOLDER)) {
      throw new Error(`ClientStrings ${WRAPPER_STRING_IDS[kind]} (English) 缺少或沒有 {0}`);
    }
    const result = {} as Record<SupportedAffixLocale, string>;
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      const own = textsByLocale[locale]?.[kind];
      const traditional = textsByLocale['zh-TW']?.[kind];
      const fallback =
        locale === 'zh-CN' && traditional?.includes(PLACEHOLDER)
          ? convertTradToSimpChinese(traditional)
          : english;
      result[locale] = own?.includes(PLACEHOLDER) ? own : fallback;
    }
    return result;
  };
  return { small: build('small'), notable: build('notable') };
}

export async function loadRadiusJewelWrappers(loader: PoeDataLoader): Promise<RadiusJewelWrappers> {
  const textsByLocale: Partial<Record<SupportedAffixLocale, Partial<Record<RadiusJewelKind, string>>>> = {};
  for (const [locale, language] of DAT_LANGUAGE_BY_LOCALE) {
    let rows: Record<string, any>[];
    try {
      rows = await loader.loadTable('ClientStrings', { language });
    } catch (error) {
      if (locale === 'en') throw error;
      console.warn(`  [!] 範圍珠寶句型略過 ${language}：${(error as Error).message}`);
      continue;
    }
    const texts: Partial<Record<RadiusJewelKind, string>> = {};
    for (const kind of Object.keys(WRAPPER_STRING_IDS) as RadiusJewelKind[]) {
      const row = rows.find((r) => r.Id === WRAPPER_STRING_IDS[kind]);
      if (typeof row?.Text === 'string') texts[kind] = cleanMarkup(row.Text, locale !== 'en');
    }
    textsByLocale[locale] = texts;
  }
  return buildRadiusJewelWrappers(textsByLocale);
}

const wrapLines = (text: string, wrapper: string): string =>
  text
    .split(LINE_SEPARATOR)
    .map((line) => (line ? wrapper.replace(PLACEHOLDER, () => line) : line))
    .join(LINE_SEPARATOR);

/**
 * 依 `RadiusJewelType` 為渲染結果套上外框句型（回傳新物件，不改動輸入）。
 * 一般詞綴原樣回傳。
 */
export function applyRadiusJewelWrapper(
  rendered: RenderedModResult,
  radiusJewelType: unknown,
  wrappers: RadiusJewelWrappers
): RenderedModResult {
  const kind = radiusJewelKind(radiusJewelType);
  if (!kind) return rendered;
  const byLocale = wrappers[kind];
  const englishLower = byLocale.en.toLowerCase();
  const templatesByLocale = {} as Record<SupportedAffixLocale, string>;
  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    templatesByLocale[locale] = wrapLines(rendered.templatesByLocale[locale] ?? '', byLocale[locale]);
  }
  return {
    ...rendered,
    key: wrapLines(rendered.key, englishLower),
    template: wrapLines(rendered.template, englishLower),
    key_zh: wrapLines(rendered.key_zh, byLocale['zh-TW']),
    template_zh: wrapLines(rendered.template_zh, byLocale['zh-TW']),
    templatesByLocale,
  };
}
