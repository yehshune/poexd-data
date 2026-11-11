/**
 * PoE 1 傭兵（Mercenary Warrant）資料：Build 技能池、技能可連的輔助與輔助階級。
 *
 * 來源為遊戲 dat：MercenaryBuilds / MercenarySkills / MercenarySupports / MercenarySupportCounts。
 * 官方市集的傭兵 stat id 為 `mercenary.skill_<HASH16>` 與 `mercenary.support_<HASH16>`，
 * 只收錄官方市集認得的技能與輔助（例如 [DNT] 佔位技能會被略過）。
 *
 * 輸出分成兩份：語系無關的結構檔（mercenary.json）與以索引對齊的語系名稱檔
 * （locales/<locale>/mercenary.json）。
 */

export type MercenarySupportSlots = 'none' | 'low' | 'medium' | 'high';

export interface MercenaryBuildEntry {
  /** 官方市集 `type.option`（discriminator 為 mercenary_warrant），同時也是 dat 的 Build Id。 */
  tradeType: string;
  infamous: boolean;
  /** 一定會出現的技能（skills 索引）。 */
  core: number[];
  /** 主技能池（skills 索引），出現 mainCount 個。 */
  main: number[];
  mainCount: number;
  /** 輔助技能池（skills 索引），出現 utilityCount 個。 */
  utility: number[];
  utilityCount: number;
}

export interface MercenarySkillEntry {
  tradeId: string;
  /** 連結數等級；high 為 6 連（5 個輔助）。 */
  slots: MercenarySupportSlots;
  /** 可連的輔助（supports 索引）。 */
  supports: number[];
}

export interface MercenarySupportEntry {
  tradeId: string;
  tier: number;
  /** 同家族不同階級的輔助共用同一個 family；專屬（Gilded 等）輔助為 null。 */
  family: string | null;
}

export interface MercenaryData {
  patch: string;
  builds: MercenaryBuildEntry[];
  skills: MercenarySkillEntry[];
  supports: MercenarySupportEntry[];
}

export interface MercenaryLocaleNames {
  patch: string;
  builds: string[];
  skills: string[];
  supports: string[];
}

export interface MercenaryTables {
  builds: Record<string, any>[];
  skills: Record<string, any>[];
  supports: Record<string, any>[];
  supportFamilies: Record<string, any>[];
  supportCounts: Record<string, any>[];
}

/** 同一組 dat 列的語系名稱（索引與英文表一致）。 */
export interface MercenaryNameTables {
  builds: Record<string, any>[];
  skills: Record<string, any>[];
  supports: Record<string, any>[];
}

const SLOT_BY_COUNT_ID: Readonly<Record<string, MercenarySupportSlots>> = {
  None: 'none',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
};

function asIndexArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((v): v is number => Number.isInteger(v));
  return Number.isInteger(value) ? [value as number] : [];
}

function uniq(values: number[]): number[] {
  return [...new Set(values)];
}

export interface MercenaryBuildResult {
  data: MercenaryData;
  /** 結構檔中每筆技能 / 輔助 / Build 對應的 dat 列索引，用來產生語系名稱檔。 */
  rows: { builds: number[]; skills: number[]; supports: number[] };
  dropped: { builds: string[]; skills: string[] };
}

/**
 * 將 dat 表整理成傭兵結構資料。
 *
 * @param tradeStatIds 官方市集 stats API 的 `mercenary` 類別 id
 * @param tradeWarrantTypes 官方市集 items API 中 discriminator 為 mercenary_warrant 的 type
 */
export function buildMercenaryData(
  patch: string,
  tables: MercenaryTables,
  tradeStatIds: ReadonlySet<string>,
  tradeWarrantTypes: ReadonlySet<string>,
): MercenaryBuildResult {
  const supportRowToIndex = new Map<number, number>();
  const supports: MercenarySupportEntry[] = [];
  const supportRows: number[] = [];
  tables.supports.forEach((row, rowIndex) => {
    const tradeId = `mercenary.support_${row.HASH16}`;
    if (!tradeStatIds.has(tradeId)) return;
    supportRowToIndex.set(rowIndex, supports.length);
    supportRows.push(rowIndex);
    const familyRow = Number.isInteger(row.SupportFamily)
      ? tables.supportFamilies[row.SupportFamily]
      : undefined;
    supports.push({
      tradeId,
      tier: Number.isInteger(row.Tier) ? row.Tier : 0,
      family: typeof familyRow?.Id === 'string' && familyRow.Id ? familyRow.Id : null,
    });
  });

  const skillRowToIndex = new Map<number, number>();
  const skills: MercenarySkillEntry[] = [];
  const skillRows: number[] = [];
  const droppedSkills: string[] = [];
  tables.skills.forEach((row, rowIndex) => {
    const tradeId = `mercenary.skill_${row.HASH16}`;
    if (!tradeStatIds.has(tradeId)) {
      droppedSkills.push(String(row.Name ?? rowIndex));
      return;
    }
    skillRowToIndex.set(rowIndex, skills.length);
    skillRows.push(rowIndex);
    const countId = tables.supportCounts[row.SupportCount]?.Id;
    skills.push({
      tradeId,
      slots: SLOT_BY_COUNT_ID[countId] ?? 'none',
      supports: uniq(
        asIndexArray(row.PossibleSupports)
          .map((i) => supportRowToIndex.get(i))
          .filter((i): i is number => i !== undefined),
      ),
    });
  });

  const mapSkills = (value: unknown) =>
    uniq(
      asIndexArray(value)
        .map((i) => skillRowToIndex.get(i))
        .filter((i): i is number => i !== undefined),
    );

  const builds: MercenaryBuildEntry[] = [];
  const buildRows: number[] = [];
  const droppedBuilds: string[] = [];
  tables.builds.forEach((row, rowIndex) => {
    if (!tradeWarrantTypes.has(row.Id)) {
      droppedBuilds.push(String(row.Id));
      return;
    }
    buildRows.push(rowIndex);
    builds.push({
      tradeType: row.Id,
      infamous: row.IsInfamous === true,
      core: mapSkills(row.Skills1),
      main: mapSkills(row.Skills2),
      mainCount: Number.isInteger(row.Skills2Count) ? row.Skills2Count : 0,
      utility: mapSkills(row.Skills3),
      utilityCount: Number.isInteger(row.Skills3Count) ? row.Skills3Count : 0,
    });
  });

  return {
    data: { patch, builds, skills, supports },
    rows: { builds: buildRows, skills: skillRows, supports: supportRows },
    dropped: { builds: droppedBuilds, skills: droppedSkills },
  };
}

function pickName(localized: Record<string, any> | undefined, fallback: Record<string, any>) {
  const name = typeof localized?.Name === 'string' ? localized.Name.trim() : '';
  return name || String(fallback?.Name ?? '');
}

/** 依結構檔的 dat 列索引取出語系名稱；缺字時退回英文。 */
export function buildMercenaryLocaleNames(
  patch: string,
  rows: MercenaryBuildResult['rows'],
  english: MercenaryNameTables,
  localized: MercenaryNameTables,
): MercenaryLocaleNames {
  return {
    patch,
    builds: rows.builds.map((r) => pickName(localized.builds[r], english.builds[r])),
    skills: rows.skills.map((r) => pickName(localized.skills[r], english.skills[r])),
    supports: rows.supports.map((r) => pickName(localized.supports[r], english.supports[r])),
  };
}
