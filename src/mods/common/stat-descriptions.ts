export const SUPPORTED_AFFIX_LOCALES = [
  'en',
  'zh-TW',
  'zh-CN',
  'ja',
  'ko',
  'ru',
  'de',
  'fr',
  'es',
  'pt',
  'th',
] as const;

export type SupportedAffixLocale = (typeof SUPPORTED_AFFIX_LOCALES)[number];

export const GGG_LANG_TO_LOCALE: Readonly<Record<string, SupportedAffixLocale>> = Object.freeze({
  English: 'en',
  'Traditional Chinese': 'zh-TW',
  'Simplified Chinese': 'zh-CN',
  Japanese: 'ja',
  Korean: 'ko',
  Russian: 'ru',
  German: 'de',
  French: 'fr',
  Spanish: 'es',
  Portuguese: 'pt',
  Thai: 'th',
});

export interface StatRuleVariant {
  conditions: Array<{ min: number; max: number }>;
  format: string;
  negatedIndices: Set<number>; // 0-indexed parameter indices to negate
  // 0-indexed parameter index -> 依序套用之無號數值換算處理器名稱 (例如 per_minute_to_per_second)
  valueHandlers: Map<number, string[]>;
}

const roundTo = (value: number, dp: number): number => {
  const factor = 10 ** dp;
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
  // 消除 IEEE 754 浮點尾數 (例如 23.100000000000005) 並避免 -0
  const normalized = Number(rounded.toFixed(dp));
  return normalized === 0 ? 0 : normalized;
};

const truncate = (value: number): number => {
  const t = Math.trunc(value);
  return t === 0 ? 0 : t;
};

/**
 * stat_descriptions 尾端數值處理器 (`<handler> <1-based index>`) 的無號換算邏輯。
 * 條件比對 (`findMatchingVariant`) 一律使用 Mods.datc64 原始整數，僅於輸出顯示數值時套用。
 * 取負部分 (negate / negate_and_double / divide_by_one_hundred_and_negate) 由 negatedIndices 處理。
 */
export const STAT_VALUE_HANDLERS: Readonly<Record<string, (value: number) => number>> = Object.freeze({
  negate_and_double: (v: number) => v * 2,
  divide_by_one_hundred_and_negate: (v: number) => roundTo(v / 100, 2),
  per_minute_to_per_second: (v: number) => roundTo(v / 60, 1),
  per_minute_to_per_second_0dp: (v: number) => roundTo(v / 60, 0),
  per_minute_to_per_second_1dp: (v: number) => roundTo(v / 60, 1),
  per_minute_to_per_second_2dp: (v: number) => roundTo(v / 60, 2),
  per_minute_to_per_second_2dp_if_required: (v: number) => roundTo(v / 60, 2),
  'permyriad_per_minute_to_%_per_second': (v: number) => roundTo(v / 6000, 2),
  milliseconds_to_seconds: (v: number) => roundTo(v / 1000, 2),
  milliseconds_to_seconds_0dp: (v: number) => roundTo(v / 1000, 0),
  milliseconds_to_seconds_1dp: (v: number) => roundTo(v / 1000, 1),
  milliseconds_to_seconds_2dp: (v: number) => roundTo(v / 1000, 2),
  milliseconds_to_seconds_2dp_if_required: (v: number) => roundTo(v / 1000, 2),
  deciseconds_to_seconds: (v: number) => roundTo(v / 10, 2),
  divide_by_ten_0dp: (v: number) => truncate(v / 10),
  divide_by_ten_1dp: (v: number) => roundTo(v / 10, 1),
  divide_by_ten_1dp_if_required: (v: number) => roundTo(v / 10, 1),
  locations_to_metres: (v: number) => roundTo(v / 10, 1),
  divide_by_one_hundred: (v: number) => roundTo(v / 100, 2),
  divide_by_one_hundred_1dp: (v: number) => roundTo(v / 100, 1),
  divide_by_one_hundred_2dp: (v: number) => roundTo(v / 100, 2),
  divide_by_one_hundred_2dp_if_required: (v: number) => roundTo(v / 100, 2),
  divide_by_one_thousand: (v: number) => roundTo(v / 1000, 3),
  divide_by_two_0dp: (v: number) => truncate(v / 2),
  divide_by_three: (v: number) => roundTo(v / 3, 2),
  divide_by_four: (v: number) => roundTo(v / 4, 2),
  divide_by_five: (v: number) => roundTo(v / 5, 1),
  divide_by_six: (v: number) => roundTo(v / 6, 1),
  divide_by_twelve: (v: number) => roundTo(v / 12, 2),
  divide_by_fifteen_0dp: (v: number) => truncate(v / 15),
  divide_by_twenty: (v: number) => roundTo(v / 20, 2),
  divide_by_twenty_then_double_0dp: (v: number) => truncate(v / 20) * 2,
  divide_by_fifty: (v: number) => roundTo(v / 50, 2),
  double: (v: number) => v * 2,
  times_one_point_five: (v: number) => roundTo(v * 1.5, 1),
  times_twenty: (v: number) => v * 20,
  plus_two_hundred: (v: number) => v + 200,
  add_one: (v: number) => v + 1,
  subtract_one: (v: number) => v - 1,
  multiplicative_damage_modifier: (v: number) => v + 100,
  '60%_of_value': (v: number) => roundTo(v * 0.6, 1),
  '30%_of_value': (v: number) => roundTo(v * 0.3, 1),
  old_leech_percent: (v: number) => roundTo(v / 5, 2),
  old_leech_permyriad: (v: number) => roundTo(v / 500, 2),
});

