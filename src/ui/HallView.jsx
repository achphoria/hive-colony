// Hive Hall: ruang rapat manusia + AI. Tab Rapat = ruang 3D full-wide dengan layar dinding live;
// tab lain = papan rencana, kalender, dan persetujuan. Mode demo: call suara disimulasikan dan
// Queen Bea menjawab dengan text-to-speech bawaan browser.
import { useEffect, useRef, useState } from 'react';
import { AGENT_BY_ID, DEPTS } from '../data/hive';
import { DEMO_STAFF, DEFAULT_PROFILE } from '../data/staff';
import { useHive } from '../sim/store';
import { HallScene, DEFAULT_VIEW, DEFAULT_VIEW_MOBILE } from '../scene/HallScene';
import { cut, MONTH, wibNow, dayStart, demoEvents, useHallData } from './hallData';
import { SoundToggle, useIsMobile } from './HUD';
import { DAY } from './hallData';
import { go } from './nav';
import { useAuth } from '../sim/auth';
import { decideApproval, advanceTask } from '../sim/hallSync';

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

function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('id'));
  if (voice) u.voice = voice;
  u.lang = 'id-ID';
  u.rate = 1.02;
  u.pitch = 1.05;
  synth.speak(u);
  return true;
}

/* ---------- call suara (demo) ---------- */

function buildAnswer(kind) {
  const s = useHive.getState();
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const lowest = [...s.missions].sort((a, b) => a.progress - b.progress)[0];
  if (kind === 'kondisi') {
    return {
      q: 'Queen Bea, gimana kondisi koloni sekarang?',
      a: `Saat ini ${s.missions.length} misi sedang berjalan, ${s.stats.done} misi sudah selesai, dan madu kita ${s.stats.honey}. ${
        pending.length ? `Ada ${pending.length} persetujuan yang menunggu Anda.` : 'Tidak ada persetujuan yang menunggu.'
      }`,
      note: pending.length ? `Ingatkan Owner: ${pending.length} persetujuan` : null,
    };
  }
  if (kind === 'mendesak') {
    return {
      q: 'Queen Bea, apa yang paling mendesak?',
      a: lowest
        ? `Yang paling perlu dikejar: "${lowest.title}" oleh ${AGENT_BY_ID[lowest.leadId].nick}, baru ${Math.round(lowest.progress * 100)} persen. Saya minta dia memberi update dalam satu jam.`
        : 'Belum ada misi yang macet. Semua agent sedang lancar.',
      note: lowest ? `Follow up: ${cut(lowest.title, 34)}` : null,
    };
  }
  const ev = demoEvents().find((e) => e.big);
  const days = Math.round((ev.ts - dayStart(wibNow())) / 864e5);
  return {
    q: 'Queen Bea, persiapan race sudah sampai mana?',
    a: `${ev.title} tinggal ${days} hari lagi. Rute dan iklan sedang dikerjakan Sprint dan Spark, sementara Dina masih perlu meminjam 2 sled.`,
    note: 'Cek status pinjam sled bersama Dina',
  };
}

