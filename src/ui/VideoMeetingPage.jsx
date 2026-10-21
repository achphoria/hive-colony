// Ruang rapat video Cloudflare Realtime: #/rapat/<id rapat> (room per rapat) dan #/video (rapat yang sedang berjalan).
// Layar preview (pilih kamera/mic/speaker) -> room: grid responsif, speaker aktif membesar, share screen,
// chat (tersimpan di hc_meeting_lines), daftar peserta, dan kontrol host (matikan mic / keluarkan).
// Transkrip live + Queen Bea lewat roomAssist; rekaman (flag MEETING_RECORDING) lewat recorder di browser host.
// Hanya dipakai saat VIDEO_PROVIDER=cloudflare; selain itu rapat berjalan sebagai rapat suara LiveKit di Hive Hall.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';
import { createCfCall, listDevices, canShareScreen, canPickSpeaker } from '../hall/rtc/cfCall';
import { requestRecap } from '../hall/meeting';
import { useCloudflare, RECORDING_ENABLED } from '../hall/rtc/config';
import { useRoomAssist, attach as attachAssist, detach as detachAssist, micChanged, onData, ask as askQueen, setAiVoice, canTranscribe } from '../hall/rtc/roomAssist';
import { createRecorder, canRecord } from '../hall/rtc/recorder';
import { Sources } from '../hall/ChiefView';
import { go } from './nav';
import { confirmDialog, alertDialog } from './dialog';

const SPEAK_LEVEL = 0.08; // ambang "sedang bicara"
const SPEAKER_HOLD_MS = 2000; // speaker aktif tidak langsung berganti saat jeda bicara
const MAX_GRID = 16;

const initials = (n) =>
  (n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function useElapsed(startedAt) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return '00:00';
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// jumlah kolom yang memberi tile 16:9 terbesar di area yang tersedia
function bestGrid(n, W, H, gap = 8) {
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * (16 / 9));
    if (w > best.w) best = { cols, w };
  }
  return best;
}

function Video({ stream, mirror, contain }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream || null;
  }, [stream]);
  // audio diputar lewat <audio> terpisah (AudioSinks), video selalu bisu
  return <video ref={ref} autoPlay playsInline muted className={`${mirror ? 'mirror' : ''}${contain ? ' contain' : ''}`} />;
}

// suara peserta lain: satu <audio> per peserta, tetap diputar walau tile-nya tidak tampil
function AudioSinks({ peers, sinkId }) {
  return (
    <div hidden>
      {peers.map((p) => (
        <PeerAudio key={p.key} stream={p.stream} sinkId={sinkId} />
      ))}
    </div>
  );
}
function PeerAudio({ stream, sinkId }) {
  const ref = useRef(null);
  const audioOnly = useMemo(() => {
    const t = stream?.getAudioTracks();
    return t?.length ? new MediaStream(t) : null;
  }, [stream]);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== audioOnly) ref.current.srcObject = audioOnly;
  }, [audioOnly]);
  useEffect(() => {
    if (sinkId && ref.current?.setSinkId) ref.current.setSinkId(sinkId).catch(() => {});
  }, [sinkId, audioOnly]);
  return <audio ref={ref} autoPlay />;
}

const Icon = {
  mic: (on) => (on ? '🎙' : '🔇'),
  cam: (on) => (on ? '📷' : '🚫'),
};

function SignalBars({ net }) {
  return (
    <span className={`vm-signal ${net}`} title={net === 'weak' ? 'Sinyal lemah' : 'Sinyal baik'} aria-label={net === 'weak' ? 'Sinyal lemah' : 'Sinyal baik'}>
      <i />
      <i />
      <i />
    </span>
  );
}

