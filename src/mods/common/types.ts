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
  typeTable: string[][];
  groups: string[];
  tiers: CompactModTier[];
}

export interface LocaleStatsShard {
  templates: string[];
  tierTemplates: number[];
  statTemplates: Record<string, number>;
}

export interface LocaleItemsShard {
  items: string[];
}
