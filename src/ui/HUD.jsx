import { useEffect, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS, ROOM_BY_ID, SEATS_BY_ROOM, TIERS, statusText, dayPhase, isNightHour } from '../data/hive';
import { useHive } from '../sim/store';
import { focusAgent } from '../sim/engine';
import { outdoor, danceNow } from '../sim/outdoor';
import { POSES } from '../data/staff';
import { go } from './nav';
import { useAuth } from '../sim/auth';
import { updatePresence } from '../sim/presence';
import { sound } from '../audio/sound';
import { useAi } from '../hall/queenBea';
import { useMeeting } from '../hall/meeting';
import { PlazaBar } from './PlazaBar';

const DEPT_ORDER = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const PHASE = { dispatch: 'Dikirim', gather: 'Berkumpul', work: 'Dikerjakan' };

function Logo() {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#F5B700" stroke="#8A5A00" strokeWidth="2.5" />
      <rect x="9" y="16" width="22" height="3.5" fill="#3A2A12" />
      <rect x="9" y="23" width="22" height="3.5" fill="#3A2A12" />
      <circle cx="15" cy="11" r="2" fill="#FF8C1A" />
      <circle cx="25" cy="11" r="2" fill="#FF8C1A" />
    </svg>
  );
}

function initials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Dot({ st }) {
  const s = st?.missionId ? 'mission' : st?.state || 'desk';
  return <span className={`dot dot-${s}`} />;
}

// Status kehadiran agent di daftar: work (sedang mengerjakan), online, offline.
// Mode real: hanya agent yang tersambung AI yang bisa online; mode demo mengikuti simulasi.
const PRESENCE_LABEL = { work: 'Kerja', online: 'Online', offline: 'Offline' };
function presenceOf(id, st, real, ai, inMeeting) {
  if (real) {
    if (id !== 'ceo' || ai.status !== 'on') return 'offline';
    return ai.busy > 0 || inMeeting ? 'work' : 'online';
  }
  if (st?.missionId) return 'work';
  if (st?.state === 'sleep') return 'offline';
  return 'online';
}

function Clock() {
  const clock = useHive((s) => s.stats.clock ?? 8);
  const wib = useHive((s) => (s.stats.clockMode ?? 'wib') === 'wib');
  const hh = String(Math.floor(clock)).padStart(2, '0');
  const mm = String(Math.floor((clock % 1) * 60)).padStart(2, '0');
  const night = isNightHour(clock);
  return (
    <div className={`clock${night ? ' is-night' : ''}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        {night ? (
          <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5z" fill="#FFF3C4" stroke="#C98A00" strokeWidth="1.2" />
        ) : (
          <g stroke="#FF8C1A" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.5" fill="#F5B700" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
              <line key={d} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${d} 12 12)`} />
            ))}
          </g>
        )}
      </svg>
      <div>
        <b>
          {hh}:{mm} <small>{wib ? 'WIB' : 'SIM'}</small>
        </b>
        <span>{wib ? `${dayPhase(clock)} · Jakarta` : `${dayPhase(clock)} · simulasi`}</span>
      </div>
    </div>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(soundPref);
  return (
    <button
      className={`sound-toggle${on ? ' on' : ''}`}
      onClick={() => {
        setSoundPref(!on);
        setOn(!on);
      }}
      aria-label={on ? 'Matikan musik dan suara' : 'Nyalakan musik dan suara'}
      title={on ? 'Matikan musik' : 'Nyalakan musik'}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };

function AccountChip() {
  const ready = useAuth((s) => s.ready);
  const account = useAuth((s) => s.account);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const online = useHive((s) => s.onlineStaff.length);
  if (!ready) return null;
  if (!session) {
    return (
      <button className="acct-btn" onClick={() => go('/login')}>
        Masuk
      </button>
    );
  }
  if (!account) {
    return (
      <button className="acct-btn" onClick={() => go('/join')}>
        Pakai kode undangan
      </button>
    );
  }
  return (
    <div className="acct">
      <div className="acct-who">
        <b>{account.name}</b>
        <span>
          {ROLE_LABEL[account.role]} · {online} rekan online
        </span>
      </div>
      {['owner', 'lead'].includes(account.role) && (
        <button className="acct-btn" onClick={() => go('/undang')}>
          Undang
        </button>
      )}
      <button className="acct-btn ghost" onClick={signOut}>
        Keluar
      </button>
    </div>
  );
}

