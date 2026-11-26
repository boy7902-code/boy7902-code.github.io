import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = [
  ['전기', 'electric'],
  ['물', 'water'],
  ['불꽃', 'fire'],
  ['얼음', 'ice'],
  ['드래곤', 'dragon'],
  ['에스퍼', 'psychic'],
  ['고스트', 'ghost']
];

test('type evolution media is mapped and loaded before the effect', () => {
  const effect = fs.readFileSync(path.join(ROOT, 'pokemon-evolution-effect.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const effectIndex = index.indexOf('pokemon-evolution-effect.js');
  assert.notEqual(effectIndex, -1);

  for (const [type, key] of TYPES) {
    assert.ok(effect.includes(`${type}:'${key}'`), `${type} should map to ${key}`);
    const mediaIndex = index.indexOf(`evolution-${key}.js`);
    assert.notEqual(mediaIndex, -1, `${key} script should be loaded`);
    assert.ok(mediaIndex < effectIndex, `${key} media should load before the effect`);
  }
});

test('type evolution media files contain playable mp4 data', () => {
  for (const [, key] of TYPES) {
    const file = path.join(ROOT, `evolution-${key}.js`);
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(new RegExp(`window\\.TypeEvolutionMedia\\.${key}='data:video\\/mp4;base64,([A-Za-z0-9+/=]+)';\\s*$`));
    assert.ok(match, `${key} should expose one mp4 data URL`);
    const bytes = Buffer.from(match[1], 'base64');
    assert.ok(bytes.length > 100000, `${key} should keep the uploaded video payload`);
    assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp', `${key} should decode as an mp4`);
  }
});
