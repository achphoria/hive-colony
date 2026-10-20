// Workshop (#/workshop): panggung kerja tim ala Agent Hub, dengan tim & data Hive Colony.
// Empat babak: Siaga (peta koloni) → Rapat (chat Queen Bea + rancangan) → Kerja (paket berjalan) → Laporan (hasil).
// Tiket = paket kerja Queen Bea (hc_delegations), langkah = tugas agent (hc_plan_tasks).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { loadMessages, watchThread } from '../hall/agentApi';
import { loadPackages, startPackage, askQueen, watchPackages, savedThread, saveThread } from '../hall/workshopApi';
import { FileViewer } from './FileViewer';
import { Rich } from './AgentWorkspace';
import { go } from './nav';

const ACTS = [
  ['siaga', 'Siaga'],
  ['rapat', 'Rapat'],
  ['kerja', 'Kerja'],
  ['laporan', 'Laporan'],
];
const ST = { pending: 'Menunggu', running: 'Bekerja', approval: 'Menunggu persetujuan', revise: 'Gagal', done: 'Selesai' };
const DIVS = ['cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const POLL_MS = 8000;

const fmt = (m) => {
  m = Math.round(m || 0);
  const h = Math.floor(m / 60);
  return h ? `${h} j ${String(m % 60).padStart(2, '0')} mnt` : `${m} mnt`;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '–');
const clock = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const progOf = (pkg) => (pkg?.steps.length ? pkg.steps.reduce((s, k) => s + (k.st === 'done' ? 1 : k.st === 'running' ? k.p : 0), 0) / pkg.steps.length : 0);
const cleanAsk = (s) => String(s || '').replace(/^\[Workshop\]\s*/, '').split('\n\nPecah permintaan ini')[0];

// ---------- peta koloni: Queen di tengah, 7 divisi melingkar, agent di sekeliling divisinya ----------
const MAP = (() => {
  const W = 1100;
  const H = 760;
  const c = [W / 2, H / 2];
  const hubs = {};
  const nodes = {};
  DIVS.forEach((d, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / DIVS.length;
    const hx = c[0] + Math.cos(a) * 330;
    const hy = c[1] + Math.sin(a) * 215;
    hubs[d] = [hx, hy];
    const team = AGENTS.filter((g) => g.dept === d);
    team.forEach((g, j) => {
      const b = a + (j - (team.length - 1) / 2) * 0.6;
      nodes[g.id] = [hx + Math.cos(b) * 118, hy + Math.sin(b) * 100];
    });
  });
  return { W, H, c, hubs, nodes };
})();

const hexPath = (r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  }).join('') + 'Z';

function TeamMap({ pkg, live }) {
  const stOf = {};
  const pri = { revise: 5, approval: 4, running: 3, done: 2, pending: 1 };
  for (const k of pkg?.steps || []) if (!stOf[k.agentId] || pri[k.st] > pri[stOf[k.agentId]]) stOf[k.agentId] = k.st;
  const hotDiv = new Set(Object.entries(stOf).filter(([, s]) => s === 'running' || s === 'approval' || s === 'revise').map(([a]) => AGENT_BY_ID[a]?.dept));
  const curve = (a, b) => `M${a[0]} ${a[1]}Q${(a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.08} ${(a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.08} ${b[0]} ${b[1]}`;
  return (
    <svg className="ws-map" viewBox={`0 0 ${MAP.W} ${MAP.H}`} role="img" aria-label="Peta tim koloni">
      {DIVS.map((d) => (
        <path key={`t-${d}`} className={`ws-edge trunk${hotDiv.has(d) ? ' on' : ''}`} d={curve(MAP.c, MAP.hubs[d])} />
      ))}
      {AGENTS.filter((g) => g.dept !== 'ceo').map((g) => (
        <path key={`e-${g.id}`} className={`ws-edge${stOf[g.id] && stOf[g.id] !== 'done' && stOf[g.id] !== 'pending' ? ' on' : ''}`} d={curve(MAP.hubs[g.dept], MAP.nodes[g.id])} />
      ))}
      {DIVS.map((d) => (
        <g key={d} transform={`translate(${MAP.hubs[d][0]} ${MAP.hubs[d][1]})`} className={`ws-hub${hotDiv.has(d) ? ' on' : ''}`}>
          <path d={hexPath(30)} style={{ '--dc': DEPTS[d].color }} />
          <text y="5">{DEPTS[d].short}</text>
        </g>
      ))}
      {AGENTS.filter((g) => g.dept !== 'ceo').map((g) => {
        const s = stOf[g.id] || 'pending';
        const off = !live.has(g.id);
        const out = pkg && pkg.steps.length && !stOf[g.id];
        return (
          <g key={g.id} transform={`translate(${MAP.nodes[g.id][0]} ${MAP.nodes[g.id][1]})`} className={`ws-node st-${s}${off ? ' off' : ''}${out ? ' out' : ''}`}>
            <title>{`${g.nick} · ${g.role}${off ? ' · belum aktif' : ''}`}</title>
            <path d={hexPath(24)} />
            <text className="ws-nm" y="5">{g.nick}</text>
          </g>
        );
      })}
      <g transform={`translate(${MAP.c[0]} ${MAP.c[1]})`} className={`ws-queen${pkg && pkg.status === 'running' ? ' busy' : ''}`}>
        <path className="ring" d={hexPath(62)} />
        <path d={hexPath(48)} />
        <text className="crown" y="-4">👑</text>
        <text className="ws-nm" y="22">Queen Bea</text>
      </g>
    </svg>
  );
}

