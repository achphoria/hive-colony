// Statistik pemakaian agent (#/statistik, khusus owner): pesan per agent & staff, waktu balas, error,
// perkiraan volume token, dan batas pesan harian per staff.
import { useEffect, useState } from 'react';
import { AGENT_BY_ID, DEPTS } from '../data/hive';
import { useAuth } from '../sim/auth';
import { loadStats, setDailyLimit, GROK_AGENTS } from '../hall/agentApi';
import { go } from './nav';

const PERIODS = [
  [1, 'Hari ini'],
  [7, '7 hari'],
  [30, '30 hari'],
];
const fmt = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const secs = (s) => (s == null ? '–' : s < 60 ? `${s} dtk` : `${Math.floor(s / 60)} mnt ${s % 60} dtk`);
const engineOf = (id) => (id === 'ceo' ? 'Claude / Grok' : GROK_AGENTS.includes(id) ? 'Grok Bot' : 'Claude · n8n');
// ±4 karakter per token; belum termasuk persona & riwayat yang ikut terkirim
const tokens = (chars) => chars / 4;

export function StatsPage() {
  const account = useAuth((s) => s.account);
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (account?.role !== 'owner') return;
    setData(null);
    setError('');
    loadStats(days)
      .then((d) => {
        setData(d);
        setLimit(String(d?.limits?.daily_per_staff ?? 0));
      })
      .catch((e) => setError(e.message));
  }, [days, account]);

  if (!account || account.role !== 'owner') {
    return (
      <div className="page aw-page">
        <div className="aw-empty-card">
          <h1>Statistik agent</h1>
          <p>Hanya owner yang bisa melihat statistik pemakaian.</p>
          <button className="save" onClick={() => go('/')}>
            Kembali ke koloni
          </button>
        </div>
      </div>
    );
  }

  const agents = data?.agents || [];
  const staff = data?.staff || [];
  const daily = data?.daily || [];
  const total = agents.reduce(
    (t, a) => ({
      asks: t.asks + a.asks,
      replies: t.replies + a.replies,
      errors: t.errors + a.errors,
      chars: t.chars + a.in_chars + a.out_chars,
      wsum: t.wsum + (a.avg_sec || 0) * a.replies,
      wn: t.wn + (a.avg_sec != null ? a.replies : 0),
    }),
    { asks: 0, replies: 0, errors: 0, chars: 0, wsum: 0, wn: 0 },
  );
  const maxDay = Math.max(1, ...daily.map((d) => d.asks));
  const maxStaff = Math.max(1, ...staff.map((s) => s.asks));

  const saveLimit = async () => {
    const n = Math.max(0, Math.min(2000, Math.round(Number(limit) || 0)));
    setSaving(true);
    setNote('');
    try {
      await setDailyLimit(n);
      setLimit(String(n));
      setNote(n ? `Batas disimpan: ${n} pesan per staff per hari.` : 'Batas dimatikan (tanpa batas).');
    } catch (e) {
      setNote(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page aw-page">
      <header className="aw-top">
        <button className="back" onClick={() => go('/agent')}>
          ← <span className="lbl">Ruang kerja</span>
        </button>
        <h1>Statistik agent</h1>
        <div className="aw-engine st-period" role="radiogroup" aria-label="Periode">
          {PERIODS.map(([d, l]) => (
            <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
              {l}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Memuat statistik…</p>}

      {data && (
        <>
          <div className="st-cards">
            <div className="st-card">
              <b>{fmt(total.asks)}</b>
              <span>pesan dari staff</span>
            </div>
            <div className="st-card">
              <b>{fmt(total.replies)}</b>
              <span>balasan agent</span>
            </div>
            <div className={`st-card${total.errors ? ' warn' : ''}`}>
              <b>{fmt(total.errors)}</b>
              <span>gagal / offline</span>
            </div>
            <div className="st-card">
              <b>{total.wn ? secs(Math.round(total.wsum / total.wn)) : '–'}</b>
              <span>rata-rata waktu balas</span>
            </div>
            <div className="st-card">
              <b>±{fmt(tokens(total.chars))}</b>
              <span>token teks chat*</span>
            </div>
          </div>

          <div className="st-grid">
            <section className="st-panel">
              <h2>Per agent</h2>
              {agents.length === 0 ? (
                <p className="muted small">Belum ada percakapan di periode ini.</p>
              ) : (
                <div className="st-table-wrap">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Mesin</th>
                        <th>Pesan</th>
                        <th>Tugas</th>
                        <th>Gagal</th>
                        <th>Waktu balas</th>
                        <th>±Token*</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => {
                        const def = AGENT_BY_ID[a.agent_id];
                        return (
                          <tr key={a.agent_id}>
                            <td>
                              <i className="st-dot" style={{ background: def ? DEPTS[def.dept].color : '#ccc' }} />
                              <button className="st-link" onClick={() => go(`/agent/${a.agent_id}`)}>
                                {def?.nick || a.agent_id}
                              </button>
                            </td>
                            <td className="muted">{engineOf(a.agent_id)}</td>
                            <td>{fmt(a.asks - a.tasks)}</td>
                            <td>{fmt(a.tasks)}</td>
                            <td className={a.errors ? 'st-bad' : ''}>{fmt(a.errors)}</td>
                            <td>{secs(a.avg_sec)}</td>
                            <td>{fmt(tokens(a.in_chars + a.out_chars))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small st-foot">
                *Perkiraan kasar dari panjang teks chat (±4 karakter per token). Belum termasuk persona, riwayat, data koloni, dan riset web yang ikut terkirim, jadi pemakaian sebenarnya lebih besar. Biaya pasti: Claude Console & xAI Console.
              </p>
            </section>

            <section className="st-panel">
              <h2>Per hari</h2>
              {daily.length === 0 ? (
                <p className="muted small">Belum ada data.</p>
              ) : (
                <div className="st-bars">
                  {daily.map((d) => (
                    <div key={d.day} className="st-bar" title={`${d.day}: ${d.asks} pesan${d.errors ? `, ${d.errors} gagal` : ''}`}>
                      <i style={{ height: `${(d.asks / maxDay) * 100}%` }} />
                      <span>{d.day.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}

              <h2>Per staff</h2>
              {staff.length === 0 && <p className="muted small">Belum ada data.</p>}
              {staff.map((s) => (
                <div key={s.user_id} className="st-staff">
                  <span>{s.name || 'Staff'}</span>
                  <div>
                    <i style={{ width: `${(s.asks / maxStaff) * 100}%` }} />
                  </div>
                  <b>{fmt(s.asks)}</b>
                </div>
              ))}

              <h2>Batas pesan harian</h2>
              <p className="muted small">Maksimal pesan per staff per hari ke semua agent (owner tidak dibatasi). 0 = tanpa batas. Tugas rutin & delegasi tidak dihitung.</p>
              <div className="st-limit">
                <input type="number" min={0} max={2000} value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Batas pesan per staff per hari" />
                <span>pesan / staff / hari</span>
                <button className="save" disabled={saving} onClick={saveLimit}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
              {note && <p className="aw-notice inline">{note}</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
