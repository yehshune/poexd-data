import './bootstrap.js';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  console.log(`[poexd-data] 開始執行資料生成目標: ${target}`);
  const { PoeDataLoader } = await import('./cdn/loader.js');
  const loader = await PoeDataLoader.create();

  if (target === 'atlas' || target === 'all') {
    const { buildAtlasMaps } = await import('./atlas/generate-atlas-maps.js');
    const { buildAtlasContent } = await import('./atlas/generate-atlas-content.js');
    console.log('\n=== [1/2] 正在生成輿圖地圖資料 (atlas_maps.json) ===');
    await buildAtlasMaps(loader);

    console.log('\n=== [2/2] 正在生成輿圖機制資料 (atlas_content.json) ===');
    await buildAtlasContent(loader);
  }

  // 產出版本中繼資料供客戶端極速比對
  const fs = await import('fs/promises');
  const versionInfo = {
    patchVersion: loader.patchVersion,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(process.cwd(), 'output', 'version.json'),
    JSON.stringify(versionInfo, null, 2),
    'utf-8'
  );
  console.log(`\n[poexd-data] 已產出 version.json (PoE 2: ${loader.patchVersion})`);

  console.log('\n[poexd-data] 全部目標處理完成！產出位於 ./output/');
}

main().catch((err) => {
  console.error('\n[poexd-data] 執行失敗:', err);
  process.exit(1);
});
