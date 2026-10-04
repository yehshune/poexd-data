export interface StatRuleVariant {
  conditions: Array<{ min: number; max: number }>;
  format: string;
  negatedIndices: Set<number>; // 0-indexed parameter indices to negate
}

export interface StatDescriptionRule {
  index: number;
  statIds: string[];
  enVariants: StatRuleVariant[];
  zhVariants: StatRuleVariant[];
}

export interface RenderedLine {
  ruleIndex: number;
  key: string;
  key_zh: string;
  template: string;
  template_zh: string;
  values: string[][];
  consumedStatIds: string[];
}

export interface RenderedModResult {
  key: string;
  key_zh: string;
  template: string;
  template_zh: string;
  values: string[][];
}

export function cleanMarkup(text: string, isZh = false): string {
  if (!text) return '';
  // 在 GGG 的 stat_descriptions 格式中：
  // [Link|Display] 的真實顯示文字一律在 '|' 之後 (例如 [EnergyShield|Energy Shield] 或 [EnergyShield|能量護盾])
  let s = text.replace(/\[(?:[^|\]]*\|)?([^\]]+)\]/g, '$1');
  // 處理少數缺少 | 分隔線的二代中文特殊標籤，如 [ContainsDelirium譫妄之鏡]
  if (isZh) {
    s = s.replace(/\[[A-Za-z0-9_]+([^\x00-\x7f][^\]]*)\]/g, '$1');
  }
  return s.trim();
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

function parseVariantLine(rawLine: string, isZh: boolean, statCount: number): StatRuleVariant | null {
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

  // 解析尾部的修飾符 (例如 negate 1, negate 2)
  const negatedIndices = new Set<number>();
  const negateMatches = tailPart.matchAll(/negate\s+(\d+)/g);
  for (const match of negateMatches) {
    const idx = parseInt(match[1], 10) - 1; // 轉為 0-indexed
    if (idx >= 0 && idx < statCount) {
      negatedIndices.add(idx);
    }
  }

  return {
    conditions,
    format: cleanMarkup(textPart, isZh),
    negatedIndices,
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

      const rule: StatDescriptionRule = {
        index: ruleIndex++,
        statIds,
        enVariants: [],
        zhVariants: [],
      };

      // 讀取英文 variants
      while (i < n && !lines[i].trim()) i++;
      if (i < n && /^\d+$/.test(lines[i].trim())) {
        const lineCount = parseInt(lines[i].trim(), 10);
        i++;
        for (let l = 0; l < lineCount && i < n; l++, i++) {
          const v = parseVariantLine(lines[i], false, statCount);
          if (v) rule.enVariants.push(v);
        }
      }

      // 讀取其他語言區塊 (尋找 Traditional Chinese)
      while (i < n) {
        const peek = lines[i].trim();
        if (peek === 'description') break;
        if (peek.startsWith('lang "Traditional Chinese"')) {
          i++;
          while (i < n && !lines[i].trim()) i++;
          if (i < n && /^\d+$/.test(lines[i].trim())) {
            const lineCount = parseInt(lines[i].trim(), 10);
            i++;
            for (let l = 0; l < lineCount && i < n; l++, i++) {
              const v = parseVariantLine(lines[i], true, statCount);
              if (v) rule.zhVariants.push(v);
            }
          }
        } else {
          i++;
        }
      }

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
      let bestRule: StatDescriptionRule | null = null;
      let bestConsumedStats: Array<{ id: string; min: number; max: number }> = [];
      let bestLine: RenderedLine | null = null;
      let maxActiveConsumed = 0;

      const currentActiveMap = new Map<string, { min: number; max: number }>();
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
            bestRule = rule;
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

    return {
      key: renderedLines.map((l) => l.key).join('|||||'),
      key_zh: renderedLines.map((l) => l.key_zh).join('|||||'),
      template: renderedLines.map((l) => l.template).join('|||||'),
      template_zh: renderedLines.map((l) => l.template_zh).join('|||||'),
      values: renderedLines.flatMap((l) => l.values),
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

    const values: string[][] = [];

    let enFormatted = enVar.format;
    let zhFormatted = zhVar.format;
    let enTemplate = enVar.format;
    let zhTemplate = zhVar.format;

    for (let i = 0; i < allStats.length; i++) {
      let { min, max } = allStats[i];

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
      consumedStatIds,
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
