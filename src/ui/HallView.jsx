// Hive Hall: ruang rapat manusia + AI. Tab Rapat = ruang 3D full-wide dengan layar dinding live;
// tab lain = papan rencana, kalender, dan persetujuan. Mode demo: call suara disimulasikan dan
// Queen Bea menjawab dengan text-to-speech bawaan browser.
import { useEffect, useState } from 'react';
import { AGENT_BY_ID, DEPTS } from '../data/hive';
import { DEMO_STAFF, DEFAULT_PROFILE } from '../data/staff';
import { useHive } from '../sim/store';
import { HallScene, DEFAULT_VIEW, DEFAULT_VIEW_MOBILE } from '../scene/HallScene';
import { cut, DAY, MONTH, wibNow, demoEvents, useHallData } from './hallData';
import { SoundToggle, useIsMobile } from './HUD';
import { go } from './nav';
import { useAuth } from '../sim/auth';
import { decideApproval, advanceTask } from '../sim/hallSync';
import { useMeeting } from '../hall/meeting';
import { MeetingView } from '../hall/MeetingView';
import { ReportView } from '../hall/ReportView';
import { ChiefView, PortalView } from '../hall/ChiefView';

function useActionError() {
  const [msg, setMsg] = useState('');
  const run = async (fn) => {
    try {
      setMsg('');
      await fn();
    } catch (e) {
      setMsg(e.message);
    }
  };
  return [msg, run];
}

/* ---------- tab lain ---------- */

function PlanBoard() {
  const tasks = useHive((s) => s.planTasks);
  const missions = useHive((s) => s.missions);
  const log = useHive((s) => s.log);
  const [err, run] = useActionError();
  const done = log.filter((e) => e.kind === 'done').slice(0, 4);
  const cols = [
    { id: 'todo', name: 'Belum', color: '#C0C5CE' },
    { id: 'doing', name: 'Jalan', color: '#F5B700' },
    { id: 'done', name: 'Selesai', color: '#8DBF5A' },
  ];
  return (
    <>
    {err && <div className="error hall-error">{err}</div>}
    <div className="kanban">
      {cols.map((c) => (
        <div key={c.id} className="kcol">
          <div className="khead" style={{ borderColor: c.color }}>
            {c.name}
            <em>
              {tasks.filter((t) => t.col === c.id).length + (c.id === 'doing' ? missions.length : c.id === 'done' ? done.length : 0)}
            </em>
          </div>
          {tasks
            .filter((t) => t.col === c.id)
            .map((t) => (
              <button key={t.id} className={`kcard ${t.kind}`} onClick={() => run(() => advanceTask(t))} title="Klik untuk pindah kolom">
                <span className={`who ${t.kind}`}>{t.who}</span>
                <p>{t.title}</p>
                <small>Rencana HYROX Race · klik untuk pindah</small>
              </button>
            ))}
          {c.id === 'doing' &&
            missions.map((m) => (
              <div key={m.id} className="kcard ai live">
                <span className="who ai">{AGENT_BY_ID[m.leadId].nick}</span>
                <p>{m.title}</p>
                <div className="bar">
                  <i style={{ width: `${Math.round(m.progress * 100)}%` }} />
                </div>
              </div>
            ))}
          {c.id === 'done' &&
            done.map((e) => (
              <div key={e.id} className="kcard ai faded">
                <p>{e.text}</p>
              </div>
            ))}
        </div>
      ))}
    </div>
    </>
  );
}