const NEGATING_HANDLERS: ReadonlySet<string> = new Set([
  'negate',
  'negate_and_double',
  'divide_by_one_hundred_and_negate',
]);

export function applyValueHandlers(value: number, handlers: readonly string[] | undefined): number {
  if (!handlers || handlers.length === 0) return value;
  let v = value;
  for (const name of handlers) {
    const fn = STAT_VALUE_HANDLERS[name];
    if (fn) v = fn(v);
  }
  return v;
}

export interface StatDescriptionRule {
  index: number;
  statIds: string[];
  enVariants: StatRuleVariant[];
  zhVariants: StatRuleVariant[];
  variantsByLocale: Map<SupportedAffixLocale, StatRuleVariant[]>;
}

export interface RenderedLine {
  ruleIndex: number;
  key: string;
  key_zh: string;
  template: string;
  template_zh: string;
  values: string[][];
  params: number[][];
  rawVariantsByLocale: Record<SupportedAffixLocale, { format: string; negatedIndices: Set<number> }>;
  consumedStatIds: string[];
  ruleStatIds: string[];
}

export interface RenderedModResult {
  key: string;
  key_zh: string;
  template: string;
  template_zh: string;
  values: string[][];
  params: number[][];
  templatesByLocale: Record<SupportedAffixLocale, string>;
  ruleStatIds: string[][];
}

export function cleanMarkup(text: string, isNonAscii = false): string {
  if (!text) return '';
  // 在 GGG 的 stat_descriptions 格式中：
  // [Link|Display] 的真實顯示文字一律在 '|' 之後 (例如 [EnergyShield|Energy Shield] 或 [EnergyShield|能量護盾])
  let s = text.replace(/\[(?:[^|\]]*\|)?([^\]]+)\]/g, '$1');
  // 處理少數缺少 | 分隔線的二代中文特殊標籤，如 [ContainsDelirium譫妄之鏡]
  if (isNonAscii) {
    s = s.replace(/\[[A-Za-z0-9_]+([^\x00-\x7f][^\]]*)\]/g, '$1');
  }
  return s.trim();
}

export function normalizeLineFormat(
  format: string,
  negatedIndices: Set<number>,
  allStatsLen: number,
  paramOffset: number
): string {
  return format.replace(/\{(\d+)(?::(\+d|d))?\}/g, (match, idxStr, fmt) => {
    const i = parseInt(idxStr, 10);
    if (i < 0 || i >= allStatsLen) return match;
    const p = paramOffset + i;
    const neg = negatedIndices.has(i);
    const signed = fmt === '+d';
    if (signed) return neg ? `{${p}:+n}` : `{${p}:+d}`;
    return neg ? `{${p}:n}` : `{${p}:d}`;
  });
}

