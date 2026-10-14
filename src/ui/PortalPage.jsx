// Portal saya (#/saya): tampilan pribadi tiap staff. Kanban (tugas tim untuk saya + to-do pribadi),
// tugas yang saya berikan ke agent, percakapan & hasil saya, dan rapat yang saya ikuti beserta
// tindak lanjut yang PIC-nya saya.
import { useEffect, useMemo, useState } from 'react';
import { AGENT_BY_ID, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { useAuth } from '../sim/auth';
import { go } from './nav';
import { Rich } from './AgentWorkspace';
import { loadTodos, addTodo, moveTodo, deleteTodo, moveTeamTask, loadMyThreads, loadMyResults, loadMyMeetings, myActionItems } from '../hall/portalApi';

const COLS = [
  ['todo', 'Belum'],
  ['doing', 'Jalan'],
  ['done', 'Selesai'],
];
const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
const PREV = { todo: 'done', doing: 'todo', done: 'doing' };
const wibNow = () => new Date(Date.now() + 7 * 3600e3);
const greet = () => {
  const h = wibNow().getUTCHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
};
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dateLong = () => {
  const d = wibNow();
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const nickOf = (id) => AGENT_BY_ID[id]?.nick || id;
const colorOf = (id) => DEPTS[AGENT_BY_ID[id]?.dept]?.color || '#F5B700';

function Section({ title, count, action, children }) {
  return (
    <section className="pt-panel">
      <div className="pt-head">
        <h2>
          {title}
          {count > 0 && <em>{count}</em>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PortalPage() {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  const planTasks = useHive((s) => s.planTasks);
  const [todos, setTodos] = useState([]);
  const [override, setOverride] = useState({}); // perpindahan tugas tim yang belum disinkronkan realtime
  const [newTodo, setNewTodo] = useState('');
  const [threads, setThreads] = useState([]);
  const [results, setResults] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [openTask, setOpenTask] = useState(null);
  const [added, setAdded] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!account) return;
    loadTodos().then(setTodos);
    loadMyThreads().then(setThreads);
    loadMyResults().then(setResults);
    loadMyMeetings(account.name).then(setMeetings);
  }, [account]);

  // tugas papan tim yang ditugaskan ke saya (akun, atau nama untuk tugas lama)
  const teamTasks = useMemo(
    () => planTasks.filter((t) => t.kind === 'human' && (t.assignee === uid || (!t.assignee && t.who === account?.name))).map((t) => ({ ...t, col: override[t.id] || t.col })),
    [planTasks, uid, account, override],
  );
  const agentTasks = useMemo(
    () =>
      planTasks
        .filter((t) => t.kind === 'ai' && t.createdBy === uid)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 8),
    [planTasks, uid],
  );
  const actions = useMemo(() => myActionItems(meetings, account?.name), [meetings, account]);

  if (!account) return null;

  const cards = [...teamTasks.map((t) => ({ kind: 'team', id: t.id, title: t.title, col: t.col })), ...todos.map((t) => ({ kind: 'todo', id: t.id, title: t.title, col: t.col, source: t.source }))];
  const activeCount = cards.filter((c) => c.col !== 'done').length;
  const runningAgent = agentTasks.filter((t) => t.col !== 'done').length;
  const weekAgo = Date.now() - 7 * 86400e3;
  const meetingsWeek = meetings.filter((m) => new Date(m.started_at).getTime() > weekAgo).length;

  const move = async (card, col) => {
    if (card.col === col) return;
    setError('');
    try {
      if (card.kind === 'todo') {
        setTodos((x) => x.map((t) => (t.id === card.id ? { ...t, col } : t)));
        await moveTodo(card.id, col);
      } else {
        setOverride((o) => ({ ...o, [card.id]: col }));
        await moveTeamTask(card.id, col);
      }
    } catch (e) {
      setError(e.message);
      if (card.kind === 'todo') loadTodos().then(setTodos);
      else setOverride((o) => ({ ...o, [card.id]: undefined }));
    }
  };

  const submitTodo = async (e) => {
    e.preventDefault();
    const t = newTodo.trim();
    if (!t) return;
    setNewTodo('');
    try {
      const row = await addTodo(t);
      setTodos((x) => [...x, row]);
    } catch (err) {
      setError(err.message);
    }
  };

  const toKanban = async (a) => {
    const key = `${a.meetingId}:${a.task}`;
    try {
      const row = await addTodo(a.task, { meeting_id: a.meetingId, due: a.due || null });
      setTodos((x) => [...x, row]);
      setAdded((m) => ({ ...m, [key]: true }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page aw-page pt-page">
      <header className="aw-top">
        <button className="back" onClick={() => go('/')}>
          ← <span className="lbl">Koloni</span>
        </button>
        <h1>Portal saya</h1>
        <button className="hbtn" onClick={() => go('/agent')}>
          💬<span className="lbl"> Ruang kerja</span>
        </button>
        <button className="hbtn" onClick={() => go('/hall')}>
          🏛<span className="lbl"> Hive Hall</span>
        </button>
      </header>

      <div className="pt-hello">
        <div>
          <h2>
            {greet()}, {account.name.split(' ')[0]} 👋
          </h2>
          <p>
            {dateLong()} · {DEPTS[account.primary_dept]?.name || ''}
          </p>
        </div>
        <div className="pt-stats">
          <span>
            <b>{activeCount}</b> tugas aktif
          </span>
          <span>
            <b>{runningAgent}</b> dikerjakan agent
          </span>
          <span>
            <b>{meetingsWeek}</b> rapat minggu ini
          </span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="pt-grid">
        <Section title="Kanban saya" count={activeCount}>
          <div className="pt-board">
            {COLS.map(([col, label]) => {
              const list = cards.filter((c) => c.col === col);
              return (
                <div
                  key={col}
                  className={`pt-col ${col}${dragOver === col ? ' over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(col);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const [kind, id] = e.dataTransfer.getData('text/plain').split('|');
                    const card = cards.find((c) => c.kind === kind && String(c.id) === id);
                    if (card) move(card, col);
                  }}
                >
                  <p className="pt-col-title">
                    {label} <em>{list.length}</em>
                  </p>
                  {col === 'todo' && (
                    <form className="pt-add" onSubmit={submitTodo}>
                      <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} maxLength={200} placeholder="＋ To-do pribadi…" aria-label="Tambah to-do pribadi" />
                    </form>
                  )}
                  {list.length === 0 && <p className="pt-empty">{col === 'done' ? 'Belum ada yang selesai.' : 'Kosong.'}</p>}
                  {list.map((c) => (
                    <div key={`${c.kind}-${c.id}`} className={`pt-card ${c.kind}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', `${c.kind}|${c.id}`)}>
                      <p>{c.title}</p>
                      <div className="pt-card-foot">
                        <span className={`pt-tag ${c.kind}`}>{c.kind === 'team' ? 'Tim' : c.source?.meeting_id ? 'Dari rapat' : 'Pribadi'}</span>
                        <span className="pt-moves">
                          <button onClick={() => move(c, PREV[c.col])} aria-label="Pindah ke kolom sebelumnya" title="Kolom sebelumnya">
                            ←
                          </button>
                          <button onClick={() => move(c, NEXT[c.col])} aria-label="Pindah ke kolom berikutnya" title="Kolom berikutnya">
                            →
                          </button>
                          {c.kind === 'todo' && (
                            <button
                              onClick={async () => {
                                setTodos((x) => x.filter((t) => t.id !== c.id));
                                await deleteTodo(c.id);
                              }}
                              aria-label="Hapus to-do"
                              title="Hapus"
                            >
                              🗑
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="muted small pt-note">Tugas <b>Tim</b> berasal dari papan rencana Hive Hall dan terlihat oleh tim. To-do <b>Pribadi</b> hanya terlihat olehmu. Geser kartu atau pakai tombol ← →.</p>
        </Section>

        <div className="pt-side">
          <Section title="Tugas saya ke agent" count={runningAgent} action={<button className="aw-link" onClick={() => go('/agent')}>Ruang kerja →</button>}>
            {agentTasks.length === 0 && <p className="muted small">Belum ada. Klik ✅ Jadikan tugas di jawaban agent, atau minta Queen Bea mendelegasikan.</p>}
            {agentTasks.map((t) => (
              <div key={t.id} className="pt-item">
                <button className="pt-item-btn" onClick={() => setOpenTask(openTask === t.id ? null : t.id)}>
                  <i className="pt-dot" style={{ background: colorOf(t.who) }} />
                  <span>
                    <b>{t.title.replace(`${nickOf(t.who)}: `, '')}</b>
                    <small>
                      {nickOf(t.who)} · {when(t.createdAt)}
                    </small>
                  </span>
                  <em className={`aw-col ${t.col}`}>{t.col === 'done' ? 'Selesai' : t.col === 'doing' ? 'Jalan' : 'Antre'}</em>
                </button>
                {openTask === t.id && (
                  <div className="aw-result">
                    {t.result ? <Rich text={t.result} /> : <p className="muted">{t.col === 'done' ? 'Hasil belum tersimpan.' : 'Sedang dikerjakan…'}</p>}
                    <div className="aw-acts">
                      <button onClick={() => go(`/agent/${t.who}`)}>Buka ruang kerja {nickOf(t.who)}</button>
                      {t.result && <button onClick={() => navigator.clipboard?.writeText(t.result)}>📋 Salin</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </Section>

          <Section title="Percakapan & hasil saya">
            {threads.length === 0 && <p className="muted small">Belum ada percakapan. Mulai dari Ruang kerja.</p>}
            {threads.map((t) => (
              <button key={t.id} className="pt-item-btn" onClick={() => go(`/agent/${t.agent_id}?thread=${t.id}`)}>
                <i className="pt-dot" style={{ background: colorOf(t.agent_id) }} />
                <span>
                  <b>
                    {t.pinned && '📌 '}
                    {t.task_id && '🗂 '}
                    {t.title}
                  </b>
                  <small>
                    {nickOf(t.agent_id)} · {when(t.updated_at)}
                  </small>
                </span>
              </button>
            ))}
            {results.length > 0 && <p className="aw-label">Hasil tersimpan</p>}
            {results.map((r) => (
              <button key={r.id} className="pt-item-btn" onClick={() => go(`/agent/${r.agent_id}`)}>
                <span className="pt-pin">📌</span>
                <span>
                  <b>{r.title}</b>
                  <small>
                    {nickOf(r.agent_id)} · {when(r.created_at)}
                  </small>
                </span>
              </button>
            ))}
          </Section>

          <Section title="Rapat & notulen saya" action={<button className="aw-link" onClick={() => go('/hall')}>Arsip rapat →</button>}>
            {actions.length > 0 && (
              <div className="pt-actions">
                <p className="aw-label">Tindak lanjut untukmu</p>
                {actions.map((a, i) => {
                  const key = `${a.meetingId}:${a.task}`;
                  return (
                    <div key={i} className="pt-action">
                      <span>
                        <b>{a.task}</b>
                        <small>
                          {a.meetingTitle}
                          {a.due ? ` · tenggat ${a.due}` : ''}
                        </small>
                      </span>
                      <button className="aw-convo-btn" disabled={added[key]} onClick={() => toKanban(a)}>
                        {added[key] ? '✓ Masuk kanban' : '+ Kanban'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {meetings.length === 0 && <p className="muted small">Belum ada rapat yang kamu ikuti.</p>}
            {meetings.map((m) => (
              <div key={m.id} className="pt-meet">
                <b>{m.title}</b>
                <small>
                  {when(m.started_at)}
                  {Array.isArray(m.participants) && m.participants.length ? ` · ${m.participants.length} peserta` : ''}
                </small>
                {m.mom?.summary && <p>{m.mom.summary.slice(0, 180)}{m.mom.summary.length > 180 ? '…' : ''}</p>}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
