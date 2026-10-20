// Uji video call Cloudflare Realtime (#/video), tahap 1: dua orang saling lihat & dengar.
// Masuk ke rapat Hive Hall yang sedang berjalan; owner bisa membuka rapat uji kalau belum ada.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';
import { createCfCall } from '../hall/rtc/cfCall';
import { requestRecap } from '../hall/meeting';
import { go } from './nav';

function Video({ stream, muted, mirror }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={mirror ? 'mirror' : ''} />;
}

function Tile({ name, stream, cam, mic, me }) {
  const hasVideo = cam && stream?.getVideoTracks().length > 0;
  return (
    <div className="vt-tile">
      {stream && <Video stream={stream} muted={me} mirror={me} />}
      {!hasVideo && (
        <div className="vt-avatar" aria-hidden="true">
          {(name || '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="vt-name">
        {!mic && '🔇 '}
        {name}
        {me && ' (Anda)'}
      </span>
    </div>
  );
}

export function VideoTestPage() {
  const account = useAuth((s) => s.account);
  const uid = useAuth((s) => s.session?.user?.id);
  const [meeting, setMeeting] = useState(undefined); // undefined = memuat, null = tidak ada rapat
  const [snap, setSnap] = useState(null);
  const [notice, setNotice] = useState('');
  const call = useRef(null);

  const loadMeeting = async () => {
    const { data } = await supabase.from('hc_meetings').select('id, title, started_at').eq('status', 'live').order('started_at', { ascending: false }).limit(1);
    setMeeting(data?.[0] || null);
  };
  useEffect(() => {
    loadMeeting();
  }, []);

  // satu objek call per rapat; kamera langsung tampil sebagai preview
  useEffect(() => {
    if (!meeting || !account || !uid) return undefined;
    const c = createCfCall({ meetingId: meeting.id, me: { id: uid, name: account.name }, onChange: setSnap });
    call.current = c;
    c.preview().catch((e) => setNotice(e.message));
    const bye = () => c.leave();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      c.leave();
      call.current = null;
    };
  }, [meeting?.id, account, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTest = async () => {
    const { error } = await supabase.from('hc_meetings').insert({ title: 'Uji video Cloudflare' });
    if (error && error.code !== '23505') setNotice(`Gagal membuka rapat: ${error.message}`);
    loadMeeting();
  };
  const end = async () => {
    if (!meeting || !window.confirm('Akhiri rapat untuk semua peserta? Queen Bea akan membuat notulen.')) return;
    await call.current?.leave();
    await requestRecap(meeting.id);
    go('/hall');
  };

  const s = snap || { state: 'idle', peers: [], micOn: true, camOn: true };
  const inCall = s.state === 'on';
  const owner = account?.role === 'owner';

  return (
    <div className="page vt-page">
      <header className="vt-top">
        <button className="back" onClick={() => go('/hall')}>
          ← Hive Hall
        </button>
        <div>
          <b>{meeting?.title || 'Video call'}</b>
          <small>Uji Cloudflare Realtime · tahap 1</small>
        </div>
      </header>

      {meeting === undefined && <p className="vt-note">Memuat…</p>}
      {meeting === null && (
        <div className="vt-card">
          <p>Belum ada rapat berjalan.</p>
          {owner ? (
            <button className="save" onClick={startTest}>
              Mulai rapat uji
            </button>
          ) : (
            <p className="vt-note">Minta owner membuka rapat dulu, lalu buka halaman ini lagi.</p>
          )}
        </div>
      )}
      {(notice || s.error) && <div className="vt-error">{s.error || notice}</div>}

      {meeting && (
        <>
          <div className={`vt-grid n${Math.min(s.peers.length + 1, 4)}`}>
            <Tile name={account?.name} stream={s.local} cam={s.camOn} mic={s.micOn} me />
            {s.peers.map((p) => (
              <Tile key={p.key} name={p.name} stream={p.stream} cam={p.cam} mic={p.mic} />
            ))}
          </div>
          {inCall && s.peers.length === 0 && <p className="vt-note">Menunggu peserta lain. Buka #/video dengan akun lain untuk menguji.</p>}
          <div className="vt-bar">
            <button className={`hbtn${s.micOn ? ' pri' : ''}`} onClick={() => call.current?.setMic(!s.micOn)} disabled={!s.local}>
              {s.micOn ? '🎙 Mic' : '🔇 Mic mati'}
            </button>
            <button className={`hbtn${s.camOn ? ' pri' : ''}`} onClick={() => call.current?.setCam(!s.camOn)} disabled={!s.local?.getVideoTracks().length}>
              {s.camOn ? '📷 Kamera' : '🚫 Kamera mati'}
            </button>
            {!inCall ? (
              <button className="hbtn pri main" onClick={() => call.current?.join()} disabled={s.state === 'connecting'}>
                {s.state === 'connecting' ? 'Menyambungkan…' : s.state === 'error' ? 'Coba lagi' : 'Masuk rapat'}
              </button>
            ) : (
              <button className="hbtn danger" onClick={() => call.current?.leave().then(() => go('/hall'))}>
                Keluar
              </button>
            )}
            {inCall && owner && (
              <button className="hbtn danger solid" onClick={end}>
                ⏹ Akhiri rapat
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
