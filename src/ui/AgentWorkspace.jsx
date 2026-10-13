// Ruang Kerja Agent (#/agent/<id>): chat langsung dengan agent AI, riwayat percakapan, lampiran file,
// suara (dikte & dibacakan), simpan hasil, jadikan tugas, tugas agent beserta hasil lengkapnya, dan peran agent.
// Akses diatur owner (#/akses).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { useAuth } from '../sim/auth';
import { supabase } from '../lib/supabase';
import { useAi } from '../hall/queenBea';
import { speak, stopSpeaking } from '../hall/ai';
import {
  useAgentNet,
  useAgentAccess,
  levelFor,
  sendToAgent,
  loadThreads,
  loadMessages,
  deleteThread,
  createAgentTask,
  createHumanTask,
  uploadFiles,
  openFile,
  fileProblem,
  FILE_ACCEPT,
  MAX_FILES,
  loadResults,
  saveResult,
  deleteResult,
  watchThread,
  loadMyFeedback,
} from '../hall/agentApi';
import { RateButtons, ScoreBadge, SkillPanel, RoutinePanel } from './AgentTraining';
import { go } from './nav';

const DEPT_ORDER = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const LEVEL_LABEL = { owner: 'Owner · akses penuh', train: 'Pelatih', use: 'Pakai' };
const COL_LABEL = { todo: 'Belum', doing: 'Jalan', done: 'Selesai' };
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const VOICE_KEY = 'hc-aw-voice';
const initials = (n) => n.slice(0, 2).toUpperCase();
const timeLabel = (iso) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const extOf = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
// teks polos untuk dibacakan / disalin
const plain = (s) =>
  s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim();
const oneLine = (s, n) => s.replace(/\s+/g, ' ').trim().slice(0, n);
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'hasil';
function loadVoicePref() {
  try {
    return localStorage.getItem(VOICE_KEY) === '1';
  } catch {
    return false;
  }
}

// teks jawaban agent: baris, poin, dan **tebal** sederhana (tanpa HTML mentah)
function Rich({ text }) {
  const inline = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }));
      list.items.push(m[1]);
      return;
    }
    list = null;
    if (!line.trim()) return;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push({ type: h ? 'h' : 'p', text: h ? h[1] : line, key: i });
  });
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((it, k) => (
          <li key={k}>{inline(it)}</li>
        ))}
      </ul>
    ) : b.type === 'h' ? (
      <p key={i} className="aw-h">
        {inline(b.text)}
      </p>
    ) : (
      <p key={i}>{inline(b.text)}</p>
    ),
  );
}

function usePresence() {
  const agentStates = useHive((s) => s.agentStates);
  const prompts = useHive((s) => s.agentPrompts);
  const ai = useAi((s) => s.status);
  const online = useAgentNet((s) => s.online);
  return (id) => {
    if (id === 'ceo') return ai === 'on' ? 'online' : 'offline';
    if (!prompts.includes(id) || online === false) return 'offline';
    return agentStates[id]?.missionId ? 'work' : 'online';
  };
}
const PRES_LABEL = { online: 'Online', work: 'Kerja', offline: 'Offline' };

