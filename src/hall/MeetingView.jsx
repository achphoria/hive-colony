import { useEffect, useRef, useState } from 'react';
import { useMeeting, AI_GUESTS } from './meeting';
import { canTranscribe } from './voice';
import { useAuth } from '../sim/auth';
import { useHive } from '../sim/store';

const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };

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
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function VoiceStatus({ m }) {
  if (!m.live) return null;
  if (m.voice === 'connecting') return <div className="voice-note">⏳ Menyambungkan suara…</div>;
  if (m.voice === 'error')
    return (
      <div className="voice-note warn">
        <span>⚠ {m.voiceError || 'Suara belum tersambung.'}</span>
        <button className="hbtn" onClick={m.retryVoice}>
          Sambung ulang
        </button>
      </div>
    );
  if (m.audioBlocked)
    return (
      <div className="voice-note">
        <span>🔈 Browser menahan suara peserta lain.</span>
        <button className="hbtn pri" onClick={m.unlockAudio}>
          Aktifkan suara
        </button>
      </div>
    );
  if (m.micError) return <div className="voice-note warn">⚠ {m.micError}</div>;
  if (m.voice === 'on' && m.mic && !canTranscribe)
    return <div className="voice-note">Browser ini belum bisa mentranskrip suara Anda. Suara tetap terdengar; untuk transkrip pakai Chrome atau Edge.</div>;
  return null;
}

