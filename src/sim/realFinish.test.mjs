// Perayaan selesai harus jalan saat tugas benar-benar selesai, bukan saat kartu hilang dari papan.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.window = globalThis.window || {};
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const engine = await server.ssrLoadModule('/src/sim/engine.js');
const board = await server.ssrLoadModule('/src/ui/missionBoard.js');
const { world, syncRealTasks } = engine;
const { missionBoardItems, RECENT_DONE_MS } = board;

function reset() {
  world.real = true;
  world.missions = [];
  world.effects = [];
  world.events = [];
  world.done = 0;
  for (const a of world.agents) {
    a.missionId = null;
    a.cheer = 0;
  }
}

function task(who, col, id = 'task-graph') {
  return {
    id,
    kind: 'ai',
    col,
    who,
    title: 'Graph: Rekap penjualan minggu ini',
    updatedAt: new Date().toISOString(),
    resultAt: col === 'done' ? new Date().toISOString() : null,
  };
}

try {
  reset();
  syncRealTasks([task('Graph', 'doing')]);
  assert.equal(world.missions.length, 1, 'tugas doing dengan who=Graph masuk misi');
  assert.equal(world.missions[0].leadId, 'analyst');
  assert.equal(world.missions[0].taskId, 'task-graph');
  assert.equal(world.byId.analyst.missionId, world.missions[0].id);
  assert.equal(world.events.filter((e) => e === 'complete').length, 0);
  assert.equal(world.effects.filter((e) => e.type === 'burst').length, 0);

  const done = task('Graph', 'done');
  syncRealTasks([done]);
  assert.equal(world.missions.length, 0, 'misi 3D langsung dilepas saat selesai');
  assert.equal(world.byId.analyst.missionId, null);
  assert.equal(world.byId.analyst.cheer, 1);
  assert.equal(world.done, 1);
  assert.equal(world.events.filter((e) => e === 'complete').length, 1);
  assert.equal(world.effects.filter((e) => e.type === 'burst').length, 1);

  const shown = missionBoardItems([done], [], Date.now());
  assert.equal(shown.length, 1);
  assert.equal(shown[0].finished, true);
  assert.equal(shown[0].progress, 1);
  assert.equal(shown[0].phase, 'done');
  assert.equal(shown[0].title, 'Rekap penjualan minggu ini');

  syncRealTasks([done]);
  assert.equal(world.events.filter((e) => e === 'complete').length, 1, 'perayaan tidak diulang');
  assert.equal(world.effects.filter((e) => e.type === 'burst').length, 1);
  assert.equal(world.done, 1);

  const later = Date.now() + RECENT_DONE_MS + 1000;
  assert.equal(missionBoardItems([done], [], later).length, 0, 'kartu hilang setelah jendela, tanpa finishReal');
  assert.equal(world.events.filter((e) => e === 'complete').length, 1);

  reset();
  syncRealTasks([task('graph', 'doing', 'task-lower')]);
  assert.equal(world.missions.length, 1);
  assert.equal(world.missions[0].leadId, 'analyst');
  syncRealTasks([task('graph', 'done', 'task-lower')]);
  assert.equal(world.events.filter((e) => e === 'complete').length, 1);

  reset();
  syncRealTasks([task('ads', 'doing', 'task-spark')]);
  assert.equal(world.missions[0].leadId, 'ads');

  console.log('realFinish ok');
} finally {
  await server.close();
}
