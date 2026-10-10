// Arsip rapat: "perpustakaan" semua rapat Hive Hall, lengkap dengan notulen (MoM), laporan,
// dan transkrip. Notulen & laporan dibuat Queen Bea (Claude) otomatis saat rapat selesai.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';
import { useIsMobile } from '../ui/HUD';
import { requestRecap } from './meeting';

const STATUS = {
  live: { label: 'Berlangsung', cls: 'live' },
  summarizing: { label: 'Menyusun notulen…', cls: 'busy' },
  done: { label: 'Selesai', cls: 'done' },
  failed: { label: 'Notulen gagal', cls: 'fail' },
};
const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const wib = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3);
const hm = (iso) => {
  const d = wib(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const dateLabel = (iso) => {
  const d = wib(iso);
  return `${DAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const duration = (m) => {
  if (!m.ended_at) return '';
  const mins = Math.max(1, Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} j ${mins % 60} m` : `${mins} menit`;
};

function momText(m, lines) {
  const mom = m.mom || {};
  const out = [`NOTULEN RAPAT: ${m.title}`, `${dateLabel(m.started_at)} · ${hm(m.started_at)}${m.ended_at ? `–${hm(m.ended_at)} WIB` : ''}`, `Peserta: ${(m.participants || []).join(', ') || '-'}`, '', 'Ringkasan', mom.summary || '-'];
  if (mom.decisions?.length) out.push('', 'Keputusan', ...mom.decisions.map((d) => `- ${d}`));
  if (mom.action_items?.length) out.push('', 'Tindak lanjut', ...mom.action_items.map((a) => `- ${a.task} (PIC: ${a.owner}; tenggat: ${a.due})`));
  if (m.report) out.push('', 'Laporan', m.report);
  if (lines?.length) out.push('', 'Transkrip', ...lines.map((l) => `[${hm(l.created_at)}] ${l.kind === 'ai' ? 'Queen Bea' : l.speaker_name}: ${l.text}`));
  return out.join('\n');
}

function Detail({ m, onBack, isOwner }) {
  const [lines, setLines] = useState(null);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const mom = m.mom || {};

  useEffect(() => {
    let alive = true;
    setLines(null);
    supabase
      .from('hc_meeting_lines')
      .select('id, speaker_name, kind, text, created_at')
      .eq('meeting_id', m.id)
      .order('created_at')
      .limit(1500)
      .then(({ data }) => alive && setLines(data || []));
    return () => {
      alive = false;
    };
  }, [m.id, m.status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(momText(m, lines));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard ditolak */
    }
  };
  const print = () => {
    document.body.classList.add('print-archive');
    window.print();
    setTimeout(() => document.body.classList.remove('print-archive'), 300);
  };
  const st = STATUS[m.status] || STATUS.done;
  const speech = (lines || []).filter((l) => l.kind === 'speech' || l.kind === 'ai');

  return (
    <article className="arc-detail">
      {onBack && (
        <button className="hbtn arc-back" onClick={onBack}>
          ← Semua rapat
        </button>
      )}
      <div className="arc-head">
        <div>
          <span className={`arc-status ${st.cls}`}>{st.label}</span>
          <h2>{m.title}</h2>
          <p className="muted">
            {dateLabel(m.started_at)} · {hm(m.started_at)}
            {m.ended_at ? `–${hm(m.ended_at)} WIB · ${duration(m)}` : ' WIB'}
          </p>
          {m.participants?.length > 0 && <p className="arc-people">👥 {m.participants.join(', ')}</p>}
        </div>
        <div className="arc-actions">
          <button className="hbtn" onClick={copy} disabled={!lines}>
            {copied ? 'Tersalin ✓' : '📋 Salin'}
          </button>
          <button className="hbtn" onClick={print}>
            🖨 Cetak / PDF
          </button>
        </div>
      </div>

      {m.status === 'live' && <div className="arc-note">Rapat masih berlangsung. Notulen dibuat Queen Bea begitu rapat selesai.</div>}
      {m.status === 'summarizing' && (
        <div className="arc-note busy">
          <span className="arc-spin" aria-hidden="true" /> Queen Bea sedang menyusun notulen dan laporan…
        </div>
      )}
      {m.status === 'failed' && (
        <div className="arc-note fail">
          Notulen gagal dibuat{m.error ? `: ${m.error}` : '.'}
          {isOwner && (
            <button
              className="hbtn pri"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                await requestRecap(m.id, true);
                setRetrying(false);
              }}
            >
              {retrying ? 'Memproses…' : 'Buat ulang notulen'}
            </button>
          )}
        </div>
      )}

      {m.status === 'done' && (
        <>
          <section className="arc-sec">
            <h3>👑 Ringkasan Queen Bea</h3>
            <p>{mom.summary}</p>
            {mom.topics?.length > 0 && (
              <div className="arc-chips">
                {mom.topics.map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </div>
            )}
          </section>
          <section className="arc-sec">
            <h3>✓ Keputusan</h3>
            {mom.decisions?.length ? (
              <ul>
                {mom.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Tidak ada keputusan yang tercatat.</p>
            )}
          </section>
          <section className="arc-sec">
            <h3>＋ Tindak lanjut</h3>
            {mom.action_items?.length ? (
              <div className="arc-tasks">
                {mom.action_items.map((a, i) => (
                  <div key={i} className="arc-task">
                    <b>{a.task}</b>
                    <span>PIC: {a.owner}</span>
                    <span>Tenggat: {a.due}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Tidak ada tindak lanjut.</p>
            )}
          </section>
          {m.report && (
            <section className="arc-sec">
              <h3>📄 Laporan rapat</h3>
              {m.report
                .split(/\n+/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </section>
          )}
        </>
      )}

      <details className="arc-sec arc-tx" open={m.status !== 'done'}>
        <summary>
          <h3>🎙 Transkrip</h3>
          <span className="muted">{lines ? `${speech.length} baris` : 'memuat…'}</span>
        </summary>
        {lines && lines.length === 0 && <p className="muted">Belum ada transkrip.</p>}
        {lines?.map((l) =>
          l.kind === 'join' || l.kind === 'leave' ? (
            <div key={l.id} className="tx sys">
              {hm(l.created_at)} · {l.text}
            </div>
          ) : (
            <div key={l.id} className={`tx${l.kind === 'ai' ? ' ceo' : ''}`}>
              <span className="tx-t">{hm(l.created_at)}</span> <b>{l.kind === 'ai' ? 'Queen Bea' : l.speaker_name}:</b> {l.text}
            </div>
          ),
        )}
      </details>
    </article>
  );
}

export function ArchiveView() {
  const account = useAuth((s) => s.account);
  const mobile = useIsMobile();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!account) return undefined;
    const load = () =>
      supabase
        .from('hc_meetings')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100)
        .then(({ data }) => setList(data || []));
    load();
    const ch = supabase
      .channel('hc-archive')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_meetings' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [account]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!list) return [];
    if (!k) return list;
    return list.filter((m) => `${m.title} ${m.mom?.summary || ''} ${(m.participants || []).join(' ')}`.toLowerCase().includes(k));
  }, [list, q]);

  if (!account) {
    return (
      <div className="arc-empty">
        <div className="portal-ic">📚</div>
        <h2>Arsip rapat</h2>
        <p>Login sebagai staff untuk melihat arsip rapat, notulen, dan laporan dari Queen Bea.</p>
      </div>
    );
  }

  const current = sel && list?.find((m) => m.id === sel);
  const detail = current ? <Detail m={current} isOwner={account.role === 'owner'} onBack={mobile ? () => setSel(null) : null} /> : null;

  if (mobile && detail) return <div className="archive">{detail}</div>;

  return (
    <div className="archive">
      <aside className="arc-list">
        <input className="arc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul, isi notulen, peserta…" />
        {list === null && <p className="muted">Memuat arsip…</p>}
        {list && list.length === 0 && <p className="muted">Belum ada rapat. Rapat yang selesai otomatis masuk ke sini lengkap dengan notulen Queen Bea.</p>}
        {list && list.length > 0 && shown.length === 0 && <p className="muted">Tidak ada rapat yang cocok.</p>}
        {shown.map((m) => {
          const st = STATUS[m.status] || STATUS.done;
          return (
            <button key={m.id} className={`arc-item${sel === m.id ? ' on' : ''}`} onClick={() => setSel(m.id)}>
              <span className={`arc-status ${st.cls}`}>{st.label}</span>
              <b>{m.title}</b>
              <small>
                {dateLabel(m.started_at)} · {hm(m.started_at)}
                {m.ended_at ? ` · ${duration(m)}` : ''}
              </small>
              {m.mom?.summary && <p>{m.mom.summary}</p>}
            </button>
          );
        })}
      </aside>
      {!mobile && (detail || <div className="arc-placeholder muted">Pilih rapat di kiri untuk membaca notulen, laporan, dan transkripnya.</div>)}
    </div>
  );
}