function useDemoCall() {
  const [call, setCall] = useState({ speaker: null, caption: '', mic: true, voice: true, notes: [] });
  const timers = useRef([]);
  const order = useRef(0);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const ask = () => {
    timers.current.forEach(clearTimeout);
    const kinds = ['kondisi', 'mendesak', 'race'];
    const r = buildAnswer(kinds[order.current++ % kinds.length]);
    setCall((c) => ({ ...c, speaker: c.mic ? 'me' : null, caption: c.mic ? `Anda: ${r.q}` : 'Mic Anda mati. Nyalakan mic untuk bertanya.' }));
    timers.current.push(
      setTimeout(() => setCall((c) => (c.mic ? { ...c, speaker: 'thinking', caption: 'Queen Bea mendengar namanya dan sedang berpikir…' } : c)), 2600),
      setTimeout(() => {
        setCall((c) => {
          if (!c.mic) return c;
          if (c.voice) speak(r.a);
          return { ...c, speaker: 'ceo', caption: `Queen Bea: ${r.a}`, notes: r.note ? [r.note, ...c.notes].slice(0, 3) : c.notes };
        });
      }, 4400),
      setTimeout(() => setCall((c) => ({ ...c, speaker: null })), 11000),
    );
  };
  return { call, setCall, ask };
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

/* ---------- halaman ---------- */

export function HallView() {
  const [tab, setTab] = useState('rapat');
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
  const { call, setCall, ask } = useDemoCall();
  const tabs = [
    ['rapat', 'Rapat'],
    ['rencana', 'Papan rencana'],
    ['kalender', 'Kalender'],
    ['persetujuan', `Persetujuan${data.pending ? ` · ${data.pending}` : ''}`],
  ];
  const zoomed = !!view.zoomed;

  const head = (
    <div className="hall-head">
      <button className="back" onClick={() => go('/')} aria-label="Kembali ke koloni">
        ← <span className="lbl">Koloni</span>
      </button>
      <div className="hall-title">
        <h1>Hive Hall</h1>
        <p>Rapat HYROX Simulation Race · {account ? 'tersambung ke database' : 'mode demo'}</p>
      </div>
      <div className="hall-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <SoundToggle />
    </div>
  );

  if (tab !== 'rapat') {
    return (
      <div className="page hall-page">
        <div className="hall-inner wide">
          {head}
          {tab === 'rencana' && <PlanBoard />}
          {tab === 'kalender' && <CalendarMonth />}
          {tab === 'persetujuan' && <Approvals />}
        </div>
      </div>
    );
  }

  return (
    <div className="hall3d">
      <HallScene data={data} me={me} dina={dina} call={call} view={view} setView={setView} mobile={mobile} />
      <div className="hall-overlay top">{head}</div>
      {zoomed && (
        <button className="hbtn pri zoom-back" onClick={() => setView(baseView)}>
          ← Lihat seluruh ruangan
        </button>
      )}
      <div className="hall-overlay bottom">
        {mobile && <MobileScreens data={data} />}
        <div className="caption">
          {call.caption || 'Tekan "Panggil Queen Bea" untuk bertanya. Klik layar di dinding untuk memperbesar.'}
        </div>
        <div className="hall-row">
          <span className="pchip">
            <i style={{ background: '#FF8C1A' }} />
            Queen Bea · {call.speaker === 'ceo' ? 'bicara' : call.speaker === 'thinking' ? 'berpikir…' : 'mendengarkan'}
          </span>
          <span className="pchip">
            <i style={{ background: me.outfitColor }} />
            {me.name || 'Anda'} · {!call.mic ? 'mute' : call.speaker === 'me' ? 'bicara' : 'diam'}
          </span>
          <span className="pchip">
            <i style={{ background: dina?.outfitColor || '#C0C5CE' }} />
            {dina ? `${dina.name} · ✋ antre` : 'Belum ada rekan lain online'}
          </span>
          {call.notes.map((n) => (
            <span key={n} className="pchip note">
              ✦ Tugas baru: {n}
            </span>
          ))}
        </div>
        <div className="hall-row center">
          <button
            className={`hbtn${call.mic ? ' pri' : ''}`}
            onClick={() => setCall((c) => ({ ...c, mic: !c.mic, speaker: null }))}
            aria-label={call.mic ? 'Matikan mic' : 'Nyalakan mic'}
          >
            {call.mic ? '🎙' : '🔇'}
            <span className="lbl">{call.mic ? ' Mic nyala' : ' Mic mati'}</span>
          </button>
          <button className="hbtn pri main" onClick={ask}>
            👑 Panggil<span className="lbl"> Queen Bea</span>
          </button>
          <button
            className={`hbtn${call.voice ? ' pri' : ''}`}
            onClick={() => setCall((c) => ({ ...c, voice: !c.voice }))}
            aria-label={call.voice ? 'Matikan suara AI' : 'Nyalakan suara AI'}
          >
            {call.voice ? '🔊' : '🔈'}
            <span className="lbl">{call.voice ? ' Suara AI nyala' : ' Suara AI mati'}</span>
          </button>
          <button className="hbtn danger" onClick={() => go('/')} aria-label="Keluar dari Hive Hall">
            ✕<span className="lbl"> Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
