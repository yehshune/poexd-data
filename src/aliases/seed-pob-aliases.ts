/**
 * 一次性回補舊英文別名：從 Path of Building Community（MIT）歷次匯出的
 * `stat_descriptions.lua` 取出當時的英文模板，與現行描述檔比對，寫入 `data/stat-aliases/<version>.json`。
 *
 * 只在需要重新回補時手動執行（`pnpm seed:aliases`）；之後每次建置會自動記錄新的改寫
 * （見 stat-text.ts）。下載的檔案快取在 `.cache/pob/`，重跑不會重複下載。
 * 設定 `GITHUB_TOKEN` 可提高 GitHub API 的速率上限。
 */
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoeDataLoader } from '../cdn/loader.js';
import { computeGggStatHash } from '../mods/common/murmurhash2.js';
import { detectAllRewording, mergeAliases, writeAliasFile, type StatAliases } from '../mods/common/stat-aliases.js';
import { buildStatText, englishOf, loadStatTextIndexes } from '../mods/common/stat-text.js';
import { extractPobDescriptions, parseLuaTable } from './pob-lua.js';

const SOURCES: Readonly<Record<'poe1' | 'poe2', string>> = {
  poe1: 'PathOfBuildingCommunity/PathOfBuilding',
  poe2: 'PathOfBuildingCommunity/PathOfBuilding-PoE2',
};
const DESCRIPTION_PATH = 'src/Data/StatDescriptions/stat_descriptions.lua';
const MAX_PAGES = 10;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'poexd-data',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/** 修改過描述檔的所有 commit（新到舊） */
async function listCommits(repo: string): Promise<string[]> {
  const shas: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(DESCRIPTION_PATH)}&per_page=100&page=${page}`;
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) throw new Error(`GitHub API ${repo} commits: HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error('GitHub API 回應格式不符');
    const pageShas = body
      .map((commit) => (typeof commit?.sha === 'string' ? commit.sha : ''))
      .filter((sha) => SHA_PATTERN.test(sha));
    shas.push(...pageShas);
    if (body.length < 100) break;
  }
  return shas;
}

async function downloadDescription(repo: string, sha: string, cacheDir: string): Promise<string> {
  const cacheFile = path.join(cacheDir, `${repo.replace('/', '_')}_${sha}.lua`);
  if (existsSync(cacheFile)) return fs.readFile(cacheFile, 'utf8');
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${DESCRIPTION_PATH}`);
  if (!response.ok) throw new Error(`下載 ${repo}@${sha.slice(0, 10)} 失敗：HTTP ${response.status}`);
  const text = await response.text();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, text, 'utf8');
  return text;
}

/** 一份 PoB 描述檔裡每個 hash 的英文模板 */
export function pobEnglishByHash(luaSource: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const description of extractPobDescriptions(parseLuaTable(luaSource))) {
    const hash = String(computeGggStatHash(description.statIds));
    const known = result.get(hash) ?? [];
    result.set(hash, [...known, ...description.templates.filter((template) => !known.includes(template))]);
  }
  return result;
}

export async function seedPobAliases(
  version: 'poe1' | 'poe2',
  loader: PoeDataLoader,
  repoRoot: string
): Promise<{ versions: number; aliases: number }> {
  const repo = SOURCES[version];
  // 與 PoB 的主描述檔比對，只用現行的主描述檔，避免技能描述檔的同 hash 寫法被當成改寫目標
  const [main] = await loadStatTextIndexes(version, (relPath) => loader.getFile(relPath));
  const current = englishOf(buildStatText([main.index], 'zh-TW'));

  const shas = await listCommits(repo);
  const cacheDir = path.join(repoRoot, '.cache', 'pob');
  const found: StatAliases[] = [];
  // 舊到新：較新版本的對應覆蓋較舊的
  for (const sha of [...shas].reverse()) {
    try {
      const previous = pobEnglishByHash(await downloadDescription(repo, sha, cacheDir));
      found.push(detectAllRewording(previous, current));
    } catch (error) {
      console.warn(`  [!] ${repo}@${sha.slice(0, 10)} 略過：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const aliases = mergeAliases(found, current);
  await writeAliasFile(path.join(repoRoot, 'data', 'stat-aliases', `${version}.json`), loader.patchVersion, aliases);
  return {
    versions: found.length,
    aliases: Object.values(aliases).reduce((sum, pairs) => sum + pairs.length, 0),
  };
}
