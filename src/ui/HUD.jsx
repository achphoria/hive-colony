import { useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS, ROOM_BY_ID, SEATS_BY_ROOM, TIERS, statusText, dayPhase, isNightHour } from '../data/hive';
import { useHive } from '../sim/store';
import { focusAgent, jumpTo, useRealtimeClock } from '../sim/engine';
import { sound } from '../audio/sound';

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

function Brand() {
  const stats = useHive((s) => s.stats);
  const agentStates = useHive((s) => s.agentStates);
  const working = Object.values(agentStates).filter((a) => a.missionId).length;
  return (
    <header className="panel brand">
      <Logo />
      <div>
        <h1>Hive Colony</h1>
        <p>Kantor virtual 21 agent AI · mode simulasi</p>
      </div>
      <Clock />
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
    </header>
  );
}

function FloorSwitch() {
  const floor = useHive((s) => s.floor);
  const setFloor = useHive((s) => s.setFloor);
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

function Directory() {
  const [open, setOpen] = useState(() => window.innerWidth > 900);
  const agentStates = useHive((s) => s.agentStates);
  const selected = useHive((s) => s.selectedAgent);
  return (
    <div className="directory">
      <button className="dir-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Daftar agent <span>{open ? '−' : '+'}</span>
      </button>
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
                  onClick={() => focusAgent(a.id)}
                  title={a.role}
                >
                  <Dot st={agentStates[a.id]} />
                  <b>{a.nick}</b>
                  <span>{a.role}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissionBoard() {
  const missions = useHive((s) => s.missions);
  const log = useHive((s) => s.log);
  const [tab, setTab] = useState('active');
  return (
    <aside className="panel board">
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
          {missions.length === 0 && <p className="empty">Queen Bea sedang menyiapkan misi berikutnya…</p>}
          {missions.map((m) => (
            <button key={m.id} className="mission" onClick={() => useHive.getState().selectRoom(m.roomId)}>
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

function SoundControl() {
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(0.7);
  return (
    <div className="sound">
      <button
        className={on ? 'on' : ''}
        onClick={() => {
          sound.setEnabled(!on);
          setOn(!on);
        }}
        aria-label={on ? 'Matikan suara' : 'Nyalakan suara'}
        title={on ? 'Matikan suara' : 'Nyalakan musik dan suara'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {on ? (
            <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
        {on ? 'Suara' : 'Suara mati'}
      </button>
      {on && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={vol}
          aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            sound.setVolume(v);
          }}
        />
      )}
    </div>
  );
}

function Controls() {
  const speed = useHive((s) => s.speed);
  const paused = useHive((s) => s.paused);
  const clock = useHive((s) => s.stats.clock ?? 8);
  const wib = useHive((s) => (s.stats.clockMode ?? 'wib') === 'wib');
  const night = isNightHour(clock);
  const { setSpeed, togglePause, resetView } = useHive.getState();
  return (
    <div className="panel controls">
      <button onClick={togglePause} aria-label={paused ? 'Lanjutkan simulasi' : 'Jeda simulasi'}>
        {paused ? '▶' : '❚❚'}
      </button>
      {[1, 2, 4].map((v) => (
        <button key={v} className={!paused && speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
          {v}×
        </button>
      ))}
      <button onClick={() => jumpTo(night ? 6.5 : 19)} title="Coba suasana lain dengan jam simulasi">
        {night ? '☀ Coba pagi' : '☾ Coba malam'}
      </button>
      {!wib && (
        <button className="on" onClick={useRealtimeClock} title="Kembali ke jam Jakarta realtime">
          🕒 Kembali ke WIB
        </button>
      )}
      <button onClick={resetView}>Reset kamera</button>
      <SoundControl />
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

export function HUD() {
  return (
    <div className="hud">
      <Brand />
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
