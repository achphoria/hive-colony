// Hive Colony: struktur gedung, agent, dan misi simulasi.

export const R = 5; // jarak grid heksagon (circumradius)
export const ROOM_R = 4.7; // radius lantai ruangan
export const APOTHEM = ROOM_R * Math.cos(Math.PI / 6);
export const TIER_GAP = 7.5;
export const WALL_H = 1.8;
export const LIFT_X = 14.5;
export const tierY = (t) => t * TIER_GAP;
export const tierOf = (y) => Math.max(0, Math.min(2, Math.floor((y + 1.5) / TIER_GAP)));

// Siklus siang-malam
export const DAY_LEN = 240; // detik simulasi untuk satu hari penuh
export const isNightHour = (h) => h >= 20 || h < 5.5;
export const sunElevation = (h) => Math.sin(((h - 6) / 12) * Math.PI); // 1 = tengah hari, -1 = tengah malam
export function dayPhase(h) {
  if (h >= 5 && h < 7) return 'Fajar';
  if (h >= 7 && h < 11) return 'Pagi';
  if (h >= 11 && h < 15) return 'Siang';
  if (h >= 15 && h < 18) return 'Sore';
  if (h >= 18 && h < 20) return 'Senja';
  return 'Malam';
}

export const TIERS = [
  { id: 2, name: 'Lantai 3', sub: 'Puncak' },
  { id: 1, name: 'Lantai 2', sub: 'Ruang divisi' },
  { id: 0, name: 'Lantai 1', sub: 'Ruang bersama' },
];

export const PALETTE = {
  gold: '#F5B700',
  amber: '#FF8C1A',
  royal: '#C98A00',
  nectar: '#FFC93C',
  cream: '#FFF8E7',
  silver: '#C0C5CE',
  graphite: '#2B2B2E',
};

export const DEPTS = {
  ceo: { name: 'Chief Executive', short: 'CEO', color: '#C98A00', acc: 'crown' },
  cx: { name: 'Customer Experience & Virtual AI', short: 'Customer XP', color: '#F5B700', acc: 'headset' },
  ops: { name: 'Operations & Facilities', short: 'Operations', color: '#FF8C1A', acc: 'hardhat' },
  it: { name: 'IT, Automation & Infrastructure', short: 'IT & Infra', color: '#8C929C', acc: 'glasses' },
  mkt: { name: 'Marketing & Creative Studio', short: 'Marketing', color: '#E2701B', acc: 'beret' },
  fin: { name: 'Finance & Data Analytics', short: 'Finance', color: '#B8860B', acc: 'bowtie' },
  prod: { name: 'Product & Innovation', short: 'Product', color: '#FFC93C', acc: 'goggles' },
  hr: { name: 'HR & General Affairs', short: 'HR & GA', color: '#D99A2B', acc: 'scarf' },
  guest: { name: 'Tamu', short: 'Tamu', color: '#C0C5CE', acc: 'none' },
};

export const SKINS = ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642'];
export const HAIRS = ['#6B4416', '#3A2A12', '#8A5A00', '#2B2B2E'];