// Roda madu: satu segmen per tugas, berputar saat paket berjalan
function Dial({ pkg }) {
  const ks = pkg?.steps.length ? pkg.steps : [{ st: 'pending' }];
  const n = ks.length;
  const P = (r, a) => [(120 + Math.cos(a) * r).toFixed(1), (120 + Math.sin(a) * r).toFixed(1)];
  const pct = Math.round(progOf(pkg) * 100);
  return (
    <svg className="ws-dial" viewBox="0 0 240 240" role="img" aria-label={pkg ? `Progres ${pct} persen` : 'Koloni siaga'}>
      {ks.map((k, i) => {
        const a0 = -Math.PI / 2 + (i * Math.PI * 2) / n + 0.03;
        const a1 = a0 + (Math.PI * 2) / n - 0.06;
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const [p0, p1, p2, p3] = [P(114, a0), P(114, a1), P(96, a1), P(96, a0)];
        return (
          <path key={i} className={`seg st-${k.st}`} d={`M${p0[0]} ${p0[1]}A114 114 0 ${big} 1 ${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}A96 96 0 ${big} 0 ${p3[0]} ${p3[1]}Z`}>
            {k.agent && <title>{`${k.agent.nick}: ${k.task} (${ST[k.st]})`}</title>}
          </path>
        );
      })}
      <g className={`spin${pkg?.status === 'running' ? ' on' : ''}`} transform="translate(120 120)">
        <path d={hexPath(84)} className="comb" />
      </g>
      <path transform="translate(120 120)" d={hexPath(58)} className="core" />
      <text x="120" y="128" className="pct">
        {pkg ? `${pct}%` : '🐝'}
      </text>
    </svg>
  );
}

function StepCard({ k, onOpen }) {
  const live = k.st === 'running';
  const dept = DEPTS[k.agent?.dept] || DEPTS.guest;
  return (
    <div className={`ws-card st-${k.st}`}>
      <div className="c-top">
        <span className="hex" style={{ '--dc': dept.color }}>
          {(k.agent?.nick || '?').slice(0, 2)}
        </span>
        <div>
          <b>{k.agent?.nick || k.agentId}</b>
          <small>{dept.short}</small>
        </div>
      </div>
      <p className="c-task">{k.task}</p>
      {live && (
        <div className="c-bar">
          <i style={{ width: `${Math.round(k.p * 100)}%` }} />
        </div>
      )}
      {k.note && k.st !== 'done' && <p className="c-note">{k.note}</p>}
      <div className="c-foot">
        <span className={`pill st-${k.st}`}>
          {ST[k.st]}
          {live ? ` · ${Math.round(k.p * 100)}%` : ''}
        </span>
        <span>{k.st === 'done' || k.st === 'revise' ? fmt(k.min) : ''}</span>
      </div>
      {k.st === 'done' && (k.result || k.files.length > 0) && (
        <button className="ws-link" onClick={() => onOpen(k)}>
          Lihat hasil →
        </button>
      )}
    </div>
  );
}