// angka header saat mode real: hanya data sungguhan
function RealStats() {
  const online = useHive((s) => s.onlineStaff.length) + 1;
  const dbActivity = useHive((s) => s.dbActivity);
  const ai = useAi((s) => s.status);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const todayCount = dbActivity.filter((a) => new Date(new Date(a.created_at).getTime() + 7 * 3600e3).toISOString().slice(0, 10) === today).length;
  return (
    <div className="stats">
      <div>
        <b>{online}</b>
        <span>staff online</span>
      </div>
      <div>
        <b>{ai === 'on' ? 1 : 0}/21</b>
        <span>agent tersambung AI</span>
      </div>
      <div>
        <b>{todayCount}</b>
        <span>aktivitas hari ini</span>
      </div>
    </div>
  );
}

function Brand() {
  const stats = useHive((s) => s.stats);
  const agentStates = useHive((s) => s.agentStates);
  const real = useAuth((s) => !!s.account);
  const working = Object.values(agentStates).filter((a) => a.missionId).length;
  return (
    <header className="panel brand">
      <Logo />
      <div>
        <h1>Hive Colony</h1>
        <p>Kantor virtual 21 agent AI · {real ? 'mode real' : 'mode simulasi'}</p>
      </div>
      <Clock />
      <SoundToggle />
      <AccountChip />
      {real ? (
        <RealStats />
      ) : (
      <div className="stats">
        <div>
          <b>{working}</b>
          <span>sedang misi</span>
        </div>
        <div>
          <b>{stats.done}</b>
          <span>misi selesai</span>
        </div>
        <div>
          <b>{stats.honey}</b>
          <span>madu</span>
        </div>
      </div>
      )}
    </header>
  );
}

/* ---------- HP: header ringkas + panel akun ---------- */

function ClockCompact() {
  const clock = useHive((s) => s.stats.clock ?? 8);
  const night = isNightHour(clock);
  const hh = String(Math.floor(clock)).padStart(2, '0');
  const mm = String(Math.floor((clock % 1) * 60)).padStart(2, '0');
  return (
    <div className={`clock-mini${night ? ' is-night' : ''}`} title={`${dayPhase(clock)} · Jakarta`}>
      <span aria-hidden="true">{night ? '☾' : '☀'}</span>
      <b>
        {hh}:{mm}
      </b>
      <small>WIB</small>
    </div>
  );
}

