import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';
import {
  SUPPORTED_AFFIX_LOCALES,
  type SupportedAffixLocale,
} from './stat-descriptions.js';
import type { LocaleItemsShard } from './types.js';
import { TRAD_CJK_CHARS, SIMP_CJK_CHARS } from './zh-cn-data.js';

const TRAD_TO_SIMP_MAP = new Map<string, string>();
for (let i = 0; i < TRAD_CJK_CHARS.length; i++) {
  TRAD_TO_SIMP_MAP.set(TRAD_CJK_CHARS[i], SIMP_CJK_CHARS[i]);
}

const POE_ZH_TW_TO_CN_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['換界石', '引路石'],
];

export function convertTradToSimpChinese(input: string): string {
  if (!input) return input;
  let text = input;
  for (const [tw, cn] of POE_ZH_TW_TO_CN_PHRASES) {
    if (text.includes(tw)) {
      text = text.replaceAll(tw, cn);
    }
  }
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += TRAD_TO_SIMP_MAP.get(ch) ?? ch;
  }
  return out;
}

export const EXCLUDED_ITEM_CLASSES = new Set<string>([
  'Microtransaction',
  'HideoutDoodad',
  'QuestItem',
  'HiddenItem',
  'GiftBox',
  'LabyrinthTrinket',
  'Leaguestone',
  'PantheonSoul',
  'AtlasUpgradeItem',
  'HeistObjective',
  'SentinelDrone',
  'NecropolisPack',
  'CursedDucat',
  'GhostItem',
  'MysteryBox',
  'SanctumSpecialRelic',
  'ArchnemesisMod',
]);

export const DAT_LANGUAGE_BY_LOCALE: ReadonlyArray<readonly [SupportedAffixLocale, string]> = [
  ['en', 'English'],
  ['zh-TW', 'Traditional Chinese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ru', 'Russian'],
  ['de', 'German'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['th', 'Thai'],
];

function isValidItemName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[DNT]') || trimmed.includes('UNUSED')) return false;
  return true;
}

export interface BuildItemLexiconInput {
  version: 'poe1' | 'poe2';
  itemClasses: Record<string, any>[];
  baseItemTypesByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>>;
  wordsByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>>;
  uniqueStashLayout?: Record<string, any>[];
  bestiaryCapturableMonsters?: Record<string, any>[];
  monsterVarietiesByLocale?: Partial<Record<SupportedAffixLocale, Record<string, any>[]>>;
  gemEffectsByLocale?: Partial<Record<SupportedAffixLocale, Record<string, any>[]>>;
}

