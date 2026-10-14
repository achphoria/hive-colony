// Teks & kartu animasi di atas Mode Intro (#/intro). Waktunya mengikuti IntroDirector (useIntro.t).
// Siap direkam: kursor & tombol hilang selama diputar, tombol muncul lagi di akhir.
import { useEffect } from 'react';
import { DEPTS } from '../data/hive';
import { useIntro, INTRO_LEN } from '../sim/intro';
import { go } from './nav';

const DEPT_IDS = ['cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
// #/intro?t=30 -> mulai dari detik ke-30 (merekam ulang satu bagian)
const startFrom = () => {
  const v = Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('t'));
  return Number.isFinite(v) && v > 0 && v < INTRO_LEN ? v : 0;
};
const between = (t, a, b) => t >= a && t < b;
// teks muncul huruf demi huruf antara detik a dan b
const typed = (text, t, a, b) => text.slice(0, Math.round(text.length * Math.max(0, Math.min(1, (t - a) / (b - a)))));

function Hex({ size = 120, draw = true }) {
  return (
    <svg className={`io-hex${draw ? ' draw' : ''}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <polygon points="50,4 92,27 92,73 50,96 8,73 8,27" />
      <polygon className="inner" points="50,22 76,36 76,64 50,78 24,64 24,36" />
      <rect x="30" y="44" width="40" height="5" rx="2" />
      <rect x="30" y="55" width="40" height="5" rx="2" />
    </svg>
  );
}

// satu lapisan per adegan; "on" mengatur fade masuk/keluar
function Layer({ on, className = '', children }) {
  return <div className={`io-layer ${className}${on ? ' on' : ''}`}>{children}</div>;
}

const Headline = ({ on, children, pos = 'bl' }) => <div className={`io-headline ${pos}${on ? ' on' : ''}`}>{children}</div>;

export function IntroOverlay() {
  const status = useIntro((s) => s.status);
  const t = useIntro((s) => s.t);
  const clock = useIntro((s) => s.clock);
  const playing = status === 'playing';

  // F = layar penuh, Esc keluar dari layar penuh (bawaan browser), Spasi = putar/ulang
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      }
      if (e.code === 'Space' && useIntro.getState().status !== 'playing') {
        e.preventDefault();
        useIntro.getState().start(startFrom());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => () => useIntro.getState().reset(), []);

  const hh = String(Math.floor(clock)).padStart(2, '0');
  const mm = String(Math.floor((clock % 1) * 60)).padStart(2, '0');
  const black = status === 'ready' ? 1 : t < 4.2 ? 1 : t < 5.6 ? 1 - (t - 4.2) / 1.4 : t > 73.5 ? Math.min(1, (t - 73.5) / 1.3) : 0;

  return (
    <div className={`intro${playing ? ' playing' : ''}`}>
      <div className="io-bars" aria-hidden="true" />
      <div className="io-black" style={{ opacity: black }} />

      {/* 0–5: pembuka */}
      <Layer on={playing && t < 4.6} className="io-center">
        <Hex size={130} />
        <p className={`io-q l1${t > 1.2 ? ' on' : ''}`}>Bagaimana kalau kantor kita punya</p>
        <p className={`io-q l2${t > 2.3 ? ' on' : ''}`}>
          <b>21 rekan kerja AI</b>?
        </p>
      </Layer>

      {/* 5–15: judul */}
      <Layer on={between(t, 6, 14.4)} className="io-title">
        <h1>
          {'HIVE COLONY'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.06 * i}s` }}>
              {ch === ' ' ? '\u00a0' : ch}
            </span>
          ))}
        </h1>
        <p>Kantor virtual 21 agent AI</p>
      </Layer>

      {/* 15–25: lantai & divisi */}
      <Layer on={between(t, 15.3, 24.6)} className="io-depts">
        <div className="io-stat">
          <span>
            <b>7</b> divisi
          </span>
          <i />
          <span>
            <b>20</b> agent
          </span>
          <i />
          <span>
            <b>1</b> Queen
          </span>
        </div>
        <div className="io-chips">
          {DEPT_IDS.map((d, i) => (
            <span key={d} className={t > 16 + i * 1.1 ? 'on' : ''} style={{ '--c': DEPTS[d].color }}>
              {DEPTS[d].name}
            </span>
          ))}
        </div>
      </Layer>

      {/* 25–37: Queen mendelegasikan */}
      <Layer on={between(t, 25.4, 36.6)} className="io-chat">
        <div className="io-card">
          <div className="io-card-head">
            <span className="io-av">👑</span>
            <b>Queen Bea</b>
            <em>Chief Executive</em>
          </div>
          <div className="io-bubble me">
            {typed('Graph, buat rekap penjualan minggu ini. Spark, siapkan 3 ide konten IG.', t, 25.8, 29.6)}
            {t < 29.6 && <span className="io-caret" />}
          </div>
          <div className={`io-bubble ai${t > 30.4 ? ' on' : ''}`}>Siap! Tugas sudah saya kirim ke Graph dan Spark.</div>
          <div className="io-tasks">
            <span className={t > 31 ? 'on' : ''}>→ Graph · Rekap penjualan</span>
            <span className={t > 31.5 ? 'on' : ''}>→ Spark · 3 ide konten IG</span>
          </div>
        </div>
      </Layer>
      <Headline on={between(t, 32.4, 36.6)}>
        Satu perintah,
        <br />
        tim langsung bergerak
      </Headline>

      {/* 37–47: Ruang Kerja */}
      <Layer on={between(t, 37.3, 46.6)} className="io-dim" />
      <Layer on={between(t, 37.3, 46.6)} className="io-cards3">
        <div className="io-card io-slide" style={{ '--d': '0s' }}>
          <p className="io-kicker">Lampiran</p>
          <div className="io-file">
            <i>PDF</i>
            <span>laporan-oktober.pdf</span>
          </div>
          <div className="io-bubble ai on small">Ringkasan: penjualan naik di kelas HYROX, keluhan terbanyak soal jadwal.</div>
        </div>
        <div className="io-card io-slide" style={{ '--d': '0.5s' }}>
          <p className="io-kicker">Mode percakapan suara</p>
          <div className="io-orb" />
          <div className="io-wave">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 6) * 0.11}s` }} />
            ))}
          </div>
        </div>
        <div className="io-card io-slide" style={{ '--d': '1s' }}>
          <p className="io-kicker">Dilatih tim sendiri</p>
          <div className="io-rate">
            <span>👍</span>
            <span>👎</span>
          </div>
          <div className="io-bubble ai on small">Koreksi staff jadi pelajaran agent.</div>
        </div>
      </Layer>
      <Headline on={between(t, 38.5, 46.6)} pos="tl">
        Ngobrol, kirim file,
        <br />
        bicara langsung
      </Headline>

      {/* 47–55: Hive Hall */}
      <Layer on={between(t, 47.4, 54.6)} className="io-chat">
        <div className="io-card">
          <p className="io-kicker">Hive Hall · rapat suara</p>
          <div className="io-people">
            {['A', 'R', 'D', '👑'].map((p, i) => (
              <span key={p} className={(Math.floor(t * 1.4) + i) % 4 === 0 ? 'talk' : ''}>
                {p}
              </span>
            ))}
          </div>
          <p className="io-kicker">Notulen otomatis · Queen Bea</p>
          <ul className="io-notes">
            <li>{typed('Promo HYROX dimulai 1 November', t, 48.5, 50.2)}</li>
            <li>{typed('Spark menyiapkan materi iklan', t, 50.4, 52)}</li>
            <li>{typed('Tally cek anggaran sebelum Jumat', t, 52.2, 53.8)}</li>
          </ul>
        </div>
      </Layer>
      <Headline on={between(t, 48.8, 54.6)}>
        Rapat selesai,
        <br />
        notulen sudah jadi
      </Headline>

      {/* 55–63: bekerja 24 jam */}
      <Layer on={between(t, 55.4, 62.8)} className="io-clock">
        <b>
          {hh}
          <span>:</span>
          {mm}
        </b>
        <p>WIB</p>
        <div className={`io-toast${t > 61.6 ? ' on' : ''}`}>✓ Tugas rutin 08:00 · Rekap keluhan member</div>
      </Layer>
      <Headline on={between(t, 56.5, 62.8)}>Bekerja 24 jam</Headline>

      {/* 63–70: terkendali */}
      <Layer on={between(t, 63.4, 69.6)} className="io-chat">
        <div className="io-card">
          <p className="io-kicker">Statistik owner</p>
          <div className="io-bars-chart">
            {[0.55, 0.8, 0.4, 0.95, 0.65, 0.75].map((h, i) => (
              <i key={i} style={{ '--h': h, animationDelay: `${0.1 * i}s` }} />
            ))}
          </div>
          <div className="io-locks">
            <span>🔐 Login wajib</span>
            <span>🔑 Akses per staff</span>
            <span>📊 Kuota harian</span>
          </div>
        </div>
      </Layer>
      <Headline on={between(t, 64.2, 69.6)}>
        Terpantau, terkendali,
        <br />
        aman
      </Headline>

      {/* 70–75: penutup */}
      <Layer on={between(t, 70.4, INTRO_LEN + 1) && status !== 'ready'} className="io-center io-end">
        <Hex size={110} draw={false} />
        <h2>HIVE COLONY</h2>
        <p>Tim AI yang dilatih oleh tim kita sendiri</p>
      </Layer>

      {/* layar mulai & akhir (tidak ikut terekam saat diputar) */}
      {status === 'ready' && (
        <div className="io-start">
          <Hex size={90} draw={false} />
          <h2>Video perkenalan Hive Colony</h2>
          <p>±75 detik. Tekan F untuk layar penuh, lalu mulai rekam layar (Win+Alt+R atau OBS) sebelum menekan Putar.</p>
          <div className="io-actions">
            <button className="io-btn pri" onClick={() => useIntro.getState().start(startFrom())}>
              ▶ Putar{startFrom() ? ` dari detik ${startFrom()}` : ''}
            </button>
            <button className="io-btn" onClick={() => go('/')}>
              Kembali ke koloni
            </button>
          </div>
        </div>
      )}
      {status === 'done' && (
        <div className="io-actions io-after">
          <button className="io-btn pri" onClick={() => useIntro.getState().start()}>
            ↺ Putar ulang
          </button>
          <button className="io-btn" onClick={() => go('/')}>
            Kembali ke koloni
          </button>
        </div>
      )}
    </div>
  );
}