function Tile({ t, level, onQuality, isHost, onMute, onKick, big, screen }) {
  const ref = useRef(null);
  const [menu, setMenu] = useState(false);
  const stream = screen ? t.screenStream : t.stream;
  const hasVideo = screen ? !!stream : t.cam && stream?.getVideoTracks().length > 0;
  // tile kecil cukup lapis rendah; tile besar minta lapis penuh (hemat bandwidth)
  useEffect(() => {
    if (t.me || screen || !onQuality) return undefined;
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => {
      const h = e.contentRect.height * (window.devicePixelRatio > 1 ? 1.5 : 1);
      onQuality(t.key, h >= 400 ? 'a' : h >= 170 ? 'b' : 'c');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [t.key, t.me, screen, onQuality]);
  const speaking = !screen && level > SPEAK_LEVEL && t.mic;
  return (
    <div ref={ref} className={`vm-tile${speaking ? ' speaking' : ''}${big ? ' big' : ''}${screen ? ' screen' : ''}`} style={{ '--lvl': Math.min(1, level * 2) }}>
      {hasVideo && <Video stream={stream} mirror={t.me && !screen} contain={screen} />}
      {!hasVideo && (
        <div className="vm-avatar" aria-hidden="true">
          <span>{initials(t.name)}</span>
        </div>
      )}
      <div className="vm-tag">
        {!screen && !t.mic && <span aria-label="Mic mati">🔇</span>}
        <span className="vm-tag-name">
          {screen ? `Layar ${t.me ? 'Anda' : t.name}` : t.me ? `${t.name} (Anda)` : t.name}
        </span>
        {!screen && t.net === 'weak' && <SignalBars net="weak" />}
      </div>
      {!screen && t.role === 'owner' && <span className="vm-host">Host</span>}
      {isHost && !t.me && !screen && (
        <div className="vm-menu">
          <button className="vm-menu-btn" onClick={() => setMenu(!menu)} aria-label={`Kelola ${t.name}`} aria-expanded={menu}>
            ⋯
          </button>
          {menu && (
            <div className="vm-menu-list" onMouseLeave={() => setMenu(false)}>
              <button
                onClick={() => {
                  setMenu(false);
                  onMute(t);
                }}
                disabled={!t.mic}
              >
                🔇 Matikan mic
              </button>
              <button
                className="danger"
                onClick={() => {
                  setMenu(false);
                  onKick(t);
                }}
              >
                ⛔ Keluarkan dari rapat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DevicePicker({ call, sinkId, setSinkId, local }) {
  const [list, setList] = useState({ audioIn: [], videoIn: [], audioOut: [] });
  const [err, setErr] = useState('');
  useEffect(() => {
    listDevices().then(setList);
    const on = () => listDevices().then(setList);
    navigator.mediaDevices?.addEventListener?.('devicechange', on);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', on);
  }, [local]);
  const cur = (kind) => local?.[kind === 'audio' ? 'getAudioTracks' : 'getVideoTracks']()[0]?.getSettings?.().deviceId || '';
  const pick = (kind) => (e) => {
    setErr('');
    call.setDevice(kind, e.target.value).catch(() => setErr('Perangkat itu tidak bisa dipakai. Pilih yang lain.'));
  };
  return (
    <div className="vm-devices">
      <label>
        <span>Mikrofon</span>
        <select value={cur('audio')} onChange={pick('audio')} disabled={!list.audioIn.length}>
          {list.audioIn.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Kamera</span>
        <select value={cur('video')} onChange={pick('video')} disabled={!list.videoIn.length}>
          {!list.videoIn.length && <option>Tidak ada kamera</option>}
          {list.videoIn.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      {canPickSpeaker && list.audioOut.length > 0 && (
        <label>
          <span>Speaker</span>
          <select value={sinkId || ''} onChange={(e) => setSinkId(e.target.value)}>
            {list.audioOut.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {err && <p className="vm-err">{err}</p>}
    </div>
  );
}

export function PreJoin({ meeting, account, snap, levels, call, sinkId, setSinkId, error }) {
  const me = { me: true, key: 'me', name: account.name, mic: snap.micOn, cam: snap.camOn, stream: snap.local, net: 'good' };
  return (
    <div className="vm-prejoin">
      <div className="vm-pre-video">
        <Tile t={me} level={levels.me || 0} big />
        <div className="vm-pre-ctl">
          <button className={`vm-btn${snap.micOn ? '' : ' off'}`} onClick={() => call.setMic(!snap.micOn)} disabled={!snap.local} aria-pressed={snap.micOn}>
            {Icon.mic(snap.micOn)}
          </button>
          <button className={`vm-btn${snap.camOn ? '' : ' off'}`} onClick={() => call.setCam(!snap.camOn)} disabled={!snap.local?.getVideoTracks().length} aria-pressed={snap.camOn}>
            {Icon.cam(snap.camOn)}
          </button>
        </div>
        <div className="vm-meter" aria-hidden="true">
          <i style={{ width: `${Math.round(Math.min(1, (levels.me || 0) * 2) * 100)}%` }} />
        </div>
      </div>
      <div className="vm-pre-side">
        <small>Siap bergabung?</small>
        <h1>{meeting.title}</h1>
        <DevicePicker call={call} sinkId={sinkId} setSinkId={setSinkId} local={snap.local} />
        {error && <p className="vm-err">{error}</p>}
        <button className="vm-join" onClick={() => call.join()} disabled={!snap.local || snap.state === 'connecting'}>
          {snap.state === 'connecting' ? 'Menyambungkan…' : 'Masuk rapat'}
        </button>
        <p className="vm-hint">Pakai headset supaya suara peserta lain tidak ikut tertangkap mic Anda.</p>
      </div>
    </div>
  );
}

function ChatPanel({ chat, onSend }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [chat.length]);
  return (
    <>
      <div className="vm-chat" ref={box}>
        {!chat.length && <p className="vm-muted">Belum ada pesan. Chat tersimpan di arsip rapat.</p>}
        {chat.map((m) => (
          <div key={m.id} className={`vm-msg${m.mine ? ' me' : ''}`}>
            <b>
              {m.mine ? 'Anda' : m.name} <time>{new Date(m.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}</time>
            </b>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {err && <p className="vm-err">{err}</p>}
      <form
        className="vm-say"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          setText('');
          setErr('');
          onSend(v).catch((x) => setErr(x.message));
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Tulis pesan untuk semua…" aria-label="Pesan chat" />
        <button type="submit" disabled={!text.trim()}>
          Kirim
        </button>
      </form>
    </>
  );
}

function PeoplePanel({ tiles, isHost, onMute, onKick }) {
  return (
    <ul className="vm-people">
      {tiles.map((t) => (
        <li key={t.key}>
          <span className="vm-people-av">{initials(t.name)}</span>
          <span className="vm-people-name">
            {t.name}
            {t.me && ' (Anda)'}
            {t.role === 'owner' && <em>Host</em>}
          </span>
          {t.net === 'weak' && <SignalBars net="weak" />}
          <span aria-label={t.mic ? 'Mic menyala' : 'Mic mati'}>{Icon.mic(t.mic)}</span>
          <span aria-label={t.cam ? 'Kamera menyala' : 'Kamera mati'}>{Icon.cam(t.cam)}</span>
          {isHost && !t.me && (
            <span className="vm-people-act">
              <button onClick={() => onMute(t)} disabled={!t.mic}>
                Mute
              </button>
              <button className="danger" onClick={() => onKick(t)}>
                Keluarkan
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function TranscriptPanel({ myName }) {
  const a = useRoomAssist();
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [a.lines.length, a.partials]);
  const partials = Object.entries(a.partials).filter(([, p]) => Date.now() - p.at < 6000);
  return (
    <>
      <div className="vm-tx-status">
        {a.txOn ? '● Transkrip live dari mic Anda' : canTranscribe ? 'Mic mati: ucapan Anda tidak ditranskrip' : 'Browser ini belum bisa mentranskrip (pakai Chrome/Edge)'}
        <button className={`vm-chip${a.aiVoice ? ' on' : ''}`} onClick={() => setAiVoice(!a.aiVoice)} aria-pressed={a.aiVoice}>
          {a.aiVoice ? '🔊 Suara Queen' : '🔈 Suara Queen'}
        </button>
      </div>
      <div className="vm-chat" ref={box}>
        {!a.lines.length && <p className="vm-muted">Transkrip muncul di sini saat ada yang bicara.</p>}
        {a.lines.map((l) =>
          l.who === 'system' ? (
            <div key={l.id} className="vm-tx sys">
              {l.t} · {l.text}
            </div>
          ) : (
            <div key={l.id} className={`vm-tx${l.who === 'ceo' ? ' ceo' : ''}`}>
              <b>
                {l.who === 'ceo' ? '👑 Queen Bea' : l.who === 'me' ? myName : l.name} <time>{l.t}</time>
              </b>
              <p>{l.text}</p>
              {l.sources?.length > 0 && <Sources list={l.sources} />}
            </div>
          ),
        )}
        {partials.map(([id, p]) => (
          <div key={`part-${id}`} className="vm-tx partial">
            <b>{id === 'me' ? myName : p.name}</b>
            <p>{p.text}…</p>
          </div>
        ))}
      </div>
      <form
        className="vm-say"
        onSubmit={(e) => {
          e.preventDefault();
          askQueen(q);
          setQ('');
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} disabled={a.queenBusy} placeholder={a.queenBusy ? 'Queen Bea sedang berpikir & riset…' : 'Tanya Queen Bea (kosong = minta ringkasan)'} aria-label="Pertanyaan untuk Queen Bea" />
        <button type="submit" disabled={a.queenBusy}>
          👑
        </button>
      </form>
    </>
  );
}

// jawaban Queen Bea tampil sebagai teks di bawah panggung (juga dibacakan bila "Suara Queen" menyala)
function QueenCaption() {
  const caption = useRoomAssist((s) => s.caption);
  if (!caption) return null;
  return (
    <div className="vm-caption" role="status">
      <b>👑 Queen Bea</b>
      <p>{caption.text}</p>
      {caption.sources?.length > 0 && <Sources list={caption.sources} />}
    </div>
  );
}

export function Room({ meeting, account, snap, levels, call, sinkId, setSinkId, chat, unread, panel, setPanel, onLeave, onEnd, notices, onMic, rec, onRecord }) {
  const stageRef = useRef(null);
  const size = useSize(stageRef);
  const elapsed = useElapsed(meeting.started_at);
  const [layout, setLayout] = useState('auto'); // auto | grid | speaker
  const [settings, setSettings] = useState(false);
  const isHost = account.role === 'owner';
  const queenBusy = useRoomAssist((s) => s.queenBusy);
  const txOn = useRoomAssist((s) => s.txOn);
  // tanda rekam terlihat semua peserta (dari presence host yang merekam)
  const recordingBy = rec?.on ? account.name : snap.peers.find((p) => p.rec)?.name;
  const me = { me: true, key: snap.key || 'me', uid: account.id, name: account.name, role: account.role, mic: snap.micOn, cam: snap.camOn, net: snap.net, stream: snap.local, screenStream: snap.screen };
  const tiles = [me, ...snap.peers];

  // speaker aktif: peserta lain dengan suara paling keras, ditahan sebentar supaya tidak berkedip
  const spk = useRef({ key: null, at: 0 });
  let loud = null;
  for (const p of snap.peers) if ((levels[p.key] || 0) > SPEAK_LEVEL && p.mic && (!loud || levels[p.key] > levels[loud.key])) loud = p;
  if (loud && (loud.key === spk.current.key || Date.now() - spk.current.at > SPEAKER_HOLD_MS)) spk.current = { key: loud.key, at: Date.now() };
  // pembicara terakhir tetap besar sampai ada yang lain bicara (atau ia keluar)
  const active = snap.peers.find((p) => p.key === spk.current.key) || null;

  const sharer = tiles.find((t) => t.screenStream);
  const mode = sharer ? 'present' : layout === 'grid' || (layout === 'auto' && tiles.length <= 2) || !active ? 'grid' : 'speaker';

  const onQuality = useCallback((k, rid) => call.setQuality(k, rid), [call]);
  const mute = (t) => call.mutePeer(t.uid);
  const kick = (t) => {
    confirmDialog({
      title: `Keluarkan ${t.name}?`,
      message: 'Video dan suaranya langsung dihentikan, dan ia tidak bisa masuk lagi ke rapat ini.',
      confirmLabel: 'Keluarkan',
      tone: 'danger',
    }).then((ok) => ok && call.kickPeer(t.uid).catch((e) => alertDialog({ title: 'Gagal mengeluarkan peserta', message: e.message, tone: 'error' })));
  };
  const tile = (t, extra = {}) => <Tile key={t.key} t={t} level={levels[t.me ? 'me' : t.key] || 0} onQuality={onQuality} isHost={isHost} onMute={mute} onKick={kick} {...extra} />;

  let stage;
  if (mode === 'grid') {
    const shown = tiles.slice(0, MAX_GRID);
    const rest = tiles.length - shown.length;
    const n = shown.length + (rest > 0 ? 1 : 0);
    const g = bestGrid(n, size.w, size.h);
    stage = (
      <div className="vm-grid" style={{ gridTemplateColumns: `repeat(${g.cols}, ${Math.floor(g.w)}px)` }}>
        {shown.map((t) => tile(t))}
        {rest > 0 && <div className="vm-tile vm-more">+{rest} lainnya</div>}
      </div>
    );
  } else {
    const main = mode === 'present' ? tile(sharer, { screen: true, big: true, key: `${sharer.key}-screen` }) : tile(active, { big: true });
    const strip = mode === 'present' ? tiles : tiles.filter((t) => t.key !== active.key);
    stage = (
      <div className="vm-focus">
        <div className="vm-main">{main}</div>
        <div className="vm-strip">{strip.map((t) => tile(t))}</div>
      </div>
    );
  }

  const share = async () => {
    try {
      if (snap.screenOn) await call.stopScreen();
      else await call.startScreen();
    } catch (e) {
      if (e?.name !== 'NotAllowedError') alertDialog({ title: 'Share screen gagal', message: e.message || 'Coba lagi, atau pilih jendela/tab lain untuk dibagikan.', tone: 'error' });
    }
  };

  return (
    <div className={`vm-room${panel ? ' with-panel' : ''}`}>
      <header className="vm-head">
        <div className="vm-title">
          <b>{meeting.title}</b>
          <small>
            {elapsed} · {tiles.length} peserta
          </small>
        </div>
        <SignalBars net={snap.net} />
        {recordingBy && (
          <span className="vm-badge rec" title={`Direkam oleh ${recordingBy}`}>
            ● REC
          </span>
        )}
        <span className={`vm-badge queen${queenBusy ? ' busy' : ''}`} title="Sebut “Queen Bea, …” untuk bertanya">
          👑 {queenBusy ? 'Berpikir…' : txOn ? 'Mendengarkan' : 'Standby'}
        </span>
        {snap.state === 'reconnecting' && <span className="vm-badge warn">Menyambung ulang…</span>}
        {snap.net === 'weak' && snap.state === 'on' && <span className="vm-badge warn">Sinyal lemah · kualitas video diturunkan</span>}
        {tiles.length > 2 && !sharer && (
          <button className="vm-layout" onClick={() => setLayout(mode === 'grid' ? 'speaker' : 'grid')}>
            {mode === 'grid' ? 'Tampilan pembicara' : 'Tampilan grid'}
          </button>
        )}
        {isHost && onRecord && (
          <button className={`vm-layout vm-recbtn${rec?.on ? ' rec' : ''}`} onClick={onRecord} disabled={!rec?.on && rec?.uploading}>
            {rec?.on ? '⏹ Stop rekam' : rec?.uploading ? 'Mengunggah…' : '⏺ Rekam'}
          </button>
        )}
      </header>
      {rec?.error && <div className="vm-rec-err">{rec.error}</div>}
      {notices.length > 0 && (
        <div className="vm-notices" aria-live="polite">
          {notices.map((n) => (
            <div key={n.id}>{n.text}</div>
          ))}
        </div>
      )}
      <div className="vm-body">
        <div className="vm-stage" ref={stageRef}>
          {stage}
          <QueenCaption />
        </div>
        {panel && (
          <aside className="vm-panel" aria-label={panel === 'people' ? 'Peserta' : panel === 'tx' ? 'Transkrip' : 'Chat'}>
            <header>
              {panel === 'people' ? (
                <b>Peserta ({tiles.length})</b>
              ) : (
                <div className="vm-tabs" role="tablist">
                  <button role="tab" aria-selected={panel === 'chat'} onClick={() => setPanel('chat')}>
                    Chat{unread > 0 && panel !== 'chat' ? ` · ${unread}` : ''}
                  </button>
                  <button role="tab" aria-selected={panel === 'tx'} onClick={() => setPanel('tx')}>
                    Transkrip & Queen
                  </button>
                </div>
              )}
              <button onClick={() => setPanel(null)} aria-label="Tutup panel">
                ✕
              </button>
            </header>
            {panel === 'chat' && <ChatPanel chat={chat} onSend={(v) => call.sendChat(v)} />}
            {panel === 'tx' && <TranscriptPanel myName={account.name} />}
            {panel === 'people' && <PeoplePanel tiles={tiles} isHost={isHost} onMute={mute} onKick={kick} />}
          </aside>
        )}
      </div>
      <nav className="vm-bar" aria-label="Kontrol rapat">
        <button className={`vm-btn${snap.micOn ? '' : ' off'}`} onClick={() => onMic(!snap.micOn)} aria-pressed={snap.micOn} title={snap.micOn ? 'Matikan mic' : 'Nyalakan mic'}>
          {Icon.mic(snap.micOn)}
          <span>Mic</span>
        </button>
        <button className={`vm-btn${snap.camOn ? '' : ' off'}`} onClick={() => call.setCam(!snap.camOn)} disabled={!snap.local?.getVideoTracks().length} aria-pressed={snap.camOn} title={snap.camOn ? 'Matikan kamera' : 'Nyalakan kamera'}>
          {Icon.cam(snap.camOn)}
          <span>Kamera</span>
        </button>
        {canShareScreen && (
          <button className={`vm-btn hide-sm${snap.screenOn ? ' on' : ''}`} onClick={share} disabled={!!sharer && !snap.screenOn} aria-pressed={snap.screenOn} title={sharer && !snap.screenOn ? `${sharer.name} sedang share screen` : 'Share screen'}>
            🖥<span>{snap.screenOn ? 'Berhenti share' : 'Share'}</span>
          </button>
        )}
        <button className={`vm-btn${panel === 'chat' || panel === 'tx' ? ' on' : ''}`} onClick={() => setPanel(panel === 'chat' || panel === 'tx' ? null : 'chat')}>
          💬<span>Chat</span>
          {unread > 0 && <em className="vm-dot">{unread > 9 ? '9+' : unread}</em>}
        </button>
        <button className={`vm-btn${panel === 'people' ? ' on' : ''}`} onClick={() => setPanel(panel === 'people' ? null : 'people')}>
          👥<span>{tiles.length}</span>
        </button>
        <button className="vm-btn hide-sm" onClick={() => setSettings(true)} title="Pengaturan perangkat">
          ⚙<span>Perangkat</span>
        </button>
        <button className="vm-btn leave" onClick={onLeave}>
          📞<span>Keluar</span>
        </button>
        {isHost && (
          <button className="vm-btn end" onClick={onEnd}>
            ⏹<span>Akhiri</span>
          </button>
        )}
      </nav>
      {settings && (
        <div className="vm-modal" role="dialog" aria-modal="true" aria-label="Pengaturan perangkat" onClick={() => setSettings(false)}>
          <div className="vm-modal-card" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>Perangkat</b>
              <button onClick={() => setSettings(false)} aria-label="Tutup">
                ✕
              </button>
            </header>
            <DevicePicker call={call} sinkId={sinkId} setSinkId={setSinkId} local={snap.local} />
          </div>
        </div>
      )}
      <AudioSinks peers={snap.peers} sinkId={sinkId} />
    </div>
  );
}

export function VideoMeetingPage({ meetingId }) {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  const [meeting, setMeeting] = useState(useCloudflare ? undefined : null); // undefined = memuat, null = tidak ada
  const [snap, setSnap] = useState(null);
  const [levels, setLevels] = useState({});
  const [chat, setChat] = useState([]);
  const [panel, setPanel] = useState(null);
  const [unread, setUnread] = useState(0);
  const [notices, setNotices] = useState([]);
  const [ended, setEnded] = useState('');
  const [sinkId, setSinkId] = useState('');
  const [rec, setRec] = useState(null); // { on, uploading, parts, error }
  const call = useRef(null);
  const recorder = useRef(null);
  const snapRef = useRef(null);
  snapRef.current = snap;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  const notify = useCallback((text) => {
    const id = Math.random();
    setNotices((n) => [...n, { id, text }].slice(-3));
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  // rapat yang dibuka: #/rapat/<id>, atau rapat yang sedang berjalan (#/video)
  useEffect(() => {
    if (!useCloudflare) return undefined;
    let alive = true;
    const q = supabase.from('hc_meetings').select('id, title, started_at, status');
    (meetingId ? q.eq('id', meetingId).maybeSingle() : q.eq('status', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle()).then(({ data }) => {
      if (!alive) return;
      if (!meetingId && data) go(`/rapat/${data.id}`);
      setMeeting(data || null);
    });
    return () => {
      alive = false;
    };
  }, [meetingId]);

  // rapat diakhiri (host / notulen dibuat) saat saya masih di dalam
  useEffect(() => {
    if (!meeting?.id) return undefined;
    const ch = supabase
      .channel(`hc-meeting-row:${meeting.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hc_meetings', filter: `id=eq.${meeting.id}` }, ({ new: row }) => {
        if (row.status !== 'live') {
          call.current?.leave();
          setEnded('Rapat sudah diakhiri. Queen Bea sedang menyusun notulen; lihat di Hive Hall → Arsip rapat.');
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [meeting?.id]);

  useEffect(() => {
    if (!useCloudflare || meeting?.status !== 'live' || !account || !uid) return undefined;
    const c = createCfCall({
      meetingId: meeting.id,
      me: { id: uid, name: account.name, role: account.role },
      onChange: setSnap,
      onLevels: setLevels,
      onEvent: (e) => {
        if (e.t === 'chat') {
          setChat((list) => (list.some((m) => m.id === e.id) ? list : [...list, e].slice(-300)));
          if (!e.mine && panelRef.current !== 'chat') setUnread((n) => n + 1);
        } else if (e.t === 'data') onData(e.msg, e.from);
        else if (e.t === 'muted') {
          micChanged(false);
          notify(`${e.by} mematikan mic Anda.`);
        }
        else if (e.t === 'joined') notify(`${e.name} bergabung`);
        else if (e.t === 'left') notify(`${e.name} keluar`);
      },
    });
    call.current = c;
    c.preview().catch((e) => setSnap((s) => ({ ...(s || c.snapshot()), error: e.message })));
    c.loadChat().then((old) => setChat((list) => [...old, ...list.filter((m) => !old.some((o) => o.id === m.id))]));
    const bye = () => c.leave();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      detachAssist();
      recorder.current?.stop();
      c.leave();
      call.current = null;
    };
  }, [meeting?.id, meeting?.status, account, uid, notify]);

  // begitu masuk room: transkrip & Queen Bea aktif; keluar / dikeluarkan: berhenti
  const inRoom = snap?.state === 'on' || snap?.state === 'reconnecting';
  useEffect(() => {
    if (!inRoom || !call.current) return undefined;
    attachAssist(call.current, { meetingId: meeting.id, me: { id: uid, name: account.name } });
    micChanged(!!snapRef.current?.micOn);
    return () => detachAssist({ silent: snapRef.current?.state === 'kicked' });
  }, [inRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // rekaman / unggahan berjalan: ingatkan sebelum menutup tab
  useEffect(() => {
    if (!rec?.on && !rec?.uploading) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [rec?.on, rec?.uploading]);

  useEffect(() => {
    if (panel === 'chat') setUnread(0);
  }, [panel]);

  const setMic = (on) => {
    call.current?.setMic(on);
    micChanged(on);
  };
  // rekaman: kanvas gabungan semua tile + campuran suara, dari snapshot terbaru
  const scene = () => {
    const sn = snapRef.current;
    if (!sn) return { tiles: [], screen: null, audio: [] };
    const tiles = [{ key: 'me', name: account.name, cam: sn.camOn, stream: sn.local }, ...sn.peers.map((p) => ({ key: p.key, name: p.name, cam: p.cam, stream: p.stream }))];
    const sharer = sn.screen ? { name: account.name, stream: sn.screen } : sn.peers.filter((p) => p.screenStream).map((p) => ({ name: p.name, stream: p.screenStream }))[0] || null;
    return { tiles, screen: sharer, audio: [sn.local, ...sn.peers.map((p) => p.stream)].filter(Boolean) };
  };
  const stopRecording = async () => {
    const r = recorder.current;
    if (!r) return;
    call.current?.setRecording(false);
    await r.stop();
    recorder.current = null;
  };
  const toggleRecord = async () => {
    if (recorder.current) {
      await stopRecording();
      notify('Rekaman berhenti. Bagian terakhir sedang diunggah ke Arsip rapat.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Mulai merekam rapat?',
      message: 'Semua peserta akan melihat tanda ● REC. Rekaman tersimpan di Arsip rapat per bagian 5 menit.',
      detail: 'Biarkan tab ini tetap terbuka dan aktif selama merekam supaya videonya tidak patah-patah.',
      confirmLabel: 'Mulai rekam',
      tone: 'rec',
    });
    if (!ok) return;
    try {
      const r = createRecorder({ meetingId: meeting.id, getScene: scene, onState: setRec });
      recorder.current = r;
      r.start();
      call.current?.setRecording(true);
    } catch (e) {
      recorder.current = null;
      alertDialog({ title: 'Rekaman tidak bisa dimulai', message: e.message, tone: 'error' });
    }
  };
  const leave = async () => {
    // peserta terakhir yang keluar menutup rapat -> Queen Bea membuat notulen
    const last = (snapRef.current?.state === 'on' || snapRef.current?.state === 'reconnecting') && !snapRef.current?.peers.length;
    await stopRecording();
    detachAssist();
    await call.current?.leave();
    if (last) await requestRecap(meeting.id);
    go('/hall');
  };
  const end = async () => {
    const ok = await confirmDialog({
      title: 'Akhiri rapat untuk semua peserta?',
      message: 'Semua peserta akan keluar dari ruang rapat. Queen Bea lalu menyusun notulen dan laporan di Arsip rapat.',
      confirmLabel: 'Akhiri rapat',
      tone: 'end',
    });
    if (!ok) return;
    await stopRecording(); // bagian terakhir diunggah dulu, baru rapat ditutup
    detachAssist();
    await call.current?.leave();
    await requestRecap(meeting.id);
    go('/hall');
  };

  const s = snap || { state: 'idle', peers: [], micOn: true, camOn: true, net: 'good' };
  let body;
  if (!useCloudflare)
    body = (
      <div className="vm-center">
        <p>Rapat video sedang dinonaktifkan. Rapat berjalan sebagai rapat suara di Hive Hall.</p>
        <button className="vm-join" onClick={() => go('/hall')}>
          Ke Hive Hall
        </button>
      </div>
    );
  else if (meeting === undefined) body = <div className="vm-center">Memuat rapat…</div>;
  else if (!meeting)
    body = (
      <div className="vm-center">
        <p>{meetingId ? 'Rapat tidak ditemukan.' : 'Belum ada rapat berjalan.'}</p>
        <button className="vm-join" onClick={() => go('/hall')}>
          Buka kalender di Hive Hall
        </button>
      </div>
    );
  else if (ended || meeting.status !== 'live' || s.state === 'left')
    body = (
      <div className="vm-center">
        <p>{ended || (meeting.status !== 'live' ? 'Rapat ini sudah selesai.' : 'Anda sudah keluar dari rapat.')}</p>
        <button className="vm-join" onClick={() => go('/hall')}>
          Ke Hive Hall
        </button>
      </div>
    );
  else if (s.state === 'kicked')
    body = (
      <div className="vm-center">
        <p>Anda dikeluarkan dari rapat ini oleh host.</p>
        <button className="vm-join" onClick={() => go('/hall')}>
          Ke Hive Hall
        </button>
      </div>
    );
  else if (s.state === 'on' || s.state === 'reconnecting')
    body = (
      <Room
        meeting={meeting}
        account={{ ...account, id: uid }}
        snap={s}
        levels={levels}
        call={call.current}
        sinkId={sinkId}
        setSinkId={setSinkId}
        chat={chat}
        unread={unread}
        panel={panel}
        setPanel={setPanel}
        onLeave={leave}
        onEnd={end}
        notices={notices}
        onMic={setMic}
        rec={rec}
        onRecord={RECORDING_ENABLED && canRecord ? toggleRecord : null}
      />
    );
  else if (s.state === 'error' && s.local === null)
    body = (
      <div className="vm-center">
        <p className="vm-err">{s.error}</p>
        <button className="vm-join" onClick={() => call.current?.retry()}>
          Sambung ulang
        </button>
      </div>
    );
  else body = call.current && <PreJoin meeting={meeting} account={account} snap={s} levels={levels} call={call.current} sinkId={sinkId} setSinkId={setSinkId} error={s.error} />;

  return (
    <div className="page vm-page">
      {!(s.state === 'on' || s.state === 'reconnecting') && (
        <header className="vm-top">
          <button className="vm-back" onClick={leave}>
            ← Hive Hall
          </button>
        </header>
      )}
      {body}
    </div>
  );
}
