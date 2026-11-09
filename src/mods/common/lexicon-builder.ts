import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  CompactModTier,
  LocaleStatsShard,
  ModTierOutput,
  ModsTiersArtifact,
} from './types.js';
import {
  SUPPORTED_AFFIX_LOCALES,
  renderGenericTemplate,
  renderTierKey,
  type SupportedAffixLocale,
} from './stat-descriptions.js';

export interface CollectedModTierRecord {
  modId: string;
  affinities: string[];
  generation_type: string;
  level: number;
  values: string[][];
  params: ReadonlyArray<number | readonly [number, number] | readonly number[]>;
  types: string[];
  id?: string;
  ids?: string[];
  statIds: string[];
  groupKey: string;
  templatesByLocale: Record<SupportedAffixLocale, string>;
  weight?: Record<string, number>;
  legacyKey?: string;
  legacyKeyZh?: string;
  legacyTemplateZh?: string;
}

export interface BuiltModsLexiconArtifacts {
  modsTiers: ModsTiersArtifact;
  shardsByLocale: Record<SupportedAffixLocale, LocaleStatsShard>;
}

function compactParams(
  params: ReadonlyArray<number | readonly [number, number] | readonly number[]>
): (number | [number, number])[] {
  return params.map((p) => {
    if (typeof p === 'number') return p;
    if (p.length === 1 || p[0] === p[1]) return p[0];
    return [p[0], p[1]] as [number, number];
  });
}

export function buildModsLexiconArtifacts(
  records: ReadonlyArray<CollectedModTierRecord>
): BuiltModsLexiconArtifacts {
  const typeTable: string[][] = [];
  const typeKeyToIdx = new Map<string, number>();

  const groups: string[] = [];
  const groupKeyToIdx = new Map<string, number>();

  // Preserve group discovery order from original record sequence
  for (const rec of records) {
    if (!groupKeyToIdx.has(rec.groupKey)) {
      groupKeyToIdx.set(rec.groupKey, groups.length);
      groups.push(rec.groupKey);
    }
    const typeKey = JSON.stringify(rec.types);
    if (!typeKeyToIdx.has(typeKey)) {
      typeKeyToIdx.set(typeKey, typeTable.length);
      typeTable.push([...rec.types]);
    }
  }

  // Stable sort by level ascending so any subsequence (by groupIdx or by statId)
  // matches legacy per-bucket stable sort `a.level - b.level`
  const indexedRecords = records.map((rec, origIdx) => ({ rec, origIdx }));
  indexedRecords.sort((a, b) => a.rec.level - b.rec.level || a.origIdx - b.origIdx);

  const tiers: CompactModTier[] = [];
  for (const { rec } of indexedRecords) {
    const groupIdx = groupKeyToIdx.get(rec.groupKey)!;
    const typeIdx = typeKeyToIdx.get(JSON.stringify(rec.types))!;
    const compactTier: CompactModTier = {
      modId: rec.modId,
      level: rec.level,
      params: compactParams(rec.params),
      values: rec.values,
      groupIdx,
      typeIdx,
      affinities: rec.affinities,
      generation_type: rec.generation_type,
    };
    if (rec.id !== undefined) compactTier.id = rec.id;
    const defaultIds = rec.id !== undefined ? [rec.id] : undefined;
    const isIdsDefault =
      rec.ids === undefined ||
      (defaultIds !== undefined &&
        rec.ids.length === 1 &&
        rec.ids[0] === defaultIds[0]);
    if (!isIdsDefault && rec.ids !== undefined) {
      compactTier.ids = rec.ids;
    }

    const effectiveIds = compactTier.ids ?? defaultIds ?? [];
    const isStatIdsDefault =
      rec.statIds.length === effectiveIds.length &&
      rec.statIds.every((sid, i) => sid === effectiveIds[i]);
    if (!isStatIdsDefault && rec.statIds.length > 0) {
      compactTier.statIds = rec.statIds;
    }
    if (rec.weight !== undefined) compactTier.weight = rec.weight;
    tiers.push(compactTier);
  }

  const shardsByLocale = {} as Record<SupportedAffixLocale, LocaleStatsShard>;

  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    const templates: string[] = [];
    const templateToIdx = new Map<string, number>();
    const tierTemplates: number[] = [];
    const statTemplates: Record<string, number> = {};

    for (const { rec } of indexedRecords) {
      const tmpl = rec.templatesByLocale[locale] ?? rec.templatesByLocale['en'] ?? '';
      let tmplIdx = templateToIdx.get(tmpl);
      if (tmplIdx === undefined) {
        tmplIdx = templates.length;
        templates.push(tmpl);
        templateToIdx.set(tmpl, tmplIdx);
      }
      tierTemplates.push(tmplIdx);

      // The first tier encountered for a statId (after sorting by level ascending)
      // defines the primary stat template for translateStat(statId)
      for (const statId of rec.statIds) {
        if (statTemplates[statId] === undefined) {
          statTemplates[statId] = tmplIdx;
        }
      }
    }

    shardsByLocale[locale] = {
      templates,
      tierTemplates,
      statTemplates,
    };
  }

  return {
    modsTiers: {
      typeTable,
      groups,
      tiers,
    },
    shardsByLocale,
  };
}

