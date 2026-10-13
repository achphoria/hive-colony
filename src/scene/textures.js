// Tekstur prosedural (digambar dengan canvas, tanpa file gambar): lantai kayu, ubin marmer,
// garis heksagon bercahaya, kaca sarang madu, dan rumput. Dibuat sekali lalu dipakai bersama.
import * as THREE from 'three';

const cache = {};
function make(key, size, draw, { repeat = 1, srgb = true } = {}) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache[key] = t;
  return t;
}

// pseudo-acak deterministik supaya pola sama tiap kali dibuka
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Papan kayu hangat (untuk ruang kerja, lobby, lounge)
export const woodTexture = () =>
  make('wood', 512, (g, n) => {
    const r = rng(11);
    const rows = 8;
    const h = n / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < n) {
        const w = 160 + r() * 200;
        const l = 62 + r() * 10;
        g.fillStyle = `hsl(${32 + r() * 6}, ${48 + r() * 10}%, ${l}%)`;
        g.fillRect(x, i * h, w, h);
        // serat kayu
        g.strokeStyle = 'rgba(120, 72, 20, 0.12)';
        g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const y = i * h + 6 + r() * (h - 12);
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + w * 0.3, y + r() * 6 - 3, x + w * 0.7, y + r() * 6 - 3, x + w, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(90, 50, 10, 0.35)';
        g.fillRect(x, i * h, 2, h);
        x += w;
      }
      g.fillStyle = 'rgba(90, 50, 10, 0.3)';
      g.fillRect(0, i * h, n, 2);
    }
  }, { repeat: 2 });

// Ubin marmer krem dengan urat emas tipis (ruang royal, hall, mission control)
export const marbleTexture = () =>
  make('marble', 512, (g, n) => {
    const r = rng(23);
    g.fillStyle = '#F7EEDC';
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(${170 + r() * 40}, ${130 + r() * 30}, ${80 + r() * 30}, ${0.12 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      let x = r() * n;
      let y = r() * n;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 140;
        y += (r() - 0.5) * 140;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // nat ubin
    g.strokeStyle = 'rgba(201, 138, 0, 0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(0, (i * n) / 4);
      g.lineTo(n, (i * n) / 4);
      g.moveTo((i * n) / 4, 0);
      g.lineTo((i * n) / 4, n);
      g.stroke();
    }
  }, { repeat: 2 });

function hexPath(g, cx, cy, rad) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

// Pola sarang lebah (hitam = gelap, putih = garis menyala); dipakai sebagai emissiveMap
export const hexLineTexture = (repeat = 3) =>
  make(`hexline-${repeat}`, 512, (g, n) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, n, n);
    const rad = n / 6;
    const w = rad * 1.5;
    const h = rad * Math.sqrt(3);
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 3;
    for (let col = -1; col < n / w + 1; col++) {
      for (let row = -1; row < n / h + 1; row++) {
        const cx = col * w;
        const cy = row * h + (col % 2 ? h / 2 : 0);
        hexPath(g, cx, cy, rad - 2);
        g.stroke();
      }
    }
  }, { repeat, srgb: false });

// Kaca sarang madu: sel heksagon amber dengan tepi terang (lift & dinding Hive Hall)
export const honeyGlassTexture = () =>
  make('honeyglass', 512, (g, n) => {
    const r = rng(5);
    g.fillStyle = '#FFB020';
    g.fillRect(0, 0, n, n);
    const rad = n / 8;
    const w = rad * 1.5;
    const h = rad * Math.sqrt(3);
    for (let col = -1; col < n / w + 1; col++) {
      for (let row = -1; row < n / h + 1; row++) {
        const cx = col * w;
        const cy = row * h + (col % 2 ? h / 2 : 0);
        const grd = g.createRadialGradient(cx, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
        const l = 58 + r() * 14;
        grd.addColorStop(0, `hsl(42, 100%, ${l + 18}%)`);
        grd.addColorStop(1, `hsl(34, 100%, ${l - 8}%)`);
        hexPath(g, cx, cy, rad - 3);
        g.fillStyle = grd;
        g.fill();
        g.strokeStyle = '#FFE7A8';
        g.lineWidth = 4;
        g.stroke();
      }
    }
  });

// Rumput dengan variasi warna halus
export const grassTexture = () =>
  make('grass', 256, (g, n) => {
    const r = rng(3);
    g.fillStyle = '#8DBF4A';
    g.fillRect(0, 0, n, n);
    for (let k = 0; k < 1800; k++) {
      g.fillStyle = `hsla(${80 + r() * 25}, ${45 + r() * 20}%, ${38 + r() * 22}%, 0.55)`;
      g.fillRect(r() * n, r() * n, 2, 3 + r() * 4);
    }
  }, { repeat: 10 });
