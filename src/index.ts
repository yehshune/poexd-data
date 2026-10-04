import './bootstrap.js';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  const fs = await import('fs/promises');
  const outputDir = path.join(process.cwd(), 'output');
  const outputPoe1Dir = path.join(outputDir, 'poe1');
  const outputPoe2Dir = path.join(outputDir, 'poe2');
  const outputPoe2IconsDir = path.join(outputPoe2Dir, 'icons');

  await fs.mkdir(outputPoe1Dir, { recursive: true });
  await fs.mkdir(outputPoe2Dir, { recursive: true });
  await fs.mkdir(outputPoe2IconsDir, { recursive: true });

  const { PoeDataLoader } = await import('./cdn/loader.js');

  // 初始化 PoE 2 資料載入器
  const loader2 = await PoeDataLoader.create('poe2');

  if (target === 'atlas' || target === 'all') {
    const { buildAtlasMaps } = await import('./atlas/generate-atlas-maps.js');
    const { buildAtlasContent } = await import('./atlas/generate-atlas-content.js');
    const { buildAtlasIcons } = await import('./atlas/generate-atlas-icons.js');

    console.log('\n=== [1/4] 正在生成 PoE 2 輿圖地圖資料 (poe2/atlas_maps.json) ===');
    await buildAtlasMaps(loader2, path.join(outputPoe2Dir, 'atlas_maps.json'));

    console.log('\n=== [2/4] 正在生成 PoE 2 輿圖機制資料 (poe2/atlas_content.json) ===');
    await buildAtlasContent(loader2, path.join(outputPoe2Dir, 'atlas_content.json'));

    console.log('\n=== [3/4] 正在自官方 CDN 提取 PoE 2 輿圖圖示 (poe2/icons/) ===');
    await buildAtlasIcons(loader2, outputPoe2IconsDir);
  }

  // 初始化 PoE 1 資料載入器
  let loader1: any = null;

  if (target === 'mods' || target === 'all') {
    const { buildModsPoE2 } = await import('./mods/poe2/generate-mods-poe2.js');
    const { buildModsPoE1 } = await import('./mods/poe1/generate-mods-poe1.js');

    console.log('\n=== [4/5] 正在直接解析官方 CDN PoE 2 詞綴 (poe2/mods-*.json) ===');
    await buildModsPoE2(loader2, outputPoe2Dir);

    console.log('\n=== [5/5] 正在直接解析官方 CDN PoE 1 詞綴 (poe1/mods-*.json) ===');
    loader1 = await PoeDataLoader.create('poe1');
    await buildModsPoE1(loader1, outputPoe1Dir);
  }

  // 若尚未初始化 loader1 則在此處取得版本號
  if (!loader1) {
    loader1 = await PoeDataLoader.create('poe1');
  }

  // 產出版本中繼資料供客戶端極速比對
  const versionInfo = {
    poe1: {
      patchVersion: loader1.patchVersion,
    },
    poe2: {
      patchVersion: loader2.patchVersion,
    },
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(outputDir, 'version.json'),
    JSON.stringify(versionInfo, null, 2),
    'utf-8'
  );
  console.log(`\n[poexd-data] 已產出 version.json (PoE 1: ${loader1.patchVersion}, PoE 2: ${loader2.patchVersion})`);

  console.log('\n[poexd-data] 全部目標處理完成！產出位於 ./output/ (poe1/ 與 poe2/)');
}

main().catch((err) => {
  console.error('\n[poexd-data] 執行失敗:', err);
  process.exit(1);
});
