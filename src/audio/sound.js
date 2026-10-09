// Audio Hive Colony, disintesis langsung dengan Web Audio API (tanpa file suara).
// - Musik ambient generatif (pentatonik), lebih pelan dan lembut saat malam
// - Dengung lebah yang mengikuti jumlah agent yang sedang terbang
// - Efek suara: misi dikirim, misi selesai, bel tamu, pintu lobby

let ctx = null;
let master;
let musicBus;
let sfxBus;
let buzzGain;
let timer = null;

const state = { enabled: false, volume: 0.7, night: 0, nextTime: 0, step: 0, melody: 2 };

const CHORDS = [
  [60, 64, 67], // C
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
];
const SCALE = [72, 74, 76, 79, 81, 84, 86];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // gema sederhana (feedback delay) supaya terasa luas
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2000;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(tone);
  tone.connect(fb);
  fb.connect(delay);
  tone.connect(wet);
  wet.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);
  musicBus.connect(delay);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);
  sfxBus.connect(delay);

  // dengung lebah: dua sawtooth sedikit fals + modulasi kepakan sayap
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = 196;
  o2.frequency.value = 203;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 1.1;
  const flutter = ctx.createGain();
  flutter.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 23;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.4;
  lfo.connect(lfoDepth);
  lfoDepth.connect(flutter.gain);
  o1.connect(bp);
  o2.connect(bp);
  bp.connect(flutter);
  buzzGain = ctx.createGain();
  buzzGain.gain.value = 0;
  flutter.connect(buzzGain);
  buzzGain.connect(master);
  o1.start();
  o2.start();
  lfo.start();
}

function note(freq, t, { type = 'triangle', gain = 0.06, attack = 0.005, decay = 0.6, bus = musicBus, filter } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

function playStep(t) {
  const night = state.night > 0.5;
  const s = state.step;
  const chord = CHORDS[Math.floor(s / 8) % CHORDS.length];
  const bar = night ? (60 / 66) * 4 : (60 / 92) * 4;

  if (s % 8 === 0) {
    // pad akor
    for (const m of chord) {
      note(hz(m - 12), t, {
        type: night ? 'sine' : 'triangle',
        gain: night ? 0.035 : 0.03,
        attack: 0.8,
        decay: bar * 1.1,
        filter: night ? 600 : 1000,
      });
    }
  }
  if (!night && (s % 8 === 0 || s % 8 === 4)) {
    note(hz(chord[0] - 24), t, { type: 'sine', gain: 0.07, decay: 0.45 });
  }
  // melodi pluck berjalan acak di skala pentatonik
  const chance = night ? 0.16 : 0.42;
  if (Math.random() < chance) {
    state.melody = Math.max(0, Math.min(SCALE.length - 1, state.melody + Math.round((Math.random() - 0.5) * 3)));
    const m = SCALE[state.melody] - (night ? 12 : 0);
    note(hz(m), t, { type: 'triangle', gain: night ? 0.035 : 0.05, decay: night ? 1.2 : 0.55 });
    note(hz(m + 12), t, { type: 'sine', gain: night ? 0.01 : 0.018, decay: 0.3 });
  }
  state.step++;
}

function schedule() {
  if (!ctx) return;
  const eighth = state.night > 0.5 ? 60 / 66 / 2 : 60 / 92 / 2;
  if (state.nextTime < ctx.currentTime) state.nextTime = ctx.currentTime + 0.05;
  while (state.nextTime < ctx.currentTime + 0.3) {
    playStep(state.nextTime);
    state.nextTime += eighth;
  }
}

function noiseBurst(t, dur, from, to, gain) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(t);
}

const SFX = {
  dispatch(t) {
    const o = note(1046, t, { type: 'sine', gain: 0.13, decay: 0.35, bus: sfxBus });
    o.frequency.exponentialRampToValueAtTime(440, t + 0.3);
    note(hz(84), t + 0.05, { type: 'triangle', gain: 0.04, decay: 0.5, bus: sfxBus });
  },
  complete(t) {
    [72, 76, 79, 84].forEach((m, i) => note(hz(m), t + i * 0.08, { type: 'triangle', gain: 0.1, decay: 0.5, bus: sfxBus }));
    note(hz(96), t + 0.32, { type: 'sine', gain: 0.03, decay: 0.8, bus: sfxBus });
  },
  bell(t) {
    note(hz(76), t, { type: 'sine', gain: 0.12, decay: 1.1, bus: sfxBus });
    note(hz(72), t + 0.38, { type: 'sine', gain: 0.12, decay: 1.4, bus: sfxBus });
  },
  door(t) {
    noiseBurst(t, 0.45, 1800, 500, 0.08);
  },
};

export const sound = {
  get enabled() {
    return state.enabled;
  },
  setEnabled(on) {
    ensure();
    if (!ctx) return;
    state.enabled = on;
    const now = ctx.currentTime;
    if (on) {
      ctx.resume();
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(state.volume, now, 0.3);
      if (!timer) timer = setInterval(schedule, 100);
    } else {
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.15);
      clearInterval(timer);
      timer = null;
    }
  },
  unlock() {
    if (ctx && state.enabled && ctx.state !== 'running') ctx.resume();
  },
  setVolume(v) {
    state.volume = v;
    if (ctx && state.enabled) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  },
  setNight(n) {
    state.night = n;
  },
  setBuzz(v) {
    if (!ctx) return;
    buzzGain.gain.setTargetAtTime(state.enabled ? v : 0, ctx.currentTime, 0.2);
  },
  play(type) {
    if (!ctx || !state.enabled || !SFX[type]) return;
    SFX[type](ctx.currentTime + 0.01);
  },
};