export const AGENTS = [
  { id: 'ceo', nick: 'Queen Bea', role: 'Chief Executive', dept: 'ceo', mode: 'Hybrid', desk: 'throne', skin: 0 },
  { id: 'concierge', nick: 'Bumble', role: 'Virtual Concierge', dept: 'cx', mode: 'Full AI', desk: 'pod', skin: 1 },
  { id: 'booking', nick: 'Buzz', role: 'Booking & Lead Qualifier', dept: 'cx', mode: 'Full AI', desk: 'pod', skin: 2 },
  { id: 'escalation', nick: 'Clover', role: 'Escalation Specialist', dept: 'cx', mode: 'Hybrid', desk: 'booth', skin: 3 },
  { id: 'hyrox', nick: 'Sprint', role: 'HYROX & Gym Operations Specialist', dept: 'ops', mode: 'Hybrid', desk: 'pod', skin: 2 },
  { id: 'fnb', nick: 'Maple', role: 'F&B & Retail Operations Specialist', dept: 'ops', mode: 'Hybrid', desk: 'pod', skin: 0 },
  { id: 'maintenance', nick: 'Bolt', role: 'Predictive Maintenance Bot', dept: 'ops', mode: 'Full AI', desk: 'pod', skin: 1 },
  { id: 'safety', nick: 'Shield', role: 'Health & Safety Compliance Officer', dept: 'ops', mode: 'Hybrid', desk: 'pod', skin: 3 },
  { id: 'cloud', nick: 'Nimbus', role: 'Cloud & Database Architect', dept: 'it', mode: 'Hybrid', desk: 'standing', skin: 1 },
  { id: 'workflow', nick: 'Loop', role: 'Workflow Integrator', dept: 'it', mode: 'Full Tech', desk: 'standing', skin: 0 },
  { id: 'network', nick: 'Ping', role: 'Automated Network Monitor', dept: 'it', mode: 'Hybrid', desk: 'standing', skin: 2 },
  { id: 'visual', nick: 'Pixel', role: 'Generative Visual Designer', dept: 'mkt', mode: 'Hybrid', desk: 'standing', skin: 3 },
  { id: 'ads', nick: 'Spark', role: 'AI Ad Strategist', dept: 'mkt', mode: 'Hybrid', desk: 'standing', skin: 1 },
  { id: 'inventory', nick: 'Tally', role: 'Automated Inventory Controller', dept: 'fin', mode: 'Hybrid', desk: 'pod', skin: 2 },
  { id: 'analyst', nick: 'Graph', role: 'Augmented Data Analyst', dept: 'fin', mode: 'Hybrid', desk: 'pod', skin: 0 },
  { id: 'trend', nick: 'Scout', role: 'AI Trend Scraper', dept: 'prod', mode: 'Hybrid', desk: 'standing', skin: 3 },
  { id: 'prototyper', nick: 'Tinker', role: 'System Prototyper', dept: 'prod', mode: 'Hybrid', desk: 'standing', skin: 1 },
  { id: 'recruit', nick: 'Hello', role: 'Recruitment & Onboarding Bot', dept: 'hr', mode: 'Full AI', desk: 'pod', skin: 0 },
  { id: 'culture', nick: 'Sunny', role: 'People & Culture AI-Analyst', dept: 'hr', mode: 'Hybrid', desk: 'pod', skin: 2 },
  { id: 'legal', nick: 'Sage', role: 'Legal & Compliance Assistant', dept: 'hr', mode: 'Hybrid', desk: 'booth', skin: 3 },
  { id: 'payroll', nick: 'Penny', role: 'Automated Payroll Admin', dept: 'hr', mode: 'Hybrid', desk: 'pod', skin: 1 },
];
export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

// Agent yang tetap bekerja saat malam (jaga malam)
export const NIGHT_SHIFT = new Set(AGENTS.filter((a) => a.mode !== 'Hybrid').map((a) => a.id));

// Tamu yang datang ke Hive Lobby lewat tangga depan
export const LOBBY_DOOR = [0, 0, 8.66 + 4.07];
export const GUESTS = [
  {
    id: 'guest-a',
    nick: 'Tamu',
    role: 'Pengunjung',
    dept: 'guest',
    guest: true,
    skin: 1,
    path: [[0.4, -2.2, 23], [0.4, -2.2, 17.8], [0.4, 0, 13.4], [0.4, 0, 12.2], [1.7, 0, 10.3], [1.0, 0, 6.7]],
  },
  {
    id: 'guest-b',
    nick: 'Tamu',
    role: 'Pengunjung',
    dept: 'guest',
    guest: true,
    skin: 3,
    path: [[-0.4, -2.2, 23], [-0.4, -2.2, 17.8], [-0.4, 0, 13.4], [-0.4, 0, 12.2], [-1.3, 0, 10.6], [-1.0, 0, 6.7]],
  },
];

