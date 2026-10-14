import { useEffect, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS, ROOM_BY_ID, SEATS_BY_ROOM, TIERS, statusText, dayPhase, isNightHour } from '../data/hive';
import { useHive } from '../sim/store';
import { focusAgent } from '../sim/engine';
import { outdoor, danceNow } from '../sim/outdoor';
import { POSES } from '../data/staff';
import { go } from './nav';
import { useAuth } from '../sim/auth';
import { updatePresence } from '../sim/presence';
import { sound } from '../audio/sound';
import { useAi, checkAi, modelLabel } from '../hall/queenBea';
import { useMeeting } from '../hall/meeting';
import { PlazaBar } from './PlazaBar';
import { useAgentNet, useAgentScores, checkHealth, GROK_AGENTS } from '../hall/agentApi';
import { useSaver } from '../sim/saver';
import { BOARD_EMPTY_REAL, missionBoardItems, nextBoardTick } from './missionBoard';

const DEPT_ORDER = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const PHASE = { dispatch: 'Dikirim', gather: 'Berkumpul', work: 'Dikerjakan', done: '✅ Selesai' };

// Mode real: tugas jalan + yang selesai dalam ±10 menit. Timer menghitung ulang supaya kartu
// selesai hilang sendiri, tanpa menunggu data baru dari database.
function useMissionBoardItems() {
  const missions = useHive((s) => s.missions);
  const tasks = useHive((s) => s.planTasks);
  const real = useAuth((s) => !!s.account);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!real) return undefined;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [real]);
  useEffect(() => {
    if (!real) return undefined;
    const at = nextBoardTick(tasks, Date.now());
    if (at == null) return undefined;
    const id = setTimeout(() => setNow(Date.now()), Math.max(250, at - Date.now() + 30));
    return () => clearTimeout(id);
  }, [real, tasks, now]);
  if (!real) return missions;
  return missionBoardItems(tasks, missions, now);
}

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
// Mode real: Queen online kalau Claude tersambung; 20 agent lain online kalau aktif di
// hc_agent_prompts (n8n), "Kerja" saat sedang mengerjakan tugas sungguhan. Mode demo mengikuti simulasi.
const PRESENCE_LABEL = { work: 'Kerja', online: 'Online', offline: 'Offline' };
function presenceOf(id, st, real, ai, inMeeting, prompts, netOnline) {
  if (real) {
    if (id === 'ceo') {
      if (ai.status !== 'on') return 'offline';
      return ai.busy > 0 || inMeeting ? 'work' : 'online';
    }
    // Nimbus, Loop, Ping, Pixel, dan Spark dijawab Grok Bot bila secretnya ada: tidak bergantung server PC kantor
    if (GROK_AGENTS.includes(id)) return st?.missionId ? 'work' : 'online';
    // server agent (n8n di PC kantor) mati -> agent n8n offline
    if (!prompts.includes(id) || netOnline === false) return 'offline';
    return st?.missionId ? 'work' : 'online';
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

const PAGE_LABEL = (p = '/') =>
  p.startsWith('/hall') ? 'Hive Hall' : p.startsWith('/agent') ? 'Ruang kerja' : p.startsWith('/tv') ? 'Mode TV' : p.startsWith('/akses') ? 'Akses agent' : p.startsWith('/avatar') ? 'Ubah avatar' : 'Koloni';

// siapa saja staff yang sedang online (Realtime Presence) dan sedang di halaman mana
export function OnlineStaffList() {
  const me = useAuth((s) => s.account);
  const profile = useHive((s) => s.profile);
  const others = useHive((s) => s.onlineStaff);
  const list = [
    { id: 'me', name: me?.name, dept: me?.primary_dept, outfitColor: profile?.outfitColor, page: (window.location.hash.replace(/^#/, '') || '/').split('?')[0], me: true },
    ...others,
  ];
  return (
    <div className="online-list">
      {list.map((o) => (
        <div key={o.id} className="online-row">
          <span className="online-av" style={{ '--c': o.outfitColor || '#FFB020' }}>
            {initialsOf(o.name || '?')}
          </span>
          <div>
            <b>
              {o.name || 'Staff'}
              {o.me && <em> (kamu)</em>}
            </b>
            <span>
              {DEPTS[o.dept]?.short || '-'} · {PAGE_LABEL(o.page)}
            </span>
          </div>
          {o.dancing && <i aria-label="Sedang joget">💃</i>}
        </div>
      ))}
      {others.length === 0 && <p className="muted small">Belum ada rekan lain yang online.</p>}
    </div>
  );
}

const hm = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// status sambungan: server agent (n8n di PC kantor) dan Queen Bea (Claude)
export function useServerLevel() {
  const net = useAgentNet((s) => s.online);
  const ai = useAi((s) => s.status);
  if (net === null || ai === 'unknown') return 'check';
  if (net && ai === 'on') return 'ok';
  if (net || ai === 'on') return 'warn';
  return 'down';
}
const SERVER_LABEL = { ok: 'Semua tersambung', warn: 'Sebagian terputus', down: 'Terputus', check: 'Memeriksa…' };

export function ServerStatusDetail() {
  const net = useAgentNet();
  const ai = useAi((s) => s.status);
  const owner = useAuth((s) => s.account?.role === 'owner');
  const [busy, setBusy] = useState(false);
  const row = (ok, name, desc) => (
    <div className="srv-row">
      <span className={`srv-dot ${ok === null ? 'check' : ok ? 'ok' : 'down'}`} />
      <div>
        <b>{name}</b>
        <span>{desc}</span>
      </div>
    </div>
  );
  return (
    <div className="srv-list">
      {row(
        net.online,
        'Server agent (n8n · PC kantor)',
        net.online === null ? 'Memeriksa…' : `${net.online ? 'Online, 20 agent siap kerja' : 'Offline, tugas agent tertunda'}${net.checkedAt ? ` · dicek ${hm(net.checkedAt)} WIB` : ''}`,
      )}
      {row(ai === 'unknown' ? null : ai === 'on', `Queen Bea (${modelLabel(useAi.getState().model)})`, ai === 'on' ? 'Tersambung' : ai === 'unknown' ? 'Memeriksa…' : 'Belum tersambung')}
      {row(null, 'Grok Bot (Nimbus, Loop, Ping, Queen opsi)', 'Bot eksternal, tidak dipantau otomatis. Kalau tidak bisa dihubungi, chat akan memberi tahu.')}
      <p className="muted small srv-note">
        Sisa saldo token Claude tidak bisa dibaca dari API.
        {owner ? (
          <>
            {' '}
            Cek di{' '}
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">
              Claude Console → Billing
            </a>
            .
          </>
        ) : (
          ' Owner bisa mengeceknya di Claude Console.'
        )}
      </p>
      <button
        className="acct-btn ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await Promise.all([checkHealth(), checkAi()]);
          setBusy(false);
        }}
      >
        {busy ? 'Memeriksa…' : 'Cek ulang'}
      </button>
    </div>
  );
}

// popover kecil di bawah tombol; tutup saat klik di luar
function Pop({ open, onClose, className = '', children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => {
      if (ref.current && !ref.current.parentElement.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`pop ${className}`}>
      {children}
    </div>
  );
}

// angka header saat mode real: hanya data sungguhan
function RealStats() {
  const online = useHive((s) => s.onlineStaff.length) + 1;
  const dbActivity = useHive((s) => s.dbActivity);
  const ai = useAi((s) => s.status);
  const prompts = useHive((s) => s.agentPrompts);
  const connected = (ai === 'on' ? 1 : 0) + prompts.filter((id) => id !== 'ceo').length;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const todayCount = dbActivity.filter((a) => new Date(new Date(a.created_at).getTime() + 7 * 3600e3).toISOString().slice(0, 10) === today).length;
  const [pop, setPop] = useState(null);
  const level = useServerLevel();
  const close = () => setPop(null);
  return (
    <div className="stats">
      <div className="stat-pop">
        <button className={`stat-btn${pop === 'staff' ? ' on' : ''}`} onClick={() => setPop(pop === 'staff' ? null : 'staff')} aria-expanded={pop === 'staff'}>
          <b>{online}</b>
          <span>online ▾</span>
        </button>
        <Pop open={pop === 'staff'} onClose={close}>
          <p className="pop-title">Staff online</p>
          <OnlineStaffList />
        </Pop>
      </div>
      <div className="stat-pop">
        <button className={`stat-btn${pop === 'server' ? ' on' : ''}`} onClick={() => setPop(pop === 'server' ? null : 'server')} aria-expanded={pop === 'server'} title={`Server: ${SERVER_LABEL[level]}`}>
          <b>
            <i className={`srv-dot ${level}`} />
            {connected}/21
          </b>
          <span>server ▾</span>
        </button>
        <Pop open={pop === 'server'} onClose={close}>
          <p className="pop-title">Status server</p>
          <ServerStatusDetail />
        </Pop>
      </div>
      <div>
        <b>{todayCount}</b>
        <span>aktivitas</span>
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
  const level = useServerLevel();
  const online = useHive((s) => s.onlineStaff.length) + 1;
  return (
    <header className="panel brand mobile-brand">
      <Logo />
      <h1>Hive Colony</h1>
      <button className="m-status" onClick={onAvatar} aria-label={`${online} staff online, server ${SERVER_LABEL[level]}`}>
        <i className={`srv-dot ${level}`} />
        {online}
      </button>
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

function Directory({ defaultOpen = false, onPick }) {
  const [open, setOpen] = useState(defaultOpen);
  const agentStates = useHive((s) => s.agentStates);
  const selected = useHive((s) => s.selectedAgent);
  const real = useAuth((s) => !!s.account);
  const ai = useAi();
  const inMeeting = useMeeting((s) => s.live && s.active);
  const counts = { work: 0, online: 0, offline: 0 };
  const prompts = useHive((s) => s.agentPrompts);
  const netOnline = useAgentNet((s) => s.online);
  const pres = Object.fromEntries(AGENTS.map((a) => [a.id, presenceOf(a.id, agentStates[a.id], real, ai, inMeeting, prompts, netOnline)]));
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
                <div key={a.id} className="dir-row">
                  <button
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
                  {real && (
                    <button className="dir-chat" onClick={() => go(`/agent/${a.id}`)} aria-label={`Buka ruang kerja ${a.nick}`} title="Buka ruang kerja">
                      💬
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissionBoard({ className = 'panel board', onPick }) {
  const items = useMissionBoardItems();
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
          Papan misi <em>{items.length}</em>
        </button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          Log koloni
        </button>
      </div>
      {tab === 'active' ? (
        <div className="list">
          {items.length === 0 && (
            <p className="empty">{real ? BOARD_EMPTY_REAL : 'Queen Bea sedang menyiapkan misi berikutnya…'}</p>
          )}
          {items.map((m) => (
            <button
              key={m.id}
              className={`mission${m.finished || m.phase === 'done' ? ' done' : ''}`}
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

// dua pintu utama, dibuat mencolok
function PrimaryActions({ className = 'primary-actions', onPick }) {
  const nav = (path) => {
    onPick?.();
    go(path);
  };
  return (
    <div className={className}>
      <button className="pa-btn hall" onClick={() => nav('/hall')}>
        <span aria-hidden="true">🏛</span>
        <b>Hive Hall</b>
        <small>Rapat & Queen Bea</small>
      </button>
      <button className="pa-btn work" onClick={() => nav('/agent')}>
        <span aria-hidden="true">💬</span>
        <b>Ruang Kerja</b>
        <small>Chat & tugas agent</small>
      </button>
      <button className="pa-btn portal" onClick={() => nav('/saya')}>
        <span aria-hidden="true">🙋</span>
        <b>Portal saya</b>
        <small>Kanban, tugas & rapat</small>
      </button>
    </div>
  );
}

// alat tambahan, dipisah dari tombol utama
function ToolRail({ className = 'panel tool-rail', onPick }) {
  const hasProfile = useHive((s) => !!s.profile);
  const saver = useSaver((s) => s.on);
  const owner = useAuth((s) => s.account?.role === 'owner');
  const tool = (icon, label, fn, title) => (
    <button
      className="tool"
      onClick={() => {
        fn();
        onPick?.();
      }}
      title={title || label}
      aria-label={label}
    >
      <span aria-hidden="true">{icon}</span>
      <em>{label}</em>
    </button>
  );
  return (
    <div className={className}>
      {tool('🎯', 'Reset kamera', () => useHive.getState().resetView())}
      <button
        className={`tool${saver ? ' on' : ''}`}
        onClick={() => useSaver.getState().toggle()}
        title="Mode hemat: tanpa efek cahaya & bayangan, untuk laptop/TV yang berat"
        aria-pressed={saver}
        aria-label="Mode hemat"
      >
        <span aria-hidden="true">⚡</span>
        <em>{saver ? 'Hemat aktif' : 'Mode hemat'}</em>
      </button>
      {owner && tool('📊', 'Statistik', () => go('/statistik'))}
      {tool('🎬', 'Intro', () => go('/intro'), 'Video perkenalan Hive Colony (±75 detik), siap direkam')}
      {tool('📺', 'Mode TV', () => go('/tv'), 'Mode spectator untuk layar besar')}
      {tool('🧑', hasProfile ? 'Avatar saya' : 'Buat avatar', () => go('/avatar'))}
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
      <button className={`tool${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Joget" title="Joget">
        <span aria-hidden="true">💃</span>
        <em>Joget</em>
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
  const real = useAuth((s) => !!s.account);
  const score = useAgentScores((s) => (id ? s[id] : null));
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
      {real && (
        <div className="card-score" title="Dari penilaian 👍/👎 staff, 30 hari terakhir">
          <span>Skor skill</span>
          <b>{score ? score.score : '–'}</b>
          <small>{score ? `${score.up} 👍 · ${score.down} 👎` : 'belum dinilai'}</small>
        </div>
      )}
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
      {real && (
        <button className="link" onClick={() => go(`/agent/${id}`)}>
          💬 Buka ruang kerja {a.nick}
        </button>
      )}
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
  const missions = useMissionBoardItems();
  const close = () => setDrawer(null);
  const plaza = useAuth((s) => !!s.account);
  return (
    <div className={`hud is-mobile${plaza ? ' has-plaza' : ''}`}>
      <MobileBrand onAvatar={() => setDrawer('akun')} />
      <PlazaBar />
      <PrimaryActions className="primary-actions is-dock" />
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
        <ToolRail className="tool-rail tool-rail-inline" onPick={close} />
        <Directory onPick={close} />
      </aside>
      <aside className={`drawer drawer-missions${drawer === 'akun' ? ' open' : ''}`} aria-hidden={drawer !== 'akun'}>
        <div className="drawer-head">
          <h2>Akun</h2>
          <button className="close" onClick={close} aria-label="Tutup panel akun">
            ×
          </button>
        </div>
        <AccountPanel onPick={close} />
        <p className="aw-label drawer-label">Staff online</p>
        <OnlineStaffList />
        <p className="aw-label drawer-label">Status server</p>
        <ServerStatusDetail />
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
      <PrimaryActions />
      <ToolRail />
      <AgentCard />
      <RoomCard />
      <div className="hint">Seret untuk memutar · scroll untuk zoom · klik ruangan atau agent</div>
    </div>
  );
}
