// Workshop (#/workshop, #/workshop/<nomor>): meja kerja tim ala Agent Hub, dengan tim & data Hive Colony.
// Kiri daftar tiket, kanan ringkasan koloni (peta + buat tiket) atau detail satu tiket dengan tab
// Rapat (chat Queen Bea) · Kerja (papan tugas agent) · Laporan (rekap & hasil).
// Tiket = paket kerja Queen Bea (hc_delegations), tugas = hc_plan_tasks.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { loadMessages, watchThread } from '../hall/agentApi';
import { loadTickets, startTicket, askQueen, cleanAsk, watchTickets, savedThread, saveThread } from '../hall/workshopApi';
import { FileViewer } from './FileViewer';
import { Rich } from './AgentWorkspace';
import { go } from './nav';

const STEP = { pending: 'Antre', running: 'Bekerja', approval: 'Perlu persetujuan', revise: 'Gagal', done: 'Selesai' };
const TICKET = { running: 'Berjalan', done: 'Selesai', failed: 'Gagal' };
const DIVS = ['cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const TEAM = AGENTS.filter((g) => g.dept !== 'ceo');
const POLL_MS = 8000;

const fmt = (m) => {
  m = Math.round(m || 0);
  if (m < 1) return '< 1 mnt';
  const h = Math.floor(m / 60);
  return h ? `${h} j ${String(m % 60).padStart(2, '0')} mnt` : `${m} mnt`;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '–');
const clock = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  if (m < 1440) return `${Math.round(m / 60)} jam lalu`;
  return when(iso);
};
// tugas gagal tidak dihitung sebagai kemajuan, supaya angka sejalan dengan "x/y tugas selesai"
const progOf = (t) => (t?.steps.length ? t.steps.reduce((s, k) => s + (k.st === 'done' ? 1 : k.st === 'running' ? k.p : 0), 0) / t.steps.length : 0);
const doneOf = (t) => t.steps.filter((k) => k.st === 'done').length;
const pct = (t) => Math.round(progOf(t) * 100);
const preview = (s) => {
  const t = String(s).replace(/[#*]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
};
const tabFor = (t) => (t.status === 'running' ? 'kerja' : 'laporan');

const hexPath = (r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  }).join('') + 'Z';

function useThreadMessages(threadId) {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    setMsgs([]);
    if (!threadId) return undefined;
    let alive = true;
    const load = () => loadMessages(threadId).then((m) => alive && setMsgs(m));
    load();
    const stop = watchThread(threadId, load);
    return () => {
      alive = false;
      stop();
    };
  }, [threadId]);
  return msgs;
}

// ---------- potongan kecil ----------
function AgentHex({ agent, size = 'md' }) {
  const dept = DEPTS[agent?.dept] || DEPTS.guest;
  return (
    <span className={`ws-hex ${size}`} style={{ '--dc': dept.color }} title={agent ? `${agent.nick} · ${agent.role}` : ''}>
      {(agent?.nick || '?').slice(0, 2)}
    </span>
  );
}

function Badge({ st, children }) {
  return <span className={`ws-badge st-${st}`}>{children}</span>;
}

