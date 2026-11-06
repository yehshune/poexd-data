import * as fs from 'fs/promises';
import * as path from 'path';

export interface UnmatchedModItem {
  modId?: string;
  template: string;
  template_zh?: string;
  key?: string;
  key_zh?: string;
  types?: string[];
  affinities?: string[];
  level?: string;
}

export async function writeUnmatchedReport(
  gameVersion: 'poe1' | 'poe2',
  outputDir: string,
  totalProcessed: number,
  matchedCount: number,
  unmatchedList: UnmatchedModItem[]
): Promise<void> {
  const unmatchedCount = totalProcessed - matchedCount;
  const matchRate = totalProcessed > 0 ? ((matchedCount / totalProcessed) * 100).toFixed(1) : '100.0';

  // 按範本匯總頻率
  const summaryMap = new Map<string, { count: number; affinities: Set<string>; types: Set<string> }>();
  for (const item of unmatchedList) {
    const key = item.template_zh || item.template;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, { count: 0, affinities: new Set(), types: new Set() });
    }
    const rec = summaryMap.get(key)!;
    rec.count++;
    item.affinities?.forEach((a) => rec.affinities.add(a));
    item.types?.forEach((t) => rec.types.add(t));
  }

  const sortedSummary = Array.from(summaryMap.entries())
    .map(([template, d]) => ({
      template,
      count: d.count,
      affinities: Array.from(d.affinities),
      sampleTypes: Array.from(d.types).slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);

  const reportData = {
    gameVersion,
    generatedAt: new Date().toISOString(),
    totalTiers: totalProcessed,
    matchedCount,
    unmatchedCount,
    matchRate: `${matchRate}%`,
    summaryByTemplate: sortedSummary,
    unmatchedDetails: unmatchedList,
  };

  const reportFile = path.join(outputDir, 'unmatched-report.json');
  await fs.writeFile(reportFile, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`  -> 寫入未配對報告: ${reportFile} (未配對: ${unmatchedCount} 筆，匹配率: ${matchRate}%)`);

  // CI GitHub Step Summary 支援
  const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryFile) {
    const title = gameVersion === 'poe1' ? 'PoE 1' : 'PoE 2';
    const topRows = sortedSummary
      .slice(0, 10)
      .map(
        (s) =>
          `| ${s.template} | ${s.count} | ${s.affinities.join(', ')} | ${s.sampleTypes.join(', ')} |`
      )
      .join('\n');

    const md = `
### ${title} 詞綴匹配報告 (Mods Matching Report)
| 指標 | 數值 |
|---|---|
| 總詞綴階級數 | ${totalProcessed} |
| 成功映射 Trade ID | ${matchedCount} (${matchRate}%) |
| 未配對階級數 | ${unmatchedCount} |

<details>
<summary>點擊展開 Top 10 未配對詞綴</summary>

| 詞綴範本 | 出現次數 | 親和度 | 適用部位範例 |
|---|---|---|---|
${topRows}

</details>
`;
    try {
      await fs.appendFile(stepSummaryFile, md, 'utf-8');
    } catch {
      // 忽略 CI 寫入錯誤
    }
  }
}
