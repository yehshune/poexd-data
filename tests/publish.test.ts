import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { batchOf, REQUIRED_FILES } from '../src/publish/catalog.js';
import { readBatchLog, recordBatch, withBatchRecord } from '../src/publish/batch-log.js';
import { buildManifest, writeManifest } from '../src/publish/manifest.js';
import { findShrunkFiles, verifyOutput } from '../src/publish/verify.js';

describe('batchOf', () => {
  it('assigns extension files to their consistency batch', () => {
    assert.equal(batchOf('poe2/mods-tiers.json'), 'poe2/game');
    assert.equal(batchOf('poe1/locales/zh-TW/stats.json'), 'poe1/game');
    assert.equal(batchOf('poe2/locales/en/items.json'), 'poe2/game');
    assert.equal(batchOf('poe2/locales/zh-CN/mod-lines.json'), 'poe2/game');
    assert.equal(batchOf('poe1/locales/zh-TW/result-labels.json'), 'poe1/game');
    assert.equal(batchOf('poe1/mercenary.json'), 'poe1/mercenary');
    assert.equal(batchOf('poe1/locales/ja/mercenary.json'), 'poe1/mercenary');
    assert.equal(batchOf('poe2/locales/ko/trade-filters.json'), 'poe2/trade-filters');
    assert.equal(batchOf('locales/zh-TW/trade-ui.json'), 'market');
    assert.equal(batchOf('poe1/locales/en/trade-stats.json'), 'market');
    assert.equal(batchOf('poe2/locales/zh-CN/trade-static.json'), 'market');
  });

  it('accepts Windows separators', () => {
    assert.equal(batchOf('poe2\\locales\\en\\stats.json'), 'poe2/game');
  });

  it('excludes files the extension does not use', () => {
    for (const path of [
      'version.json',
      'manifest.json',
      'batches.json',
      'poe2/atlas_maps.json',
      'poe2/icons/AtlasIconContentBreach.png',
      'poe1/unmatched-report.json',
      'poe2/mercenary.json',
      'poe3/mods-tiers.json',
      'poe2/locales/../stats.json',
    ]) {
      assert.equal(batchOf(path), null, path);
    }
  });
});

describe('batch log', () => {
  it('adds records without mutating the previous log and sorts stale locales', () => {
    const before = Object.freeze({ market: Object.freeze({ builtAt: 'a' }) });
    const after = withBatchRecord(before, 'poe2/trade-filters', { builtAt: 'b', staleLocales: ['ko', 'th'].reverse() });
    assert.deepEqual(before, { market: { builtAt: 'a' } });
    assert.deepEqual(after, { market: { builtAt: 'a' }, 'poe2/trade-filters': { builtAt: 'b', staleLocales: ['ko', 'th'] } });
  });

  it('drops empty stale lists and missing patches', () => {
    assert.deepEqual(withBatchRecord({}, 'market', { builtAt: 'x', staleLocales: [] }), { market: { builtAt: 'x' } });
  });
});

let dir: string;

async function put(root: string, path: string, value: unknown) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
}

/** 一份最小但完整、批次一致的輸出目錄 */
async function seedOutput(root: string) {
  for (const version of ['poe1', 'poe2']) {
    const patch = version === 'poe1' ? '3.0' : '0.5';
    await put(root, `${version}/mods-tiers.json`, { patch, tiers: [{}, {}] });
    await put(root, `${version}/locales/en/stats.json`, { patch, tierTemplates: [1, 2] });
    await put(root, `${version}/locales/zh-TW/stats.json`, { patch, tierTemplates: [1, 2] });
    await put(root, `${version}/locales/en/items.json`, { patch, items: [1] });
    await put(root, `${version}/locales/en/trade-filters.json`, { schemaVersion: 3, fields: { a: 'A'.repeat(200) } });
    await put(root, `${version}/locales/en/trade-stats.json`, { schemaVersion: 1, stats: {} });
    await put(root, `${version}/atlas_maps.json`, []);
  }
  await put(root, 'locales/zh-TW/trade-ui.json', { schemaVersion: 1, strings: {} });
  await put(root, 'version.json', { poe1: { patchVersion: '3.0' }, poe2: { patchVersion: '0.5' } });
}