function Bar({ value }) {
  return (
    <div className="ws-bar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function Empty({ icon, title, children }) {
  return (
    <div className="ws-empty">
      <span aria-hidden="true">{icon}</span>
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

// ---------- peta koloni: Queen di tengah, 7 divisi melingkar, agent di sekeliling divisinya ----------
const MAP = (() => {
  const W = 1100;
  const H = 720;
  const c = [W / 2, H / 2];
  const hubs = {};
  const nodes = {};
  DIVS.forEach((d, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / DIVS.length;
    const hx = c[0] + Math.cos(a) * 330;
    const hy = c[1] + Math.sin(a) * 205;
    hubs[d] = [hx, hy];
    const team = TEAM.filter((g) => g.dept === d);
    team.forEach((g, j) => {
      const b = a + (j - (team.length - 1) / 2) * 0.6;
      nodes[g.id] = [hx + Math.cos(b) * 118, hy + Math.sin(b) * 96];
    });
  });
  return { W, H, c, hubs, nodes };
})();

function TeamMap({ stOf, live, busy }) {
  const hot = new Set(Object.entries(stOf).filter(([, s]) => s === 'running' || s === 'approval').map(([a]) => AGENT_BY_ID[a]?.dept));
  const curve = (a, b) => `M${a[0]} ${a[1]}Q${(a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.08} ${(a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.08} ${b[0]} ${b[1]}`;
  return (
    <svg className="ws-map" viewBox={`0 0 ${MAP.W} ${MAP.H}`} role="img" aria-label="Peta tim koloni">
      {DIVS.map((d) => (
        <path key={`t-${d}`} className={`ws-edge trunk${hot.has(d) ? ' on' : ''}`} d={curve(MAP.c, MAP.hubs[d])} />
      ))}
      {TEAM.map((g) => (
        <path key={`e-${g.id}`} className={`ws-edge${stOf[g.id] === 'running' || stOf[g.id] === 'approval' ? ' on' : ''}`} d={curve(MAP.hubs[g.dept], MAP.nodes[g.id])} />
      ))}
      {DIVS.map((d) => (
        <g key={d} transform={`translate(${MAP.hubs[d][0]} ${MAP.hubs[d][1]})`} className={`ws-hub${hot.has(d) ? ' on' : ''}`} style={{ '--dc': DEPTS[d].color }}>
          <path d={hexPath(32)} />
          <text y="4">{DEPTS[d].short}</text>
        </g>
      ))}
      {TEAM.map((g) => {
        const s = stOf[g.id] || 'idle';
        return (
          <g key={g.id} transform={`translate(${MAP.nodes[g.id][0]} ${MAP.nodes[g.id][1]})`} className={`ws-node st-${s}${live.has(g.id) ? '' : ' off'}`}>
            <title>{`${g.nick} · ${g.role}${live.has(g.id) ? '' : ' · belum tersambung AI'}`}</title>
            <path d={hexPath(25)} />
            <text y="4">{g.nick}</text>
          </g>
        );
      })}
      <g transform={`translate(${MAP.c[0]} ${MAP.c[1]})`} className={`ws-queen${busy ? ' busy' : ''}`}>
        <path className="ring" d={hexPath(64)} />
        <path d={hexPath(50)} />
        <text className="crown" y="-6">👑</text>
        <text y="22">Queen Bea</text>
      </g>
    </svg>
  );
}

function MapLegend() {
  return (
    <div className="ws-legend">
      {[
        ['running', 'Bekerja'],
        ['approval', 'Perlu persetujuan'],
        ['done', 'Selesai hari ini'],
        ['revise', 'Gagal'],
        ['idle', 'Siaga'],
        ['off', 'Belum tersambung AI'],
      ].map(([k, l]) => (
        <span key={k}>
          <i className={`k-${k}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

// Roda madu: satu segmen per tugas, berputar saat tiket berjalan
function Dial({ ticket, size = 112 }) {
  const ks = ticket?.steps.length ? ticket.steps : [{ st: 'pending' }];
  const n = ks.length;
  const P = (r, a) => [(120 + Math.cos(a) * r).toFixed(1), (120 + Math.sin(a) * r).toFixed(1)];
  return (
    <svg className="ws-dial" style={{ width: size, height: size }} viewBox="0 0 240 240" role="img" aria-label={ticket ? `Progres ${pct(ticket)} persen` : 'Menyusun'}>
      {ks.map((k, i) => {
        const a0 = -Math.PI / 2 + (i * Math.PI * 2) / n + (n > 1 ? 0.035 : 0);
        const a1 = a0 + (Math.PI * 2) / n - (n > 1 ? 0.07 : 0.0001);
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const [p0, p1, p2, p3] = [P(114, a0), P(114, a1), P(94, a1), P(94, a0)];
        return (
          <path key={i} className={`seg st-${k.st}`} d={`M${p0[0]} ${p0[1]}A114 114 0 ${big} 1 ${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}A94 94 0 ${big} 0 ${p3[0]} ${p3[1]}Z`}>
            {k.agent && <title>{`${k.agent.nick}: ${k.task} (${STEP[k.st]})`}</title>}
          </path>
        );
      })}
      <g className={`spin${!ticket || ticket.status === 'running' ? ' on' : ''}`} transform="translate(120 120)">
        <path d={hexPath(82)} className="comb" />
      </g>
      <path transform="translate(120 120)" d={hexPath(60)} className="core" />
      <text x="120" y="131" className="pct">
        {ticket ? `${pct(ticket)}%` : '…'}
      </text>
    </svg>
  );
}

function StepCard({ k, onOpen }) {
  const live = k.st === 'running';
  return (
    <article className={`ws-card st-${k.st}`}>
      <header>
        <AgentHex agent={k.agent} />
        <div>
          <b>{k.agent?.nick || k.agentId}</b>
          <small>{k.agent?.role || ''}</small>
        </div>
      </header>
      <p className="ws-card-task">{k.task}</p>
      {live && (
        <div className="ws-card-prog">
          <Bar value={k.p} />
          <span>{Math.round(k.p * 100)}%</span>
        </div>
      )}
      {k.note && k.st !== 'done' && k.st !== 'approval' && <p className="ws-card-note">{k.note}</p>}
      {k.st === 'revise' && k.result && <p className="ws-card-note bad">{k.result.slice(0, 160)}</p>}
      <footer>
        <span>{k.st === 'done' || k.st === 'revise' ? fmt(k.min) : live ? `Berjalan ${fmt(k.min)}` : ''}</span>
        {k.st === 'done' && (k.result || k.files.length > 0) && (
          <button className="ws-link" onClick={() => onOpen(k)}>
            Lihat hasil →
          </button>
        )}
      </footer>
    </article>
  );
}

function Chat({ msgs, busy, onSend, placeholder, intro }) {
  const [text, setText] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs.length, busy]);
  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    onSend(v).then((ok) => ok && setText(''));
  };
  return (
    <div className="ws-chat">
      <div className="ws-msgs" ref={box} aria-live="polite">
        {!msgs.length && <div className="ws-msg">{intro}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`ws-msg${m.role === 'user' ? ' me' : ''}${m.role === 'system' ? ' sys' : ''}`}>
            {m.role === 'user' ? <p>{cleanAsk(m.content)}</p> : <Rich text={m.content} />}
            <time>
              {m.role === 'user' ? 'Kamu' : 'Queen Bea'} · {clock(m.created_at)}
            </time>
          </div>
        ))}
        {busy && <div className="ws-msg typing">Queen Bea sedang mengetik…</div>}
      </div>
      <form className="ws-say" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Pesan untuk Queen Bea" maxLength={2000} />
        <button className="ws-btn primary" type="submit" disabled={busy || !text.trim()}>
          Kirim
        </button>
      </form>
    </div>
  );
}

function ResultModal({ step, onClose, onFile }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="ws-modal" role="dialog" aria-modal="true" aria-label={`Hasil ${step.agent?.nick || ''}`} onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <AgentHex agent={step.agent} />
          <div>
            <small>
              {step.agent?.nick} · {fmt(step.min)}
            </small>
            <b>{step.task}</b>
          </div>
          <button className="ws-btn ghost sm" onClick={onClose}>
            Tutup
          </button>
        </header>
        <div className="ws-modal-body ws-doc">
          {step.result ? <Rich text={step.result} /> : <p>Tidak ada teks hasil.</p>}
          <Files files={step.files} onFile={onFile} />
        </div>
      </div>
    </div>
  );
}

function Files({ files, onFile }) {
  if (!files?.length) return null;
  return (
    <div className="ws-files">
      {files.map((f) => (
        <button key={f.path || f.url || f.name} onClick={() => onFile(f)}>
          <span aria-hidden="true">{/^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name || '') ? '🖼' : '📄'}</span>
          <span>
            {f.name}
            {f.by && <small> · {f.by}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- daftar tiket ----------
function TicketRow({ t, active, onPick }) {
  const agents = [...new Set(t.steps.map((k) => k.agentId))].map((id) => AGENT_BY_ID[id]).filter(Boolean);
  return (
    <button className={`ws-row${active ? ' on' : ''}`} onClick={onPick} aria-current={active ? 'page' : undefined}>
      <div className="ws-row-top">
        <span className="ws-no">#{t.no}</span>
        <Badge st={t.status}>{TICKET[t.status]}</Badge>
        <time>{ago(t.createdAt)}</time>
      </div>
      <b className="ws-row-title">{cleanAsk(t.request)}</b>
      <div className="ws-row-foot">
        <div className="ws-stack">
          {agents.slice(0, 4).map((a) => (
            <AgentHex key={a.id} agent={a} size="xs" />
          ))}
          {agents.length > 4 && <span className="ws-more">+{agents.length - 4}</span>}
        </div>
        <span>
          {doneOf(t)}/{t.steps.length} tugas
        </span>
      </div>
      {t.status === 'running' && <Bar value={progOf(t)} />}
    </button>
  );
}

function Rail({ tickets, sel, creating, onPick, onHome }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const list = tickets.filter((t) => (filter === 'all' || (filter === 'running' ? t.status === 'running' : t.status !== 'running')) && (!q.trim() || `#${t.no} ${cleanAsk(t.request)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const running = tickets.filter((t) => t.status === 'running').length;
  return (
    <aside className="ws-rail" aria-label="Daftar tiket">
      <button className={`ws-home${sel ? '' : ' on'}`} onClick={onHome}>
        <span aria-hidden="true">🐝</span>
        <div>
          <b>Ringkasan koloni</b>
          <small>Peta tim & buat tiket</small>
        </div>
      </button>
      <div className="ws-rail-head">
        <h2>Tiket</h2>
        <span>{tickets.length}</span>
      </div>
      <div className="ws-seg" role="tablist" aria-label="Saring tiket">
        {[
          ['all', 'Semua'],
          ['running', `Berjalan${running ? ` · ${running}` : ''}`],
          ['closed', 'Selesai'],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <input className="ws-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor atau judul tiket" aria-label="Cari tiket" />
      <div className="ws-rows">
        {creating && (
          <div className="ws-row ghost">
            <div className="ws-row-top">
              <span className="ws-no">#…</span>
              <Badge st="planning">Menyusun</Badge>
            </div>
            <b className="ws-row-title">{creating}</b>
            <div className="ws-row-foot">
              <span>Queen Bea sedang membagi tugas…</span>
            </div>
          </div>
        )}
        {list.map((t) => (
          <TicketRow key={t.id} t={t} active={sel?.id === t.id} onPick={() => onPick(t)} />
        ))}
        {!list.length && !creating && <p className="ws-rail-empty">{tickets.length ? 'Tidak ada tiket yang cocok.' : 'Belum ada tiket. Buat tiket pertama dari Ringkasan koloni.'}</p>}
      </div>
    </aside>
  );
}

// ---------- ringkasan koloni ----------
function Overview({ tickets, live, creating, busy, onCreate, onAsk }) {
  const [text, setText] = useState('');
  const stOf = {};
  const pri = { revise: 5, approval: 4, running: 3, done: 2, pending: 1 };
  const today = new Date().toDateString();
  for (const t of tickets)
    for (const k of t.steps) {
      if (k.st === 'done' && new Date(t.reportedAt || t.createdAt).toDateString() !== today) continue;
      if (k.st === 'pending' || (t.status !== 'running' && k.st !== 'done')) continue;
      if (!stOf[k.agentId] || pri[k.st] > pri[stOf[k.agentId]]) stOf[k.agentId] = k.st;
    }
  const running = tickets.filter((t) => t.status === 'running');
  const week = Date.now() - 7 * 86400e3;
  const doneWeek = tickets.filter((t) => t.status !== 'running' && new Date(t.reportedAt || t.createdAt) > week).length;
  const working = Object.values(stOf).filter((s) => s === 'running').length;
  const submit = (fn) => {
    const v = text.trim();
    if (v) fn(v).then((ok) => ok && setText(''));
  };
  return (
    <div className="ws-overview">
      <section className="ws-card-lg ws-compose">
        <div className="ws-compose-head">
          <span className="ws-crown" aria-hidden="true">
            👑
          </span>
          <div>
            <h1>Tiket baru untuk tim</h1>
            <p>Ceritakan pekerjaannya. Queen Bea memecahnya menjadi tugas dan mengirim ke agent yang tepat.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(onCreate);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(onCreate);
            }}
            rows={3}
            maxLength={1500}
            placeholder="Misalnya: rencana promo HYROX bulan depan, lengkap dengan poster, copy iklan, dan jadwal posting"
            aria-label="Isi tiket"
            disabled={!!creating}
          />
          <div className="ws-compose-actions">
            <small className={creating ? '' : 'ws-hide-sm'}>{creating ? 'Queen Bea sedang menyusun rencana. Biasanya kurang dari satu menit.' : 'Ctrl + Enter untuk membuat tiket'}</small>
            <button className="ws-btn ghost" type="button" disabled={busy || !text.trim()} onClick={() => submit(onAsk)}>
              Tanya Queen saja
            </button>
            <button className="ws-btn primary" type="submit" disabled={busy || !text.trim()}>
              {creating ? 'Menyusun…' : 'Buat tiket'}
            </button>
          </div>
        </form>
      </section>

      <section className="ws-stats" aria-label="Ringkasan">
        <div className="ws-stat">
          <b>{running.length}</b>
          <span>Tiket berjalan</span>
        </div>
        <div className="ws-stat">
          <b>{doneWeek}</b>
          <span>Tiket selesai 7 hari</span>
        </div>
        <div className="ws-stat">
          <b>{working}</b>
          <span>Agent sedang bekerja</span>
        </div>
        <div className="ws-stat">
          <b>
            {TEAM.filter((g) => live.has(g.id)).length}
            <small>/{TEAM.length}</small>
          </b>
          <span>Agent tersambung AI</span>
        </div>
      </section>

      <section className="ws-card-lg ws-mapcard">
        <div className="ws-card-head">
          <h2>Peta koloni</h2>
          <MapLegend />
        </div>
        <TeamMap stOf={stOf} live={live} busy={running.length > 0} />
      </section>
    </div>
  );
}

// ---------- detail tiket ----------
function Board({ t, onOpen }) {
  const cols = [
    ['antre', 'Antre', t.steps.filter((k) => k.st === 'pending' || k.st === 'approval')],
    ['jalan', 'Bekerja', t.steps.filter((k) => k.st === 'running')],
    ['selesai', 'Selesai', t.steps.filter((k) => k.st === 'done')],
  ];
  const failed = t.steps.filter((k) => k.st === 'revise');
  if (failed.length) cols.push(['gagal', 'Gagal', failed]);
  const appr = t.steps.filter((k) => k.st === 'approval');
  return (
    <>
      {appr.length > 0 && (
        <div className="ws-alert info">
          <b>Perlu persetujuan owner.</b> {appr.map((k) => `${k.agent?.nick}: ${k.task}`).join(' · ')}. Putuskan di Hive Hall → Persetujuan.
        </div>
      )}
      {failed.length > 0 && t.status === 'running' && (
        <div className="ws-alert bad">
          <b>{failed.length} tugas gagal.</b> Minta Queen Bea mengulang lewat tab Rapat.
        </div>
      )}
      <div className="ws-board" style={{ '--cols': cols.length }}>
        {cols.map(([id, label, ks]) => (
          <section key={id} className={`ws-col c-${id}`}>
            <header>
              <span>{label}</span>
              <em>{ks.length}</em>
            </header>
            {ks.map((k) => (
              <StepCard key={k.id} k={k} onOpen={onOpen} />
            ))}
            {!ks.length && <p className="ws-col-empty">Kosong</p>}
          </section>
        ))}
      </div>
    </>
  );
}

function Report({ t, msgs, onOpen, onFile }) {
  const ks = t.steps;
  const report = msgs.find((m) => m.meta?.report === t.id);
  const files = ks.flatMap((k) => k.files.map((f) => ({ ...f, by: k.agent?.nick })));
  const fails = ks.filter((k) => k.st === 'revise').length;
  const open = t.status === 'running';
  return (
    <div className="ws-report">
      {open && <div className="ws-alert info">Laporan sementara. Tiket masih berjalan; Queen Bea mengirim rekap otomatis setelah semua tugas selesai.</div>}
      <div className="ws-stats sm">
        <div className="ws-stat">
          <b>
            {doneOf(t)}
            <small>/{ks.length}</small>
          </b>
          <span>Tugas selesai</span>
        </div>
        <div className="ws-stat">
          <b>{fmt(ks.reduce((m, k) => Math.max(m, k.min), 0))}</b>
          <span>Waktu kerja (paralel)</span>
        </div>
        <div className={`ws-stat${fails ? ' bad' : ''}`}>
          <b>{fails}</b>
          <span>Tugas gagal</span>
        </div>
        <div className="ws-stat">
          <b>{new Set(ks.map((k) => k.agentId)).size}</b>
          <span>Agent terlibat</span>
        </div>
      </div>
      <div className="ws-report-grid">
        <section className="ws-card-lg">
          <div className="ws-card-head">
            <h2>Rekap Queen Bea</h2>
            {report && <time>{when(report.created_at)}</time>}
          </div>
          {report ? (
            <div className="ws-doc">
              <Rich text={report.content} />
              <Files files={report.meta.files} onFile={onFile} />
            </div>
          ) : (
            <Empty icon="📝" title={open ? 'Rekap belum tersedia' : 'Rekap tidak ditemukan'}>
              {open ? 'Rekap muncul di sini setelah semua agent menyetor hasil.' : 'Queen Bea belum mengirim rekap ke percakapan tiket ini.'}
            </Empty>
          )}
        </section>
        <div className="ws-report-side">
          <section className="ws-card-lg">
            <div className="ws-card-head">
              <h2>Hasil per agent</h2>
            </div>
            <ul className="ws-results">
              {ks.map((k) => (
                <li key={k.id}>
                  <AgentHex agent={k.agent} size="sm" />
                  <div>
                    <b>{k.agent?.nick}</b>
                    <span>{k.task}</span>
                    {k.result && k.st === 'done' && <p>{preview(k.result)}</p>}
                  </div>
                  <div className="ws-results-r">
                    <Badge st={k.st}>{STEP[k.st]}</Badge>
                    {(k.result || k.files.length > 0) && (
                      <button className="ws-link" onClick={() => onOpen(k)}>
                        Buka
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {files.length > 0 && (
            <section className="ws-card-lg">
              <div className="ws-card-head">
                <h2>Lampiran tim</h2>
                <span className="ws-count">{files.length}</span>
              </div>
              <Files files={files} onFile={onFile} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketView({ t, tab, setTab, busy, onSend, onOpen, onFile, onBack }) {
  const msgs = useThreadMessages(t.threadId);
  const agents = new Set(t.steps.map((k) => k.agentId));
  const divs = new Set([...agents].map((a) => AGENT_BY_ID[a]?.dept).filter(Boolean));
  // tiket selesai: tugas berjalan paralel, jadi durasinya = tugas terlama
  const dur = t.status === 'running' ? (Date.now() - new Date(t.createdAt)) / 60000 : Math.max(0, ...t.steps.map((k) => k.min));
  const tabs = [
    ['rapat', 'Rapat', msgs.length || null],
    ['kerja', 'Kerja', t.steps.length],
    ['laporan', 'Laporan', null],
  ];
  return (
    <div className="ws-ticket">
      <button className="ws-back" onClick={onBack}>
        ← Semua tiket
      </button>
      <section className="ws-card-lg ws-thead">
        <Dial ticket={t} />
        <div className="ws-thead-t">
          <div className="ws-thead-meta">
            <span className="ws-no lg">Tiket #{t.no}</span>
            <Badge st={t.status}>{TICKET[t.status]}</Badge>
          </div>
          <h1>{cleanAsk(t.request)}</h1>
          <dl className="ws-facts">
            <div>
              <dt>Dibuat</dt>
              <dd>{when(t.createdAt)}</dd>
            </div>
            <div>
              <dt>{t.status === 'running' ? 'Berjalan' : 'Durasi'}</dt>
              <dd>{fmt(dur)}</dd>
            </div>
            <div>
              <dt>Tugas</dt>
              <dd>
                {doneOf(t)}/{t.steps.length} selesai
              </dd>
            </div>
            <div>
              <dt>Tim</dt>
              <dd>
                {agents.size} agent · {divs.size} divisi
              </dd>
            </div>
          </dl>
          <div className="ws-thead-prog">
            <Bar value={progOf(t)} />
            <b>{pct(t)}%</b>
          </div>
        </div>
      </section>
      <nav className="ws-tabs" role="tablist" aria-label="Bagian tiket">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            {n ? <em>{n}</em> : null}
          </button>
        ))}
      </nav>
      {tab === 'rapat' && (
        <div className="ws-rapat">
          <section className="ws-card-lg">
            <Chat msgs={msgs} busy={busy} onSend={(v) => onSend(v, t.threadId)} placeholder="Tulis ke Queen Bea tentang tiket ini…" intro="Percakapan tiket ini kosong." />
          </section>
          <section className="ws-card-lg ws-cast">
            <div className="ws-card-head">
              <h2>Penugasan</h2>
            </div>
            <ul>
              {t.steps.map((k) => (
                <li key={k.id}>
                  <AgentHex agent={k.agent} size="sm" />
                  <div>
                    <b>{k.agent?.nick}</b>
                    <span>{k.task}</span>
                  </div>
                  <Badge st={k.st}>{STEP[k.st]}</Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {tab === 'kerja' && <Board t={t} onOpen={onOpen} />}
      {tab === 'laporan' && <Report t={t} msgs={msgs} onOpen={onOpen} onFile={onFile} />}
    </div>
  );
}

function ChatDrawer({ threadId, busy, onSend, onClose, onReset }) {
  const msgs = useThreadMessages(threadId);
  return (
    <div className="ws-drawer-bg" onClick={onClose}>
      <aside className="ws-drawer" aria-label="Chat Queen Bea" onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="ws-crown" aria-hidden="true">
            👑
          </span>
          <div>
            <b>Queen Bea</b>
            <small>Tanya apa saja. Tidak membuat tiket.</small>
          </div>
          <button className="ws-btn ghost sm" onClick={onReset} disabled={!threadId}>
            Obrolan baru
          </button>
          <button className="ws-btn ghost sm" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </header>
        <Chat msgs={msgs} busy={busy} onSend={onSend} placeholder="Tulis ke Queen Bea…" intro="Halo. Ada yang mau ditanyakan soal koloni?" />
      </aside>
    </div>
  );
}

// ---------- halaman ----------
export function WorkshopView({ ticketNo }) {
  const agentPrompts = useHive((s) => s.agentPrompts);
  const live = useMemo(() => new Set(agentPrompts), [agentPrompts]);
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(null); // teks tiket yang sedang disusun Queen
  const [tab, setTab] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [chatThread, setChatThread] = useState(savedThread);
  const [toast, setToast] = useState('');
  const [step, setStep] = useState(null);
  const [file, setFile] = useState(null);
  const toastTimer = useRef(0);

  const say = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  const refresh = useCallback(
    () =>
      loadTickets()
        .then((list) => {
          setTickets(list);
          setError('');
          return list;
        })
        .catch((e) => {
          setError(e.message);
          return null;
        }),
    [],
  );

  useEffect(() => {
    refresh();
    const stop = watchTickets(refresh);
    const t = setInterval(() => !document.hidden && refresh(), POLL_MS);
    return () => {
      stop();
      clearInterval(t);
    };
  }, [refresh]);

  const sel = ticketNo && tickets ? tickets.find((t) => String(t.no) === String(ticketNo)) || null : null;
  // tab bawaan saat membuka tiket: berjalan → Kerja, selesai → Laporan
  useEffect(() => {
    setTab(null);
  }, [ticketNo]);
  const curTab = tab || (sel ? tabFor(sel) : 'kerja');

  // kabar saat tiket yang sedang dibuka selesai
  const prevStatus = useRef(null);
  useEffect(() => {
    const prev = prevStatus.current;
    if (sel && prev?.id === sel.id && prev.status === 'running' && sel.status !== 'running') say(`Tiket #${sel.no} selesai. Laporan siap.`);
    prevStatus.current = sel ? { id: sel.id, status: sel.status } : null;
  }, [sel?.id, sel?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (text) => {
    if (busy) return false;
    setBusy(true);
    setCreating(text);
    try {
      const r = await startTicket(text);
      const sent = (r?.meta?.delegated || []).filter((d) => d.task_id);
      const list = await refresh();
      const made = (list || []).find((t) => t.threadId === r?.thread_id);
      if (sent.length && made) {
        say(`Tiket #${made.no} dibuat · ${sent.length} tugas dikirim ke tim`);
        go(`/workshop/${made.no}`);
      } else {
        say('Queen Bea menjawab tanpa membagi tugas, jadi belum ada tiket. Lihat jawabannya di chat.');
        if (r?.thread_id) {
          setChatThread(r.thread_id);
          saveThread(r.thread_id);
        }
        setDrawer(true);
      }
      return true;
    } catch (e) {
      say(e.message);
      return false;
    } finally {
      setBusy(false);
      setCreating(null);
    }
  };

  const send = async (text, threadId) => {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await askQueen(text, threadId);
      if (!threadId && r?.thread_id) {
        setChatThread(r.thread_id);
        saveThread(r.thread_id);
      }
      refresh();
      return true;
    } catch (e) {
      say(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ask = async (text) => {
    setDrawer(true);
    return send(text, chatThread);
  };

  const onFile = (f) => (f.path ? setFile(f) : f.url && window.open(f.url, '_blank', 'noopener'));

  let main;
  if (!tickets) main = <div className="ws-card-lg">{error ? <Empty icon="⚠️" title="Tiket gagal dimuat">{error}</Empty> : <Empty icon="🐝" title="Memuat tiket…" />}</div>;
  else if (ticketNo && !sel)
    main = (
      <div className="ws-card-lg">
        <Empty icon="🔍" title={`Tiket #${ticketNo} tidak ditemukan`}>
          <button className="ws-btn" onClick={() => go('/workshop')}>
            Kembali ke ringkasan
          </button>
        </Empty>
      </div>
    );
  else if (sel) main = <TicketView t={sel} tab={curTab} setTab={setTab} busy={busy} onSend={send} onOpen={setStep} onFile={onFile} onBack={() => go('/workshop')} />;
  else main = <Overview tickets={tickets} live={live} creating={creating} busy={busy} onCreate={create} onAsk={ask} />;

  return (
    <div className="page ws-page">
      <header className="ws-top">
        <button className="ws-btn ghost-dark sm" onClick={() => go('/')}>
          ← Koloni
        </button>
        <div className="ws-brand">
          <span className="ws-logo" aria-hidden="true" />
          <div>
            <b>Workshop</b>
            <small>Hive Colony · Tim Queen Bea</small>
          </div>
        </div>
        <div className="ws-top-r">
          <button className="ws-btn ghost-dark sm" onClick={() => setDrawer(true)}>
            💬 <span className="ws-hide-sm">Chat Queen</span>
          </button>
          <button className="ws-btn primary sm" onClick={() => go('/workshop')}>
            + <span className="ws-hide-sm">Tiket baru</span>
          </button>
        </div>
      </header>
      {error && tickets && <div className="ws-conn">{error} Mencoba lagi…</div>}
      <div className={`ws-shell${sel || ticketNo ? ' has-ticket' : ''}`}>
        <Rail tickets={tickets || []} sel={sel} creating={creating} onPick={(t) => go(`/workshop/${t.no}`)} onHome={() => go('/workshop')} />
        <main className="ws-main">{main}</main>
      </div>
      {toast && (
        <div className="ws-toast" role="status">
          {toast}
        </div>
      )}
      {drawer && (
        <ChatDrawer
          threadId={chatThread}
          busy={busy}
          onSend={(v) => send(v, chatThread)}
          onClose={() => setDrawer(false)}
          onReset={() => {
            setChatThread(null);
            saveThread(null);
          }}
        />
      )}
      {step && <ResultModal step={step} onClose={() => setStep(null)} onFile={onFile} />}
      {file && <FileViewer file={file} onClose={() => setFile(null)} />}
    </div>
  );
}