export function renderGenericTemplate(rawTemplate: string, locale: SupportedAffixLocale | string): string {
  return rawTemplate
    .split('|||||')
    .map((line) => {
      const s = line
        .replace(/\{\d+:\+[dn]\}/g, '+#')
        .replace(/\{\d+:[dn]\}/g, '#');
      return (locale === 'en' ? s.toLowerCase() : s)
        .replace(/^\+/, '')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .join('|||||');
}

export function renderTierKey(
  rawTemplate: string,
  params: ReadonlyArray<number | readonly [number, number] | readonly number[]>,
  locale: SupportedAffixLocale | string
): string {
  return rawTemplate
    .split('|||||')
    .map((line) => {
      const s = line.replace(/\{(\d+):(\+d|\+n|d|n)\}/g, (match, idxStr, fmt) => {
        const p = parseInt(idxStr, 10);
        const param = params[p];
        if (param === undefined) return match;
        let min = typeof param === 'number' ? param : param[0];
        let max = typeof param === 'number' ? param : param.length > 1 ? param[1] : param[0];
        if (fmt === '+n' || fmt === 'n') {
          min = -min;
          max = -max;
          if (min > max) {
            const tmp = min;
            min = max;
            max = tmp;
          }
        }
        if (fmt === '+d' || fmt === '+n') {
          return min === max ? (min >= 0 ? `+${min}` : `${min}`) : `+(${min}-${max})`;
        }
        return min === max ? `${min}` : `(${min}-${max})`;
      });
      return locale === 'en' ? s.toLowerCase().trim() : s.trim();
    })
    .join('|||||');
}

function parseCondition(condStr: string): { min: number; max: number } {
  if (condStr === '#') return { min: -Infinity, max: Infinity };
  if (condStr.includes('|')) {
    const [lo, hi] = condStr.split('|');
    return {
      min: lo === '#' ? -Infinity : Number(lo),
      max: hi === '#' ? Infinity : Number(hi),
    };
  }
  const val = Number(condStr);
  return { min: val, max: val };
}

function parseVariantLine(rawLine: string, isNonAscii: boolean, statCount: number): StatRuleVariant | null {
  const trimmed = rawLine.trim();
  const firstQuote = trimmed.indexOf('"');
  const lastQuote = trimmed.lastIndexOf('"');
  if (firstQuote === -1 || lastQuote === -1 || firstQuote >= lastQuote) return null;

  const condPart = trimmed.slice(0, firstQuote).trim();
  const textPart = trimmed.slice(firstQuote + 1, lastQuote);
  const tailPart = trimmed.slice(lastQuote + 1).trim();

  const conditionTokens = condPart.split(/\s+/).filter(Boolean);
  const conditions = conditionTokens.slice(0, statCount).map(parseCondition);
  while (conditions.length < statCount) {
    conditions.push({ min: -Infinity, max: Infinity });
  }

  // 解析尾部的數值處理器 (例如 negate 1, per_minute_to_per_second 1, milliseconds_to_seconds 2)
  // 非數值型修飾符 (reminderstring、canonical_line、passive_hash 等) 不影響數值，直接略過
  const negatedIndices = new Set<number>();
  const valueHandlers = new Map<number, string[]>();
  const tailTokens = tailPart.split(/\s+/).filter(Boolean);
  for (let t = 0; t < tailTokens.length - 1; t++) {
    const name = tailTokens[t];
    const idxToken = tailTokens[t + 1];
    if (!/^\d+$/.test(idxToken)) continue;
    const isNegating = NEGATING_HANDLERS.has(name);
    const hasTransform = Object.prototype.hasOwnProperty.call(STAT_VALUE_HANDLERS, name);
    if (!isNegating && !hasTransform) continue;
    const idx = parseInt(idxToken, 10) - 1; // 轉為 0-indexed
    t++;
    if (idx < 0 || idx >= statCount) continue;
    if (isNegating) negatedIndices.add(idx);
    if (hasTransform) {
      const list = valueHandlers.get(idx);
      if (list) list.push(name);
      else valueHandlers.set(idx, [name]);
    }
  }

  return {
    conditions,
    format: cleanMarkup(textPart, isNonAscii),
    negatedIndices,
    valueHandlers,
  };
}

export class StatDescriptionIndex {
  private rules: StatDescriptionRule[] = [];
  // statId -> rules that mention this statId
  private rulesByStat = new Map<string, StatDescriptionRule[]>();

  static parse(content: string): StatDescriptionIndex {
    const index = new StatDescriptionIndex();
    const lines = content.split(/\r\n|\n/);
    const n = lines.length;

    let i = 0;
    let ruleIndex = 0;
    while (i < n) {
      const line = lines[i].trim();
      if (line !== 'description') {
        i++;
        continue;
      }
      i++;

      while (i < n && !lines[i].trim()) i++;
      if (i >= n) break;

      const statLine = lines[i].trim().split(/\s+/);
      const statCount = parseInt(statLine[0], 10);
      if (isNaN(statCount) || statCount <= 0) {
        i++;
        continue;
      }

      const statIds = statLine.slice(1, 1 + statCount);
      i++;

      const enVariants: StatRuleVariant[] = [];
      const variantsByLocale = new Map<SupportedAffixLocale, StatRuleVariant[]>();
      variantsByLocale.set('en', enVariants);

      // 讀取英文 variants
      while (i < n && !lines[i].trim()) i++;
      if (i < n && /^\d+$/.test(lines[i].trim())) {
        const lineCount = parseInt(lines[i].trim(), 10);
        i++;
        for (let l = 0; l < lineCount && i < n; l++, i++) {
          const v = parseVariantLine(lines[i], false, statCount);
          if (v) enVariants.push(v);
        }
      }

      // 讀取所有語言區塊 (lang "...")
      while (i < n) {
        const peek = lines[i].trim();
        if (peek === 'description') break;
        const langMatch = peek.match(/^lang\s+"([^"]+)"/);
        if (langMatch) {
          const gggLang = langMatch[1];
          const locale = GGG_LANG_TO_LOCALE[gggLang];
          i++;
          while (i < n && !lines[i].trim()) i++;
          if (i < n && /^\d+$/.test(lines[i].trim())) {
            const lineCount = parseInt(lines[i].trim(), 10);
            i++;
            const locVariants: StatRuleVariant[] = [];
            for (let l = 0; l < lineCount && i < n; l++, i++) {
              if (locale) {
                const v = parseVariantLine(lines[i], locale !== 'en', statCount);
                if (v) locVariants.push(v);
              }
            }
            if (locale && locVariants.length > 0) {
              variantsByLocale.set(locale, locVariants);
            }
          }
        } else {
          i++;
        }
      }

      const zhVariants = variantsByLocale.get('zh-TW') || [];
      const rule: StatDescriptionRule = {
        index: ruleIndex++,
        statIds,
        enVariants,
        zhVariants,
        variantsByLocale,
      };

      index.rules.push(rule);
      for (const statId of statIds) {
        if (!index.rulesByStat.has(statId)) {
          index.rulesByStat.set(statId, []);
        }
        index.rulesByStat.get(statId)!.push(rule);
      }
    }

    // 優先匹配參照更多 stat 的規則
    index.rules.sort((a, b) => b.statIds.length - a.statIds.length);
    for (const [, ruleList] of index.rulesByStat) {
      ruleList.sort((a, b) => b.statIds.length - a.statIds.length);
    }

    return index;
  }

  renderMod(activeStats: Array<{ id: string; min: number; max: number }>): RenderedModResult | null {
    if (activeStats.length === 0) return null;

    const remainingStats = [...activeStats];
    const renderedLines: RenderedLine[] = [];

    while (remainingStats.length > 0) {
      let bestConsumedStats: Array<{ id: string; min: number; max: number }> = [];
      let bestLine: RenderedLine | null = null;
      let maxActiveConsumed = 0;

      const currentActiveMap = new Map<string, { id: string; min: number; max: number }>();
      for (const s of remainingStats) {
        currentActiveMap.set(s.id, s);
      }

      // 檢查候選規則：規則必須包含至少一個當前活躍的 stat
      for (const currentStat of remainingStats) {
        const candidateRules = this.rulesByStat.get(currentStat.id) || [];
        for (const rule of candidateRules) {
          // 計算此規則能消耗多少個當前活躍的 stat
          const activeInRule: Array<{ id: string; min: number; max: number }> = [];
          for (const sid of rule.statIds) {
            if (currentActiveMap.has(sid)) {
              activeInRule.push(currentActiveMap.get(sid)!);
            }
          }

          if (activeInRule.length <= maxActiveConsumed) continue;

          // 構建傳入規則的完整 stat 值列表 (規則中未在 mod 出現的 stat，預設值為 0)
          const allRuleStats = rule.statIds.map((sid) => {
            return currentActiveMap.get(sid) || { id: sid, min: 0, max: 0 };
          });

          // 嘗試格式化
          const line = this.formatRule(rule, allRuleStats, activeInRule.map((s) => s.id));
          if (line) {
            maxActiveConsumed = activeInRule.length;
            bestConsumedStats = activeInRule;
            bestLine = line;
          }
        }
      }

      if (bestLine && bestConsumedStats.length > 0) {
        renderedLines.push(bestLine);
        // 從 remainingStats 移除已消耗的 stats
        for (const consumed of bestConsumedStats) {
          const idx = remainingStats.findIndex((s) => s.id === consumed.id);
          if (idx !== -1) remainingStats.splice(idx, 1);
        }
      } else {
        // 若此 stat 找不到任何有效規則，跳過以避免無窮迴圈
        remainingStats.shift();
      }
    }

    if (renderedLines.length === 0) return null;

    // 依據 stat_descriptions 規則定義順序排序，確保複合詞綴順序符合 GGG 客戶端與 Trade 規範
    renderedLines.sort((a, b) => a.ruleIndex - b.ruleIndex);

    let values: string[][];
    if (renderedLines.length <= 1) {
      values = renderedLines.flatMap((l) => l.values);
    } else {
      values = renderedLines.map((l) => {
        if (l.values.length === 0) {
          return [];
        } else if (l.values.length === 1) {
          return l.values[0];
        } else {
          // 子詞綴包含多個佔位符（如點傷附加 # 至 # 傷害）
          const firstRange = l.values[0];
          const lastRange = l.values[l.values.length - 1];
          const min = firstRange[0];
          const max = lastRange[lastRange.length - 1];
          return min === max ? [min] : [min, max];
        }
      });
    }

    const params: number[][] = [];
    const lineBucketsByLocale = new Map<SupportedAffixLocale, string[]>();
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      lineBucketsByLocale.set(locale, []);
    }

    let paramOffset = 0;
    for (const line of renderedLines) {
      const lineStatCount = line.params.length;
      for (const p of line.params) {
        params.push(p);
      }
      for (const locale of SUPPORTED_AFFIX_LOCALES) {
        const rawVar = line.rawVariantsByLocale[locale];
        const normalized = normalizeLineFormat(
          rawVar.format,
          rawVar.negatedIndices,
          lineStatCount,
          paramOffset
        );
        lineBucketsByLocale.get(locale)!.push(normalized);
      }
      paramOffset += lineStatCount;
    }

    const templatesByLocale = {} as Record<SupportedAffixLocale, string>;
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      templatesByLocale[locale] = lineBucketsByLocale.get(locale)!.join('|||||');
    }

    return {
      key: renderedLines.map((l) => l.key).join('|||||'),
      key_zh: renderedLines.map((l) => l.key_zh).join('|||||'),
      template: renderedLines.map((l) => l.template).join('|||||'),
      template_zh: renderedLines.map((l) => l.template_zh).join('|||||'),
      values,
      params,
      templatesByLocale,
      ruleStatIds: renderedLines.map((l) => l.ruleStatIds),
    };
  }

  private formatRule(
    rule: StatDescriptionRule,
    allStats: Array<{ id: string; min: number; max: number }>,
    consumedStatIds: string[]
  ): RenderedLine | null {
    const enVar = this.findMatchingVariant(rule.enVariants, allStats);
    if (!enVar) return null;

    const zhVar = this.findMatchingVariant(rule.zhVariants, allStats) || enVar;

    const rawVariantsByLocale = {} as Record<
      SupportedAffixLocale,
      { format: string; negatedIndices: Set<number> }
    >;
    for (const locale of SUPPORTED_AFFIX_LOCALES) {
      const locVariants = rule.variantsByLocale.get(locale);
      const matched =
        locVariants && locVariants.length > 0
          ? this.findMatchingVariant(locVariants, allStats) || enVar
          : enVar;
      rawVariantsByLocale[locale] = {
        format: matched.format,
        negatedIndices: matched.negatedIndices,
      };
    }

    const values: string[][] = [];
    const params: number[][] = [];

    let enFormatted = enVar.format;
    let zhFormatted = zhVar.format;
    let enTemplate = enVar.format;
    let zhTemplate = zhVar.format;

    for (let i = 0; i < allStats.length; i++) {
      // 條件比對已使用原始整數完成，此處才依尾端處理器換算為顯示數值 (例如每分鐘 -> 每秒)
      const handlers = enVar.valueHandlers.get(i);
      const rawMin = applyValueHandlers(allStats[i].min, handlers);
      const rawMax = applyValueHandlers(allStats[i].max, handlers);
      params.push(rawMin === rawMax ? [rawMin] : [rawMin, rawMax]);

      let min = rawMin;
      let max = rawMax;

      // 若具有 negate 標記，將數值取負
      if (enVar.negatedIndices.has(i)) {
        min = -min;
        max = -max;
        if (min > max) {
          const tmp = min;
          min = max;
          max = tmp;
        }
      }

      const valStr = min === max ? `${min}` : `(${min}-${max})`;
      const valStrSigned = min === max ? (min >= 0 ? `+${min}` : `${min}`) : `+(${min}-${max})`;

      // 只有實際有佔位符或非 0 的 stat 才記錄 values
      const hasPlaceholder =
        enVar.format.includes(`{${i}`) || zhVar.format.includes(`{${i}`);
      if (hasPlaceholder) {
        values.push(min === max ? [String(min)] : [String(min), String(max)]);
      }

      const rSigned = new RegExp(`\\{${i}:\\+d\\}`, 'g');
      const rUnsigned = new RegExp(`\\{${i}(?::d)?\\}`, 'g');

      enFormatted = enFormatted.replace(rSigned, valStrSigned).replace(rUnsigned, valStr);
      zhFormatted = zhFormatted.replace(rSigned, valStrSigned).replace(rUnsigned, valStr);

      enTemplate = enTemplate.replace(rSigned, '+#').replace(rUnsigned, '#');
      zhTemplate = zhTemplate.replace(rSigned, '+#').replace(rUnsigned, '#');
    }

    const cleanTmpl = (s: string) =>
      s
        .toLowerCase()
        .replace(/^\+/, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanTmplZh = (s: string) =>
      s
        .replace(/^\+/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
      ruleIndex: rule.index,
      key: enFormatted.toLowerCase().trim(),
      key_zh: zhFormatted.trim(),
      template: cleanTmpl(enTemplate),
      template_zh: cleanTmplZh(zhTemplate),
      values,
      params,
      rawVariantsByLocale,
      consumedStatIds,
      ruleStatIds: rule.statIds,
    };
  }

  private findMatchingVariant(
    variants: StatRuleVariant[],
    stats: Array<{ id: string; min: number; max: number }>
  ): StatRuleVariant | null {
    for (const v of variants) {
      let matches = true;
      for (let i = 0; i < stats.length; i++) {
        const cond = v.conditions[i];
        if (!cond) continue;
        const val = stats[i].min;
        if (val < cond.min || val > cond.max) {
          matches = false;
          break;
        }
      }
      if (matches) return v;
    }
    return variants[0] || null;
  }
}