// q, r = koordinat axial heksagon (flat-top)
const ROOMS = [
  { id: 'hall', name: 'Comb Hall', tier: 0, q: 0, r: 0, kind: 'hall', floor: '#FFF3D6', desc: 'Ruang rapat lintas divisi dengan meja heksagon.' },
  { id: 'lobby', name: 'Hive Lobby', tier: 0, q: 0, r: 1, kind: 'lobby', floor: '#FFE9B8', desc: 'Pintu masuk koloni dan meja resepsionis.' },
  { id: 'lounge', name: 'Nectar Lounge', tier: 0, q: 1, r: 0, kind: 'lounge', floor: '#FCE2C0', desc: 'Pantry dan kafe, tempat agent istirahat.' },
  { id: 'gym', name: 'Pollen Gym', tier: 0, q: -1, r: 1, kind: 'gym', floor: '#EADFCB', desc: 'Mini area HYROX untuk recharge.' },
  { id: 'pods', name: 'Charging Pods', tier: 0, q: -1, r: 0, kind: 'pods', floor: '#EEF1F5', desc: 'Kapsul sel madu untuk mengisi daya.' },
  { id: 'server', name: 'Server Hive', tier: 0, q: 0, r: -1, kind: 'server', floor: '#D9DDE3', desc: 'Rak server sarang yang dipantau tim IT.' },
  { id: 'ops', name: 'Operations & Facilities', tier: 1, q: 0, r: 0, kind: 'dept', dept: 'ops', floor: '#FFF3D6', desc: 'Operasional gym HYROX, F&B, retail, dan fasilitas.' },
  { id: 'cx', name: 'Customer Experience', tier: 1, q: 0, r: 1, kind: 'dept', dept: 'cx', floor: '#FFF3D6', desc: 'Concierge virtual, booking, dan eskalasi member.' },
  { id: 'it', name: 'IT & Infrastructure', tier: 1, q: 1, r: 0, kind: 'dept', dept: 'it', floor: '#F1F2F4', desc: 'Cloud, database, workflow, dan jaringan.' },
  { id: 'mkt', name: 'Marketing Studio', tier: 1, q: 1, r: -1, kind: 'dept', dept: 'mkt', floor: '#FFF3D6', desc: 'Visual generatif dan strategi iklan.' },
  { id: 'fin', name: 'Finance & Data', tier: 1, q: 0, r: -1, kind: 'dept', dept: 'fin', floor: '#FFF3D6', desc: 'Inventori, laporan, dan analitik data.' },
  { id: 'prod', name: 'Product & Innovation', tier: 1, q: -1, r: 0, kind: 'dept', dept: 'prod', floor: '#FFF3D6', desc: 'Riset tren dan prototipe sistem baru.' },
  { id: 'hr', name: 'HR & General Affairs', tier: 1, q: -1, r: 1, kind: 'dept', dept: 'hr', floor: '#FFF3D6', desc: 'Rekrutmen, budaya, legal, dan payroll.' },
  { id: 'royal', name: 'Royal Chamber', tier: 2, q: 0, r: 0, kind: 'royal', dept: 'ceo', floor: '#FFE7A3', desc: 'Ruang Chief Executive, asal semua misi.' },
  { id: 'mission', name: 'Mission Control', tier: 2, q: 1, r: 0, kind: 'mission', floor: '#F3E3C0', desc: 'Papan misi dan peta seluruh koloni.' },
  { id: 'garden', name: 'Rooftop Garden', tier: 2, q: -1, r: 1, kind: 'garden', floor: '#B8D36E', desc: 'Taman atap tempat mencari nektar (riset).' },
];

export function hexToWorld(q, r) {
  return [1.5 * R * q, Math.sqrt(3) * R * (r + q / 2)];
}

export const ROOM_LIST = ROOMS.map((rm) => {
  const [x, z] = hexToWorld(rm.q, rm.r);
  return { ...rm, x, z, y: tierY(rm.tier) };
});
export const ROOM_BY_ID = Object.fromEntries(ROOM_LIST.map((r) => [r.id, r]));

const DEPT_ROOM = { ceo: 'royal', cx: 'cx', ops: 'ops', it: 'it', mkt: 'mkt', fin: 'fin', prod: 'prod', hr: 'hr' };

// Meja tersusun melingkar di sisi belakang ruangan, agent menghadap ke tengah.
const DESK_R = 1.75;
const SEAT_R = 2.55;
export const SEATS = {};
export const SEATS_BY_ROOM = {};
for (const dept of Object.keys(DEPT_ROOM)) {
  const room = ROOM_BY_ID[DEPT_ROOM[dept]];
  const list = AGENTS.filter((a) => a.dept === dept);
  const n = list.length;
  const spread = (52 * Math.PI) / 180;
  const base = dept === 'ceo' ? -Math.PI / 2 : (-100 * Math.PI) / 180;
  SEATS_BY_ROOM[room.id] = [];
  list.forEach((agent, i) => {
    const a = base + (i - (n - 1) / 2) * spread;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const seat = {
      agentId: agent.id,
      roomId: room.id,
      type: agent.desk,
      angle: a,
      deskLocal: [DESK_R * c, 0, DESK_R * s],
      deskRot: Math.atan2(c, s),
      deskWorld: [room.x + DESK_R * c, room.y, room.z + DESK_R * s],
      seat: [room.x + SEAT_R * c, room.y, room.z + SEAT_R * s],
      facing: Math.atan2(-c, -s),
    };
    SEATS[agent.id] = seat;
    SEATS_BY_ROOM[room.id].push(seat);
  });
}

// Titik berdiri di ruang bersama (melingkar, menghadap tengah).
const SPOT_CFG = {
  lounge: { r: 2.5, n: 6 },
  gym: { r: 2.55, n: 6 },
  pods: { r: 2.7, n: 6 },
  garden: { r: 2.6, n: 6 },
  hall: { r: 2.05, n: 6 },
  mission: { r: 2.45, n: 4, base: -90, step: 50 },
  lobby: { r: 2.4, n: 4, base: 0, step: 90 },
  server: { r: 2.3, n: 3, base: 30, step: 120 },
};
const spotCache = {};
export function roomSpots(roomId) {
  if (spotCache[roomId]) return spotCache[roomId];
  const room = ROOM_BY_ID[roomId];
  const cfg = SPOT_CFG[room.kind];
  const out = [];
  for (let i = 0; i < cfg.n; i++) {
    const deg = cfg.base !== undefined ? cfg.base + (i - (cfg.n - 1) / 2) * cfg.step : 30 + 60 * i;
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push({ local: [cfg.r * c, 0, cfg.r * s], angle: a, facing: Math.atan2(-c, -s) });
  }
  spotCache[roomId] = out;
  return out;
}