function CalendarMonth() {
  const now = wibNow();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const first = new Date(Date.UTC(y, mo, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  const events = demoEvents();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div className="calendar">
      <div className="cal-title">
        {MONTH[mo]} {y}
      </div>
      <div className="cal-grid">
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />;
          const ts = Date.UTC(y, mo, d);
          const evs = events.filter((e) => e.ts === ts);
          return (
            <div key={i} className={`cal-cell${d === today ? ' today' : ''}`}>
              <span className="cal-d">{d}</span>
              {evs.map((e) => (
                <span key={e.title} className={`cal-ev${e.big ? ' big' : ''}`} style={{ '--c': e.color }}>
                  {e.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Approvals() {
  const approvals = useHive((s) => s.approvals);
  const account = useAuth((s) => s.account);
  const [err, run] = useActionError();
  const canDecide = !account || ['owner', 'lead'].includes(account.role);
  const label = { approved: 'Disetujui', revise: 'Diminta revisi', rejected: 'Ditolak' };
  return (
    <>
      {err && <div className="error hall-error">{err}</div>}
      <div className="approvals">
        {approvals.map((a) => (
          <div key={a.id} className={`appr ${a.status}`}>
            <div className="appr-top">
              <span className="chip" style={{ '--c': DEPTS[a.dept]?.color }}>
                {DEPTS[a.dept]?.short}
              </span>
              <span className="muted">dari {a.by}</span>
            </div>
            <h3>{a.title}</h3>
            <p>{a.detail}</p>
            {a.status !== 'pending' ? (
              <div className="appr-done">{label[a.status]}</div>
            ) : canDecide ? (
              <div className="appr-btns">
                <button className="hbtn pri" onClick={() => run(() => decideApproval(a, 'approved'))}>
                  Setujui
                </button>
                <button className="hbtn" onClick={() => run(() => decideApproval(a, 'revise'))}>
                  Revisi
                </button>
                <button className="hbtn danger" onClick={() => run(() => decideApproval(a, 'rejected'))}>
                  Tolak
                </button>
              </div>
            ) : (
              <div className="appr-done muted">Menunggu keputusan owner atau kepala divisi</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- HP: isi layar dinding sebagai kartu geser ---------- */

function MobileScreens({ data }) {
  return (
    <div className="mscreens" role="list" aria-label="Layar dinding Hive Hall">
      <section className="mcard" role="listitem">
        <div className="ws-head gold">
          <i className="live" /> Aktivitas live
        </div>
        <div className="mcard-body">
          {data.feed.length === 0 && <p className="ws-empty">Menunggu aktivitas pertama…</p>}
          {data.feed.slice(0, 4).map((f) => (
            <div key={f.id} className="mrow">
              <span className="t">{f.t}</span>
              <span>{cut(f.text, 40)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mcard" role="listitem">
        <div className="ws-head amber">Belum selesai · {data.open.length}</div>
        <div className="mcard-body">
          {data.open.length === 0 && <p className="ws-empty ok">Semua beres</p>}
          {data.open.slice(0, 3).map((o, i) => (
            <div key={i} className="mrow task" style={{ '--c': o.color }}>
              <b>{cut(o.title, 34)}</b>
              <small>{o.sub}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="mcard" role="listitem">
        <div className="ws-head gold">Kalender minggu ini</div>
        <div className="mcard-body">
          {data.events.length === 0 && <p className="ws-empty">Belum ada agenda minggu ini</p>}
          {data.events.slice(0, 4).map((e) => {
            const d = new Date(e.ts);
            return (
              <div key={e.title} className={`mrow ev${e.big ? ' big' : ''}`} style={{ '--c': e.color }}>
                {DAY[d.getUTCDay()]} {d.getUTCDate()} · {e.title}
              </div>
            );
          })}
        </div>
      </section>
      <section className="mcard" role="listitem">
        <div className="ws-head blue">Online · {data.online.length}</div>
        <div className="mcard-body">
          {data.online.slice(0, 4).map((o) => (
            <div key={o.name} className="mrow person">
              <i style={{ background: o.color }} />
              <span>{cut(o.name, 22)}</span>
              <small className={o.here ? 'here' : ''}>{o.where}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="mcard" role="listitem">
        <div className="ws-head green">Skor skill agent</div>
        <div className="mcard-body">
          {data.skills.slice(0, 4).map((k) => (
            <div key={k.id} className="mrow skill">
              <span>{k.nick}</span>
              <div className="sbar">
                <i style={{ width: `${k.score}%`, background: k.score >= 85 ? '#F5B700' : '#FF8C1A' }} />
              </div>
              <b>{k.score}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- lobi: status meeting + tombol aksi ---------- */

const LOBBY_CALL = { speaker: null, mic: true }; // ruang 3D di lobi: semua diam

function useMeetingClock(startedAt) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);
  return startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
}

function MeetingBanner({ onJoin }) {
  const m = useMeeting();
  const mins = useMeetingClock(m.startedAt);
  if (!m.active) return null;
  const count = m.people.length + (m.joined ? 1 : 0);
  return (
    <button className="live-banner" onClick={onJoin}>
      <span className="live-dot" />
      <span className="live-text">
        <b>{m.title || 'Rapat koloni'}</b> · {count || 1} orang · {mins} menit · AI mentranskrip
      </span>
      <span className="live-join">Gabung</span>
    </button>
  );
}

function StartMeetingDialog({ onCancel, onStart }) {
  const [title, setTitle] = useState('');
  return (
    <div className="dialog-scrim" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="start-title">
        <h2 id="start-title">Mulai meeting</h2>
        <p className="muted">Semua orang yang membuka Hive Hall akan melihat meeting ini dan bisa bergabung.</p>
        <input
          autoFocus
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onStart(title)}
          placeholder="Rapat mingguan Operations"
        />
        <div className="dialog-btns">
          <button className="hbtn" onClick={onCancel}>
            Batal
          </button>
          <button className="hbtn pri" onClick={() => onStart(title)}>
            🎙 Mulai
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionDock({ onAction }) {
  const active = useMeeting((s) => s.active);
  const items = [
    {
      id: 'meeting',
      ic: '🎙',
      bg: '#FCEBEB',
      title: active ? 'Gabung meeting' : 'Mulai meeting',
      sub: active ? 'Rapat sedang berlangsung. Masuk dan ikut transkrip live.' : 'Buka ruang meeting untuk semua. Transkrip live oleh AI.',
    },
    { id: 'report', ic: '📊', bg: '#FCE7B0', title: 'Presentasi report', sub: 'Queen Bea mempresentasikan laporan koloni.' },
    { id: 'chief', ic: '👑', bg: '#DCE6F4', title: 'Ngobrol dengan Chief', sub: 'Chat dengan lampiran, atau ngobrol pakai suara.' },
    { id: 'portal', ic: '🗂', bg: '#F3E3C0', title: 'Portal karyawan', sub: 'Cuti, slip gaji, dokumen.', soon: true },
  ];
  return (
    <div className="dock">
      {items.map((it) => (
        <button key={it.id} className={`dock-tile${it.soon ? ' soon' : ''}${it.id === 'meeting' && active ? ' live' : ''}`} onClick={() => onAction(it.id)}>
          <span className="dock-ic" style={{ background: it.bg }}>
            {it.ic}
          </span>
          <b>{it.title}</b>
          <span className="dock-sub">{it.sub}</span>
          {it.soon && <span className="soon-badge">Segera hadir</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- halaman ---------- */

const VIEW_TITLE = { meeting: 'Meeting', report: 'Presentasi report', chief: 'Ngobrol dengan Chief', portal: 'Portal karyawan' };

export function HallView() {
  const [tab, setTab] = useState('lobi');
  const [mode, setMode] = useState('lobby'); // lobby | meeting | report | chief | portal
  const [asking, setAsking] = useState(false);
  const mobile = useIsMobile();
  const baseView = mobile ? DEFAULT_VIEW_MOBILE : DEFAULT_VIEW;
  const [view, setView] = useState(baseView);
  useEffect(() => setView(baseView), [mobile]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = useHive((s) => s.profile);
  const me = profile || { ...DEFAULT_PROFILE, name: 'Anda' };
  const account = useAuth((s) => s.account);
  const onlineStaff = useHive((s) => s.onlineStaff);
  const mate = onlineStaff.find((o) => o.page === '/hall') || onlineStaff[0];
  const dina = account ? (mate ? { ...mate.profile, name: mate.name } : null) : DEMO_STAFF[0];
  const data = useHallData(me);
  const meetingActive = useMeeting((s) => s.active);
  const meetingJoined = useMeeting((s) => s.joined);

  // status "satu server meeting" diawasi sejak membuka Hive Hall
  useEffect(() => {
    useMeeting.getState().watch();
  }, [account]);
  // keluar dari Hive Hall = keluar meeting (mic & suara tidak tertinggal menyala)
  useEffect(
    () => () => {
      if (useMeeting.getState().joined) useMeeting.getState().leave();
    },
    [],
  );

  const tabs = [
    ['lobi', 'Lobi'],
    ['rencana', 'Papan rencana'],
    ['kalender', 'Kalender'],
    ['persetujuan', `Persetujuan${data.pending ? ` · ${data.pending}` : ''}`],
  ];
  const zoomed = !!view.zoomed;

  const openAction = (id) => {
    if (id === 'meeting') {
      if (meetingActive) setMode('meeting');
      else setAsking(true);
      return;
    }
    setMode(id);
  };

  const head = (
    <div className="hall-head">
      <button
        className="back"
        onClick={() => (mode !== 'lobby' && tab === 'lobi' ? setMode('lobby') : go('/'))}
        aria-label={mode !== 'lobby' && tab === 'lobi' ? 'Kembali ke lobi' : 'Kembali ke koloni'}
      >
        ← <span className="lbl">{mode !== 'lobby' && tab === 'lobi' ? 'Lobi' : 'Koloni'}</span>
      </button>
      <div className="hall-title">
        <h1>{mode !== 'lobby' && tab === 'lobi' ? VIEW_TITLE[mode] : 'Hive Hall'}</h1>
        <p>{account ? 'Tersambung ke database' : 'Mode demo'}</p>
      </div>
      <div className="hall-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => {
              setTab(id);
              if (id === 'lobi' && !meetingJoined) setMode('lobby');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <SoundToggle />
    </div>
  );

  if (tab !== 'lobi' || mode !== 'lobby') {
    return (
      <div className="page hall-page">
        <div className="hall-inner wide">
          {head}
          {tab === 'rencana' && <PlanBoard />}
          {tab === 'kalender' && <CalendarMonth />}
          {tab === 'persetujuan' && <Approvals />}
          {tab === 'lobi' && mode === 'meeting' && <MeetingView onLeave={() => setMode('lobby')} onReport={() => setMode('report')} />}
          {tab === 'lobi' && mode === 'report' && <ReportView onClose={() => setMode(meetingJoined ? 'meeting' : 'lobby')} />}
          {tab === 'lobi' && mode === 'chief' && <ChiefView />}
          {tab === 'lobi' && mode === 'portal' && <PortalView />}
        </div>
      </div>
    );
  }

  return (
    <div className="hall3d">
      <HallScene data={data} me={me} dina={dina} call={LOBBY_CALL} view={view} setView={setView} mobile={mobile} />
      <div className="hall-overlay top">
        {head}
        <MeetingBanner onJoin={() => setMode('meeting')} />
      </div>
      {zoomed && (
        <button className="hbtn pri zoom-back" onClick={() => setView(baseView)}>
          ← Lihat seluruh ruangan
        </button>
      )}
      <div className="hall-overlay bottom">
        {mobile && <MobileScreens data={data} />}
        <ActionDock onAction={openAction} />
      </div>
      {asking && (
        <StartMeetingDialog
          onCancel={() => setAsking(false)}
          onStart={async (title) => {
            setAsking(false);
            await useMeeting.getState().start(title);
            setMode('meeting');
          }}
        />
      )}
    </div>
  );
}
