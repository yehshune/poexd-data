/**
 * 發布相關的子命令（不需要下載遊戲封包）：
 *
 * - manifest：產生 output/manifest.json
 * - verify [--baseline <dir>] [--allow-shrink]：部署前驗證閘門
 * - check-patch：比對官方最新 patch 與 output/version.json，結果寫入 GITHUB_OUTPUT
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GAME_VERSIONS } from './catalog.js';
import { buildManifest, writeManifest } from './manifest.js';
import { verifyOutput } from './verify.js';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function resolveSourceCommit(): string | undefined {
  const fromEnv = process.env.GITHUB_SHA;
  if (fromEnv && COMMIT_PATTERN.test(fromEnv)) return fromEnv;
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return COMMIT_PATTERN.test(head) ? head : undefined;
  } catch {
    return undefined;
  }
}

export async function runManifest(outputDir: string): Promise<void> {
  const manifest = await buildManifest(outputDir, { sourceCommit: resolveSourceCommit() });
  await writeManifest(outputDir, manifest);
  const batchCount = Object.keys(manifest.batches).length;
  console.log(`[manifest] 已產出 manifest.json：${Object.keys(manifest.files).length} 個檔案、${batchCount} 個批次`);
}

export async function runVerify(outputDir: string, argv: string[]): Promise<void> {
  let baselineDir: string | undefined;
  let allowShrink = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--baseline') baselineDir = argv[++i];
    else if (argv[i] === '--allow-shrink') allowShrink = true;
    else throw new Error(`未知參數：${argv[i]}`);
  }
  const errors = await verifyOutput(outputDir, { baselineDir, allowShrink });
  if (errors.length > 0) {
    throw new Error(`[verify] 驗證失敗，不部署：\n  - ${errors.join('\n  - ')}`);
  }
  console.log(`[verify] 通過${baselineDir ? '（已與上一版比對）' : ''}`);
}

async function writeGithubOutput(values: Record<string, string>): Promise<void> {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  await appendFile(target, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

export async function runCheckPatch(outputDir: string): Promise<void> {
  const { PoeDataLoader } = await import('../cdn/loader.js');
  const versionFile = join(outputDir, 'version.json');
  const published = existsSync(versionFile) ? JSON.parse(await readFile(versionFile, 'utf8')) : {};
  const current: Record<string, string> = {};
  let changed = false;
  for (const version of GAME_VERSIONS) {
    current[version] = await PoeDataLoader.detectPatchVersion(version);
    const previous = published?.[version]?.patchVersion;
    const differs = previous !== current[version];
    changed ||= differs;
    console.log(`[check-patch] ${version}: 已發布 ${previous ?? '（無）'}，官方 ${current[version]}${differs ? ' → 需要重建' : ''}`);
  }
  await writeGithubOutput({ changed: String(changed), poe1: current.poe1, poe2: current.poe2 });
}