export function reconstructLegacyModsArtifacts(
  modsTiers: ModsTiersArtifact,
  enShard: LocaleStatsShard,
  zhShard: LocaleStatsShard
): {
  modsData: Record<string, ModTierOutput[]>;
  modsIdData: Record<string, ModTierOutput[]>;
} {
  const modsData: Record<string, ModTierOutput[]> = {};
  const modsIdData: Record<string, ModTierOutput[]> = {};

  for (const groupKey of modsTiers.groups) {
    modsData[groupKey] = [];
  }

  for (let tierIdx = 0; tierIdx < modsTiers.tiers.length; tierIdx++) {
    const cTier = modsTiers.tiers[tierIdx];
    const groupKey = modsTiers.groups[cTier.groupIdx];
    const types = modsTiers.typeTable[cTier.typeIdx] || [];
    const enRawTemplate = enShard.templates[enShard.tierTemplates[tierIdx]] || '';
    const zhRawTemplate = zhShard.templates[zhShard.tierTemplates[tierIdx]] || enRawTemplate;

    const tierItem: ModTierOutput = {
      affinities: cTier.affinities,
      generation_type: cTier.generation_type,
      key: renderTierKey(enRawTemplate, cTier.params, 'en'),
      key_zh: renderTierKey(zhRawTemplate, cTier.params, 'zh-TW'),
      template_zh: renderGenericTemplate(zhRawTemplate, 'zh-TW'),
      level: String(cTier.level),
      values: cTier.values,
      types,
      id: cTier.id,
      ids: cTier.ids ?? (cTier.id ? [cTier.id] : undefined),
    };

    if (!modsData[groupKey]) {
      modsData[groupKey] = [];
    }
    modsData[groupKey].push(tierItem);

    const statIds = cTier.statIds || cTier.ids || (cTier.id ? [cTier.id] : []);
    for (const statId of statIds) {
      if (!modsIdData[statId]) {
        modsIdData[statId] = [];
      }
      modsIdData[statId].push(tierItem);
    }
  }

  return { modsData, modsIdData };
}

export async function writeModsLexiconArtifacts(
  outputDir: string,
  modsTiers: ModsTiersArtifact,
  shardsByLocale: Record<SupportedAffixLocale, LocaleStatsShard>,
  patch: string
): Promise<{ modsTiersFile: string; localeFiles: string[] }> {
  await fs.mkdir(outputDir, { recursive: true });
  const modsTiersFile = path.join(outputDir, 'mods-tiers.json');
  await fs.writeFile(modsTiersFile, JSON.stringify({ patch, ...modsTiers }), 'utf-8');

  const localeFiles: string[] = [];
  for (const locale of SUPPORTED_AFFIX_LOCALES) {
    const localeDir = path.join(outputDir, 'locales', locale);
    await fs.mkdir(localeDir, { recursive: true });
    const localeFile = path.join(localeDir, 'stats.json');
    await fs.writeFile(localeFile, JSON.stringify({ patch, ...shardsByLocale[locale] }), 'utf-8');
    localeFiles.push(localeFile);
  }

  return { modsTiersFile, localeFiles };
}