// Template misi simulasi (bisnis gym HYROX + F&B + retail).
export const MISSIONS = [
  { lead: 'concierge', title: 'Balas 18 chat calon member di WhatsApp' },
  { lead: 'concierge', title: 'Pandu tamu virtual tur fasilitas gym', with: 'hyrox' },
  { lead: 'booking', title: 'Kualifikasi 9 leads dari Instagram Ads', with: 'ads' },
  { lead: 'booking', title: 'Jadwalkan trial class HYROX untuk 6 orang' },
  { lead: 'escalation', title: 'Tangani komplain member soal loker rusak', with: 'maintenance' },
  { lead: 'escalation', title: 'Selesaikan refund paket membership' , with: 'payroll' },
  { lead: 'hyrox', title: 'Susun jadwal HYROX Simulation Race Sabtu' },
  { lead: 'hyrox', title: 'Atur rotasi coach untuk kelas pagi', with: 'culture' },
  { lead: 'fnb', title: 'Restock protein bar dan minuman di kafe', with: 'inventory' },
  { lead: 'fnb', title: 'Rancang menu smoothie edisi race day' },
  { lead: 'maintenance', title: 'Prediksi servis rower #3 (getaran naik)' },
  { lead: 'maintenance', title: 'Cek sensor suhu ruang sauna' },
  { lead: 'safety', title: 'Audit K3 area free weight' },
  { lead: 'safety', title: 'Perbarui SOP evakuasi lantai gym', with: 'legal' },
  { lead: 'cloud', title: 'Backup database member harian' },
  { lead: 'cloud', title: 'Skalakan server saat promo flash sale', with: 'network' },
  { lead: 'workflow', title: 'Sinkronkan booking app ke kalender coach', with: 'booking' },
  { lead: 'workflow', title: 'Otomasi notifikasi perpanjangan member' },
  { lead: 'network', title: 'Pantau latensi WiFi area gym' },
  { lead: 'visual', title: 'Desain carousel "Road to HYROX"', with: 'trend' },
  { lead: 'visual', title: 'Buat 3 variasi visual promo smoothie', with: 'fnb' },
  { lead: 'ads', title: 'Optimasi budget Meta Ads minggu ini', with: 'analyst' },
  { lead: 'ads', title: 'Siapkan kampanye referral member' },
  { lead: 'inventory', title: 'Hitung stok merchandise dan alert reorder' },
  { lead: 'analyst', title: 'Analisis retensi member kuartal ini' },
  { lead: 'analyst', title: 'Rekap revenue F&B harian', with: 'fnb' },
  { lead: 'trend', title: 'Scrape tren fitness TikTok minggu ini' },
  { lead: 'trend', title: 'Pantau harga kompetitor gym sekitar', with: 'analyst' },
  { lead: 'prototyper', title: 'Prototype leaderboard HYROX member', with: 'cloud' },
  { lead: 'prototyper', title: 'Uji coba kiosk check-in wajah' },
  { lead: 'recruit', title: 'Screening 14 CV coach baru' },
  { lead: 'recruit', title: 'Onboarding 2 staf front desk', with: 'culture' },
  { lead: 'culture', title: 'Survei mood tim mingguan' },
  { lead: 'legal', title: 'Review kontrak vendor kebersihan' },
  { lead: 'payroll', title: 'Proses payroll periode ini', with: 'analyst' },
];

export function statusText(st) {
  if (!st) return '';
  const room = (id) => ROOM_BY_ID[id]?.name || '';
  switch (st.state) {
    case 'fly':
      return `Terbang ke ${room(st.destRoom)}`;
    case 'desk':
      return st.missionId ? 'Mengerjakan misi' : 'Kerja rutin di meja';
    case 'break':
      if (st.roomId === 'lounge') return 'Ngopi di Nectar Lounge';
      if (st.roomId === 'gym') return 'Latihan di Pollen Gym';
      if (st.roomId === 'garden') return 'Cari nektar di Rooftop Garden';
      if (st.roomId === 'mission') return 'Memantau Mission Control';
      return `Santai di ${room(st.roomId)}`;
    case 'charge':
      return 'Mengisi daya di Charging Pods';
    case 'meeting':
      return 'Rapat di Comb Hall';
    case 'visit':
      return `Kolaborasi di ${room(st.roomId)}`;
    case 'sleep':
      return `Tidur di ${room(st.roomId)}`;
    default:
      return '';
  }
}
