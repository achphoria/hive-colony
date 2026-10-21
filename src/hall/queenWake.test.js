import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queenCall } from './queenWake.js';

test('pertanyaan lengkap ke Queen Bea', () => {
  assert.deepEqual(queenCall('Queen Bea, menurut kamu promo ini gimana?'), { wakeOnly: false });
  assert.deepEqual(queenCall('Kalau begitu kuin bi tolong ringkas rapat ini'), { wakeOnly: false });
});

test('hanya memanggil nama', () => {
  assert.deepEqual(queenCall('Queen Bea?'), { wakeOnly: true });
  assert.deepEqual(queenCall('Kwin, '), { wakeOnly: true });
});

test('bukan panggilan', () => {
  assert.equal(queenCall('Kita beli kasur queen size bed untuk mess'), null);
  assert.equal(queenCall('Sled sudah datang hari Kamis'), null);
  assert.equal(queenCall(''), null);
});
