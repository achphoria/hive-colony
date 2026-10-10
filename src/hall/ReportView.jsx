// Presentasi report oleh Queen Bea: slide disusun dari data koloni saat dibuka,
// dinarasikan dengan suara browser, maju otomatis setelah narasi selesai.
import { useEffect, useMemo, useRef, useState } from 'react';
import { reportData, speak, stopSpeaking } from './ai';
import { cut } from '../ui/hallData';

function buildSlides(r) {
  const top = r.depts.filter((d) => d.done > 0).slice(0, 3);
  const max = Math.max(1, ...r.depts.map((d) => d.done));
  return [
    {
      title: 'Ringkasan koloni hari ini',
      say: `Halo semua. Hari ini koloni sudah menyelesaikan ${r.stats.done} misi dan mengumpulkan ${r.stats.honey} madu. Saat ini ${r.missions.length} misi sedang berjalan dan ${r.awake} dari 21 agent aktif.`,
      body: (
        <div className="kpis">
          <div>
            <b>{r.stats.done}</b>
            <span>Misi selesai</span>
          </div>
          <div>
            <b>{r.stats.honey}</b>
            <span>Madu terkumpul</span>
          </div>
          <div>
            <b>{r.missions.length}</b>
            <span>Misi berjalan</span>
          </div>
          <div>
            <b>{r.awake}/21</b>
            <span>Agent aktif</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Misi selesai per divisi',
      say: top.length
        ? `Divisi paling produktif adalah ${top.map((d) => `${d.name} dengan ${d.done} misi`).join(', ')}.`
        : 'Belum ada misi yang selesai hari ini, jadi grafiknya masih kosong.',
      body: (
        <div className="bars">
          {r.depts.map((d) => (
            <div key={d.id} className="bar-row">
              <span>{d.name}</span>
              <div className="bar-track">
                <i style={{ width: `${(d.done / max) * 100}%`, background: d.color }} />
              </div>
              <b>{d.done}</b>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Yang sedang dikerjakan',
      say: r.missions.length
        ? `Ada ${r.missions.length} misi yang sedang berjalan. Yang paling dekat selesai adalah "${[...r.missions].sort((a, b) => b.progress - a.progress)[0].title}".`
        : 'Saat ini tidak ada misi yang sedang berjalan.',
      body: (
        <div className="slide-list">
          {r.missions.length === 0 && <p className="muted">Tidak ada misi berjalan.</p>}
          {r.missions.slice(0, 5).map((m) => (
            <div key={m.id} className="slide-item">
              <span>{cut(m.title, 46)}</span>
              <div className="bar-track small">
                <i style={{ width: `${Math.round(m.progress * 100)}%`, background: '#FF8C1A' }} />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Yang perlu perhatian',
      say:
        r.pending.length || r.slow.length
          ? `Ada ${r.pending.length} persetujuan yang menunggu keputusan${
              r.slow.length ? `, dan misi paling lambat adalah "${r.slow[0].title}"` : ''
            }.`
          : 'Tidak ada yang macet. Semua berjalan lancar.',
      body: (
        <div className="slide-list">
          {r.pending.map((a) => (
            <div key={a.id} className="slide-item warn">
              <span>⏳ {a.title}</span>
              <small>dari {a.by} · menunggu keputusan</small>
            </div>
          ))}
          {r.slow.map((m) => (
            <div key={m.id} className="slide-item">
              <span>🐢 {cut(m.title, 46)}</span>
              <small>{Math.round(m.progress * 100)}% selesai</small>
            </div>
          ))}
          {!r.pending.length && !r.slow.length && <p className="muted">Semua beres.</p>}
        </div>
      ),
    },
    {
      title: 'Rekomendasi Queen Bea',
      say: `Rekomendasi saya: ${r.pending.length ? 'putuskan persetujuan yang tertunda hari ini, ' : ''}${
        r.slow.length ? 'minta update dari misi yang lambat, ' : ''
      }dan pertahankan ritme divisi yang sedang produktif. Terima kasih.`,
      body: (
        <ol className="recs">
          {r.pending.length > 0 && <li>Putuskan {r.pending.length} persetujuan yang tertunda hari ini.</li>}
          {r.slow.length > 0 && <li>Minta update dari misi yang paling lambat dalam 1 jam.</li>}
          {top[0] && <li>Jadikan cara kerja {top[0].name} contoh untuk divisi lain.</li>}
          <li>Cek ulang papan rencana HYROX Race di rapat berikutnya.</li>
        </ol>
      ),
    },
  ];
}

export function ReportView({ onClose }) {
  const slides = useMemo(() => buildSlides(reportData()), []);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(true);
  const [asked, setAsked] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    stopSpeaking();
    if (!playing) return undefined;
    let alive = true; // narasi yang dibatalkan juga memicu "selesai"; abaikan kalau slide sudah berganti
    const next = () => {
      if (!alive) return;
      if (i < slides.length - 1) timer.current = setTimeout(() => setI((n) => n + 1), 1200);
      else setPlaying(false);
    };
    if (voice) {
      const ok = speak(slides[i].say, next);
      if (!ok) timer.current = setTimeout(next, 8000);
    } else {
      timer.current = setTimeout(next, 8000);
    }
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [i, playing, voice, slides]);

  useEffect(() => () => stopSpeaking(), []);

  const s = slides[i];
  return (
    <div className="report">
      <div className="report-grid">
        <div>
          <div className="slide">
            <div className="slide-meta">
              Slide {i + 1} dari {slides.length} · Laporan koloni
            </div>
            <h2>{s.title}</h2>
            {s.body}
            <div className="slide-prog">
              <i style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
            </div>
          </div>
          <div className={`narration${playing ? ' on' : ''}`}>
            <div className="qb">👑</div>
            <p>
              <b>Queen Bea:</b> {s.say}
            </p>
          </div>
          {asked && (
            <div className="narration">
              <div className="qb">✋</div>
              <p>Pertanyaan dicatat. Di fase berikutnya Queen Bea bisa menjawab langsung di tengah presentasi.</p>
            </div>
          )}
        </div>
        <div className="slide-index">
          {slides.map((sl, k) => (
            <button key={sl.title} className={k === i ? 'on' : ''} onClick={() => setI(k)}>
              {k + 1} · {sl.title}
            </button>
          ))}
        </div>
      </div>
      <div className="meet-bar">
        <button className="hbtn" onClick={() => setI((n) => Math.max(0, n - 1))} aria-label="Slide sebelumnya">
          ⏮
        </button>
        <button className="hbtn pri main" onClick={() => setPlaying(!playing)}>
          {playing ? '⏸ Jeda' : '▶ Putar'}
        </button>
        <button className="hbtn" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))} aria-label="Slide berikutnya">
          ⏭
        </button>
        <button className={`hbtn${voice ? ' pri' : ''}`} onClick={() => setVoice(!voice)} aria-label="Suara narasi">
          {voice ? '🔊' : '🔈'}
          <span className="lbl"> Narasi</span>
        </button>
        <button
          className="hbtn"
          onClick={() => {
            setPlaying(false);
            setAsked(true);
          }}
        >
          ✋<span className="lbl"> Tanya</span>
        </button>
        <button className="hbtn" onClick={() => window.print()} aria-label="Cetak atau simpan PDF">
          ⬇<span className="lbl"> PDF</span>
        </button>
        <button className="hbtn danger" onClick={onClose}>
          Selesai
        </button>
      </div>
    </div>
  );
}