function Tile({ name, sub, color, ai, crown, speaking, muted, hand }) {
  return (
    <div className={`mtile${speaking ? ' speaking' : ''}`}>
      {ai && <span className="mtile-ai">AI</span>}
      {(hand || muted) && (
        <span className="mtile-flag">
          {hand && '✋'}
          {muted && '🔇'}
        </span>
      )}
      <div className="mtile-av" style={{ '--c': color }}>
        {crown ? '👑' : initials(name)}
      </div>
      <b>{name}</b>
      <small>{sub}</small>
      {speaking && (
        <div className="mtile-wave" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

export function MeetingView({ onLeave, onReport }) {
  const m = useMeeting();
  const account = useAuth((s) => s.account);
  const profile = useHive((s) => s.profile);
  const [voice, setVoice] = useState(true);
  const [picker, setPicker] = useState(false);
  const elapsed = useElapsed(m.startedAt);
  const listRef = useRef(null);
  const myName = account?.name || profile?.name || 'Anda';
  const nameOf = (who) => {
    if (who === 'me') return myName;
    if (who === 'system') return '';
    return AI_GUESTS.find((a) => a.id === who)?.name || m.people.find((p) => p.id === who)?.name || who;
  };

  useEffect(() => {
    if (!m.joined) m.join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [m.transcript.length]);

  const leave = async () => {
    await m.leave();
    onLeave();
  };
  const kinds = ['kondisi', 'mendesak', 'race'];
  const askIdx = useRef(0);
  const notInvited = AI_GUESTS.filter((a) => !m.aiGuests.includes(a.id));
  const talking = (id) => m.speaking === id || m.talking.includes(id);
  const badge = !m.live
    ? '● Transkrip live oleh AI · demo'
    : m.voice === 'on'
      ? `● Suara tersambung${m.txOn ? ' · transkrip live' : ''}`
      : m.voice === 'connecting'
        ? '○ Menyambungkan suara…'
        : '○ Suara belum tersambung';

  return (
    <div className="meet">
      <div className="meet-head">
        <div>
          <h2>{m.title || 'Rapat koloni'}</h2>
          <span>
            {elapsed} berjalan · {m.people.length + m.aiGuests.length + 1} peserta
          </span>
        </div>
        <span className={`rec-badge${m.live && m.voice !== 'on' ? ' off' : ''}`}>{badge}</span>
      </div>
      <VoiceStatus m={m} />
      <div className="meet-grid">
        <div className="meet-tiles">
          <Tile name={`${myName} (Anda)`} sub={account ? ROLE_LABEL[account.role] : 'Anda'} color={profile?.outfitColor || '#4A6FA5'} speaking={talking('me')} muted={!m.mic} hand={m.hand} />
          {m.aiGuests.map((id) => {
            const a = AI_GUESTS.find((g) => g.id === id);
            return <Tile key={id} name={a.name} sub={a.role} color={a.color} ai crown={a.crown} speaking={talking(id)} />;
          })}
          {m.people.map((p) => (
            <Tile
              key={p.id}
              name={p.name}
              sub={ROLE_LABEL[p.role] || p.role || 'Staff'}
              color={p.color || '#C0C5CE'}
              speaking={talking(p.id)}
              muted={m.voice === 'on' && m.peerMuted.includes(p.id)}
              hand={m.hands.includes(p.id)}
            />
          ))}
          {notInvited.length > 0 && (
            <button className="mtile invite" onClick={() => setPicker(!picker)}>
              <div className="mtile-av">＋</div>
              <b>Undang AI</b>
              <small>Ketua divisi</small>
            </button>
          )}
          {picker && (
            <div className="ai-picker">
              {notInvited.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    m.inviteAi(a.id);
                    m.say(a.id, `Halo, ${a.name} dari ${a.role} sudah bergabung.`);
                    setPicker(false);
                  }}
                >
                  <i style={{ background: a.color }} /> {a.name} · {a.role}
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="meet-side">
          <div className="side-head">
            <b>Transkrip</b>
            <span>{m.transcript.length} baris</span>
          </div>
          <div className="tx-list" ref={listRef}>
            {m.transcript.length === 0 && <p className="muted">Transkrip akan muncul di sini saat ada yang bicara.</p>}
            {m.transcript.map((l) =>
              l.who === 'system' ? (
                <div key={l.id} className="tx sys">
                  {l.t} · {l.text}
                </div>
              ) : (
                <div key={l.id} className={`tx${l.who === 'ceo' ? ' ceo' : ''}`}>
                  <span className="tx-t">{l.t}</span> <b>{l.name || nameOf(l.who)}:</b> {l.text}
                </div>
              ),
            )}
          </div>
          <div className="ai-notes">
            <b>Dicatat AI</b>
            {m.notes.length === 0 && <span className="muted">Keputusan dan tugas baru akan muncul di sini.</span>}
            {m.notes.map((n, i) => (
              <div key={i}>
                {n.type === 'decision' ? '✓ Keputusan: ' : '＋ Tugas: '}
                {n.text}
              </div>
            ))}
          </div>
        </aside>
      </div>
      <div className="meet-bar">
        <button className={`hbtn${m.mic ? ' pri' : ''}`} onClick={m.toggleMic} aria-label={m.mic ? 'Matikan mic' : 'Nyalakan mic'}>
          {m.mic ? '🎙' : '🔇'}
          <span className="lbl">{m.mic ? ' Mic' : ' Mic mati'}</span>
        </button>
        <button className={`hbtn${m.hand ? ' pri' : ''}`} onClick={m.toggleHand} aria-label="Angkat tangan">
          ✋<span className="lbl"> Angkat tangan</span>
        </button>
        <button className="hbtn pri main" onClick={() => m.askChief(kinds[askIdx.current++ % kinds.length], voice)}>
          👑 Tanya<span className="lbl"> Queen Bea</span>
        </button>
        <button className={`hbtn${voice ? ' pri' : ''}`} onClick={() => setVoice(!voice)} aria-label="Suara AI">
          {voice ? '🔊' : '🔈'}
          <span className="lbl"> Suara AI</span>
        </button>
        <button className="hbtn" onClick={onReport} aria-label="Bagikan report">
          📊<span className="lbl"> Bagikan report</span>
        </button>
        <button className="hbtn danger" onClick={leave}>
          Keluar<span className="lbl"> meeting</span>
        </button>
      </div>
      <p className="demo-note">
        {m.live
          ? 'Suara antar-peserta tersambung lewat LiveKit. Transkrip dibuat pengenal suara browser tiap peserta (paling akurat di Chrome/Edge); pakai headset agar suara orang lain tidak ikut tertranskrip. Jawaban Queen Bea masih versi demo.'
          : 'Mode demo: suara dan transkrip disimulasikan. Login sebagai staff untuk meeting dengan suara sungguhan.'}
      </p>
    </div>
  );
}
