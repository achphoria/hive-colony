// Ngobrol dengan Chief (Queen Bea): mode chat (teks + lampiran file apa pun) dan mode suara.
// Mode suara memakai pengenal suara bawaan browser (Web Speech API) dan suara browser untuk jawaban.
// Staff yang login: jawaban dari Claude (lihat queenBea.js). Tanpa login: jawaban demo.
import { useEffect, useRef, useState } from 'react';
import { chiefReply, speak, stopSpeaking } from './ai';
import { useAuth } from '../sim/auth';
import { useHive } from '../sim/store';
import { askQueenBea, useAi, modelLabel } from './queenBea';

const STORE_KEY = 'hive.chiefChat';
const WELCOME = {
  id: 'w',
  from: 'ceo',
  text: 'Halo! Saya Queen Bea. Tanya apa saja soal koloni, atau lampirkan file (Excel, PDF, foto) untuk saya pelajari.',
  files: [],
};

function loadChat() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [WELCOME];
  } catch {
    return [WELCOME];
  }
}
function saveChat(msgs) {
  try {
    // simpan teks & info file saja (bukan isi file) untuk sesi ini
    sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-40).map((m) => ({ ...m, files: m.files.map(({ url, ...f }) => f) }))));
  } catch {
    /* abaikan */
  }
}

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const extOf = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// daftar sumber riset web di bawah jawaban Queen Bea
export function Sources({ list }) {
  if (!list?.length) return null;
  return (
    <div className="qb-sources">
      <span>🔎 Sumber riset</span>
      {list.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
          {s.title}
        </a>
      ))}
    </div>
  );
}

function FileChip({ f, onRemove }) {
  const isImg = f.type?.startsWith('image/') && f.url;
  return (
    <div className="fchip">
      {isImg ? <img src={f.url} alt="" /> : <i>{extOf(f.name)}</i>}
      <div>
        <span>{f.name}</span>
        <small>{fmtSize(f.size)}</small>
      </div>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Hapus ${f.name}`}>
          ×
        </button>
      )}
    </div>
  );
}

function ChatMode({ msgs, send, busy }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, busy]);

  const addFiles = (list) => {
    const arr = [...list].slice(0, 6).map((f) => ({ name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f) }));
    setFiles((old) => [...old, ...arr].slice(0, 6));
  };
  const submit = () => {
    if (!text.trim() && !files.length) return;
    send(text.trim(), files);
    setText('');
    setFiles([]);
  };

  return (
    <div
      className={`chat${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      <div className="chat-list" ref={listRef}>
        {msgs.map((m) =>
          m.from === 'me' ? (
            <div key={m.id} className="msg me">
              {m.text && <p>{m.text}</p>}
              {m.files.map((f, i) => (
                <FileChip key={i} f={f} />
              ))}
            </div>
          ) : (
            <div key={m.id} className={`msg ai${m.error ? ' err' : ''}`}>
              <div className="qb">👑</div>
              <div className="bub">
                <p>{m.text}</p>
                <Sources list={m.sources} />
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="msg ai">
            <div className="qb">👑</div>
            <div className="bub typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f, i) => (
            <FileChip key={i} f={f} onRemove={() => setFiles((x) => x.filter((_, k) => k !== i))} />
          ))}
        </div>
      )}
      <div className="chat-input">
        <button className="ib" onClick={() => fileRef.current?.click()} aria-label="Lampirkan file">
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          rows={1}
          value={text}
          placeholder="Ketik pesan atau seret file ke sini…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="ib send" onClick={submit} aria-label="Kirim">
          ➤
        </button>
      </div>
    </div>
  );
}