function Chat({ msgs, busy, onSend, placeholder }) {
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
    <>
      <div className="ws-msgs" ref={box} aria-live="polite">
        {!msgs.length && <div className="ws-msg">👑 Halo. Pekerjaan apa yang mau kita mulai hari ini?</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`ws-msg${m.role === 'user' ? ' me' : ''}${m.role === 'system' ? ' sys' : ''}`}>
            {m.role === 'user' ? cleanAsk(m.content) : <Rich text={m.content} />}
            <time>
              {m.role === 'user' ? 'Kamu' : 'Queen Bea'} · {clock(m.created_at)}
            </time>
          </div>
        ))}
        {busy && <div className="ws-msg typing">Queen Bea sedang menyusun…</div>}
      </div>
      <form className="ws-say" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Pesan untuk Queen Bea" maxLength={2000} />
        <button className="btn primary" type="submit" disabled={busy}>
          Kirim
        </button>
      </form>
    </>
  );
}

// hasil satu tugas (teks + lampiran)
function ResultModal({ step, onClose, onFile }) {
  return (
    <div className="ws-modal" role="dialog" aria-label={`Hasil ${step.agent?.nick || ''}`} onClick={onClose}>
      <div className="ws-modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <small>{step.agent?.nick}</small>
            <b>{step.task}</b>
          </div>
          <button className="back" onClick={onClose}>
            Tutup
          </button>
        </header>
        <div className="ws-modal-body">
          {step.result ? <Rich text={step.result} /> : <p>Tidak ada teks hasil.</p>}
          {step.files.length > 0 && (
            <div className="ws-files">
              {step.files.map((f) => (
                <button key={f.path || f.name} onClick={() => onFile(f)}>
                  📎 {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkshopView() {
  const agentPrompts = useHive((s) => s.agentPrompts);
  const live = useMemo(() => new Set(agentPrompts), [agentPrompts]);
  const [act, setAct] = useState('siaga');
  const [picked, setPicked] = useState(false); // pengguna memilih babak sendiri: jangan dipindah otomatis
  const [pkgs, setPkgs] = useState(null);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState(savedThread);
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [workId, setWorkId] = useState(null);
  const [lapId, setLapId] = useState(null);
  const [step, setStep] = useState(null);
  const [file, setFile] = useState(null);
  const [ask, setAsk] = useState('');
  const [lapMsgs, setLapMsgs] = useState([]);

  const toastTimer = useRef(0);
  const say = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  };

  const refresh = useCallback(() => {
    loadPackages()
      .then((p) => {
        setPkgs(p);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const stop = watchPackages(refresh);
    const t = setInterval(() => !document.hidden && refresh(), POLL_MS);
    return () => {
      stop();
      clearInterval(t);
    };
  }, [refresh]);

  // percakapan workshop dengan Queen Bea
  useEffect(() => {
    if (!threadId) {
      setMsgs([]);
      return undefined;
    }
    let alive = true;
    const load = () => loadMessages(threadId).then((m) => alive && setMsgs(m));
    load();
    const stop = watchThread(threadId, load);
    return () => {
      alive = false;
      stop();
    };
  }, [threadId]);

  const running = (pkgs || []).filter((p) => p.status === 'running');
  const closed = (pkgs || []).filter((p) => p.status !== 'running');
  const work = running.find((p) => p.id === workId) || running[0] || null;
  const lap = closed.find((p) => p.id === lapId) || closed[0] || null;
  const mine = (pkgs || []).find((p) => p.threadId === threadId) || null;

  // rekap Queen untuk laporan yang dipilih ada di percakapan asal paket itu
  const lapThread = act === 'laporan' ? lap?.threadId : null;
  useEffect(() => {
    if (!lapThread) return undefined;
    let alive = true;
    loadMessages(lapThread).then((m) => alive && setLapMsgs(m));
    return () => {
      alive = false;
    };
  }, [lapThread, lap?.reportedAt]);

  // ikuti cerita kecuali pengguna memilih babak: ada paket berjalan → Kerja
  const prevRunning = useRef(null);
  useEffect(() => {
    if (!pkgs) return;
    const n = running.length;
    if (prevRunning.current !== null && n < prevRunning.current) say('Paket selesai. Laporan siap.');
    if (!picked && prevRunning.current === null && n) setAct('kerja');
    prevRunning.current = n;
  }, [pkgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (text, asPackage) => {
    if (busy) return false;
    setBusy(true);
    try {
      const r = asPackage ? await startPackage(text, threadId) : await askQueen(text, threadId);
      if (r?.thread_id && r.thread_id !== threadId) {
        setThreadId(r.thread_id);
        saveThread(r.thread_id);
      }
      const sent = (r?.meta?.delegated || []).filter((d) => d.task_id);
      if (asPackage) {
        say(sent.length ? `Queen mengirim ${sent.length} tugas ke tim` : 'Queen menjawab tanpa membagi tugas. Lihat di Rapat.');
        setPicked(false);
        setAct(sent.length ? 'kerja' : 'rapat');
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

  const newMeeting = () => {
    setThreadId(null);
    saveThread(null);
  };
  const pick = (a) => {
    setPicked(true);
    setAct(a);
  };
  const onFile = (f) => (f.path ? setFile(f) : f.url && window.open(f.url, '_blank', 'noopener'));

  let view;
  if (!pkgs) view = <div className="ws-panel ws-empty">{error || 'Memuat panggung…'}</div>;
  else if (act === 'siaga') {
    const last = closed[0];
    view = (
      <section className="ws-view siaga">
        <div className="ws-siaga-head">
          <div>
            <h1>{running.length ? `${running.length} paket berjalan` : 'Semua agent siaga'}</h1>
            <p>{running.length ? 'Lebah yang menyala sedang bekerja. Yang lain tetap siaga.' : 'Ceritakan pekerjaan berikutnya ke Queen Bea. Dia yang membagi tugas ke divisi.'}</p>
          </div>
          <div className="ws-alerts">
            {running.map((p) => (
              <button key={p.id} className="ws-alert" onClick={() => (setWorkId(p.id), pick('kerja'))}>
                <b>{cleanAsk(p.request).slice(0, 70)}</b>
                <small>Berjalan · {Math.round(progOf(p) * 100)}% · {p.steps.length} tugas</small>
              </button>
            ))}
            {last && (
              <button className="ws-alert calm" onClick={() => (setLapId(last.id), pick('laporan'))}>
                <b>Laporan terakhir</b>
                <small>
                  {cleanAsk(last.request).slice(0, 60)} · {when(last.reportedAt || last.createdAt)}
                </small>
              </button>
            )}
          </div>
        </div>
        <div className="ws-panel ws-bigmap">
          <TeamMap pkg={work} live={live} />
        </div>
        <form
          className="ws-ask"
          onSubmit={(e) => {
            e.preventDefault();
            const v = ask.trim();
            if (v) send(v, true).then((ok) => ok && setAsk(''));
          }}
        >
          <input value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={600} placeholder="Ceritakan ke Queen Bea… misalnya: rencana promo HYROX bulan depan lengkap dengan poster dan jadwal posting" aria-label="Permintaan untuk Queen Bea" />
          <button className="btn primary" type="submit" disabled={busy}>
            Mulai paket
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              const v = ask.trim();
              if (v) send(v, false).then((ok) => ok && (setAsk(''), pick('rapat')));
            }}
          >
            Tanya saja
          </button>
        </form>
        <p className="ws-hint">"Mulai paket" meminta Queen Bea membagi pekerjaan ke agent. "Tanya saja" hanya mengobrol. Lebah pudar belum tersambung AI.</p>
      </section>
    );
  } else if (act === 'rapat') {
    const cast = new Set((mine?.steps || []).map((k) => k.agentId));
    view = (
      <section className="ws-view rapat">
        <div className="ws-panel ws-chat">
          <div className="ws-sec-row">
            <h2 className="ws-sec">Rapat dengan Queen Bea</h2>
            <button className="btn sm" onClick={newMeeting}>
              Rapat baru
            </button>
          </div>
          <Chat msgs={msgs} busy={busy} onSend={(v) => send(v, false)} placeholder="Tulis ke Queen Bea…" />
        </div>
        <div className="ws-panel ws-plan">
          <div className="ws-plan-head">
            <Dial pkg={mine} />
            <div>
              <span className="ws-sec">Rancangan paket</span>
              <h2>{mine ? cleanAsk(mine.request) : 'Belum ada rancangan'}</h2>
              <div className="ws-meta">
                <span>
                  Tugas <b>{mine?.steps.length || 0}</b>
                </span>
                <span>
                  Agent <b>{cast.size}</b>
                </span>
                <span>
                  Divisi <b>{new Set([...cast].map((a) => AGENT_BY_ID[a]?.dept)).size}</b>
                </span>
              </div>
            </div>
          </div>
          <span className="ws-sec">Lebah yang dipilih</span>
          <div className="ws-cast">
            {AGENTS.filter((g) => g.dept !== 'ceo').map((g) => (
              <span key={g.id} className={`${cast.has(g.id) ? 'on' : ''}${live.has(g.id) ? '' : ' off'}`} title={g.role}>
                {g.nick}
              </span>
            ))}
          </div>
          {mine?.steps.length ? (
            <div className="ws-track">
              {mine.steps.map((k) => (
                <StepCard key={k.id} k={k} onOpen={setStep} />
              ))}
            </div>
          ) : (
            <div className="ws-empty">Rancangan muncul di sini saat Queen Bea membagi tugas dari percakapan ini.</div>
          )}
          {mine?.status === 'running' && (
            <button className="btn primary" onClick={() => (setWorkId(mine.id), pick('kerja'))}>
              Lihat jalannya kerja
            </button>
          )}
        </div>
      </section>
    );
  } else if (act === 'kerja') {
    if (!work) view = <div className="ws-panel ws-empty">Tidak ada paket berjalan. Mulai dari babak Siaga dengan bercerita ke Queen Bea.</div>;
    else {
      const ks = work.steps;
      const done = ks.filter((k) => k.st === 'done').length;
      const appr = ks.find((k) => k.st === 'approval');
      const fail = ks.find((k) => k.st === 'revise');
      view = (
        <section className="ws-view kerja">
          <div className="ws-panel ws-strip">
            <Dial pkg={work} />
            <div className="ws-strip-t">
              <div className="ws-meta">
                <span className="pill st-running">Berjalan</span>
                <span>
                  Dimulai <b>{when(work.createdAt)}</b>
                </span>
                <span>
                  Berjalan <b>{fmt((Date.now() - new Date(work.createdAt)) / 60000)}</b>
                </span>
              </div>
              <h1>{cleanAsk(work.request)}</h1>
              <div className="ws-prog">
                <div>
                  <i style={{ width: `${Math.round(progOf(work) * 100)}%` }} />
                </div>
                <span>{Math.round(progOf(work) * 100)}%</span>
              </div>
              <div className="ws-meta">
                <span>
                  {done} dari {ks.length} tugas selesai
                </span>
              </div>
              {appr && (
                <p className="ws-line info">
                  <b>Menunggu persetujuan owner:</b> {appr.agent?.nick} · {appr.task}. Putuskan di Hive Hall → Persetujuan.
                </p>
              )}
              {fail && (
                <p className="ws-line warn">
                  <b>Gagal:</b> {fail.agent?.nick} · {fail.task}
                  {fail.result ? ` — ${fail.result.slice(0, 140)}` : ''}
                </p>
              )}
            </div>
            <div className="ws-strip-r">
              {running.length > 1 && (
                <select value={work.id} onChange={(e) => setWorkId(e.target.value)} aria-label="Pilih paket">
                  {running.map((p) => (
                    <option key={p.id} value={p.id}>
                      {cleanAsk(p.request).slice(0, 50)}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn sm"
                onClick={() => {
                  setThreadId(work.threadId);
                  saveThread(work.threadId);
                  pick('rapat');
                }}
              >
                Chat Queen
              </button>
            </div>
          </div>
          <div className="ws-panel ws-lakon">
            <h2 className="ws-sec">Jalannya kerja · semua tugas berjalan paralel</h2>
            <div className="ws-track">
              {ks.map((k) => (
                <StepCard key={k.id} k={k} onOpen={setStep} />
              ))}
            </div>
          </div>
          <div className="ws-panel ws-minimap">
            <span className="ws-sec">Peta koloni</span>
            <TeamMap pkg={work} live={live} />
          </div>
        </section>
      );
    }
  } else {
    if (!lap) view = <div className="ws-panel ws-empty">Belum ada paket yang selesai. Laporan muncul di sini setelah semua tugas dalam paket selesai.</div>;
    else {
      const ks = lap.steps;
      const total = ks.reduce((m, k) => Math.max(m, k.min), 0);
      const fails = ks.filter((k) => k.st === 'revise').length;
      const report = lapMsgs.find((m) => m.meta?.report === lap.id);
      const files = ks.flatMap((k) => k.files.map((f) => ({ ...f, by: k.agent?.nick })));
      view = (
        <section className="ws-view laporan">
          <div className="ws-panel ws-lap-head">
            <Dial pkg={lap} />
            <div className="ws-lap-t">
              <span className="ws-sec">Laporan akhir</span>
              <h1>{cleanAsk(lap.request)}</h1>
              <div className="ws-meta">
                <span>
                  Dibuka <b>{when(lap.createdAt)}</b>
                </span>
                <span>
                  Dilaporkan <b>{when(lap.reportedAt)}</b>
                </span>
              </div>
            </div>
            <div className="ws-strip-r">
              <select value={lap.id} onChange={(e) => setLapId(e.target.value)} aria-label="Pilih laporan">
                {closed.map((p) => (
                  <option key={p.id} value={p.id}>
                    {when(p.createdAt)} · {cleanAsk(p.request).slice(0, 50)}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                onClick={() => {
                  setThreadId(lap.threadId);
                  saveThread(lap.threadId);
                  pick('rapat');
                }}
              >
                Lanjutkan di Rapat
              </button>
            </div>
          </div>
          <div className="ws-tiles">
            <div className="ws-panel">
              <b>
                {ks.length - fails}/{ks.length}
              </b>
              <span>Tugas selesai</span>
            </div>
            <div className="ws-panel">
              <b>{fmt(total)}</b>
              <span>Waktu kerja (paralel)</span>
            </div>
            <div className={`ws-panel${fails ? ' warn' : ''}`}>
              <b>{fails}</b>
              <span>Gagal</span>
            </div>
            <div className="ws-panel">
              <b>{new Set(ks.map((k) => k.agentId)).size}</b>
              <span>Agent terlibat</span>
            </div>
          </div>
          <div className="ws-lap-body">
            <div className="ws-panel">
              <h2 className="ws-sec">Rekap Queen Bea</h2>
              {report ? (
                <div className="ws-report">
                  <Rich text={report.content} />
                  {(report.meta.files || []).length > 0 && (
                    <div className="ws-files">
                      {report.meta.files.map((f) => (
                        <button key={f.path} onClick={() => onFile(f)}>
                          📎 {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="ws-empty">{lap.reportedAt ? 'Rekap tidak ditemukan di percakapan paket ini.' : 'Queen Bea belum mengirim rekap untuk paket ini.'}</div>
              )}
            </div>
            <div className="ws-side">
              <div className="ws-panel">
                <h2 className="ws-sec">Hasil per agent</h2>
                <ul className="ws-feed">
                  {ks.map((k) => (
                    <li key={k.id}>
                      <span className={`pill st-${k.st}`}>{ST[k.st]}</span>
                      <span>
                        <b>{k.agent?.nick}</b> · {k.task} <small>({fmt(k.min)})</small>
                      </span>
                      {(k.result || k.files.length > 0) && (
                        <button className="ws-link" onClick={() => setStep(k)}>
                          Buka
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {files.length > 0 && (
                <div className="ws-panel">
                  <h2 className="ws-sec">Lampiran tim</h2>
                  <div className="ws-files">
                    {files.map((f) => (
                      <button key={f.path || f.url} onClick={() => onFile(f)}>
                        📎 {f.name} <small>· {f.by}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }
  }

  return (
    <div className="page ws-page">
      <header className="ws-top">
        <button className="back" onClick={() => go('/')}>
          ← Koloni
        </button>
        <div className="ws-brand">
          <b>Workshop</b>
          <span>Hive Colony · Tim Queen Bea</span>
        </div>
        <nav className="ws-acts" aria-label="Babak">
          {ACTS.map(([id, label], i) => (
            <button key={id} className="ws-act" aria-current={act === id ? 'step' : undefined} onClick={() => pick(id)}>
              <em>{i + 1}</em>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {error && pkgs && <div className="ws-conn">{error}</div>}
      <main>{view}</main>
      {toast && (
        <div className="ws-toast" role="status">
          {toast}
        </div>
      )}
      {step && <ResultModal step={step} onClose={() => setStep(null)} onFile={onFile} />}
      {file && <FileViewer file={file} onClose={() => setFile(null)} />}
    </div>
  );
}