export function buildItemLexiconShards(
  input: BuildItemLexiconInput,
): Record<SupportedAffixLocale, LocaleItemsShard> {
  const itemClassByIndex = new Map<number, string>();
  input.itemClasses.forEach((row, idx) => {
    const indexKey = typeof row._index === 'number' ? row._index : idx;
    if (typeof row.Id === 'string') {
      itemClassByIndex.set(indexKey, row.Id);
    }
  });

  const shards = {} as Record<SupportedAffixLocale, LocaleItemsShard>;
  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    shards[locale] = { items: [] };
  }

  const seenEnglishLower = new Set<string>();

  const pushEntry = (resolveLocaleName: (locale: SupportedAffixLocale) => string | undefined) => {
    const rawEn = resolveLocaleName('en');
    if (!isValidItemName(rawEn)) return;
    const enName = rawEn.trim();
    const enLower = enName.toLowerCase();
    if (seenEnglishLower.has(enLower)) return;
    seenEnglishLower.add(enLower);

    const rawZhTw = resolveLocaleName('zh-TW');
    const zhTwName = isValidItemName(rawZhTw) ? rawZhTw.trim() : enName;

    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      if (locale === 'en') {
        shards.en.items.push(enName);
      } else if (locale === 'zh-TW') {
        shards['zh-TW'].items.push(zhTwName);
      } else if (locale === 'zh-CN') {
        const rawZhCn = resolveLocaleName('zh-CN');
        const zhCnName = isValidItemName(rawZhCn)
          ? rawZhCn.trim()
          : convertTradToSimpChinese(zhTwName);
        shards['zh-CN'].items.push(zhCnName);
      } else {
        const rawLoc = resolveLocaleName(locale);
        const locName = isValidItemName(rawLoc) ? rawLoc.trim() : enName;
        shards[locale].items.push(locName);
      }
    }
  };

  // 1. BaseItemTypes
  const baseEnRows = input.baseItemTypesByLocale.en ?? [];
  for (let i = 0; i < baseEnRows.length; i++) {
    const enRow = baseEnRows[i];
    if (!enRow) continue;
    const id = String(enRow.Id ?? '');
    if (id.includes('/Microtransaction') || id.includes('/Hideout')) continue;
    const classKey = enRow.ItemClassesKey ?? enRow.ItemClass;
    const classId = typeof classKey === 'number' ? itemClassByIndex.get(classKey) : undefined;
    if (classId && EXCLUDED_ITEM_CLASSES.has(classId)) continue;

    pushEntry((locale) => input.baseItemTypesByLocale[locale]?.[i]?.Name);
  }

  // 2. Words (Wordlist === 6: Unique item names)
  const allowedWordsSet = input.uniqueStashLayout
    ? new Set<number>(
        input.uniqueStashLayout
          .map((u) => u.WordsKey)
          .filter((k): k is number => typeof k === 'number'),
      )
    : null;

  const wordsEnRows = input.wordsByLocale.en ?? [];
  for (let i = 0; i < wordsEnRows.length; i++) {
    const enRow = wordsEnRows[i];
    if (!enRow || enRow.Wordlist !== 6) continue;
    const rowIdx = typeof enRow._index === 'number' ? enRow._index : i;
    if (allowedWordsSet && !allowedWordsSet.has(rowIdx)) {
      const hasPositiveWeight =
        Array.isArray(enRow.SpawnWeight_Values) &&
        enRow.SpawnWeight_Values.some((v: number) => v > 0);
      if (!hasPositiveWeight) continue;
    }

    pushEntry((locale) => {
      const r = input.wordsByLocale[locale]?.[i];
      return r?.Text2 || r?.Text;
    });
  }

  // 3. PoE 1 Bestiary Capturable Monsters
  if (input.bestiaryCapturableMonsters && input.monsterVarietiesByLocale?.en) {
    for (const bcmRow of input.bestiaryCapturableMonsters) {
      const mvIdx = bcmRow?.MonsterVarietiesKey;
      if (typeof mvIdx !== 'number') continue;
      pushEntry((locale) => input.monsterVarietiesByLocale?.[locale]?.[mvIdx]?.Name);
    }
  }

  // 4. PoE 1 GemEffects (Transfigured / Vaal skill gem names)
  const gemEnRows = input.gemEffectsByLocale?.en ?? [];
  for (let i = 0; i < gemEnRows.length; i++) {
    const enRow = gemEnRows[i];
    if (!enRow || !isValidItemName(enRow.Name)) continue;
    pushEntry((locale) => input.gemEffectsByLocale?.[locale]?.[i]?.Name);
  }

  return shards;
}

export async function loadAndWriteItemLexiconShards(
  loader: PoeDataLoader,
  outputDir: string,
): Promise<Record<SupportedAffixLocale, LocaleItemsShard>> {
  const version = loader.gameVersion;
  const itemClasses = await loader.loadTable('ItemClasses', { language: 'English' });

  const baseItemTypesByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>> = {};
  const wordsByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>> = {};
  const monsterVarietiesByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>> = {};
  const gemEffectsByLocale: Partial<Record<SupportedAffixLocale, Record<string, any>[]>> = {};

  await Promise.all(
    DAT_LANGUAGE_BY_LOCALE.map(async ([locale, datLang]) => {
      const [baseItemTypes, words, monsterVarieties, gemEffects] = await Promise.all([
        loader.loadTable('BaseItemTypes', { language: datLang }),
        loader.loadTable('Words', { language: datLang }),
        version === 'poe1'
          ? loader.loadTable('MonsterVarieties', { language: datLang })
          : Promise.resolve(undefined),
        version === 'poe1'
          ? loader.loadTable('GemEffects', { language: datLang })
          : Promise.resolve(undefined),
      ]);
      baseItemTypesByLocale[locale] = baseItemTypes;
      wordsByLocale[locale] = words;
      if (monsterVarieties) {
        monsterVarietiesByLocale[locale] = monsterVarieties;
      }
      if (gemEffects) {
        gemEffectsByLocale[locale] = gemEffects;
      }
    }),
  );

  const uniqueStashLayout =
    version === 'poe2'
      ? await loader.loadTable('UniqueStashLayout', { language: 'English' })
      : undefined;
  const bestiaryCapturableMonsters =
    version === 'poe1'
      ? await loader.loadTable('BestiaryCapturableMonsters', { language: 'English' })
      : undefined;

  const shards = buildItemLexiconShards({
    version,
    itemClasses,
    baseItemTypesByLocale,
    wordsByLocale,
    uniqueStashLayout,
    bestiaryCapturableMonsters,
    monsterVarietiesByLocale: version === 'poe1' ? monsterVarietiesByLocale : undefined,
    gemEffectsByLocale: version === 'poe1' ? gemEffectsByLocale : undefined,
  });

  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    await fs.writeFile(
      path.join(localeDir, 'items.json'),
      JSON.stringify(shards[locale]),
      'utf-8',
    );
  }

  return shards;
}
