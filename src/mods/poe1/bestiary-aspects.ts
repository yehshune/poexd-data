import type { CollectedModTierRecord } from '../common/lexicon-builder.js';
import { SUPPORTED_AFFIX_LOCALES, type SupportedAffixLocale } from '../common/stat-descriptions.js';
import type { fetchTradeStats } from '../common/trade-stats.js';
import { POE1_DEFAULT_GEAR_TYPES } from './gear-types.js';

interface AspectDefinition {
  en: string;
  zhTW: string;
  zhCN: string;
}

const ASPECT_SKILL_DEFINITIONS: Readonly<Record<string, AspectDefinition>> = {
  Cat: {
    en: 'Grants Level {0} Aspect of the Cat',
    zhTW: '獲得等級 {0} 的傲貓祝福技能',
    zhCN: '获得 {0} 级的主动技能猫之势',
  },
  Bird: {
    en: 'Grants Level {0} Aspect of the Avian',
    zhTW: '獲得等級 {0} 的飛羽祝福技能',
    zhCN: '获得 {0} 级的主动技能鸟之势',
  },
  Spider: {
    en: 'Grants Level {0} Aspect of the Spider',
    zhTW: '獲得等級 {0} 的毒蛛祝福技能',
    zhCN: '获得 {0} 级的主动技能蛛之势',
  },
  Crab: {
    en: 'Grants Level {0} Aspect of the Crab',
    zhTW: '獲得等級 {0} 的蟹將祝福技能',
    zhCN: '获得 {0} 级的主动技能蟹之势',
  },
  BrineKing: {
    en: 'Grants Level {0} Aspect of the Brine King',
    zhTW: '獲得等級 {0} 的海洋王祝福技能',
    zhCN: '获得 {0} 级的海王之势技能',
  },
  Lunaris: {
    en: 'Grants Level {0} Aspect of Lunaris',
    zhTW: '獲得等級 {0} 的月影祝福技能',
    zhCN: '获得 {0} 级的月影之相技能',
  },
  Solaris: {
    en: 'Grants Level {0} Aspect of Solaris',
    zhTW: '獲得等級 {0} 的日耀祝福技能',
    zhCN: '获得 {0} 级的日耀之相技能',
  },
  Arakaali: {
    en: 'Grants Level {0} Aspect of Arakaali',
    zhTW: '獲得等級 {0} 的艾爾卡莉祝福技能',
    zhCN: '获得 {0} 级的阿拉卡力之相技能',
  },
};

function buildLocaleTemplates(def: AspectDefinition): Record<SupportedAffixLocale, string> {
  const templates = {} as Record<SupportedAffixLocale, string>;
  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    if (locale === 'zh-TW') templates[locale] = def.zhTW;
    else if (locale === 'zh-CN') templates[locale] = def.zhCN;
    else templates[locale] = def.en;
  }
  return templates;
}

/**
 * 獸獵 / 神君勢技能工藝詞綴（Grants*AspectCrafted*）：
 * Mods.dat 的 Stat1Min/Max 為 0 且描述不在一般 stat_descriptions.csd 內，
 * 因此直接依技能定義與等級建構詞綴階級並對應官方市集 explicit 代碼。
 */
export function buildPoE1AspectCraftedRecords(
  modsTable: ReadonlyArray<Record<string, any>>,
  tradeStats: Awaited<ReturnType<typeof fetchTradeStats>>
): CollectedModTierRecord[] {
  const records: CollectedModTierRecord[] = [];

  for (const mod of modsTable) {
    const modId = String(mod.Id ?? '');
    const match = modId.match(/^Grants([A-Za-z]+)AspectCrafted(\d*)$/);
    if (!match) continue;

    const aspectKey = match[1];
    const levelVal = match[2] ? Number(match[2]) : 20;
    const def = ASPECT_SKILL_DEFINITIONS[aspectKey];
    if (!def) continue;

    const groupKey = def.en.replace('{0}', '#').toLowerCase();
    const resolved =
      tradeStats.resolveStatIds(groupKey, {
        preferredCategories: ['explicit'],
        isLocal: false,
        context: [],
      }) ??
      tradeStats.resolveStatIds(`${groupKey} skill`, {
        preferredCategories: ['explicit'],
        isLocal: false,
        context: [],
      });
    const tradeId = resolved?.singleId;
    const statIds = resolved?.allIds ?? [];

    records.push({
      modId,
      affinities: ['bestiary'],
      generation_type: String(mod.GenerationType ?? 2),
      level: Number(mod.Level ?? 1),
      values: [[String(levelVal)]],
      params: [levelVal],
      types: POE1_DEFAULT_GEAR_TYPES,
      id: tradeId,
      ids: tradeId ? [tradeId] : undefined,
      statIds,
      groupKey,
      templatesByLocale: buildLocaleTemplates(def),
      legacyKey: def.en.replace('{0}', String(levelVal)),
      legacyKeyZh: def.zhTW.replace('{0}', String(levelVal)),
      legacyTemplateZh: def.zhTW.replace('{0}', '#'),
    });
  }

  return records;
}
