import * as fs from 'fs/promises';
import * as path from 'path';
import { PoeDataLoader } from '../cdn/loader.js';

export const ARBITER_OF_ASH_MAPS = new Set([
  'MapUberBoss_CopperCitadel', // 青銅城塞
  'MapUberBoss_IronCitadel',   // 鋼鐵城塞
  'MapUberBoss_StoneCitadel',  // 岩石城塞
]);

export const ARBITER_OF_DIVINITY_MAPS = new Set([
  'MapMothersoul_Male',
  'MapMothersoul_Female',
  'MapMothersoul_Male_Quest',
  'MapMothersoul_Female_Quest',
]);

export function prettifyId(code: string): string {
  let s = code;
  if (s.startsWith('Map')) {
    s = s.substring(3);
  }
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

export async function buildAtlasMaps(
  loader: PoeDataLoader,
  outputPath = path.join(process.cwd(), 'output', 'atlas_maps.json')
): Promise<Record<string, any>> {
  console.log('[AtlasMaps] 載入關聯資料表 (英文 & 繁體中文)...');
  const [
    endgameMaps,
    worldAreasEn,
    worldAreasZh,
    mapPins,
    contentSets,
    mods,
    tags,
    monstersEn,
    monstersZh
  ] = await Promise.all([
    loader.loadTable('EndgameMaps'),
    loader.loadTable('WorldAreas'),
    loader.loadTable('WorldAreas', { language: 'Traditional Chinese' }),
    loader.loadTable('EndgameMapPins'),
    loader.loadTable('EndgameMapContentSet'),
    loader.loadTable('Mods'),
    loader.loadTable('Tags'),
    loader.loadTable('MonsterVarieties'),
    loader.loadTable('MonsterVarieties', { language: 'Traditional Chinese' })
  ]);

  console.log(`[AtlasMaps] 開始拼裝資料 (共 ${endgameMaps.length} 筆地圖)...`);
  const result: Record<string, any> = {};

  for (const rowEn of endgameMaps) {
    if (rowEn.WorldArea == null) continue;
    const waEn = worldAreasEn[rowEn.WorldArea];
    if (!waEn) continue;

    const mapId = waEn.Id;
    const mapIdLower = mapId.toLowerCase();
    const waZh = worldAreasZh[rowEn.WorldArea] ?? null;

    const fallbackName = prettifyId(mapId);
    const nameEn = waEn.Name || fallbackName;
    const nameZh = (waZh?.Name) || nameEn;

    const isUniqueMapArea = Boolean(waEn.IsUniqueMapArea) || mapIdLower.includes('unique');
    const isHideout = Boolean(waEn.IsHideout) || mapIdLower.includes('hideout');

    const pinObj = rowEn.MapPin != null ? mapPins[rowEn.MapPin] : null;
    const pinId = pinObj?.Id || '';

    const contentSetObj = rowEn.MapContentSet != null ? contentSets[rowEn.MapContentSet] : null;
    const contentSetId = contentSetObj?.Id || '';

    const areaMods = ((waEn.AreaMods || []) as number[])
      .map((idx) => mods[idx]?.Id)
      .filter(Boolean) as string[];

    const waTags = ((waEn.Tags || []) as number[])
      .map((idx) => tags[idx]?.Id)
      .filter(Boolean) as string[];

    const tagsSet = new Set<string>();

    // (a) 灰燼仲裁者
    if (ARBITER_OF_ASH_MAPS.has(mapId)) {
      tagsSet.add('arbiter_of_ash');
      tagsSet.add('arbiter');
    }

    // (b) 神聖仲裁者
    if (ARBITER_OF_DIVINITY_MAPS.has(mapId)) {
      tagsSet.add('arbiter_of_divinity');
      tagsSet.add('arbiter');
    }

    // (c) MapContentSet == "QuestAreaOnly" -> traverse
    if (contentSetId === 'QuestAreaOnly') {
      tagsSet.add('traverse');
    }

    // (d) AreaMods 有 "MapIsQuestArea" -> quest
    if (areaMods.includes('MapIsQuestArea')) {
      tagsSet.add('quest');
    }

    // (e) AreaMods 有 "MapPinnacleNoExperienceGainOrLoss" -> pinnacle_boss
    if (areaMods.includes('MapPinnacleNoExperienceGainOrLoss')) {
      tagsSet.add('pinnacle_boss');
    }

    // (f) MapPin 包含 "Logbook" -> GrandExpedition
    if (pinId.includes('Logbook')) {
      tagsSet.add('GrandExpedition');
    }

    // (g) Lineage 血脈
    if (pinId.startsWith('Hidden')) {
      tagsSet.add('lineage');
    }

    // (h) Hideout 藏身處
    if (isHideout) {
      tagsSet.add('hideout');
    }

    // (i) 高塔 (原生 WorldArea Tags 包含 "map_tower")
    if (waTags.includes('map_tower')) {
      tagsSet.add('tower');
    }

    // (j) 傳奇地圖
    if (isUniqueMapArea) {
      tagsSet.add('unique');
    }

    const bossList: Array<{ id: string; name: string; name_en: string }> = [];
    if (Array.isArray(waEn.Bosses_MonsterVarietiesKeys)) {
      for (const bIdx of waEn.Bosses_MonsterVarietiesKeys) {
        const bEn = monstersEn[bIdx];
        if (!bEn) continue;
        const bZh = monstersZh[bIdx] ?? null;

        const rawId = bEn.Id.split('/').pop() || '';
        const bId = rawId.replace(/^BossMap_|^Boss_|^Boss/, '');
        const bNameEn = bEn.Name || bId;
        const bNameZh = (bZh?.Name) || bNameEn;

        bossList.push({
          id: bId,
          name: bNameZh,
          name_en: bNameEn
        });
      }
    }

    const entry: Record<string, any> = {
      name: nameEn,
      group: 'map',
      IsUniqueMapArea: isUniqueMapArea,
      IsHideout: isHideout,
      tags: Array.from(tagsSet).sort(),
      translates: {
        english: nameEn,
        'traditional chinese': nameZh
      }
    };

    if (bossList.length > 0) {
      entry.bosses = bossList;
    }

    result[mapId] = entry;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[AtlasMaps] 已寫入: ${outputPath} (共 ${Object.keys(result).length} 筆地圖)`);
  return result;
}