function AvatarButton({ onClick }) {
  const account = useAuth((s) => s.account);
  const profile = useHive((s) => s.profile);
  const label = account?.name || profile?.name || '';
  return (
    <button
      className={`avatar-btn${account ? ' in' : ''}`}
      onClick={onClick}
      aria-label={account ? `Akun ${label}` : 'Masuk atau atur akun'}
      style={{ '--c': profile?.outfitColor || '#FFF8E7' }}
    >
      {label ? initialsOf(label) : '☰'}
    </button>
  );
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function MobileBrand({ onAvatar }) {
  return (
    <header className="panel brand mobile-brand">
      <Logo />
      <h1>Hive Colony</h1>
      <ClockCompact />
      <AvatarButton onClick={onAvatar} />
    </header>
  );
}

function AccountPanel({ onPick }) {
  const ready = useAuth((s) => s.ready);
  const account = useAuth((s) => s.account);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const profile = useHive((s) => s.profile);
  const online = useHive((s) => s.onlineStaff.length);
  const nav = (path) => {
    onPick?.();
    go(path);
  };
  return (
    <div className="acct-panel">
      {ready && account ? (
        <div className="acct-card">
          <div className="acct-avatar" style={{ '--c': profile?.outfitColor || '#FFB020' }}>
            {initialsOf(account.name || 'A')}
          </div>
          <div>
            <b>{account.name}</b>
            <span>
              {ROLE_LABEL[account.role]} · {DEPTS[account.primary_dept]?.short}
            </span>
            <span>{online} rekan online</span>
          </div>
        </div>
      ) : (
        <div className="acct-card">
          <div className="acct-avatar">?</div>
          <div>
            <b>Mode demo</b>
            <span>{session ? 'Masukkan kode undangan untuk aktif' : 'Masuk supaya avatar tersimpan dan terlihat rekan'}</span>
          </div>
        </div>
      )}
      <div className="acct-actions">
        {!session && (
          <button className="acct-btn" onClick={() => nav('/login')}>
            Masuk
          </button>
        )}
        {session && !account && (
          <button className="acct-btn" onClick={() => nav('/join')}>
            Pakai kode undangan
          </button>
        )}
        <button className="acct-btn ghost" onClick={() => nav('/avatar')}>
          {profile ? 'Ubah avatar' : 'Buat avatar'}
        </button>
        <button className="acct-btn ghost" onClick={() => nav('/hall')}>
          Hive Hall
        </button>
        {account && ['owner', 'lead'].includes(account.role) && (
          <button className="acct-btn ghost" onClick={() => nav('/undang')}>
            Undang staff
          </button>
        )}
        {session && (
          <button
            className="acct-btn ghost danger"
            onClick={() => {
              onPick?.();
              signOut();
            }}
          >
            Keluar
          </button>
        )}
      </div>
      <div className="acct-row">
        <span>Musik latar</span>
        <SoundToggle />
      </div>
    </div>
  );
}

function FloorSwitch({ onPick }) {
  const floor = useHive((s) => s.floor);
  const setFloor = (f) => {
    useHive.getState().setFloor(f);
    onPick?.();
  };
  return (
    <div className="floors">
      <button className={floor === 'all' ? 'on' : ''} onClick={() => setFloor('all')}>
        <b>Semua</b>
        <span>Menara sarang</span>
      </button>
      {TIERS.map((t) => (
        <button key={t.id} className={floor === t.id ? 'on' : ''} onClick={() => setFloor(t.id)}>
          <b>{t.name}</b>
          <span>{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

function Directory({ defaultOpen = window.innerWidth > 900, onPick }) {
  const [open, setOpen] = useState(defaultOpen);
  const agentStates = useHive((s) => s.agentStates);
  const selected = useHive((s) => s.selectedAgent);
  const real = useAuth((s) => !!s.account);
  const ai = useAi();
  const inMeeting = useMeeting((s) => s.live && s.active);
  const counts = { work: 0, online: 0, offline: 0 };
  const pres = Object.fromEntries(AGENTS.map((a) => [a.id, presenceOf(a.id, agentStates[a.id], real, ai, inMeeting)]));
  Object.values(pres).forEach((p) => counts[p]++);
  return (
    <div className="directory">
      <button className="dir-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Daftar agent <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="pres-sum">
          <span className="pres pres-work">Kerja {counts.work}</span>
          <span className="pres pres-online">Online {counts.online}</span>
          <span className="pres pres-offline">Offline {counts.offline}</span>
        </div>
      )}
      {open && (
        <div className="dir-list">
          {DEPT_ORDER.map((d) => (
            <div key={d} className="dir-dept">
              <div className="dir-head">
                <i style={{ background: DEPTS[d].color }} />
                {DEPTS[d].short}
              </div>
              {AGENTS.filter((a) => a.dept === d).map((a) => (
                <button
                  key={a.id}
                  className={`dir-agent${selected === a.id ? ' on' : ''}`}
                  onClick={() => {
                    focusAgent(a.id);
                    onPick?.();
                  }}
                  title={a.role}
                >
                  <span className={`dot pdot-${pres[a.id]}`} />
                  <b>{a.nick}</b>
                  <span>{a.role}</span>
                  <em className={`pres pres-${pres[a.id]}`}>{PRESENCE_LABEL[pres[a.id]]}</em>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissionBoard({ className = 'panel board', onPick }) {
  const missions = useHive((s) => s.missions);
  const simLog = useHive((s) => s.log);
  const dbActivity = useHive((s) => s.dbActivity);
  const real = useAuth((s) => !!s.account);
  // mode real: log koloni = aktivitas sungguhan dari database
  const log = real ? dbActivity.map((a) => ({ id: `db-${a.id}`, kind: a.kind || 'human', text: a.text })) : simLog;
  const [tab, setTab] = useState('active');
  return (
    <aside className={className}>
      <div className="tabs">
        <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>
          Papan misi <em>{missions.length}</em>
        </button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          Log koloni
        </button>
      </div>
      {tab === 'active' ? (
        <div className="list">
          {missions.length === 0 && (
            <p className="empty">{real ? 'Belum ada misi. Agent sedang bebas; misi datang dari agent AI yang sudah tersambung.' : 'Queen Bea sedang menyiapkan misi berikutnya…'}</p>
          )}
          {missions.map((m) => (
            <button
              key={m.id}
              className="mission"
              onClick={() => {
                useHive.getState().selectRoom(m.roomId);
                onPick?.();
              }}
            >
              <div className="m-top">
                <span className="chip" style={{ '--c': DEPTS[m.dept].color }}>
                  {DEPTS[m.dept].short}
                </span>
                <span className="phase">{PHASE[m.phase]}</span>
              </div>
              <p>{m.title}</p>
              <div className="m-agents">
                {AGENT_BY_ID[m.leadId].nick}
                {m.collabId && <> + {AGENT_BY_ID[m.collabId].nick}</>}
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round(m.progress * 100)}%` }} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="list">
          {log.length === 0 && <p className="empty">Belum ada aktivitas.</p>}
          {log.map((e) => (
            <div key={e.id} className={`log log-${e.kind}`}>
              {e.text}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function Controls({ className = 'panel controls', onPick }) {
  const speed = useHive((s) => s.speed);
  const paused = useHive((s) => s.paused);
  const hasProfile = useHive((s) => !!s.profile);
  const { setSpeed, togglePause } = useHive.getState();
  const resetView = () => {
    useHive.getState().resetView();
    onPick?.();
  };
  return (
    <div className={className}>
      <button onClick={togglePause} aria-label={paused ? 'Lanjutkan simulasi' : 'Jeda simulasi'}>
        {paused ? '▶' : '❚❚'}
      </button>
      {[1, 2, 4].map((v) => (
        <button key={v} className={!paused && speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
          {v}×
        </button>
      ))}
      <button onClick={resetView}>Reset kamera</button>
      <span className="ctl-sep" />
      <button onClick={() => go('/hall')}>Hive Hall</button>
      <button onClick={() => go('/avatar')}>{hasProfile ? 'Avatar saya' : 'Buat avatar'}</button>
      {hasProfile && <DanceMenu onPick={onPick} />}
    </div>
  );
}

function DanceMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const dance = (pose) => {
    setOpen(false);
    danceNow('me', pose);
    updatePresence({ pose, danceAt: Date.now() });
    const w = outdoor.byId.me;
    if (w) useHive.getState().focusOn([w.pos.x, w.pos.y + 1, w.pos.z], 12, [Math.sin(w.facing), 0.9, Math.cos(w.facing)]);
    onPick?.();
  };
  return (
    <div className="dance-menu">
      <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} aria-expanded={open}>
        Joget ▾
      </button>
      {open && (
        <div className="dance-pop">
          {POSES.filter((p) => p.id !== 'idle').map((p) => (
            <button key={p.id} onClick={() => dance(p.id)}>
              <b>{p.name}</b>
              <span>{p.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard() {
  const id = useHive((s) => s.selectedAgent);
  const st = useHive((s) => (id ? s.agentStates[id] : null));
  const missions = useHive((s) => s.missions);
  if (!id) return null;
  const a = AGENT_BY_ID[id];
  const dept = DEPTS[a.dept];
  const mission = st?.missionId ? missions.find((m) => m.id === st.missionId) : null;
  return (
    <div className="panel card">
      <button className="close" onClick={() => useHive.getState().clearSelection()} aria-label="Tutup">
        ×
      </button>
      <div className="card-head">
        <div className="avatar" style={{ '--c': dept.color }}>
          {initials(a.nick)}
        </div>
        <div>
          <h2>{a.nick}</h2>
          <p>{a.role}</p>
        </div>
      </div>
      <div className="tags">
        <span className="chip" style={{ '--c': dept.color }}>
          {dept.short}
        </span>
        <span className="chip ghost">AI · {a.mode}</span>
      </div>
      <div className="status">
        <Dot st={st} /> {statusText(st)}
      </div>
      {mission && (
        <div className="card-mission">
          <span>Misi aktif</span>
          <p>{mission.title}</p>
          <div className="bar">
            <i style={{ width: `${Math.round(mission.progress * 100)}%` }} />
          </div>
        </div>
      )}
      <button className="link" onClick={() => focusAgent(id)}>
        Fokus kamera ke {a.nick}
      </button>
    </div>
  );
}

function RoomCard() {
  const id = useHive((s) => s.selectedRoom);
  const agentStates = useHive((s) => s.agentStates);
  if (!id) return null;
  const room = ROOM_BY_ID[id];
  const residents = (SEATS_BY_ROOM[id] || []).map((s) => s.agentId);
  const present = Object.entries(agentStates)
    .filter(([, st]) => st.roomId === id)
    .map(([aid]) => aid);
  const ids = [...new Set([...residents, ...present])];
  return (
    <div className="panel card">
      <button className="close" onClick={() => useHive.getState().clearSelection()} aria-label="Tutup">
        ×
      </button>
      <h2>{room.name}</h2>
      <p className="muted">{room.desc}</p>
      <div className="room-agents">
        {ids.length === 0 && <span className="muted">Ruangan sedang kosong.</span>}
        {ids.map((aid) => (
          <button key={aid} onClick={() => focusAgent(aid)}>
            <Dot st={agentStates[aid]} />
            {AGENT_BY_ID[aid].nick}
            {!present.includes(aid) && <em>(sedang keluar)</em>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useIsMobile() {
  const query = '(max-width: 760px)';
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// Musik latar mati secara default. Kalau pengguna pernah menyalakannya (ikon speaker di header),
// pilihan itu diingat; audio baru "dibuka" pada interaksi pertama karena aturan autoplay browser.
const SOUND_KEY = 'hive.sound';
export function soundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}
export function setSoundPref(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* tidak tersimpan: berlaku untuk sesi ini saja */
  }
  sound.setEnabled(on);
}

export function useAutoSound() {
  useEffect(() => {
    if (soundPref()) sound.setEnabled(true);
    const unlock = () => sound.unlock();
    const events = ['pointerdown', 'touchend', 'click', 'keydown'];
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5z" fill="#3A2A12" />
      <path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" fill="none" stroke="#3A2A12" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <polygon points="12,2 20,6.5 20,15.5 12,20 4,15.5 4,6.5" fill="none" stroke="#3A2A12" strokeWidth="1.8" />
      <path d="M8.5 9h7M8.5 12h7M8.5 15h4" stroke="#3A2A12" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Tampilan HP: hanya header; panel lain masuk laci samping yang muncul saat tab ditekan.
function MobileHUD() {
  const [drawer, setDrawer] = useState(null);
  const missions = useHive((s) => s.missions);
  const close = () => setDrawer(null);
  const plaza = useAuth((s) => !!s.account);
  return (
    <div className={`hud is-mobile${plaza ? ' has-plaza' : ''}`}>
      <MobileBrand onAvatar={() => setDrawer('akun')} />
      <PlazaBar />
      <button className="edge-tab edge-menu" onClick={() => setDrawer('menu')} aria-label="Buka menu lantai dan agent">
        <LayersIcon />
        <span>Menu</span>
      </button>
      <button className="edge-tab edge-missions" onClick={() => setDrawer('missions')} aria-label="Buka papan misi">
        <ListIcon />
        <span>Misi</span>
        {missions.length > 0 && <em>{missions.length}</em>}
      </button>
      <div className={`scrim${drawer ? ' show' : ''}`} onClick={close} />
      <aside className={`drawer drawer-menu${drawer === 'menu' ? ' open' : ''}`} aria-hidden={drawer !== 'menu'}>
        <div className="drawer-head">
          <h2>Menu koloni</h2>
          <button className="close" onClick={close} aria-label="Tutup menu">
            ×
          </button>
        </div>
        <FloorSwitch onPick={close} />
        <Controls className="controls controls-inline" onPick={close} />
        <Directory defaultOpen onPick={close} />
      </aside>
      <aside className={`drawer drawer-missions${drawer === 'akun' ? ' open' : ''}`} aria-hidden={drawer !== 'akun'}>
        <div className="drawer-head">
          <h2>Akun</h2>
          <button className="close" onClick={close} aria-label="Tutup panel akun">
            ×
          </button>
        </div>
        <AccountPanel onPick={close} />
      </aside>
      <aside className={`drawer drawer-missions${drawer === 'missions' ? ' open' : ''}`} aria-hidden={drawer !== 'missions'}>
        <div className="drawer-head">
          <h2>Misi koloni</h2>
          <button className="close" onClick={close} aria-label="Tutup papan misi">
            ×
          </button>
        </div>
        <MissionBoard className="board board-inline" onPick={close} />
      </aside>
      <AgentCard />
      <RoomCard />
    </div>
  );
}

export function HUD() {
  const mobile = useIsMobile();
  const plaza = useAuth((s) => !!s.account);
  if (mobile) return <MobileHUD />;
  return (
    <div className={`hud${plaza ? ' has-plaza' : ''}`}>
      <Brand />
      <PlazaBar />
      <aside className="panel left">
        <FloorSwitch />
        <Directory />
      </aside>
      <MissionBoard />
      <Controls />
      <AgentCard />
      <RoomCard />
      <div className="hint">Seret untuk memutar · scroll untuk zoom · klik ruangan atau agent</div>
    </div>
  );
}
