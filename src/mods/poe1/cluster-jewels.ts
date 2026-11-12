import type { CollectedModTierRecord } from '../common/lexicon-builder.js';

const SIZE_IN_MOD_ID = /(Large|Medium|Small)/;

/**
 * 星團珠寶的插槽數等詞綴沒有出現權重標籤，尺寸只寫在詞綴 ID（JewelExpansionJewelNodesLarge2___）。
 * 有尺寸時回傳該尺寸的類別，否則回傳 null（沿用全部尺寸）。
 */
export function clusterSizeTypesFromModId(modId: string): string[] | null {
  const size = modId.match(SIZE_IN_MOD_ID)?.[1];
  return size ? ['cluster_jewel', `${size.toLowerCase()}_cluster_jewel`] : null;
}

export interface ClusterBaseNodes {
  size: string;
  min: number;
  max: number;
}

export interface RenderedNodeCount {
  template: string;
  templatesByLocale: CollectedModTierRecord['templatesByLocale'];
  values: string[][];
  params: number[][];
}

/**
 * 星團珠寶的天賦數是底材屬性（PassiveTreeExpansionJewels.MinNodes/MaxNodes），不是詞綴；
 * 市集以附魔「Adds # Passive Skills」篩選。每種尺寸產生一筆附魔階級。
 */
export function buildClusterPassiveCountRecords(
  bases: ReadonlyArray<ClusterBaseNodes>,
  render: (min: number, max: number) => RenderedNodeCount | null,
  tradeId: string
): CollectedModTierRecord[] {
  return bases.flatMap(({ size, min, max }) => {
    const rendered = render(min, max);
    if (!rendered) return [];
    return [
      {
        modId: `PassiveTreeExpansionJewels${size}`,
        affinities: ['enchant'],
        generation_type: '10',
        level: 1,
        values: rendered.values,
        params: rendered.params,
        types: ['cluster_jewel', `${size.toLowerCase()}_cluster_jewel`],
        id: tradeId,
        ids: [tradeId],
        statIds: [tradeId],
        groupKey: rendered.template,
        templatesByLocale: rendered.templatesByLocale,
      },
    ];
  });
}