function VoiceMode({ send, lastReply, busy, onChat }) {
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef(null);
  const finalText = useRef('');

  useEffect(() => {
    if (!busy && state === 'thinking' && lastReply) {
      setState('speaking');
      speak(lastReply, () => setState('idle'));
    }
  }, [busy, lastReply, state]);
  useEffect(() => () => {
    rec.current?.abort?.();
    stopSpeaking();
  }, []);

  const start = () => {
    if (!SpeechRec) return;
    stopSpeaking();
    setError('');
    finalText.current = '';
    setInterim('');
    const r = new SpeechRec();
    r.lang = 'id-ID';
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let k = 0; k < e.results.length; k++) {
        if (e.results[k].isFinal) fin += e.results[k][0].transcript;
        else mid += e.results[k][0].transcript;
      }
      finalText.current = fin;
      setInterim(fin + mid);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser.' : 'Suara tidak tertangkap. Coba lagi.');
      setState('idle');
    };
    r.onend = () => {
      const said = (finalText.current || '').trim();
      if (said) {
        setState('thinking');
        send(said, []);
      } else setState((s) => (s === 'listening' ? 'idle' : s));
    };
    rec.current = r;
    r.start();
    setState('listening');
  };
  const stop = () => rec.current?.stop();

  if (!SpeechRec) {
    return (
      <div className="voice">
        <div className="orb idle">👑</div>
        <p>
          Browser ini belum mendukung pengenalan suara. Coba Chrome, Edge, atau Safari versi terbaru, atau pakai mode chat.
        </p>
        <button className="hbtn pri" onClick={onChat}>
          💬 Pindah ke chat
        </button>
      </div>
    );
  }
  const label = {
    idle: 'Tahan tombol lalu bicara',
    listening: 'Queen Bea mendengarkan…',
    thinking: 'Queen Bea berpikir…',
    speaking: 'Queen Bea menjawab',
  }[state];
  return (
    <div className="voice">
      <div className={`orb ${state}`}>👑</div>
      <b>{label}</b>
      <div className="voice-text">
        {state === 'listening' || state === 'thinking' ? interim || '…' : state === 'speaking' ? lastReply : 'Jawaban juga muncul sebagai teks di mode chat.'}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="voice-btns">
        <button
          className={`hbtn pri main talk${state === 'listening' ? ' on' : ''}`}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={() => state === 'listening' && stop()}
          disabled={state === 'thinking'}
        >
          🎙 {state === 'listening' ? 'Lepas untuk kirim' : 'Tahan untuk bicara'}
        </button>
        {state === 'speaking' && (
          <button
            className="hbtn"
            onClick={() => {
              stopSpeaking();
              setState('idle');
            }}
          >
            ⏹ Hentikan
          </button>
        )}
        <button className="hbtn" onClick={onChat}>
          💬<span className="lbl"> Chat</span>
        </button>
      </div>
    </div>
  );
}

export function ChiefView() {
  const [mode, setMode] = useState('chat');
  const [msgs, setMsgs] = useState(loadChat);
  const [busy, setBusy] = useState(false);
  const account = useAuth((s) => s.account);
  const profile = useHive((s) => s.profile);
  const ai = useAi();
  const live = !!account;

  useEffect(() => saveChat(msgs), [msgs]);

  const reply = (text, extra = {}) => setMsgs((m) => [...m, { id: `a${Date.now()}`, from: 'ceo', text, files: [], ...extra }]);

  const send = async (text, files) => {
    const mine = { id: `m${Date.now()}`, from: 'me', text, files };
    const next = [...msgs, mine];
    setMsgs(next);
    setBusy(true);
    if (!live) {
      setTimeout(() => {
        reply(chiefReply(text, files));
        setBusy(false);
      }, 1100 + Math.random() * 700);
      return;
    }
    // riwayat untuk Claude: tanpa salam pembuka dan pesan galat; lampiran disebut namanya saja
    const history = next
      .filter((m) => m.id !== 'w' && !m.error)
      .map((m) => ({
        role: m.from === 'me' ? 'user' : 'assistant',
        content: [m.text, ...m.files.map((f) => `[Lampiran: ${f.name}, ${fmtSize(f.size)}; isinya belum bisa dibaca]`)].filter(Boolean).join('\n'),
      }));
    try {
      const r = await askQueenBea({ messages: history });
      reply(r.reply, { sources: r.sources });
    } catch (e) {
      reply(e.message, { error: true });
    } finally {
      setBusy(false);
    }
  };
  const lastReply = [...msgs].reverse().find((m) => m.from === 'ceo')?.text || '';

  return (
    <div className="chief">
      <div className="chief-head">
        <div className="mode-switch" role="tablist">
          <button role="tab" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'on' : ''} onClick={() => setMode('chat')}>
            💬 Chat
          </button>
          <button role="tab" aria-selected={mode === 'voice'} className={mode === 'voice' ? 'on' : ''} onClick={() => setMode('voice')}>
            🎙 Suara
          </button>
        </div>
        <span className="muted">
          {account?.name || profile?.name || 'Anda'} ↔ Queen Bea · {live ? (ai.status === 'off' ? 'AI belum tersambung' : modelLabel(ai.model)) : 'mode demo'}
        </span>
      </div>
      <div className="chief-box">
        {mode === 'chat' ? (
          <ChatMode msgs={msgs} send={send} busy={busy} />
        ) : (
          <VoiceMode send={send} lastReply={lastReply} busy={busy} onChat={() => setMode('chat')} />
        )}
      </div>
      <p className="demo-note">
        {live
          ? 'Queen Bea dijawab Claude dengan data koloni asli dari database. Isi file lampiran belum bisa dibaca; itu menyusul di fase berikutnya.'
          : 'Mode demo: jawaban Queen Bea contoh. Login sebagai staff untuk ngobrol dengan Queen Bea versi AI (Claude).'}
      </p>
    </div>
  );
}

export function PortalView() {
  return (
    <div className="portal">
      <div className="portal-card">
        <div className="portal-ic">🗂</div>
        <h2>Portal karyawan</h2>
        <p>Sedang dibangun. Nanti di sini ada pengajuan cuti, slip gaji, dokumen kontrak, dan absensi.</p>
        <div className="portal-soon">
          {['Pengajuan cuti', 'Slip gaji', 'Dokumen', 'Absensi'].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <span className="soon-badge">Segera hadir</span>
      </div>
    </div>
  );
}
