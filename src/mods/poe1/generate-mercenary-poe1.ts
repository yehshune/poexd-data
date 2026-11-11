import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';
import { DAT_LANGUAGE_BY_LOCALE } from '../common/item-lexicon.js';
import { fetchTradeStats } from '../common/trade-stats.js';
import { fetchTradeItems, TRADE_ITEMS_URLS } from '../common/zh-cn-trade-names.js';
import {
  buildMercenaryData,
  buildMercenaryLocaleNames,
  type MercenaryNameTables,
} from './mercenary.js';

const WARRANT_DISCRIMINATOR = 'mercenary_warrant';

async function loadNameTables(loader: PoeDataLoader, language: string): Promise<MercenaryNameTables> {
  const [builds, skills, supports] = await Promise.all([
    loader.loadTable('MercenaryBuilds', { language }),
    loader.loadTable('MercenarySkills', { language }),
    loader.loadTable('MercenarySupports', { language }),
  ]);
  return { builds, skills, supports };
}

/**
 * 產出 poe1/mercenary.json 與 poe1/locales/<locale>/mercenary.json。
 * zh-CN 沒有對應的 dat 語系，名稱檔退回英文（執行期會再退回 UI 語系）。
 */
export async function buildMercenaryPoE1(loader: PoeDataLoader, outputDir: string): Promise<void> {
  const patch = loader.patchVersion;
  const [tradeStats, tradeItems, english, supportFamilies, supportCounts] = await Promise.all([
    fetchTradeStats('poe1', patch),
    fetchTradeItems(
      TRADE_ITEMS_URLS.poe1.international,
      path.join(process.cwd(), '.cache', 'trade_items_poe1_international.json'),
    ),
    loadNameTables(loader, 'English'),
    loader.loadTable('MercenarySupportFamilies'),
    loader.loadTable('MercenarySupportCounts'),
  ]);
  if (!tradeItems) throw new Error('無法取得官方市集物品資料，無法對應傭兵 Build');

  const tradeStatIds = new Set(
    (tradeStats.rawData.result ?? [])
      .filter((category) => category.id === 'mercenary')
      .flatMap((category) => category.entries.map((entry) => entry.id)),
  );
  const tradeWarrantTypes = new Set(
    tradeItems.result
      .flatMap((category) => category.entries)
      .filter((entry) => entry.disc === WARRANT_DISCRIMINATOR)
      .map((entry) => entry.type),
  );

  const { data, rows, dropped } = buildMercenaryData(
    patch,
    {
      builds: english.builds,
      skills: english.skills,
      supports: english.supports,
      supportFamilies,
      supportCounts,
    },
    tradeStatIds,
    tradeWarrantTypes,
  );

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'mercenary.json'), JSON.stringify(data), 'utf-8');

  for (const [locale, datLang] of DAT_LANGUAGE_BY_LOCALE) {
    const localized = datLang === 'English' ? english : await loadNameTables(loader, datLang);
    const names = buildMercenaryLocaleNames(patch, rows, english, localized);
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    await fs.writeFile(path.join(localeDir, 'mercenary.json'), JSON.stringify(names), 'utf-8');
  }

  console.log(
    `  -> 傭兵資料: ${data.builds.length} 個 Build、${data.skills.length} 個技能、${data.supports.length} 個輔助`,
  );
  if (dropped.builds.length > 0) {
    console.log(`  -> 略過官方市集沒有的 Build: ${dropped.builds.join(', ')}`);
  }
  if (dropped.skills.length > 0) {
    console.log(`  -> 略過官方市集沒有的技能: ${dropped.skills.join(', ')}`);
  }
}
