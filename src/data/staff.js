// Staff manusia (mode demo): opsi avatar, pose joget, staff contoh, dan profil "saya" di browser.

export const POSES = [
  { id: 'idle', name: 'Diam', desc: 'Berdiri santai' },
  { id: 'pargoy', name: 'Pargoy Lebah', desc: 'Beat DJ, sayap heboh, freeze!' },
  { id: 'itik', name: 'Goyang Itik', desc: 'Kepak-kepak, pinggul goyang' },
  { id: 'floss', name: 'Floss', desc: 'Tangan ayun silang cepat' },
  { id: 'baling', name: 'Baling-baling', desc: 'Tangan muter, siap lepas landas' },
  { id: 'robot', name: 'Robot Patah-patah', desc: 'Kaku, patah-patah, serius' },
  { id: 'koboi', name: 'Koboi Galau', desc: 'Naik kuda imajiner + laso' },
];
export const POSE_BY_ID = Object.fromEntries(POSES.map((p) => [p.id, p]));

export const AVATAR_OPTIONS = {
  hair: [
    ['short', 'Pendek'],
    ['long', 'Panjang'],
    ['pony', 'Kuncir'],
    ['mohawk', 'Mohawk'],
    ['bald', 'Botak'],
  ],
  hairColor: [
    ['#2B2B2E', 'Hitam'],
    ['#6B4416', 'Cokelat'],
    ['#C98A00', 'Madu'],
    ['#D85A30', 'Merah'],
    ['#7F77DD', 'Ungu'],
  ],
  skin: [
    ['#FFE0BD', 'Terang'],
    ['#F1C27D', 'Kuning langsat'],
    ['#E0AC69', 'Sawo matang'],
    ['#C68642', 'Cokelat'],
    ['#8D5524', 'Gelap'],
  ],
  outfit: [
    ['hoodie', 'Hoodie lebah'],
    ['tee', 'Kaos tim'],
    ['jacket', 'Jaket gym'],
    ['shirt', 'Kemeja'],
  ],
  outfitColor: [
    ['#FFB020', 'Madu'],
    ['#2B2B2E', 'Graphite'],
    ['#4A6FA5', 'Biru'],
    ['#8DBF5A', 'Hijau'],
    ['#C0C5CE', 'Silver'],
  ],
  acc: [
    ['none', 'Tidak ada'],
    ['glasses', 'Kacamata'],
    ['cap', 'Topi'],
    ['band', 'Headband'],
    ['ear', 'Anting'],
  ],
  tattoo: [
    ['none', 'Tidak ada'],
    ['arm', 'Sarang di lengan'],
    ['cheek', 'Heksagon di pipi'],
  ],
  expr: [
    ['happy', 'Senang'],
    ['hype', 'Semangat'],
    ['chill', 'Santai'],
    ['wink', 'Kedip'],
  ],
};

export const DEFAULT_PROFILE = {
  id: 'me',
  name: '',
  dept: 'ops',
  hair: 'short',
  hairColor: '#2B2B2E',
  skin: '#F1C27D',
  outfit: 'hoodie',
  outfitColor: '#FFB020',
  acc: 'none',
  tattoo: 'none',
  expr: 'happy',
  pose: 'pargoy',
};

export const DEMO_STAFF = [
  { id: 'dina', name: 'Dina', dept: 'ops', hair: 'long', hairColor: '#6B4416', skin: '#E0AC69', outfit: 'jacket', outfitColor: '#8DBF5A', acc: 'band', tattoo: 'none', expr: 'happy', pose: 'pargoy', spot: 'rapat' },
  { id: 'rudi', name: 'Rudi', dept: 'ops', hair: 'mohawk', hairColor: '#2B2B2E', skin: '#C68642', outfit: 'tee', outfitColor: '#D85A30', acc: 'cap', tattoo: 'arm', expr: 'hype', pose: 'koboi', spot: 'gudang' },
  { id: 'maya', name: 'Maya', dept: 'cx', hair: 'pony', hairColor: '#7F77DD', skin: '#FFE0BD', outfit: 'hoodie', outfitColor: '#FFB020', acc: 'ear', tattoo: 'cheek', expr: 'wink', pose: 'floss', spot: 'lobby' },
  { id: 'tono', name: 'Tono', dept: 'hr', hair: 'short', hairColor: '#2B2B2E', skin: '#F1C27D', outfit: 'shirt', outfitColor: '#4A6FA5', acc: 'glasses', tattoo: 'none', expr: 'chill', pose: 'robot', spot: 'outdoor' },
];

const KEY = 'hive.profile';
export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw), id: 'me' } : null;
  } catch {
    return null;
  }
}
export function saveProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* penyimpanan browser tidak tersedia: profil hanya berlaku di sesi ini */
  }
}