describe('manifest and verify', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'poexd-publish-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists catalog files with sha256, size, batch and schema version', async () => {
    const out = join(dir, 'out');
    await seedOutput(out);
    await recordBatch(out, 'poe2/game', { patch: '0.5', builtAt: '2026-01-01T00:00:00.000Z' });
    await recordBatch(out, 'poe1/mercenary', { patch: '3.0', builtAt: '2026-01-01T00:00:00.000Z' });
    const manifest = await buildManifest(out, { sourceCommit: 'c'.repeat(40), now: new Date('2026-01-02T00:00:00Z') });

    assert.equal(manifest.manifestVersion, 1);
    assert.equal(manifest.generatedAt, '2026-01-02T00:00:00.000Z');
    assert.deepEqual(manifest.games, { poe1: { patchVersion: '3.0' }, poe2: { patchVersion: '0.5' } });
    // 沒有檔案的批次（poe1/mercenary）不列入
    assert.deepEqual(Object.keys(manifest.batches), ['poe2/game']);
    assert.equal(manifest.files['poe2/atlas_maps.json'], undefined);
    assert.equal(manifest.files['version.json'], undefined);

    const content = await readFile(join(out, 'poe2/mods-tiers.json'));
    assert.deepEqual(manifest.files['poe2/mods-tiers.json'], {
      batch: 'poe2/game',
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.length,
    });
    assert.equal(manifest.files['poe1/locales/en/trade-filters.json'].schema, 3);
    assert.equal(manifest.files['locales/zh-TW/trade-ui.json'].batch, 'market');

    await writeManifest(out, manifest);
    assert.deepEqual(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')), JSON.parse(JSON.stringify(manifest)));
    assert.deepEqual(await readBatchLog(out), {
      'poe2/game': { builtAt: '2026-01-01T00:00:00.000Z', patch: '0.5' },
      'poe1/mercenary': { builtAt: '2026-01-01T00:00:00.000Z', patch: '3.0' },
    });
  });

  it('passes a complete, consistent output', async () => {
    const out = join(dir, 'out');
    await seedOutput(out);
    assert.deepEqual(await verifyOutput(out, { baselineDir: out }), []);
  });

  it('reports missing required files, broken JSON and inconsistent batches', async () => {
    const out = join(dir, 'out');
    await seedOutput(out);
    await rm(join(out, 'poe2/locales/en/trade-filters.json'));
    await put(out, 'poe1/locales/ja/trade-filters.json', '{ broken');
    await put(out, 'poe2/locales/zh-TW/stats.json', { patch: '0.4', tierTemplates: [1, 2] });
    const errors = await verifyOutput(out);
    assert.ok(errors.includes('缺少必要檔案 poe2/locales/en/trade-filters.json'));
    assert.ok(errors.some((error) => error.startsWith('poe1/locales/ja/trade-filters.json 不是有效的 JSON')));
    assert.ok(errors.includes('poe2/game: stats.json (zh-TW) patch 0.4 ≠ 0.5'));
  });

  it('blocks shrunk or vanished files unless explicitly allowed', async () => {
    const baseline = join(dir, 'baseline');
    const out = join(dir, 'out');
    await seedOutput(baseline);
    await put(baseline, 'poe2/locales/ja/trade-filters.json', { schemaVersion: 3, fields: {} });
    await seedOutput(out);
    await put(out, 'poe1/locales/en/trade-filters.json', { schemaVersion: 3, fields: {} });

    const errors = await verifyOutput(out, { baselineDir: baseline });
    assert.equal(errors.length, 2);
    assert.ok(errors.some((error) => error.startsWith('poe1/locales/en/trade-filters.json 縮水')));
    assert.ok(errors.some((error) => error.startsWith('poe2/locales/ja/trade-filters.json 在本次發布中消失')));
    assert.deepEqual(await verifyOutput(out, { baselineDir: baseline, allowShrink: true }), []);
  });
});

describe('findShrunkFiles', () => {
  it('flags files below the shrink threshold and missing files only', () => {
    const before = new Map([
      ['a', 1000],
      ['b', 1000],
      ['c', 1000],
      ['empty', 0],
    ]);
    const after = new Map([
      ['a', 700],
      ['b', 699],
      ['empty', 0],
      ['new', 5],
    ]);
    assert.deepEqual(findShrunkFiles(before, after), [
      { path: 'b', before: 1000, after: 699 },
      { path: 'c', before: 1000, after: null },
    ]);
  });
});

describe('required files', () => {
  it('cover the runtime fallback data for both games', () => {
    assert.ok(REQUIRED_FILES.includes('poe1/locales/en/trade-filters.json'));
    assert.ok(REQUIRED_FILES.includes('poe2/mods-tiers.json'));
  });
});
