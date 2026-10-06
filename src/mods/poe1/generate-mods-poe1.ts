import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';
import type { ModTierOutput } from '../common/types.js';
import { StatDescriptionIndex } from '../common/stat-descriptions.js';
import { fetchTradeStats } from '../common/trade-stats.js';
import { resolvePoE1GearTypes, POE1_ITEM_CLASS_TO_GEAR_TYPES } from './gear-types.js';
import { resolvePoE1Affinities } from './affinities.js';
import { writeUnmatchedReport, type UnmatchedModItem } from '../common/unmatched-reporter.js';

export async function buildModsPoE1(
  loader: PoeDataLoader,
  outputDir: string
) {
  await fs.mkdir(outputDir, { recursive: true });

  console.log('[PoE 1 Mods] [1/4] 抓取官方 Trade API Filter 檢索表...');
  const tradeStats = await fetchTradeStats('poe1', loader.patchVersion);

  console.log('[PoE 1 Mods] [2/4] 自官方 CDN 載入並解析 StatDescriptions...');
  const txtBytes = await loader.getFile('metadata/statdescriptions/stat_descriptions.txt');
  if (!txtBytes) {
    throw new Error('無法自官方 CDN 取得 stat_descriptions.txt');
  }
  const txtContent = Buffer.from(txtBytes.buffer, txtBytes.byteOffset, txtBytes.byteLength).toString('utf16le');
  const statIndex = StatDescriptionIndex.parse(txtContent);

  console.log('[PoE 1 Mods] [3/4] 載入關聯 Dat 表格 (Mods, Stats, Tags, BaseItemTypes, ItemClasses, Essences, DelveCraftingModifiers)...');
  const [
    modsTable,
    statsTable,
    tagsTable,
    baseItemsTable,
    itemClassesTable,
    essencesTable,
    delveTable,
  ] = await Promise.all([
    loader.loadTable('Mods'),
    loader.loadTable('Stats'),
    loader.loadTable('Tags'),
    loader.loadTable('BaseItemTypes'),
    loader.loadTable('ItemClasses'),
    loader.loadTable('Essences'),
    loader.loadTable('DelveCraftingModifiers'),
  ]);

  const statsMap = new Map<number, string>();
  statsTable.forEach((row, idx) => {
    if (row.Id) statsMap.set(idx, row.Id);
  });

  const tagsMap = new Map<number, string>();
  tagsTable.forEach((row, idx) => {
    if (row.Id) tagsMap.set(idx, row.Id);
  });

  const itemClassesMap = new Map<number, string>();
  itemClassesTable.forEach((row, idx) => {
    if (row.Id) itemClassesMap.set(idx, row.Id);
  });

  // 1. 基底固有詞綴對應的裝備類別映射表 (BaseItemTypes.Implicit_ModsKeys)
  const implicitModTypesMap = new Map<number, Set<string>>();
  for (const item of baseItemsTable) {
    const classId = itemClassesMap.get(item.ItemClassesKey);
    if (!classId) continue;
    const gearTypes = POE1_ITEM_CLASS_TO_GEAR_TYPES[classId];
    if (!gearTypes || gearTypes.length === 0) continue;

    const imps = (item as any).Implicit_ModsKeys || (item as any).Implicit_Mods || [];
    for (const mIdx of imps) {
      if (!implicitModTypesMap.has(mIdx)) implicitModTypesMap.set(mIdx, new Set());
      const s = implicitModTypesMap.get(mIdx)!;
      for (const gt of gearTypes) s.add(gt);
    }
  }

  // 2. 精華外鍵與部位索引 (Essences.dat)
  const essenceModIndices = new Set<number>();
  const essenceModTypesMap = new Map<number, Set<string>>();
  const essenceFieldToGearTypes: Record<string, string[]> = {
    Helmet_ModsKey: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int'],
    BodyArmour_ModsKey: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
    Boots_ModsKey: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int'],
    Gloves_ModsKey: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int'],
    Bow_ModsKey: ['bow', 'bows'],
    Wand_ModsKey: ['wand', 'wands'],
    Staff_ModsKey: ['staff', 'staves'],
    TwoHandSword_ModsKey: ['two-hand-sword', 'two_hand_swords'],
    TwoHandAxe_ModsKey: ['two-hand-axe', 'two_hand_axes'],
    TwoHandMace_ModsKey: ['two-hand-mace', 'two_hand_maces'],
    Claw_ModsKey: ['claw', 'claws'],
    Dagger_ModsKey: ['dagger', 'daggers'],
    OneHandSword_ModsKey: ['one-hand-sword', 'one_hand_swords'],
    OneHandThrustingSword_ModsKey: ['one-hand-sword', 'one_hand_swords'],
    OneHandAxe_ModsKey: ['one-hand-axe', 'one_hand_axes'],
    OneHandMace_ModsKey: ['one-hand-mace', 'one_hand_maces'],
    Sceptre_ModsKey: ['sceptre', 'sceptres'],
    Belt_ModsKey: ['belt', 'belts'],
    Amulet_ModsKey: ['amulet', 'amulets'],
    Ring_ModsKey: ['ring', 'rings'],
    Shield_ModsKey: ['shield', 'shields_str', 'shields_str_dex', 'shields_str_int', 'bucklers'],
  };

  for (const row of essencesTable) {
    for (const [key, gearTypes] of Object.entries(essenceFieldToGearTypes)) {
      const mIdx = (row as any)[key];
      if (mIdx != null) {
        essenceModIndices.add(mIdx);
        if (!essenceModTypesMap.has(mIdx)) essenceModTypesMap.set(mIdx, new Set());
        const s = essenceModTypesMap.get(mIdx)!;
        gearTypes.forEach((t) => s.add(t));
      }
    }
  }

  // 3. 掘獄化石外鍵索引 (DelveCraftingModifiers.dat)
  const delveModIndices = new Set<number>();
  for (const row of delveTable) {
    for (const mIdx of ((row as any).AddedModsKeys || (row as any).AddedMods || [])) {
      if (mIdx != null) delveModIndices.add(mIdx);
    }
    for (const mIdx of ((row as any).ForcedAddModsKeys || (row as any).ForcedAddMods || [])) {
      if (mIdx != null) delveModIndices.add(mIdx);
    }
  }

  console.log(`[PoE 1 Mods] [4/4] 運算裝備與物品詞綴階級 (共 ${modsTable.length} 筆原始 Mod 定義)...`);

  const modsData: Record<string, ModTierOutput[]> = {};
  const modsIdData: Record<string, ModTierOutput[]> = {};

  let processedCount = 0;
  let matchedTradeIdCount = 0;
  const unmatchedList: UnmatchedModItem[] = [];

  // 允許的 Domain 集合: 裝備(1)、藥劑(2)、工藝(9)、珠寶(10)、深淵珠寶(13)
  const allowedDomains = new Set([1, 2, 9, 10, 13]);
  // 允許的 GenerationType 集合: 固有(0, 3)、前綴(1)、後綴(2)、瓦爾腐化(5)
  const allowedGenTypes = new Set([0, 1, 2, 3, 5]);

  for (let modIdx = 0; modIdx < modsTable.length; modIdx++) {
    const mod = modsTable[modIdx];
    const isBaseImplicit = implicitModTypesMap.has(modIdx);

    if (!allowedDomains.has(mod.Domain)) continue;
    if (!isBaseImplicit && !allowedGenTypes.has(mod.GenerationType)) continue;

    // 解析裝備部位標籤
    let types: string[] = [];
    const spawnWeights: Array<{ tag: string; weight: number }> = [];

    if (isBaseImplicit) {
      types = Array.from(implicitModTypesMap.get(modIdx)!);
    } else {
      const tagIndices = (mod as any).SpawnWeight_TagsKeys || (mod as any).SpawnWeight_Tags || [];
      const tagWeights = mod.SpawnWeight_Values || [];
      for (let i = 0; i < tagIndices.length; i++) {
        const tagIdx = tagIndices[i];
        const weight = tagWeights[i];
        const tagName = tagsMap.get(tagIdx);
        if (tagName) {
          spawnWeights.push({ tag: tagName, weight });
        }
      }
      types = resolvePoE1GearTypes(spawnWeights, mod.Domain);
    }

    // 若詞綴無自然掉落部位，但屬於精華專屬詞綴，由精華外鍵關聯補全部位
    if (types.length === 0 && essenceModTypesMap.has(modIdx)) {
      types = Array.from(essenceModTypesMap.get(modIdx)!);
    }

    if (types.length === 0) continue;

    // 收集該 Mod 包含的所有活躍數值欄位 (PoE 1 欄位為 StatsKey 與 StatMin / StatMax)
    const activeStats: Array<{ id: string; min: number; max: number }> = [];
    for (let slot = 1; slot <= 8; slot++) {
      const statIdx = (mod as any)[`StatsKey${slot}`] ?? (mod as any)[`Stat${slot}`];
      if (statIdx == null) continue;
      const statId = statsMap.get(statIdx);
      if (!statId) continue;

      let min = 0;
      let max = 0;
      if ((mod as any)[`Stat${slot}Min`] != null) {
        min = Number((mod as any)[`Stat${slot}Min`]) || 0;
        max = Number((mod as any)[`Stat${slot}Max`]) || 0;
      } else if ((mod as any)[`Stat${slot}Value`]) {
        min = Number((mod as any)[`Stat${slot}Value`][0]) || 0;
        max = Number((mod as any)[`Stat${slot}Value`][1]) || 0;
      }

      if (min === 0 && max === 0) continue;

      activeStats.push({ id: statId, min, max });
    }

    if (activeStats.length === 0) continue;

    // 透過 StatDescriptionIndex 聯合解析
    const rendered = statIndex.renderMod(activeStats);
    if (!rendered) continue;

    // 偏好 Trade Stat 類別選取
    const preferredCategories: string[] = [];
    if (mod.GenerationType === 5) {
      preferredCategories.push('implicit');
    } else if (mod.Domain === 9 || mod.Domain === 28) {
      preferredCategories.push('crafted', 'explicit');
    } else if (isBaseImplicit || mod.GenerationType === 0 || mod.GenerationType === 3) {
      preferredCategories.push('implicit', 'explicit');
    } else if (delveModIndices.has(modIdx)) {
      preferredCategories.push('delve', 'explicit');
    } else {
      preferredCategories.push('explicit');
    }

    const isLocal = activeStats.some((s) => s.id.startsWith('local_'));
    const contexts: string[] = [];
    if (types.some((t) => t.includes('shield'))) contexts.push('shields');
    if (types.some((t) => t.includes('stave') || t.includes('staff'))) contexts.push('staves');
    if (types.some((t) => t.includes('flask'))) contexts.push('flask');

    const resolvedIds = tradeStats.resolveStatIds(rendered.template, {
      preferredCategories,
      isLocal,
      context: contexts,
      ruleStatIds: rendered.ruleStatIds,
    });
    const tradeId = resolvedIds?.singleId;
    const tradeIds = resolvedIds?.splitIds;
    const tradeCategory = resolvedIds?.allIds[0]?.split('.')[0];

    // 方案 B：由 Trade 官方類別與官方 Dat 表格外鍵自動推導屬性標籤
    const isNaturalDrop = types.length > 0 && !isBaseImplicit && (mod.GenerationType === 1 || mod.GenerationType === 2);
    const affinities = resolvePoE1Affinities(
      modIdx,
      mod,
      { essenceModIndices, delveModIndices },
      tradeCategory,
      isNaturalDrop,
      spawnWeights
    );

    const tierItem: ModTierOutput = {
      affinities,
      generation_type: isBaseImplicit ? '0' : String(mod.GenerationType),
      key: rendered.key,
      key_zh: rendered.key_zh,
      template_zh: rendered.template_zh,
      level: String(mod.Level ?? 1),
      values: rendered.values,
      types,
      id: tradeId,
      ids: tradeIds || (tradeId ? [tradeId] : undefined),
    };

    // 歸類至 mods-data (以 template 為 key)
    if (!modsData[rendered.template]) {
      modsData[rendered.template] = [];
    }
    modsData[rendered.template].push(tierItem);

    // 歸類至 mods-id-data (以 Trade Stat ID 為 key)
    if (resolvedIds && resolvedIds.allIds.length > 0) {
      for (const statId of resolvedIds.allIds) {
        if (!modsIdData[statId]) {
          modsIdData[statId] = [];
        }
        modsIdData[statId].push(tierItem);
      }
      matchedTradeIdCount++;
    } else {
      unmatchedList.push({
        modId: mod.Id,
        template: rendered.template,
        template_zh: rendered.template_zh,
        key: rendered.key,
        key_zh: rendered.key_zh,
        types,
        affinities,
        level: String(mod.Level ?? 1),
      });
    }

    processedCount++;
  }

  // 對各個 Tier 列表按等級排序
  for (const tmpl in modsData) {
    modsData[tmpl].sort((a, b) => Number(a.level) - Number(b.level));
  }
  for (const id in modsIdData) {
    modsIdData[id].sort((a, b) => Number(a.level) - Number(b.level));
  }

  const modsDataFile = path.join(outputDir, 'mods-data.json');
  const modsIdDataFile = path.join(outputDir, 'mods-id-data.json');

  await fs.writeFile(modsDataFile, JSON.stringify(modsData, null, 2), 'utf-8');
  await fs.writeFile(modsIdDataFile, JSON.stringify(modsIdData, null, 2), 'utf-8');

  console.log(`[PoE 1 Mods] 完成！共轉換 ${processedCount} 筆詞綴階級，成功映射 ${matchedTradeIdCount} 筆 Trade Stat ID`);
  console.log(`  -> 寫入: ${modsDataFile} (共 ${Object.keys(modsData).length} 個屬性分組範本)`);
  console.log(`  -> 寫入: ${modsIdDataFile} (共 ${Object.keys(modsIdData).length} 個 Trade Stat IDs)`);

  await writeUnmatchedReport('poe1', outputDir, processedCount, matchedTradeIdCount, unmatchedList);
}
