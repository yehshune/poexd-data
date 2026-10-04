import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../../cdn/loader.js';
import type { ModTierOutput } from '../common/types.js';
import { StatDescriptionIndex } from '../common/stat-descriptions.js';
import { fetchTradeStats } from '../common/trade-stats.js';
import {
  resolvePoE2GearTypes,
  POE2_ITEM_CLASS_TO_GEAR_TYPES,
  getPoE2ItemClassGearTypes,
  ALL_POE2_WEAPONS,
  ALL_POE2_ARMOUR,
} from './gear-types.js';
import { resolvePoE2Affinities } from './affinities.js';
import { writeUnmatchedReport, type UnmatchedModItem } from '../common/unmatched-reporter.js';

export async function buildModsPoE2(
  loader: PoeDataLoader,
  outputDir: string
) {
  await fs.mkdir(outputDir, { recursive: true });

  console.log('[PoE 2 Mods] [1/4] 抓取官方 Trade API Filter 檢索表...');
  const tradeStats = await fetchTradeStats('poe2');

  console.log('[PoE 2 Mods] [2/4] 自官方 CDN 載入並解析 StatDescriptions...');
  const csdBytes = await loader.getFile('data/statdescriptions/stat_descriptions.csd');
  if (!csdBytes) {
    throw new Error('無法自官方 CDN 取得 stat_descriptions.csd');
  }
  const csdText = Buffer.from(csdBytes.buffer, csdBytes.byteOffset, csdBytes.byteLength).toString('utf16le');
  const statIndex = StatDescriptionIndex.parse(csdText);

  console.log('[PoE 2 Mods] [3/4] 載入關聯 Dat 表格 (Mods, Stats, Tags, BaseItemTypes, ItemClasses, SoulCoreStats, EssenceMods, LiquidEmotionOutcomes)...');
  const [
    modsTable,
    statsTable,
    tagsTable,
    baseItemsTable,
    itemClassesTable,
    soulCoreStatsTable,
    soulCoreCatsTable,
    essenceModsTable,
    liquidOutcomesTable,
    essenceTargetCatsTable,
    essencesTable,
  ] = await Promise.all([
    loader.loadTable('Mods'),
    loader.loadTable('Stats'),
    loader.loadTable('Tags'),
    loader.loadTable('BaseItemTypes'),
    loader.loadTable('ItemClasses'),
    loader.loadTable('SoulCoreStats'),
    loader.loadTable('SoulCoreStatCategories'),
    loader.loadTable('EssenceMods'),
    loader.loadTable('LiquidEmotionOutcomes'),
    loader.loadTable('EssenceTargetItemCategories'),
    loader.loadTable('Essences'),
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

  // 1. 基底固有詞綴對應的裝備類別映射表 (BaseItemTypes.Implicit_Mods)
  const implicitModTypesMap = new Map<number, Set<string>>();
  for (const item of baseItemsTable) {
    const classId = itemClassesMap.get(item.ItemClassesKey);
    if (!classId) continue;
    const gearTypes = POE2_ITEM_CLASS_TO_GEAR_TYPES[classId];
    if (!gearTypes || gearTypes.length === 0) continue;

    const imps = (item as any).Implicit_Mods || (item as any).Implicit_ModsKeys || [];
    for (const mIdx of imps) {
      if (!implicitModTypesMap.has(mIdx)) implicitModTypesMap.set(mIdx, new Set());
      const s = implicitModTypesMap.get(mIdx)!;
      for (const gt of gearTypes) s.add(gt);
    }
  }

  // 2. 精華外鍵索引與部位映射表 (EssenceMods.dat + EssenceTargetItemCategories.dat)
  const essenceModIndices = new Set<number>();
  const perfectEssenceModIndices = new Set<number>();
  const essenceModTypesMap = new Map<number, Set<string>>();

  for (const em of essenceModsTable) {
    const ess = essencesTable[em.Essence];
    const isPerfect = ess ? ess.Perfect === true : false;
    const allModIndices = [em.Mod, em.DisplayMod, ...(em.OutcomeMods || [])].filter((x) => x != null);
    for (const mIdx of allModIndices) {
      if (isPerfect) {
        perfectEssenceModIndices.add(mIdx);
      } else {
        essenceModIndices.add(mIdx);
      }
    }

    const cat = essenceTargetCatsTable[em.TargetItemCategory];
    if (!cat || !cat.ItemClasses) continue;

    const gearTypes = new Set<string>();
    for (const icIdx of cat.ItemClasses) {
      const classId = itemClassesMap.get(icIdx);
      const gts = classId ? getPoE2ItemClassGearTypes(classId) : undefined;
      if (gts) {
        for (const gt of gts) {
          gearTypes.add(gt);
        }
      } else if (classId) {
        console.warn(`[PoE 2 Mods] 未知的精華目標 ItemClass: ${classId}`);
      }
    }
    if (gearTypes.size === 0) continue;

    for (const mIdx of allModIndices) {
      if (!essenceModTypesMap.has(mIdx)) {
        essenceModTypesMap.set(mIdx, new Set());
      }
      const set = essenceModTypesMap.get(mIdx)!;
      for (const gt of gearTypes) set.add(gt);
    }
  }

  // 3. 蒸餾情緒外鍵索引 (LiquidEmotionOutcomes.dat)
  const liquidModIndices = new Set<number>();
  for (const lo of liquidOutcomesTable) {
    for (const key of [
      'RubyPrefix',
      'RubySuffix',
      'EmeraldPrefix',
      'EmeraldSuffix',
      'SapphirePrefix',
      'SapphireSuffix',
      'DiamondPrefix',
      'DiamondSuffix',
    ]) {
      const mIdx = (lo as any)[key];
      if (mIdx != null) liquidModIndices.add(mIdx);
    }
  }

  console.log(`[PoE 2 Mods] [4/4] 運算裝備與物品詞綴階級 (共 ${modsTable.length} 筆原始 Mod 定義)...`);

  const modsData: Record<string, ModTierOutput[]> = {};
  const modsIdData: Record<string, ModTierOutput[]> = {};

  let processedCount = 0;
  let matchedTradeIdCount = 0;
  const unmatchedList: UnmatchedModItem[] = [];

  // 允許的 Domain 集合: 裝備(1)、藥劑與護符(2)、聖物(8)、珠寶(11)、換界石與石碑(28)
  const allowedDomains = new Set([1, 2, 8, 11, 28]);
  // 允許的 GenerationType 集合: 固有(0)、前綴(1)、後綴(2)、瓦爾腐化(5)、符文(14, 15)
  const allowedGenTypes = new Set([0, 1, 2, 5, 14, 15]);

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
      types = resolvePoE2GearTypes(spawnWeights, mod.Domain);

      // 若該詞綴屬於精華外鍵關聯詞綴，合併精華目標部位
      if (essenceModTypesMap.has(modIdx)) {
        const essenceTypes = essenceModTypesMap.get(modIdx)!;
        const mergedTypes = new Set([...types, ...essenceTypes]);
        types = Array.from(mergedTypes);
      }
    }

    if (types.length === 0) continue;

    // 收集該 Mod 包含的所有活躍數值欄位 (支援複合詞綴聯合解析)
    const activeStats: Array<{ id: string; min: number; max: number }> = [];
    for (let slot = 1; slot <= 8; slot++) {
      const statIdx = (mod as any)[`Stat${slot}`];
      if (statIdx == null) continue;
      const statId = statsMap.get(statIdx);
      if (!statId) continue;

      const valArr = (mod as any)[`Stat${slot}Value`] || [0, 0];
      const min = Number(valArr[0]) || 0;
      const max = Number(valArr[1]) || 0;
      if (min === 0 && max === 0) continue;

      activeStats.push({ id: statId, min, max });
    }

    if (activeStats.length === 0) continue;

    // 透過 StatDescriptionIndex 聯合解析
    const rendered = statIndex.renderMod(activeStats);
    if (!rendered) continue;

    // 依據機制偏好選取 Trade Stat 類別
    const isDesecratedCandidate = mod.Id?.startsWith('AbyssMod');
    const preferredCategories: string[] = [];
    if (isDesecratedCandidate) {
      preferredCategories.push('desecrated');
    } else if (mod.GenerationType === 5) {
      preferredCategories.push('enchant');
    } else if (types.some((t) => t.includes('relic'))) {
      preferredCategories.push('sanctum');
    } else if (isBaseImplicit || mod.GenerationType === 0) {
      preferredCategories.push('implicit', 'explicit');
    } else {
      preferredCategories.push('explicit');
    }

    const isLocal = activeStats.some((s) => s.id.startsWith('local_'));
    const contexts: string[] = [];
    if (types.some((t) => t.includes('charm'))) contexts.push('charm');
    if (types.some((t) => t.includes('flask'))) contexts.push('flask');
    if (types.some((t) => t.includes('shield'))) contexts.push('shields');

    const resolvedIds = tradeStats.resolveStatIds(rendered.template, {
      preferredCategories,
      isLocal,
      context: contexts,
    });
    const tradeId = resolvedIds?.singleId;
    const tradeIds = resolvedIds?.splitIds;
    const tradeCategory = resolvedIds?.allIds[0]?.split('.')[0];

    // 方案 B：由 Trade 官方類別、官方 Dat 表格外鍵與符文機制標籤自動推導屬性標籤
    const activeTags = spawnWeights.filter((sw) => sw.weight > 0).map((sw) => sw.tag);
    const affinities = resolvePoE2Affinities(
      modIdx,
      mod,
      { essenceModIndices, perfectEssenceModIndices, liquidModIndices },
      tradeCategory,
      activeTags
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

  // 處理 SoulCoreStats 符文詞綴 (socketable 與 bonded)
  for (const sc of soulCoreStatsTable) {
    const catIdx = sc.StatCategory;
    const cat = soulCoreCatsTable[catIdx];
    let catTypes: string[] = [];
    if (cat) {
      const targetClassIndices: number[] = cat.TargetItemClasses || [];
      const typeSet = new Set<string>();
      for (const tci of targetClassIndices) {
        const cId = itemClassesMap.get(tci);
        const gts = cId ? getPoE2ItemClassGearTypes(cId) : undefined;
        if (gts) {
          for (const gt of gts) typeSet.add(gt);
        }
      }
      if (typeSet.size === 0 && cat.Id) {
        const lowerId = cat.Id.toLowerCase();
        if (lowerId.includes('weapon') || lowerId.includes('all')) {
          for (const gt of ALL_POE2_WEAPONS) typeSet.add(gt);
        }
        if (lowerId.includes('armour') || lowerId.includes('all')) {
          for (const gt of ALL_POE2_ARMOUR) typeSet.add(gt);
        }
      }
      catTypes = Array.from(typeSet);
    }
    if (catTypes.length === 0) continue;

    // 處理 socketable 數值 (增幅)
    if (sc.Stats && sc.Stats.length > 0) {
      const activeStats: Array<{ id: string; min: number; max: number }> = [];
      for (let i = 0; i < sc.Stats.length; i++) {
        const sId = statsMap.get(sc.Stats[i]);
        const val = sc.StatsValues?.[i] ?? 0;
        if (sId) activeStats.push({ id: sId, min: val, max: val });
      }
      if (activeStats.length > 0) {
        const rendered = statIndex.renderMod(activeStats);
        if (rendered) {
          const isLocal = activeStats.some((s) => s.id.startsWith('local_'));
          const resolvedIds = tradeStats.resolveStatIds(rendered.template, {
            preferredCategories: ['rune'],
            isLocal,
          });
          const tradeId = resolvedIds?.singleId;
          const tradeIds = resolvedIds?.splitIds;

          const tierItem: ModTierOutput = {
            affinities: ['socketable'],
            generation_type: '0',
            key: rendered.key,
            key_zh: rendered.key_zh,
            template_zh: rendered.template_zh,
            level: '1',
            values: rendered.values,
            types: catTypes,
            id: tradeId,
            ids: tradeIds || (tradeId ? [tradeId] : undefined),
          };
          if (!modsData[rendered.template]) modsData[rendered.template] = [];
          modsData[rendered.template].push(tierItem);
          if (resolvedIds && resolvedIds.allIds.length > 0) {
            for (const statId of resolvedIds.allIds) {
              if (!modsIdData[statId]) modsIdData[statId] = [];
              modsIdData[statId].push(tierItem);
            }
            matchedTradeIdCount++;
          } else {
            unmatchedList.push({
              modId: `SoulCore_${sc._index}_socketable`,
              template: rendered.template,
              template_zh: rendered.template_zh,
              key: rendered.key,
              key_zh: rendered.key_zh,
              types: catTypes,
              affinities: ['socketable'],
              level: '1',
            });
          }
          processedCount++;
        }
      }
    }

    // 處理 bonded 數值 (命定詞綴)
    if (sc.BondedStats && sc.BondedStats.length > 0) {
      const activeStats: Array<{ id: string; min: number; max: number }> = [];
      for (let i = 0; i < sc.BondedStats.length; i++) {
        const sId = statsMap.get(sc.BondedStats[i]);
        const val = sc.BondedStatsValues?.[i] ?? 0;
        if (sId) activeStats.push({ id: sId, min: val, max: val });
      }
      if (activeStats.length > 0) {
        const rendered = statIndex.renderMod(activeStats);
        if (rendered) {
          const isLocal = activeStats.some((s) => s.id.startsWith('local_'));
          const resolvedIds = tradeStats.resolveStatIds(rendered.template, {
            preferredCategories: ['rune'],
            context: 'bonded',
            isLocal,
          });
          const tradeId = resolvedIds?.singleId;
          const tradeIds = resolvedIds?.splitIds;

          const tierItem: ModTierOutput = {
            affinities: ['bonded'],
            generation_type: '0',
            key: rendered.key,
            key_zh: rendered.key_zh,
            template_zh: rendered.template_zh,
            level: '1',
            values: rendered.values,
            types: catTypes,
            id: tradeId,
            ids: tradeIds || (tradeId ? [tradeId] : undefined),
          };
          if (!modsData[rendered.template]) modsData[rendered.template] = [];
          modsData[rendered.template].push(tierItem);
          if (resolvedIds && resolvedIds.allIds.length > 0) {
            for (const statId of resolvedIds.allIds) {
              if (!modsIdData[statId]) modsIdData[statId] = [];
              modsIdData[statId].push(tierItem);
            }
            matchedTradeIdCount++;
          } else {
            unmatchedList.push({
              modId: `SoulCore_${sc._index}_bonded`,
              template: rendered.template,
              template_zh: rendered.template_zh,
              key: rendered.key,
              key_zh: rendered.key_zh,
              types: catTypes,
              affinities: ['bonded'],
              level: '1',
            });
          }
          processedCount++;
        }
      }
    }
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

  console.log(`[PoE 2 Mods] 完成！共轉換 ${processedCount} 筆詞綴階級，成功映射 ${matchedTradeIdCount} 筆 Trade Stat ID`);
  console.log(`  -> 寫入: ${modsDataFile} (共 ${Object.keys(modsData).length} 個屬性分組範本)`);
  console.log(`  -> 寫入: ${modsIdDataFile} (共 ${Object.keys(modsIdData).length} 個 Trade Stat IDs)`);

  await writeUnmatchedReport('poe2', outputDir, processedCount, matchedTradeIdCount, unmatchedList);
}
