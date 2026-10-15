// Ruang Kerja Agent (#/agent/<id>): chat langsung dengan agent AI, riwayat percakapan, lampiran file,
// suara (dikte & dibacakan), simpan hasil, jadikan tugas, tugas agent beserta hasil lengkapnya, dan peran agent.
// Akses diatur owner (#/akses).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { useHive } from '../sim/store';
import { useAuth } from '../sim/auth';
import { supabase } from '../lib/supabase';
import { useAi, modelLabel } from '../hall/queenBea';
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
  fileProblem,
  FILE_ACCEPT,
  MAX_FILES,
  loadResults,
  saveResult,
  deleteResult,
  watchThread,
  loadMyFeedback,
  updateThread,
  searchConversations,
  loadUsage,
  GROK_AGENTS,
} from '../hall/agentApi';
import { RateButtons, ScoreBadge, SkillPanel, RoutinePanel } from './AgentTraining';
import { useConversation } from './useConversation';
import { FileViewer, ImageThumbs } from './FileViewer';
import { go } from './nav';
import { imageUrlsIn, stripMachineBlocks } from '../../supabase/functions/_shared/taskProtocol.js';

const DEPT_ORDER = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const LEVEL_LABEL = { owner: 'Owner · akses penuh', train: 'Pelatih', use: 'Pakai' };
const COL_LABEL = { todo: 'Belum', doing: 'Jalan', done: 'Selesai', failed: 'Gagal' };
const BUSY_MS = 30 * 60 * 1000;
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const VOICE_KEY = 'hc-aw-voice';
const ENGINE_KEY = 'hc-aw-engine';
// percakapan terakhir per agent, supaya setelah refresh langsung terbuka lagi
const LAST_KEY = 'hc-aw-last-thread:';
function lastThread(agent) {
  try {
    return localStorage.getItem(LAST_KEY + agent);
  } catch {
    return null;
  }
}
function rememberThread(agent, id) {
  try {
    if (id) localStorage.setItem(LAST_KEY + agent, id);
    else localStorage.removeItem(LAST_KEY + agent);
  } catch {
    /* penyimpanan browser tidak tersedia */
  }
}
const WAIT_POLL_MS = 5000;
const WAIT_MAX_MS = 3 * 60 * 1000;
function loadEngine() {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'grokbot' ? 'grokbot' : 'claude';
  } catch {
    return 'claude';
  }
}
// sudah ada balasan (agent/sistem) setelah pesan user terakhir?
const answered = (list) => {
  let lastUser = -1;
  list.forEach((m, i) => m.role === 'user' && (lastUser = i));
  return lastUser >= 0 && list.slice(lastUser + 1).some((m) => m.role === 'agent' || m.role === 'system');
};
const initials = (n) => n.slice(0, 2).toUpperCase();
const timeLabel = (iso) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const extOf = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
// blok delegasi di akhir jawaban Queen mode Grok diproses server, jangan ditampilkan
const visible = (s) => stripMachineBlocks(s);
const threadParam = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('thread');
// teks polos untuk dibacakan / disalin
const plain = (s) =>
  visible(s)
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
export function Rich({ text }) {
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
    if (GROK_AGENTS.includes(id)) return agentStates[id]?.missionId ? 'work' : 'online';
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
function ResultView({ text, files, onOpen }) {
  const urls = imageUrlsIn(text || '');
  const stored = (files || []).filter((f) => f && (f.path || f.url));
  const extra = stored.filter((f) => f.url && !urls.includes(f.url));
  return (
    <>
      {text ? <Rich text={visible(text)} /> : null}
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
          <img className="aw-result-img" src={url} alt="" />
        </a>
      ))}
      {extra.map((f) =>
        String(f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(f.url) ? (
          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
            <img className="aw-result-img" src={f.url} alt={f.name || ''} />
          </a>
        ) : (
          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
            {f.name || 'Lampiran'}
          </a>
        ),
      )}
      <ImageThumbs files={stored.filter((f) => f.path)} onOpen={onOpen} />
      <FileChips files={stored.filter((f) => f.path)} onOpen={(f) => f.path && onOpen?.(f)} />
    </>
  );
}

