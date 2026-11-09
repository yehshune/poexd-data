/**
 * Live Atlas node content tokens.
 *
 * Each Atlas node in game memory carries a list of content tokens. The low 16 bits of a token are a
 * Stats row index + 1, so the numbers shift whenever a patch inserts Stats rows. These helpers derive
 * the token for every EndgameMapContent row from its first stat, and resolve the few display-only stats
 * (which have no EndgameMapContent row of their own) by their stable stat Id instead of a number.
 */

export interface ContentRowLike {
  Id?: string | null;
  Name?: string | null;
  Stats?: unknown;
}

export type ContentTarget = { row: string } | { key: string };

/** Display-only stats the live Atlas uses as content tokens, keyed by stat Id (stable across patches). */
export const DISPLAY_STAT_TOKENS: ReadonlyArray<{ statId: string; target: ContentTarget }> = [
  { statId: 'map_atlas_node_has_delirium', target: { row: 'Delirium' } },
  { statId: 'map_atlas_node_has_abyss', target: { row: 'Abyss' } },
  { statId: 'map_atlas_node_has_ritual', target: { row: 'Ritual' } },
  { statId: 'map_atlas_node_has_incursion', target: { row: 'Incursion' } },
  { statId: 'map_atlas_node_has_breach', target: { row: 'Breach' } },
  { statId: 'map_delirium_has_giga_mirror', target: { key: '1007' } },
];

/** atlas_content.json key of an EndgameMapContent row. */
export const contentKey = (rowIndex: number): string => String(100 + rowIndex);

/**
 * Content a map type always carries (EndgameMaps.MapContent, e.g. the merchant maps carry Merchant),
 * as atlas_content.json ids. The live Atlas node has no token or badge for it, so the radar reads it
 * from the map type instead.
 */
export function intrinsicContentIds(mapContent: unknown): number[] {
  if (!Array.isArray(mapContent)) return [];
  return mapContent.filter((row): row is number => Number.isInteger(row) && row >= 0).map((row) => 100 + row);
}

/**
 * Whether the Atlas shows the Deadly Map Boss icon on this map type. No table carries the icon, so this
 * mirrors what the client shows (confirmed live 0.5.5.7): every pinnacle map (including the logbook boss
 * sub-areas), and every arbiter or MapUberBoss_* map (the citadels) except their quest-area copies. The
 * pinnacle maps are quest areas too, so the quest exclusion must not apply to them.
 */
export function isDeadlyMapBoss(mapId: string, tags: ReadonlySet<string>): boolean {
  if (tags.has('pinnacle_boss')) return true;
  return !tags.has('quest') && (tags.has('arbiter') || mapId.startsWith('MapUberBoss_'));
}

function firstStat(stats: unknown): number | null {
  const first = Array.isArray(stats) ? stats[0] : stats;
  return typeof first === 'number' && Number.isInteger(first) && first >= 0 ? first : null;
}

/**
 * Returns atlas_content.json key → live tokens. A token is claimed by the first visible row whose first
 * stat produces it (hidden "[DNT]" rows never claim one), matching the order the client resolves them.
 * Throws when a display stat or its target row no longer exists, so a renamed stat fails the build
 * instead of silently dropping a category.
 */
export function buildContentTokens(
  rows: readonly ContentRowLike[],
  statIds: readonly (string | null | undefined)[],
): Map<string, number[]> {
  const tokens = new Map<string, number[]>();
  const claimed = new Set<number>();
  const add = (key: string, token: number): void => {
    if (claimed.has(token)) return;
    claimed.add(token);
    tokens.set(key, [...(tokens.get(key) ?? []), token]);
  };

  rows.forEach((row, index) => {
    if ((row.Name ?? '').startsWith('[')) return;
    const stat = firstStat(row.Stats);
    if (stat !== null) add(contentKey(index), stat + 1);
  });

  const statIndex = new Map<string, number>();
  statIds.forEach((id, index) => {
    if (id && !statIndex.has(id)) statIndex.set(id, index);
  });
  for (const { statId, target } of DISPLAY_STAT_TOKENS) {
    const index = statIndex.get(statId);
    if (index === undefined) throw new Error(`[AtlasContent] display stat not found: ${statId}`);
    let key: string;
    if ('row' in target) {
      const rowIndex = rows.findIndex((row) => row.Id === target.row);
      if (rowIndex < 0) throw new Error(`[AtlasContent] EndgameMapContent row not found: ${target.row}`);
      key = contentKey(rowIndex);
    } else {
      key = target.key;
    }
    add(key, index + 1);
  }
  return tokens;
}
