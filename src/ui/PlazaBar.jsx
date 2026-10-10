// Bar "Ngobrol di koloni" (public mic) untuk staff yang login, di halaman koloni.
import { useEffect } from 'react';
import { useAuth } from '../sim/auth';
import { usePlaza, startPlazaWatch, stopPlazaWatch } from '../sim/plaza';

const names = (list, max = 2) => {
  const n = list.map((p) => p.name || 'Staff');
  return n.length <= max ? n.join(', ') : `${n.slice(0, max).join(', ')} +${n.length - max}`;
};

export function PlazaBar() {
  const account = useAuth((s) => s.account);
  const p = usePlaza();

  // pantau obrolan selama halaman koloni terbuka; keluar otomatis saat pindah halaman
  useEffect(() => {
    if (!account) return undefined;
    startPlazaWatch();
    return () => stopPlazaWatch();
  }, [account]);

  if (!account) return null;

  if (p.state === 'on') {
    const talking = new Set(p.talking);
    return (
      <div className="plaza on" role="region" aria-label="Obrolan koloni">
        <span className="plaza-live" aria-hidden="true" />
        <div className="plaza-people">
          <b>Ngobrol di koloni</b>
          <span>
            {p.peers.length === 0
              ? 'Menunggu yang lain bergabung…'
              : p.peers.map((x) => (
                  <i key={x.id} className={talking.has(`u-${x.id}`) ? 'talk' : ''}>
                    {x.muted ? '🔇 ' : ''}
                    {x.name || 'Staff'}
                  </i>
                ))}
          </span>
        </div>
        {p.audioBlocked && (
          <button className="plaza-btn pri" onClick={p.unlockAudio}>
            🔈 Aktifkan suara
          </button>
        )}
        <button className={`plaza-btn${p.mic ? ' pri' : ''}${talking.has('me') ? ' talk' : ''}`} onClick={p.toggleMic} aria-label={p.mic ? 'Matikan mic' : 'Nyalakan mic'}>
          {p.mic ? '🎙' : '🔇'}
        </button>
        <button className="plaza-btn danger" onClick={() => p.leave()}>
          Keluar
        </button>
        {p.error && <div className="plaza-msg">{p.error}</div>}
      </div>
    );
  }

  return (
    <div className="plaza">
      <button className="plaza-join" onClick={p.join} disabled={p.state === 'connecting'}>
        <span aria-hidden="true">{p.state === 'connecting' ? '⏳' : '🎙'}</span>
        {p.state === 'connecting' ? 'Menyambungkan…' : p.waiting.length ? `${names(p.waiting)} sedang ngobrol · Gabung` : 'Ngobrol di koloni'}
        {p.waiting.length > 0 && <span className="plaza-dot" aria-hidden="true" />}
      </button>
      {(p.error || p.notice) && <div className="plaza-msg">{p.error || p.notice}</div>}
    </div>
  );
}
