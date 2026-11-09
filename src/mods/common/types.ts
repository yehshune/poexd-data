export interface ModTierOutput {
  affinities: string[];
  generation_type: string;
  key: string;
  key_zh: string;
  template_zh: string;
  level: string;
  values: string[][];
  types: string[];
  id?: string;
  ids?: string[];
}

export interface CompactModTier {
  modId: string;
  level: number;
  params: (number | [number, number])[];
  values: string[][];
  groupIdx: number;
  typeIdx: number;
  affinities: string[];
  generation_type: string;
  id?: string;
  ids?: string[];
  statIds?: string[];
  weight?: Record<string, number>;
}

export interface ModsTiersArtifact {
  /** 產生此檔的遊戲 patch；各分片與 mods-tiers 以索引對齊，載入端據此確認來自同一次建置 */
  patch?: string;
  typeTable: string[][];
  groups: string[];
  tiers: CompactModTier[];
}

export interface LocaleStatsShard {
  /** 產生此檔的遊戲 patch；各分片與 mods-tiers 以索引對齊，載入端據此確認來自同一次建置 */
  patch?: string;
  templates: string[];
  tierTemplates: number[];
  statTemplates: Record<string, number>;
}

export interface LocaleItemsShard {
  /** 產生此檔的遊戲 patch；各分片與 mods-tiers 以索引對齊，載入端據此確認來自同一次建置 */
  patch?: string;
  items: string[];
}
