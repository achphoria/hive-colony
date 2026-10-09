// Satu loop global untuk simulasi, terpisah dari kanvas 3D,
// supaya koloni tetap hidup saat pengguna membuka Hive Hall atau pembuat avatar.
import { update } from './engine';
import { updateOutdoor } from './outdoor';

let started = false;

export function startLoop() {
  if (started) return;
  started = true;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    updateOutdoor(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