function TaskForm({ agent, nick, message, ask, threadId, onDone, onCancel }) {
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
        await createAgentTask({ agent, title: t, detail: detail.slice(0, 6000), threadId });
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
  const [viewer, setViewer] = useState(null); // lampiran yang sedang dibuka
  const [voiceOn, setVoiceOn] = useState(loadVoicePref);
  const [listening, setListening] = useState(false);
  const [myFb, setMyFb] = useState({});
  const [engine, setEngine] = useState(loadEngine);
  const [waiting, setWaiting] = useState(null); // { threadId, since } saat menunggu balasan Grok Bot
  // mode percakapan suara: dengar -> kirim -> jawaban dibacakan -> dengar lagi
  const convo = useConversation({
    onSend: (t) => deliver(t, []),
    onError: (m) => setError(m),
    onIdle: () => setNotice('Mode percakapan berhenti karena tidak ada suara.'),
  });
  const [tab, setTab] = useState('info');
  const [quota, setQuota] = useState(null); // { used, limit } pesan hari ini
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null); // hasil pencarian percakapan
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
    setWaiting(null);
    convo.stop();
    setError('');
    setTaskFor(null);
    setFiles([]);
    loadThreads(agent).then((list) => {
      setThreads(list);
      const last = lastThread(agent);
      if (!threadParam() && last && list.some((t) => t.id === last)) setThreadId((cur) => cur || last);
    });
    loadResults(agent).then(setResults);
    if (threadParam()) setThreadId(threadParam());
    if (agent !== 'ceo')
      supabase
        .from('hc_agent_prompts')
        .select('system_prompt')
        .eq('agent_id', agent)
        .maybeSingle()
        .then(({ data }) => setPrompt(data?.system_prompt || ''));
    else setPrompt('');
  }, [agent, account]);

  const openThread = (id) => {
    setThreadId(id);
    rememberThread(agent, id);
  };

  // pindah percakapan lewat ?thread= tanpa ganti agent
  useEffect(() => {
    const on = () => threadParam() && setThreadId(threadParam());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // kuota pesan harian (kalau owner mengaktifkan batas)
  useEffect(() => {
    if (account) loadUsage().then((q) => q && setQuota(q));
  }, [account]);

  // cari di semua percakapan (jeda 400 ms setelah berhenti mengetik)
  useEffect(() => {
    if (search.trim().length < 2) {
      setFound(null);
      return undefined;
    }
    const t = setTimeout(() => searchConversations(search).then(setFound), 400);
    return () => clearTimeout(t);
  }, [search]);

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

  // menunggu balasan Grok Bot: Realtime (efek di atas) + cadangan polling tiap 5 detik, maks. 3 menit
  useEffect(() => {
    if (!waiting) return undefined;
    const poll = setInterval(() => {
      if (!busyRef.current) loadMessages(waiting.threadId).then(setMsgs);
    }, WAIT_POLL_MS);
    const stop = setTimeout(() => {
      setWaiting(null);
      setError('Belum ada balasan, coba lagi.');
      convo.replyArrived('Belum ada balasan, coba lagi.');
    }, Math.max(0, waiting.since + WAIT_MAX_MS - Date.now()));
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting]);

  // balasan masuk: hilangkan indikator (dan bacakan kalau mode suara aktif)
  useEffect(() => {
    if (!waiting || waiting.threadId !== threadId || !answered(msgs)) return;
    setWaiting(null);
    const last = msgs[msgs.length - 1];
    if (convo.active) {
      convo.replyArrived(last?.content || '');
      return;
    }
    if (voiceOn && last?.role === 'agent') {
      setSpeaking(last.id);
      speak(plain(last.content), () => setSpeaking((s) => (s === last.id ? null : s)));
    }
  }, [msgs, waiting, threadId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, busy, waiting]);

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

  const mine = useMemo(
    () => planTasks.filter((t) => t.kind === 'ai' && (t.who === agent || String(t.who || '').toLowerCase() === def.nick.toLowerCase())),
    [planTasks, agent, def.nick],
  );
  const busyTask = mine.find((t) => t.col === 'doing' && (!t.updatedAt || Date.now() - Date.parse(t.updatedAt) < BUSY_MS));
  const tasks = useMemo(() => [...mine].reverse().slice(0, 12), [mine]);
  const locked = !!(busyTask && busyTask.createdBy !== uid);
  const pres = busyTask ? 'work' : presence(agent);
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

  // kirim satu pesan (dipakai ketik biasa & mode percakapan); hasil: { thread_id, reply, status, meta }
  const deliver = async (m, pending) => {
    setError('');
    setBusy(true);
    setMsgs((x) => [
      ...x,
      { id: `tmp-${Date.now()}`, role: 'user', content: m || 'Tolong pelajari lampiran ini.', meta: { files: pending.map((f) => ({ name: f.name, size: f.size })) }, created_at: new Date().toISOString() },
    ]);
    try {
      const refs = pending.length ? await uploadFiles(pending) : [];
      const r = await sendToAgent({ agent, message: m, threadId, files: refs, engine });
      if (r.status === 'pending') setWaiting({ threadId: r.thread_id, since: Date.now() });
      if (r.quota) setQuota(r.quota);
      if (voiceOn && !convo.active && r.status === 'ok' && r.reply) {
        setSpeaking('last');
        speak(plain(r.reply), () => setSpeaking((s) => (s === 'last' ? null : s)));
      }
      if (!threadId) {
        openThread(r.thread_id);
        loadThreads(agent).then(setThreads);
      } else {
        setMsgs(await loadMessages(r.thread_id));
      }
      return r;
    } catch (e) {
      setError(e.message);
      setMsgs((x) => x.filter((y) => !String(y.id).startsWith('tmp-')));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const m = text.trim();
    if (locked || (!m && !files.length) || busy || waiting) return;
    recRef.current?.stop();
    const pending = files;
    setText('');
    setFiles([]);
    try {
      await deliver(m, pending);
    } catch {
      if (!m) setFiles(pending);
      else setText(m);
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

  const model = GROK_AGENTS.includes(agent) ? 'Grok Bot' : agent === 'ceo' ? (ai.status === 'on' ? modelLabel(ai.model) : 'belum tersambung') : 'Claude · n8n';
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
          <button className="hbtn" onClick={() => go('/statistik')}>
            📊<span className="lbl"> Statistik</span>
          </button>
        )}
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
          <div className="aw-search">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Cari di semua percakapan" aria-label="Cari percakapan" />
          </div>
          {found && (
            <div className="aw-found">
              <p className="aw-label">
                Hasil pencarian
                <button className="aw-link" onClick={() => setSearch('')}>
                  tutup
                </button>
              </p>
              {found.length === 0 && <p className="muted small">Tidak ada yang cocok.</p>}
              {found.map((f) => (
                <button
                  key={f.threadId}
                  className="aw-hit"
                  onClick={() => {
                    setSearch('');
                    go(`/agent/${f.agent}?thread=${f.threadId}`);
                    if (f.agent === agent) openThread(f.threadId);
                  }}
                >
                  <b>
                    {AGENT_BY_ID[f.agent]?.nick || f.agent} · {f.title}
                  </b>
                  {f.snippet && <span>{f.snippet}</span>}
                  <small>
                    {timeLabel(f.at)}
                    {f.userId !== uid && names[f.userId] ? ` · ${names[f.userId]}` : ''}
                  </small>
                </button>
              ))}
            </div>
          )}
          {level && (
            <>
              <p className="aw-label">Percakapan</p>
              <button
                className={`aw-thread new${threadId ? '' : ' on'}`}
                onClick={() => {
                  openThread(null);
                  setMsgs([]);
                }}
              >
                ＋ Percakapan baru
              </button>
              <div className="aw-threads">
                {threads.map((t) => (
                  <div key={t.id} className={`aw-thread${t.id === threadId ? ' on' : ''}${t.pinned ? ' pinned' : ''}`}>
                    <button onClick={() => openThread(t.id)}>
                      <span>
                        {t.pinned && '📌 '}
                        {t.task_id && '🗂 '}
                        {t.title}
                      </span>
                      <small>
                        {timeLabel(t.updated_at)}
                        {t.user_id !== uid && names[t.user_id] ? ` · ${names[t.user_id]}` : ''}
                      </small>
                    </button>
                    {t.user_id === uid && (
                      <span className="aw-thread-acts">
                        <button
                          className="aw-del"
                          aria-label={t.pinned ? 'Lepas sematan' : 'Sematkan percakapan'}
                          title={t.pinned ? 'Lepas sematan' : 'Sematkan'}
                          onClick={async () => {
                            await updateThread(t.id, { pinned: !t.pinned }).catch((e) => setError(e.message));
                            loadThreads(agent).then(setThreads);
                          }}
                        >
                          📌
                        </button>
                        <button
                          className="aw-del"
                          aria-label="Ganti judul percakapan"
                          title="Ganti judul"
                          onClick={async () => {
                            const title = window.prompt('Judul percakapan', t.title);
                            if (!title || title === t.title) return;
                            await updateThread(t.id, { title }).catch((e) => setError(e.message));
                            loadThreads(agent).then(setThreads);
                          }}
                        >
                          ✏️
                        </button>
                      </span>
                    )}
                    {t.user_id === uid && (
                      <button
                        className="aw-del"
                        aria-label="Hapus percakapan"
                        onClick={async () => {
                          if (!window.confirm('Hapus percakapan ini?')) return;
                          await deleteThread(t.id);
                          if (t.id === threadId) {
                            openThread(null);
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
              </div>
            </>
          )}
          {level && <p className="aw-label">Agent</p>}
          <AgentList current={agent} access={access} presence={presence} onPick={(id) => go(`/agent/${id}`)} />
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
            <span className={`pres pres-${pres}`}>{busyTask ? 'Kerja' : PRES_LABEL[pres]}</span>
            {agent === 'ceo' && level ? (
              <div className="aw-engine" role="radiogroup" aria-label="Mesin AI Queen Bea">
                {[
                  ['claude', 'Claude'],
                  ['grokbot', 'Grok Bot'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={engine === k}
                    className={engine === k ? 'on' : ''}
                    disabled={busy || !!waiting}
                    onClick={() => {
                      setEngine(k);
                      try {
                        localStorage.setItem(ENGINE_KEY, k);
                      } catch {
                        /* penyimpanan browser tidak tersedia */
                      }
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <span className="aw-model">{model}</span>
            )}
            {level && <ScoreBadge agent={agent} />}
            {level && threadId && msgs.length > 0 && (
              <button
                className="aw-voice"
                title="Unduh percakapan ini (.md)"
                onClick={() => {
                  const t = threads.find((x) => x.id === threadId);
                  const lines = msgs.map((m) => {
                    const who = m.role === 'user' ? m.meta?.name || account.name : m.role === 'agent' ? def.nick : 'Sistem';
                    return `**${who}** · ${timeLabel(m.created_at)} WIB\n\n${m.role === 'agent' ? visible(m.content) : m.content}\n`;
                  });
                  download(`${slug(`${def.nick}-${t?.title || 'percakapan'}`)}.md`, `# ${def.nick} · ${t?.title || 'Percakapan'}\n\n${lines.join('\n---\n\n')}`);
                }}
              >
                ⬇<span className="lbl"> Unduh</span>
              </button>
            )}
            {level && (
              <button className={`aw-voice${voiceOn ? ' on' : ''}`} onClick={toggleVoice} title="Bacakan jawaban otomatis" aria-pressed={voiceOn}>
                {voiceOn ? '🔊' : '🔈'}
                <span className="lbl"> Suara</span>
              </button>
            )}
          </div>

          {busyTask && agent !== 'ceo' && (
            <div className="aw-busy">
              {def.nick} sedang mengerjakan “{busyTask.title.replace(`${def.nick}: `, '')}”
              {Number.isFinite(Number(busyTask.progress)) ? ` · ${Math.round(Number(busyTask.progress) * 100)}%` : ''}
              {busyTask.progressNote ? ` · ${busyTask.progressNote}` : ''}.{' '}
              {locked ? 'Kamu belum bisa mengirim pekerjaan baru sampai selesai.' : 'Kamu masih bisa mengobrol; tugas baru menunggu yang ini selesai.'}
            </div>
          )}
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
                        {m.role === 'agent' ? (
                          <ResultView text={m.content} files={m.meta?.files} onOpen={setViewer} />
                        ) : (
                          <>
                            <p>{m.content}</p>
                            <ImageThumbs files={m.meta?.files} onOpen={setViewer} />
                            <FileChips files={m.meta?.files} onOpen={(f) => (f.path ? setViewer(f) : f.url && window.open(f.url, '_blank', 'noopener'))} />
                          </>
                        )}
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
                            {canWrite && canTask && (
                              <button
                                onClick={() => setTaskFor(taskFor === m.id ? null : m.id)}
                                disabled={!!busyTask}
                                title={busyTask ? `${def.nick} sedang mengerjakan tugas lain` : 'Jadikan tugas'}
                              >
                                ✅ Jadikan tugas
                              </button>
                            )}
                          </div>
                        )}
                        {taskFor === m.id && (
                          <TaskForm
                            agent={agent}
                            nick={def.nick}
                            message={m}
                            ask={askBefore(m)}
                            threadId={threadId}
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
                {(busy || (waiting && waiting.threadId === threadId)) && (
                  <div className="aw-msg agent">
                    {avatar(true)}
                    <div className="aw-bub typing">
                      <i />
                      <i />
                      <i />
                    </div>
                    {waiting && (
                      <span className="aw-typing-label">
                        {def.nick} sedang berpikir
                        <span className="aw-dots" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                )}
              </div>
              {error && <div className="error aw-err">{error}</div>}
              {quota?.limit > 0 && !readOnly && (
                <p className={`aw-quota${quota.used >= quota.limit ? ' out' : ''}`}>
                  Sisa pesan hari ini: {Math.max(0, quota.limit - quota.used)} dari {quota.limit}
                </p>
              )}
              {notice && <div className="aw-notice">{notice}</div>}
              {readOnly ? (
                <p className="aw-readonly">Ini percakapan milik {names[thread.user_id] || 'staff lain'} (hanya bisa dibaca).</p>
              ) : (
                convo.active ? (
                  <div className={`aw-convo ${convo.phase}`} role="status" aria-live="polite">
                    <span className="aw-orb" aria-hidden="true" />
                    <div className="aw-convo-text">
                      <b>
                        {convo.phase === 'listening'
                          ? 'Mendengarkan… bicara saja'
                          : convo.phase === 'thinking'
                            ? `${def.nick} sedang berpikir`
                            : convo.phase === 'speaking'
                              ? `${def.nick} sedang bicara`
                              : 'Mode percakapan'}
                      </b>
                      <span>
                        {convo.phase === 'listening'
                          ? convo.interim || 'Diam sebentar setelah selesai bicara, pesan terkirim otomatis.'
                          : convo.phase === 'speaking'
                            ? 'Tekan Potong (atau spasi) untuk menyela.'
                            : 'Jawaban akan dibacakan, lalu mikrofon menyala lagi.'}
                      </span>
                    </div>
                    {convo.phase === 'listening' && convo.interim && (
                      <button className="aw-convo-btn" onClick={convo.sendNow}>
                        Kirim
                      </button>
                    )}
                    {convo.phase === 'speaking' && (
                      <button className="aw-convo-btn" onClick={convo.interrupt}>
                        ✋ Potong
                      </button>
                    )}
                    <button className="aw-convo-btn stop" onClick={convo.stop}>
                      Selesai
                    </button>
                  </div>
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
                        locked
                          ? `${def.nick} sedang mengerjakan tugas lain…`
                          : listening
                          ? 'Mendengarkan… bicara sekarang'
                          : pres === 'offline' && agent !== 'ceo'
                            ? `${def.nick} sedang offline${netDown ? ' (server agent mati)' : ''}…`
                            : `Beri perintah ke ${def.nick}…`
                      }
                      disabled={locked}
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
                    <button
                      className="aw-tool convo"
                      onClick={() => {
                        recRef.current?.stop();
                        convo.start();
                      }}
                      disabled={busy || !!waiting || !convo.supported}
                      aria-label="Mode percakapan suara"
                      title={convo.supported ? 'Mode percakapan: bicara, agent menjawab dengan suara' : 'Butuh Chrome atau Edge'}
                    >
                      🗣
                    </button>
                    <button className="aw-send" onClick={send} disabled={locked || busy || !!waiting || (!text.trim() && !files.length)} aria-label="Kirim">
                      ➤
                    </button>
                  </div>
                </div>
                )
              )}
            </>
          )}
          {drag && <div className="aw-drop">Lepaskan file untuk dilampirkan</div>}
          {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
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
              {tasks.map((t) => {
                const open = openItem === t.id;
                const title = t.title.replace(`${def.nick}: `, '');
                const pct = Number.isFinite(Number(t.progress)) ? Math.round(Number(t.progress) * 100) : null;
                const linked = threads.find((th) => th.task_id === t.id) || (t.sourceThreadId ? threads.find((th) => th.id === t.sourceThreadId) : null);
                return (
                  <div key={t.id} className={`aw-task${open ? ' open' : ''}`}>
                    <button onClick={() => setOpenItem(open ? null : t.id)} aria-expanded={open}>
                      <span className={`aw-col ${t.col}`}>{COL_LABEL[t.col] || t.col}</span>
                      <b>{title}</b>
                      {t.col === 'doing' && (
                        <small className="muted">
                          {pct != null ? `${pct}%` : 'Sedang dikerjakan'}
                          {t.progressNote ? ` · ${t.progressNote}` : ''}
                        </small>
                      )}
                      {!open && t.result && <small className="aw-preview">{oneLine(visible(t.result), 140)}</small>}
                      {!open && !t.result && t.col === 'failed' && <small className="muted">Tidak ada hasil.</small>}
                    </button>
                    {open && (
                      <div className="aw-result">
                        {t.result || (t.resultFiles || []).length ? (
                          <ResultView text={t.result} files={t.resultFiles} onOpen={setViewer} />
                        ) : (
                          <p className="muted">{t.col === 'doing' ? 'Sedang dikerjakan…' : t.col === 'failed' ? 'Tugas ini gagal dan tidak punya hasil.' : 'Belum ada hasil.'}</p>
                        )}
                        <div className="aw-acts">
                          {t.result && <button onClick={() => copy(t.result)}>📋 Salin</button>}
                          {t.result && <button onClick={() => download(`${slug(t.title)}.md`, `# ${t.title}\n\n${visible(t.result)}\n`)}>⬇ Unduh</button>}
                          {linked && (
                            <button onClick={() => openThread(linked.id)}>Buka di chat</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
