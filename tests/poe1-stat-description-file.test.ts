import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPoE1StatDescriptionFile } from '../src/mods/poe1/generate-mods-poe1.js';

const fakeFiles = (files: Record<string, string>) => {
  const requested: string[] = [];
  const getFile = async (relPath: string) => {
    requested.push(relPath);
    return relPath in files ? new TextEncoder().encode(files[relPath]) : null;
  };
  return { getFile, requested };
};

const decode = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null);

describe('getPoE1StatDescriptionFile', () => {
  const txtPath = 'metadata/statdescriptions/stat_descriptions.txt';
  const csdPath = 'metadata/statdescriptions/stat_descriptions.csd';

  it('reads the .csd file that 3.30+ clients ship', async () => {
    const { getFile, requested } = fakeFiles({ [csdPath]: 'csd' });
    assert.equal(decode(await getPoE1StatDescriptionFile(getFile, txtPath)), 'csd');
    assert.deepEqual(requested, [csdPath]);
  });

  it('falls back to the .txt file of older clients', async () => {
    const { getFile, requested } = fakeFiles({ [txtPath]: 'txt' });
    assert.equal(decode(await getPoE1StatDescriptionFile(getFile, txtPath)), 'txt');
    assert.deepEqual(requested, [csdPath, txtPath]);
  });

  it('returns null when neither file exists', async () => {
    const { getFile } = fakeFiles({});
    assert.equal(await getPoE1StatDescriptionFile(getFile, txtPath), null);
  });
});
