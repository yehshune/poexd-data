import './bootstrap.js';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  const fs = await import('fs/promises');
  const outputDir = path.join(process.cwd(), 'output');

  // 市集篩選翻譯與市集漢化只需要官方市集 API，不需要下載 GGG 遊戲封包
  if (target === 'trade') {
    const { buildTradeData, parseTradeArgs } = await import('./trade/build-trade-data.js');
    console.log('\n=== 正在自官方市集 API 產生篩選翻譯與市集漢化資料 ===');
    await buildTradeData(outputDir, parseTradeArgs(args.slice(1)));
    return;
  }

  // 發布相關子命令：manifest、驗證閘門、patch 比對
  if (target === 'manifest' || target === 'verify' || target === 'check-patch') {
    const cli = await import('./publish/cli.js');
    if (target === 'manifest') await cli.runManifest(outputDir);
    else if (target === 'verify') await cli.runVerify(outputDir, args.slice(1));
    else await cli.runCheckPatch(outputDir);
    return;
  }

  const { recordBatch } = await import('./publish/batch-log.js');
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
    await recordBatch(outputDir, 'poe2/game', { patch: loader2.patchVersion });

    console.log('\n=== [5/5] 正在直接解析官方 CDN PoE 1 詞綴 (poe1/mods-*.json) ===');
    loader1 = await PoeDataLoader.create('poe1');
    await buildModsPoE1(loader1, outputPoe1Dir);
    await recordBatch(outputDir, 'poe1/game', { patch: loader1.patchVersion });
  }

  if (target === 'mods' || target === 'mercenary' || target === 'all') {
    const { buildMercenaryPoE1 } = await import('./mods/poe1/generate-mercenary-poe1.js');
    console.log('\n=== 正在解析 PoE 1 傭兵資料 (poe1/mercenary.json) ===');
    loader1 ??= await PoeDataLoader.create('poe1');
    await buildMercenaryPoE1(loader1, outputPoe1Dir);
    await recordBatch(outputDir, 'poe1/mercenary', { patch: loader1.patchVersion });
  }

  if (target === 'all') {
    const { buildTradeData } = await import('./trade/build-trade-data.js');
    console.log('\n=== 正在自官方市集 API 產生篩選翻譯與市集漢化資料 ===');
    try {
      await buildTradeData(outputDir);
    } catch (error) {
      // 市集資料失敗時沿用 output/ 內的上一版，不擋住遊戲資料的更新；驗證閘門仍會檢查必要檔案
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[poexd-data] 市集資料未更新，沿用上一版：${message}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning title=市集資料未更新::${message.replace(/\r?\n/g, ' ')}`);
    }
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
