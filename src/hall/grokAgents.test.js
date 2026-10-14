import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function grokList(src, file) {
  const m = src.match(/export const GROK_AGENTS = (\[[\s\S]*?\]);/);
  assert.ok(m, `${file} menyimpan GROK_AGENTS`);
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test('daftar Grok Bot di server dan browser sama, termasuk Pixel dan Spark', () => {
  const edge = grokList(readFileSync(new URL('../../supabase/functions/_shared/hive.ts', import.meta.url), 'utf8'), 'hive.ts');
  const client = grokList(readFileSync(new URL('./agentApi.js', import.meta.url), 'utf8'), 'agentApi.js');
  assert.deepEqual(client, edge);
  assert.deepEqual(edge, ['cloud', 'workflow', 'network', 'visual', 'ads']);
});