function AgentList({ current, access, presence, onPick }) {
  return (
    <div className="aw-agents">
      {DEPT_ORDER.map((d) => (
        <div key={d}>
          <p className="aw-dept">
            <i style={{ background: DEPTS[d].color }} />
            {DEPTS[d].short}
          </p>
          {AGENTS.filter((a) => a.dept === d).map((a) => {
            const lv = levelFor(access, a.id);
            const p = presence(a.id);
            return (
              <button key={a.id} className={`aw-agent${current === a.id ? ' on' : ''}${lv ? '' : ' locked'}`} onClick={() => onPick(a.id)} title={lv ? a.role : 'Belum punya akses'}>
                <span className={`dot pdot-${p}`} />
                <b>{a.nick}</b>
                {!lv && <span aria-label="Terkunci">🔒</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FileChips({ files, onRemove, onOpen }) {
  if (!files?.length) return null;
  return (
    <div className="aw-files">
      {files.map((f, i) => (
        <span key={f.path || `${f.name}-${i}`} className={`aw-file${onOpen ? ' link' : ''}`} onClick={onOpen ? () => onOpen(f) : undefined} title={f.name}>
          <i>{extOf(f.name)}</i>
          <span>{f.name}</span>
          <small>{fmtSize(f.size)}</small>
          {onRemove && (
            <button onClick={() => onRemove(i)} aria-label={`Hapus ${f.name}`}>
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

// Jadikan tugas: dikerjakan agent otomatis (lewat n8n) atau tugas untuk diri sendiri
function TaskForm({ agent, nick, message, ask, onDone, onCancel }) {
  const canAgent = agent !== 'ceo';
  const [title, setTitle] = useState(oneLine(ask || message.content, 100));
  const [forAgent, setForAgent] = useState(canAgent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr('');
    try {
      if (forAgent) {
        const detail = `${ask ? `Permintaan awal: ${ask}\n\n` : ''}Jawaban/rencana sebelumnya dari ${nick}:\n${message.content}`;
        await createAgentTask({ agent, title: t, detail: detail.slice(0, 6000) });
      } else {
        await createHumanTask(t);
      }
      onDone(forAgent ? `Tugas "${t}" masuk papan rencana dan sedang dikerjakan ${nick}. Hasilnya muncul di panel Tugas.` : `Tugas "${t}" masuk papan rencana atas namamu.`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="aw-taskform">
      <label>
        Judul tugas
        <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
      </label>
      <div className="aw-seg">
        {canAgent && (
          <button className={forAgent ? 'on' : ''} onClick={() => setForAgent(true)}>
            🐝 {nick} kerjakan otomatis
          </button>
        )}
        <button className={!forAgent ? 'on' : ''} onClick={() => setForAgent(false)}>
          🙋 Untuk saya
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="aw-formbtn">
        <button onClick={onCancel}>Batal</button>
        <button className="save" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Membuat…' : 'Buat tugas'}
        </button>
      </div>
    </div>
  );
}

export function AgentWorkspace({ agentId }) {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  const access = useAgentAccess();
  const presence = usePresence();
  const netDown = useAgentNet((s) => s.online === false);
  const ai = useAi();
  const planTasks = useHive((s) => s.planTasks);
  const agent = AGENT_BY_ID[agentId] ? agentId : 'ceo';
  const def = AGENT_BY_ID[agent];
  const level = levelFor(access, agent);
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prompt, setPrompt] = useState('');
  const [names, setNames] = useState({});
  const [openItem, setOpenItem] = useState(null);
  const [results, setResults] = useState([]);
  const [taskFor, setTaskFor] = useState(null);
  const [speaking, setSpeaking] = useState(null);
  const [voiceOn, setVoiceOn] = useState(loadVoicePref);
  const [listening, setListening] = useState(false);
  const [myFb, setMyFb] = useState({});
  const [tab, setTab] = useState('info');
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  // ganti agent: muat percakapan, hasil tersimpan & peran
  useEffect(() => {
    if (!account) return;
    setThreadId(null);
    setMsgs([]);
    setError('');
    setTaskFor(null);
    setFiles([]);
    loadThreads(agent).then(setThreads);
    loadResults(agent).then(setResults);
    if (agent !== 'ceo')
      supabase
        .from('hc_agent_prompts')
        .select('system_prompt')
        .eq('agent_id', agent)
        .maybeSingle()
        .then(({ data }) => setPrompt(data?.system_prompt || ''));
    else setPrompt('');
  }, [agent, account]);

  // owner melihat percakapan staff lain: tampilkan nama pemiliknya
  const trainsAny = access.owner || Object.values(access.levels).includes('train');
  useEffect(() => {
    if (!trainsAny) return;
    supabase
      .from('hc_profiles')
      .select('id, name')
      .then(({ data }) => setNames(Object.fromEntries((data || []).map((p) => [p.id, p.name]))));
  }, [trainsAny]);

  // muat pesan + dengarkan pesan baru (mis. jawaban agent setelah approval disetujui owner)
  useEffect(() => {
    if (!threadId) return;
    loadMessages(threadId).then(setMsgs);
    let timer;
    const off = watchThread(threadId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!busyRef.current) loadMessages(threadId).then(setMsgs);
      }, 400);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [threadId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, busy]);

  // penilaian saya untuk pesan di percakapan ini
  useEffect(() => {
    if (!threadId || !msgs.length) return;
    loadMyFeedback(msgs.map((m) => m.id)).then(setMyFb);
  }, [threadId, msgs.length]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // berhenti bicara/mendengar saat keluar halaman
  useEffect(
    () => () => {
      recRef.current?.abort?.();
      stopSpeaking();
    },
    [],
  );

  const tasks = useMemo(() => planTasks.filter((t) => t.kind === 'ai' && t.who === agent).slice(-12).reverse(), [planTasks, agent]);
  const pres = presence(agent);
  const thread = threads.find((t) => t.id === threadId);
  const readOnly = thread && thread.user_id !== uid; // owner membaca percakapan staff lain
  const canTask = account && account.role !== 'viewer';
  const canTrain = level === 'owner' || level === 'train';

  const addFiles = (list) => {
    const arr = [...list];
    const bad = arr.map(fileProblem).filter(Boolean);
    setError(bad.join(' '));
    const ok = arr.filter((f) => !fileProblem(f));
    setFiles((old) => {
      const next = [...old, ...ok];
      if (next.length > MAX_FILES) setError(`Maksimal ${MAX_FILES} file per pesan.`);
      return next.slice(0, MAX_FILES);
    });
  };

  const toggleSpeak = (m) => {
    if (speaking === m.id) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    setSpeaking(m.id);
    if (!speak(plain(m.content), () => setSpeaking((s) => (s === m.id ? null : s)))) {
      setSpeaking(null);
      setError('Browser ini belum mendukung suara.');
    }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) stopSpeaking();
    try {
      localStorage.setItem(VOICE_KEY, next ? '1' : '0');
    } catch {
      /* penyimpanan browser tidak tersedia */
    }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!SpeechRec) {
      setError('Dikte suara belum didukung browser ini. Pakai Chrome atau Edge.');
      return;
    }
    stopSpeaking();
    const rec = new SpeechRec();
    rec.lang = 'id-ID';
    rec.interimResults = true;
    rec.continuous = false;
    const base = text ? `${text.trimEnd()} ` : '';
    rec.onresult = (e) => {
      let s = '';
      for (const r of e.results) s += r[0].transcript;
      setText(base + s);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const send = async () => {
    const m = text.trim();
    if ((!m && !files.length) || busy) return;
    recRef.current?.stop();
    const pending = files;
    setText('');
    setFiles([]);
    setError('');
    setBusy(true);
    setMsgs((x) => [
      ...x,
      { id: `tmp-${Date.now()}`, role: 'user', content: m || 'Tolong pelajari lampiran ini.', meta: { files: pending.map((f) => ({ name: f.name, size: f.size })) }, created_at: new Date().toISOString() },
    ]);
    try {
      const refs = pending.length ? await uploadFiles(pending) : [];
      const r = await sendToAgent({ agent, message: m, threadId, files: refs });
      if (voiceOn && r.status === 'ok' && r.reply) {
        setSpeaking('last');
        speak(plain(r.reply), () => setSpeaking((s) => (s === 'last' ? null : s)));
      }
      if (!threadId) {
        setThreadId(r.thread_id);
        loadThreads(agent).then(setThreads);
      } else {
        setMsgs(await loadMessages(r.thread_id));
      }
    } catch (e) {
      setError(e.message);
      if (!m) setFiles(pending);
      else setText(m);
      setMsgs((x) => x.filter((y) => !String(y.id).startsWith('tmp-')));
    } finally {
      setBusy(false);
    }
  };

  const askBefore = (m) => {
    const i = msgs.indexOf(m);
    for (let k = i - 1; k >= 0; k--) if (msgs[k].role === 'user') return msgs[k].content;
    return '';
  };

  const keep = async (m) => {
    try {
      await saveResult({ agent, messageId: m.id, title: oneLine(askBefore(m) || m.content, 100), content: m.content });
      setNotice('Disimpan ke Hasil tersimpan (panel kanan).');
      loadResults(agent).then(setResults);
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async (s) => {
    try {
      await navigator.clipboard.writeText(plain(s));
      setNotice('Teks disalin.');
    } catch {
      setError('Gagal menyalin teks.');
    }
  };

  if (!account) {
    return (
      <div className="page aw-page">
        <div className="aw-empty-card">
          <h1>Ruang Kerja Agent</h1>
          <p>Login sebagai staff untuk bekerja dengan agent AI Hive Colony.</p>
          <button className="save" onClick={() => go('/login')}>
            Masuk
          </button>
        </div>
      </div>
    );
  }

  const model = agent === 'ceo' ? (ai.status === 'on' ? 'Claude Haiku 5.5' : 'belum tersambung') : 'Claude · n8n';
  const canWrite = level && !readOnly;
  const avatar = (sm) => (
    <div className={`aw-av${sm ? ' sm' : ''}`} style={{ '--c': DEPTS[def.dept].color }}>
      {agent === 'ceo' ? '👑' : initials(def.nick)}
    </div>
  );

  return (
    <div className="page aw-page">
      <header className="aw-top">
        <button className="back" onClick={() => go('/')}>
          ← <span className="lbl">Koloni</span>
        </button>
        <h1>Ruang Kerja Agent</h1>
        {access.owner && (
          <button className="hbtn" onClick={() => go('/akses')}>
            🔑<span className="lbl"> Akses agent</span>
          </button>
        )}
      </header>

      <div className="aw-grid">
        <aside className="aw-left">
          <select className="aw-select" value={agent} onChange={(e) => go(`/agent/${e.target.value}`)} aria-label="Pilih agent">
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nick} · {DEPTS[a.dept].short}
              </option>
            ))}
          </select>
          <AgentList current={agent} access={access} presence={presence} onPick={(id) => go(`/agent/${id}`)} />
          {level && (
            <>
              <p className="aw-label">Percakapan</p>
              <button className={`aw-thread new${threadId ? '' : ' on'}`} onClick={() => setThreadId(null) || setMsgs([])}>
                ＋ Percakapan baru
              </button>
              {threads.map((t) => (
                <div key={t.id} className={`aw-thread${t.id === threadId ? ' on' : ''}`}>
                  <button onClick={() => setThreadId(t.id)}>
                    <span>{t.title}</span>
                    <small>
                      {timeLabel(t.updated_at)}
                      {t.user_id !== uid && names[t.user_id] ? ` · ${names[t.user_id]}` : ''}
                    </small>
                  </button>
                  {t.user_id === uid && (
                    <button
                      className="aw-del"
                      aria-label="Hapus percakapan"
                      onClick={async () => {
                        if (!window.confirm('Hapus percakapan ini?')) return;
                        await deleteThread(t.id);
                        if (t.id === threadId) {
                          setThreadId(null);
                          setMsgs([]);
                        }
                        loadThreads(agent).then(setThreads);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </aside>

        <section
          className={`aw-main${drag ? ' drag' : ''}`}
          onDragOver={(e) => {
            if (!canWrite) return;
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            if (!canWrite) return;
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="aw-head">
            {avatar(false)}
            <div className="aw-who">
              <b>{def.nick}</b>
              <span>
                {def.role} · {DEPTS[def.dept].name}
              </span>
            </div>
            <span className={`pres pres-${pres}`}>{PRES_LABEL[pres]}</span>
            <span className="aw-model">{model}</span>
            {level && <ScoreBadge agent={agent} />}
            {level && (
              <button className={`aw-voice${voiceOn ? ' on' : ''}`} onClick={toggleVoice} title="Bacakan jawaban otomatis" aria-pressed={voiceOn}>
                {voiceOn ? '🔊' : '🔈'}
                <span className="lbl"> Suara</span>
              </button>
            )}
          </div>

          {!level ? (
            <div className="aw-locked">
              <p>🔒 Kamu belum punya akses ke {def.nick}.</p>
              <p className="muted">Owner bisa memberi akses di halaman Akses agent.</p>
            </div>
          ) : (
            <>
              <div className="aw-msgs" ref={listRef}>
                {msgs.length === 0 && !busy && (
                  <div className="aw-hello">
                    <p>
                      Mulai percakapan dengan <b>{def.nick}</b>. Beri perintah atau pertanyaan seputar {DEPTS[def.dept].name}.
                    </p>
                    <p className="muted">📎 Lampirkan gambar, PDF, atau file teks/CSV supaya {def.nick} bisa membacanya. 🎤 Atau dikte dengan suara.</p>
                    {agent === 'ceo' && <p className="muted">Queen Bea bisa mendelegasikan tugas ke agent lain; hasilnya muncul di panel kanan agent tersebut.</p>}
                  </div>
                )}
                {msgs.map((m) =>
                  m.role === 'system' ? (
                    <div key={m.id} className="aw-sys">
                      {m.content}
                    </div>
                  ) : (
                    <div key={m.id} className={`aw-msg ${m.role}`}>
                      {m.role === 'agent' && avatar(true)}
                      <div className="aw-bub">
                        {m.role === 'agent' ? <Rich text={m.content} /> : <p>{m.content}</p>}
                        <FileChips files={m.meta?.files} onOpen={(f) => f.path && openFile(f.path)} />
                        {m.meta?.delegated?.length > 0 && (
                          <div className="aw-deleg">
                            {m.meta.delegated.map((d, i) => (
                              <button key={i} onClick={() => go(`/agent/${d.agent}`)}>
                                → {d.nick}: {d.title}
                              </button>
                            ))}
                          </div>
                        )}
                        {m.meta?.sources?.length > 0 && (
                          <div className="aw-src">
                            🔎{' '}
                            {m.meta.sources.map((s) => (
                              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                                {s.title}
                              </a>
                            ))}
                          </div>
                        )}
                        <small>{timeLabel(m.created_at)}</small>
                        {m.role === 'agent' && !String(m.id).startsWith('tmp-') && (
                          <div className="aw-acts">
                            <button onClick={() => copy(m.content)}>📋 Salin</button>
                            <button onClick={() => toggleSpeak(m)}>{speaking === m.id ? '⏹ Stop' : '🔊 Dengar'}</button>
                            {canWrite && typeof m.id === 'number' && (
                              <RateButtons agent={agent} message={m} mine={myFb[m.id]} onRated={(v) => setMyFb((x) => ({ ...x, [m.id]: v }))} />
                            )}
                            {canWrite && <button onClick={() => keep(m)}>📌 Simpan</button>}
                            {canWrite && canTask && <button onClick={() => setTaskFor(taskFor === m.id ? null : m.id)}>✅ Jadikan tugas</button>}
                          </div>
                        )}
                        {taskFor === m.id && (
                          <TaskForm
                            agent={agent}
                            nick={def.nick}
                            message={m}
                            ask={askBefore(m)}
                            onCancel={() => setTaskFor(null)}
                            onDone={(note) => {
                              setTaskFor(null);
                              setNotice(note);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ),
                )}
                {busy && (
                  <div className="aw-msg agent">
                    {avatar(true)}
                    <div className="aw-bub typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
              </div>
              {error && <div className="error aw-err">{error}</div>}
              {notice && <div className="aw-notice">{notice}</div>}
              {readOnly ? (
                <p className="aw-readonly">Ini percakapan milik {names[thread.user_id] || 'staff lain'} (hanya bisa dibaca).</p>
              ) : (
                <div className="aw-inputwrap">
                  <FileChips files={files} onRemove={(i) => setFiles((x) => x.filter((_, k) => k !== i))} />
                  <div className={`aw-input${listening ? ' rec' : ''}`}>
                    <button className="aw-tool" onClick={() => fileRef.current?.click()} disabled={busy || files.length >= MAX_FILES} aria-label="Lampirkan file" title="Lampirkan file (maks. 3, 10 MB)">
                      📎
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept={FILE_ACCEPT}
                      hidden
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <textarea
                      rows={1}
                      value={text}
                      maxLength={4000}
                      placeholder={
                        listening
                          ? 'Mendengarkan… bicara sekarang'
                          : pres === 'offline' && agent !== 'ceo'
                            ? `${def.nick} sedang offline${netDown ? ' (server agent mati)' : ''}…`
                            : `Beri perintah ke ${def.nick}…`
                      }
                      onChange={(e) => setText(e.target.value)}
                      onPaste={(e) => {
                        if (e.clipboardData.files.length) {
                          e.preventDefault();
                          addFiles(e.clipboardData.files);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    <button className={`aw-tool${listening ? ' on' : ''}`} onClick={toggleMic} disabled={busy} aria-label={listening ? 'Berhenti dikte' : 'Dikte dengan suara'} title="Dikte dengan suara">
                      {listening ? '⏺' : '🎤'}
                    </button>
                    <button className="aw-send" onClick={send} disabled={busy || (!text.trim() && !files.length)} aria-label="Kirim">
                      ➤
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {drag && <div className="aw-drop">Lepaskan file untuk dilampirkan</div>}
        </section>

        <aside className="aw-right">
          {level && (
            <div className="aw-tabs" role="tablist">
              {[
                ['info', 'Info'],
                ['skill', 'Skill'],
                ['rutin', 'Rutin'],
              ].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {level && tab === 'skill' && <SkillPanel agent={agent} nick={def.nick} canTrain={canTrain} names={names} />}
          {level && tab === 'rutin' && <RoutinePanel agent={agent} nick={def.nick} canTrain={canTrain} />}
          {(!level || tab === 'info') && (
          <>
          <p className="aw-label">Akses kamu</p>
          <p className="aw-chip">{level ? LEVEL_LABEL[level] : 'Belum ada akses'}</p>

          {agent !== 'ceo' && (
            <>
              <p className="aw-label">Tugas {def.nick}</p>
              {tasks.length === 0 && <p className="muted small">Belum ada tugas. Klik ✅ Jadikan tugas di jawaban {def.nick}, atau minta Queen Bea mendelegasikan.</p>}
              {tasks.map((t) => (
                <div key={t.id} className="aw-task">
                  <button onClick={() => setOpenItem(openItem === t.id ? null : t.id)}>
                    <span className={`aw-col ${t.col}`}>{COL_LABEL[t.col] || t.col}</span>
                    <b>{t.title.replace(`${def.nick}: `, '')}</b>
                  </button>
                  {openItem === t.id && (
                    <div className="aw-result">
                      {t.result ? <Rich text={t.result} /> : <p className="muted">{t.col === 'done' ? 'Hasil lengkap belum tersimpan (tugas lama).' : 'Sedang dikerjakan…'}</p>}
                      {t.result && (
                        <div className="aw-acts">
                          <button onClick={() => copy(t.result)}>📋 Salin</button>
                          <button onClick={() => download(`${slug(t.title)}.md`, `# ${t.title}\n\n${t.result}\n`)}>⬇ Unduh</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {level && (
            <>
              <p className="aw-label">Hasil tersimpan</p>
              {results.length === 0 && <p className="muted small">Klik 📌 Simpan di jawaban {def.nick} untuk menyimpan hasil penting di sini.</p>}
              {results.map((r) => {
                const key = `r-${r.id}`;
                return (
                  <div key={r.id} className="aw-task">
                    <button onClick={() => setOpenItem(openItem === key ? null : key)}>
                      <b>{r.title}</b>
                      <small className="muted">
                        {timeLabel(r.created_at)}
                        {r.user_id !== uid && names[r.user_id] ? ` · ${names[r.user_id]}` : ''}
                      </small>
                    </button>
                    {openItem === key && (
                      <div className="aw-result">
                        <Rich text={r.content} />
                        <div className="aw-acts">
                          <button onClick={() => copy(r.content)}>📋 Salin</button>
                          <button onClick={() => download(`${slug(r.title)}.md`, `# ${r.title}\n\n${r.content}\n`)}>⬇ Unduh</button>
                          {(r.user_id === uid || access.owner) && (
                            <button
                              onClick={async () => {
                                if (!window.confirm('Hapus hasil ini?')) return;
                                await deleteResult(r.id);
                                loadResults(agent).then(setResults);
                              }}
                            >
                              🗑 Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <p className="aw-label">Peran</p>
          <p className="aw-role">{agent === 'ceo' ? 'Chief Executive: memimpin 20 agent, menjawab dengan data koloni, riset web, dan mendelegasikan tugas.' : prompt.split(`Kamu adalah ${def.nick}. `)[1] || def.role}</p>
          {(level === 'owner' || level === 'train') && agent !== 'ceo' && prompt && (
            <details className="aw-prompt">
              <summary>Prompt lengkap yang dipakai agent</summary>
              <p>{prompt}</p>
            </details>
          )}
          </>
          )}
        </aside>
      </div>
    </div>
  );
}
