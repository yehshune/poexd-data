import * as fs from 'fs/promises';
import type { PoeDataLoader } from '../../cdn/loader.js';
import { StatDescriptionIndex } from '../common/stat-descriptions.js';
import {
  buildModsLexiconArtifacts,
  writeModsLexiconArtifacts,
  type CollectedModTierRecord,
} from '../common/lexicon-builder.js';
import { loadAndWriteItemLexiconShards } from '../common/item-lexicon.js';
import { fetchTradeStats } from '../common/trade-stats.js';
import {
  resolvePoE1GearTypes,
  getPoE1ItemClassGearTypes,
  POE1_DEFAULT_GEAR_TYPES,
  resolveRecombinatorSpecialGearTypes,
  resolveHarvestQualityGearTypes
} from './gear-types.js';
import { resolvePoE1Affinities } from './affinities.js';
import {
  applySpecialBaseKeys,
  buildPoE1BaseProfiles,
  classifyPoE1Base,
  isSpecialBaseKey,
  resolveDomainProfileKeys,
  type BaseRecord,
} from './base-profiles.js';
import { writeUnmatchedReport, type UnmatchedModItem } from '../common/unmatched-reporter.js';

export async function buildModsPoE1(
  loader: PoeDataLoader,
  outputDir: string
) {
  await fs.mkdir(outputDir, { recursive: true });

  console.log('[PoE 1 Mods] [1/4] 抓取官方 Trade API Filter 檢索表...');
  const tradeStats = await fetchTradeStats('poe1', loader.patchVersion);

  console.log('[PoE 1 Mods] [2/4] 自官方 CDN 載入並解析 StatDescriptions (包含地圖、聖物、塗劑與劫盜)...');
  const [
    baseDescBytes,
    mapDescBytes,
    sanctumDescBytes,
    tinctureDescBytes,
    heistDescBytes,
  ] = await Promise.all([
    loader.getFile('metadata/statdescriptions/stat_descriptions.txt'),
    loader.getFile('metadata/statdescriptions/map_stat_descriptions.txt'),
    loader.getFile('metadata/statdescriptions/sanctum_relic_stat_descriptions.txt'),
    loader.getFile('metadata/statdescriptions/tincture_stat_descriptions.txt'),
    loader.getFile('metadata/statdescriptions/heist_equipment_stat_descriptions.txt'),
  ]);

  if (!baseDescBytes) {
    throw new Error('無法自官方 CDN 取得 stat_descriptions.txt');
  }

  const toStr = (b: Uint8Array | null) =>
    b ? Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf16le') : '';

  const combinedDesc = [
    toStr(baseDescBytes),
    toStr(mapDescBytes),
    toStr(sanctumDescBytes),
    toStr(tinctureDescBytes),
    toStr(heistDescBytes),
  ].filter(Boolean).join('\n\n');

  const statIndex = StatDescriptionIndex.parse(combinedDesc);

  console.log('[PoE 1 Mods] [3/4] 載入關聯 Dat 表格 (Mods, Stats, Tags, BaseItemTypes, ItemClasses, Essences, DelveCraftingModifiers, CraftingBenchOptions, CraftingItemClassCategories)...');
  const [
    modsTable,
    statsTable,
    tagsTable,
    baseItemsTable,
    itemClassesTable,
    essencesTable,
    delveTable,
    craftingBenchTable,
    craftingCategoriesTable,
  ] = await Promise.all([
    loader.loadTable('Mods'),
    loader.loadTable('Stats'),
    loader.loadTable('Tags'),
    loader.loadTable('BaseItemTypes'),
    loader.loadTable('ItemClasses'),
    loader.loadTable('Essences'),
    loader.loadTable('DelveCraftingModifiers'),
    loader.loadTable('CraftingBenchOptions'),
    loader.loadTable('CraftingItemClassCategories'),
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

  // 0. 基底輪廓：依各基底實際標籤評估詞綴（藥劑、珠寶、劫盜裝備與特殊基底）
  const baseRecords: BaseRecord[] = [];
  for (const item of baseItemsTable) {
    const classId = itemClassesMap.get(item.ItemClassesKey);
    const name = (item as any).Name as string | undefined;
    if (!classId || !name) continue;
    const tagKeys: number[] = (item as any).TagsKeys ?? (item as any).Tags ?? [];
    const tags = tagKeys.map((k) => tagsMap.get(k)).filter((t): t is string => !!t);
    baseRecords.push({ classId, name, tags });
  }
  const baseProfiles = buildPoE1BaseProfiles(baseRecords);

  // 1. 基底固有詞綴對應的裝備類別映射表 (BaseItemTypes.Implicit_ModsKeys)
  const implicitModTypesMap = new Map<number, Set<string>>();
  for (const item of baseItemsTable) {
    const classId = itemClassesMap.get(item.ItemClassesKey);
    if (!classId) continue;
    const gearTypes = resolveImplicitGearTypes(classId, (item as any).Name ?? '', item, tagsMap);
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
    Helmet_ModsKey: ['helmet', 'helmets_str', 'helmets_dex', 'helmets_int', 'helmets_str_dex', 'helmets_str_int', 'helmets_dex_int', 'helmets_ward'],
    BodyArmour_ModsKey: ['body-armour', 'body_armours_str', 'body_armours_dex', 'body_armours_int', 'body_armours_str_dex', 'body_armours_str_int', 'body_armours_dex_int'],
    Boots_ModsKey: ['boots', 'boots_str', 'boots_dex', 'boots_int', 'boots_str_dex', 'boots_str_int', 'boots_dex_int', 'boots_ward'],
    Gloves_ModsKey: ['gloves', 'gloves_str', 'gloves_dex', 'gloves_int', 'gloves_str_dex', 'gloves_str_int', 'gloves_dex_int', 'gloves_ward'],
    Bow_ModsKey: ['bow'],
    Wand_ModsKey: ['wand', 'wands_minion'],
    Staff_ModsKey: ['staff', 'warstaff'],
    TwoHandSword_ModsKey: ['two-hand-sword'],
    TwoHandAxe_ModsKey: ['two-hand-axe'],
    TwoHandMace_ModsKey: ['two-hand-mace'],
    Claw_ModsKey: ['claw'],
    Dagger_ModsKey: ['dagger', 'rune-dagger'],
    OneHandSword_ModsKey: ['one-hand-sword'],
    OneHandThrustingSword_ModsKey: ['one-hand-sword', 'thrusting-one-hand-sword'],
    OneHandAxe_ModsKey: ['one-hand-axe'],
    OneHandMace_ModsKey: ['one-hand-mace'],
    Sceptre_ModsKey: ['sceptre'],
    Belt_ModsKey: ['belt'],
    Amulet_ModsKey: ['amulet'],
    Ring_ModsKey: ['ring', 'rings_minion', 'unset_ring'],
    Shield_ModsKey: ['shield', 'shields_str', 'shields_dex', 'shields_int', 'shields_str_dex', 'shields_str_int', 'shields_dex_int', 'shields_minion'],
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

  // 4. 工藝台外鍵索引 (CraftingBenchOptions.dat -> CraftingItemClassCategories.dat -> ItemClasses.dat)
  const benchModTypesMap = new Map<number, Set<string>>();
  for (const benchRow of craftingBenchTable) {
    const modIdx = (benchRow as any).AddModKey ?? (benchRow as any).AddMod;
    if (modIdx == null) continue;

    const catKeys = (benchRow as any).CraftingItemClassCategoriesKeys ?? (benchRow as any).CraftingItemClassCategories;
    if (!catKeys || !Array.isArray(catKeys)) continue;

    for (const catIdx of catKeys) {
      const catRow = craftingCategoriesTable[catIdx];
      if (!catRow) continue;
      const icKeys = (catRow as any).ItemClassesKeys ?? (catRow as any).ItemClasses;
      if (!icKeys || !Array.isArray(icKeys)) continue;

      for (const icIdx of icKeys) {
        const itemClassRow = itemClassesTable[icIdx];
        if (!itemClassRow || !itemClassRow.Id) continue;
        const gearTypes = getPoE1ItemClassGearTypes(itemClassRow.Id);
        if (gearTypes) {
          if (!benchModTypesMap.has(modIdx)) benchModTypesMap.set(modIdx, new Set());
          const gearTypeSet = benchModTypesMap.get(modIdx)!;
          for (const gearType of gearTypes) gearTypeSet.add(gearType);
        }
      }
    }
  }

  console.log(`[PoE 1 Mods] [4/4] 運算裝備與物品詞綴階級 (共 ${modsTable.length} 筆原始 Mod 定義)...`);

  const collectedRecords: CollectedModTierRecord[] = [];

  let processedCount = 0;
  let matchedTradeIdCount = 0;
  const unmatchedList: UnmatchedModItem[] = [];

  // 允許的 Domain 集合: 裝備(1)、藥劑(2)、地圖(5)、聖物(7, 32)、工藝(9)、珠寶(10)、深淵珠寶(13)、掘獄(16)、星團珠寶(21)、劫盜契約(22)、劫盜裝備(23)、盜賊飾品(24)、密教工藝(28)、熔爐地圖(33)、獵魔塗劑(34)、傭兵(41)、深水神君(42)
  const allowedDomains = new Set([1, 2, 5, 7, 9, 10, 13, 16, 21, 22, 23, 24, 28, 32, 33, 34, 41, 42]);
  // 允許的 GenerationType 集合: 固有(0, 3)、前綴(1)、後綴(2)、瓦爾腐化(5)、地圖附魔(8)、附魔(10)、塗油(19)、藥劑附魔(21, 22)、譫妄層數(23)、灼烙總督古靈(28)、吞噬天地古靈(29)、T17地圖(36)
  const allowedGenTypes = new Set([0, 1, 2, 3, 5, 8, 10, 19, 21, 22, 23, 28, 29, 36]);

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
      const profileKeys = resolveDomainProfileKeys(spawnWeights, mod.Domain, baseProfiles);
      if (profileKeys && (profileKeys.length > 0 || mod.Domain === 2)) {
        types = profileKeys;
      } else if (profileKeys) {
        // 沒有一般基底能骰出（傳奇、星團附魔、劫盜成員專屬等），沿用網域預設類別
        types = resolvePoE1GearTypes(spawnWeights, mod.Domain);
      } else {
        types = resolvePoE1GearTypes(spawnWeights, mod.Domain);
        if (mod.Domain === 1 && spawnWeights.length > 0) {
          types = applySpecialBaseKeys(types, spawnWeights, baseProfiles);
        }
      }
    }

    // 若詞綴無自然掉落部位，但屬於精華專屬詞綴，由精華外鍵關聯補全部位
    if (types.length === 0 && essenceModTypesMap.has(modIdx)) {
      types = Array.from(essenceModTypesMap.get(modIdx)!);
    }

    // 若詞綴無自然掉落部位，但屬於藏身處大師工藝台詞綴，由工藝台外鍵關聯補全部位
    if (types.length === 0 && benchModTypesMap.has(modIdx)) {
      types = Array.from(benchModTypesMap.get(modIdx)!);
    }

    // 重組裝置專屬詞綴依部位精準補全
    if (types.length === 0 && mod.Id?.startsWith('RecombinatorSpecial')) {
      types = resolveRecombinatorSpecialGearTypes(mod.Id);
    }

    // 豐收/劫盜替代品質附魔依武器/防具精準補全
    if (types.length === 0 && mod.Id?.startsWith('HarvestAlternate')) {
      types = resolveHarvestQualityGearTypes(mod.Id);
    }

    // 枯疫防禦塔附魔補全為戒指/護身符
    if (types.length === 0 && mod.GenerationType === 19) {
      types = ['ring', 'amulet'];
    }

    // 藥劑附魔補全為所有藥劑類別
    if (types.length === 0 && (mod.GenerationType === 21 || mod.GenerationType === 22)) {
      types = ALL_POE1_FLASK_KEYS;
    }

    // 獵魔工藝勢技能 (Aspect Skills) 補全為全裝備部位
    if (types.length === 0 && mod.Id?.includes('AspectCrafted')) {
      types = POE1_DEFAULT_GEAR_TYPES;
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
    if (mod.Domain === 7 || mod.Domain === 32) {
      preferredCategories.push('sanctum', 'explicit', 'implicit');
    } else if (mod.GenerationType === 8 || [10, 19, 21, 22].includes(mod.GenerationType) || mod.Id?.startsWith('HarvestAlternate')) {
      preferredCategories.push('enchant', 'explicit');
    } else if (mod.GenerationType === 5) {
      preferredCategories.push('implicit');
    } else if (mod.GenerationType === 28 || mod.GenerationType === 29) {
      preferredCategories.push('implicit', 'explicit');
    } else if (mod.Domain === 9 || mod.Domain === 28) {
      preferredCategories.push('crafted', 'explicit');
    } else if (isBaseImplicit || mod.GenerationType === 0 || mod.GenerationType === 3) {
      preferredCategories.push('implicit', 'explicit');
    } else if (delveModIndices.has(modIdx) || mod.Domain === 16) {
      preferredCategories.push('delve', 'explicit');
    } else {
      preferredCategories.push('explicit');
    }

    const isLocal = activeStats.some((s) => s.id.startsWith('local_'));
    const contexts: string[] = [];
    if (types.some((t) => t.includes('shield'))) contexts.push('shields');
    if (types.some((t) => t.includes('stave') || t.includes('staff'))) contexts.push('staves');
    if (types.some((t) => t.includes('flask'))) contexts.push('flask');

    let resolvedIds = tradeStats.resolveStatIds(rendered.template, {
      preferredCategories,
      isLocal,
      context: contexts,
      ruleStatIds: rendered.ruleStatIds,
    });

    if (!resolvedIds && (mod.Domain === 5 || mod.Domain === 22) && rendered.template.includes('|||||')) {
      const primaryPart = rendered.template.split('|||||')[0].trim();
      resolvedIds = tradeStats.resolveStatIds(primaryPart, {
        preferredCategories,
        isLocal,
        context: contexts,
        ruleStatIds: rendered.ruleStatIds ? [rendered.ruleStatIds[0]] : undefined,
      });
    }

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

    const statIds = resolvedIds?.allIds || [];
    collectedRecords.push({
      modId: String(mod.Id || `Mod_${modIdx}`),
      affinities,
      generation_type: isBaseImplicit ? '0' : String(mod.GenerationType),
      level: Number(mod.Level ?? 1),
      values: rendered.values,
      params: rendered.params,
      types,
      id: tradeId,
      ids: tradeIds || (tradeId ? [tradeId] : undefined),
      statIds,
      groupKey: rendered.template,
      templatesByLocale: rendered.templatesByLocale,
      legacyKey: rendered.key,
      legacyKeyZh: rendered.key_zh,
      legacyTemplateZh: rendered.template_zh,
    });

    if (statIds.length > 0) {
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

  const { modsTiers, shardsByLocale } = buildModsLexiconArtifacts(collectedRecords);
  const { modsTiersFile, localeFiles } = await writeModsLexiconArtifacts(
    outputDir,
    modsTiers,
    shardsByLocale,
    loader.patchVersion
  );

  console.log(`[PoE 1 Mods] 完成！共轉換 ${processedCount} 筆詞綴階級，成功映射 ${matchedTradeIdCount} 筆 Trade Stat ID`);
  console.log(`  -> 寫入: ${modsTiersFile} (共 ${modsTiers.groups.length} 個屬性分組範本, ${modsTiers.typeTable.length} 種部位組合)`);
  console.log(`  -> 寫入: ${localeFiles.length} 份語系詞綴分片 (locales/*/stats.json)`);

  const itemShards = await loadAndWriteItemLexiconShards(loader, outputDir);
  console.log(`  -> 寫入: 11 份語系物品名稱分片 (locales/*/items.json, 共 ${itemShards.en.items.length} 筆物品名稱)`);

  await writeUnmatchedReport('poe1', outputDir, processedCount, matchedTradeIdCount, unmatchedList);
}

const ALL_POE1_FLASK_KEYS = ['flask', 'life-flask', 'mana-flask', 'hybrid-flask', 'utility-flask', 'iron-flask'];

/**
 * 固有詞綴的類別：網域基底（藥劑、珠寶、劫盜）用基底分類；
 * 特殊基底只保留自己的子類別，一般基底不帶任何特殊子類別。
 */
function resolveImplicitGearTypes(
  classId: string,
  name: string,
  item: unknown,
  tagsMap: Map<number, string>,
): string[] | undefined {
  const tagKeys: number[] = (item as any).TagsKeys ?? (item as any).Tags ?? [];
  const tags = tagKeys.map((k) => tagsMap.get(k)).filter((t): t is string => !!t);
  const classification = classifyPoE1Base(classId, name, tags);
  if (classification && 'keys' in classification) return classification.keys;

  const classTypes = getPoE1ItemClassGearTypes(classId);
  if (!classTypes) return undefined;
  const generic = classTypes.filter((t) => !isSpecialBaseKey(t));
  return classification && 'special' in classification ? [...generic, classification.special] : generic;
}
