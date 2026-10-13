// Overlay mode TV untuk layar besar: jam WIB, status LIVE, caption ala siaran TV,
// ticker aktivitas, dan kontrol yang hanya muncul saat mouse digerakkan.
import { useEffect, useRef, useState } from 'react';
import { statusText } from '../data/hive';
import { useHive } from '../sim/store';
import { useAuth } from '../sim/auth';
import { outdoor } from '../sim/outdoor';
import { useTv } from '../sim/tv';
import { useAi } from '../hall/queenBea';
import { feedText } from './hallData';
import { go } from './nav';

const DAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DOING = { dance: 'sedang joget', walk: 'jalan-jalan di taman', idle: 'santai di taman' };

function useNow(ms = 1000) {
  const [now, set] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function TvClock() {
  const d = new Date(useNow() + 7 * 3600e3);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return (
    <div className="tv-clock">
      <b>
        {hh}
        <i>:</i>
        {mm}
      </b>
      <span>
        {DAY[d.getUTCDay()]}, {d.getUTCDate()} {MON[d.getUTCMonth()]} · WIB
      </span>
    </div>
  );
}

// status terkini target yang sedang disorot
function useCaptionStatus(c) {
  useNow(1000);
  const st = useHive((s) => (c?.type === 'agent' ? s.agentStates[c.id] : null));
  const real = useAuth((s) => !!s.account);
  const ai = useAi((s) => s.status);
  const prompts = useHive((s) => s.agentPrompts);
  if (!c) return '';
  if (c.type === 'agent') {
    const base = statusText(st);
    if (!real) return base;
    if (c.id === 'ceo') return ai === 'on' ? `Online · tersambung Claude AI · ${base}` : base;
    if (!prompts.includes(c.id)) return `Offline (belum tersambung AI) · ${base}`;
    return st?.missionId ? `Mengerjakan tugas sungguhan · Claude via n8n` : `Online · Claude via n8n · ${base}`;
  }
  if (c.type === 'staff') {
    const w = outdoor.byId[c.id] || outdoor.walkers.find((x) => x.id === c.id);
    return w ? DOING[w.state] || 'di koloni' : 'di koloni';
  }
  return c.sub;
}

function Ticker() {
  const real = useAuth((s) => !!s.account);
  const db = useHive((s) => s.dbActivity);
  const log = useHive((s) => s.log);
  const items = (real ? db.map((a) => a.text) : log.map((e) => feedText(e))).slice(0, 6);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 6000);
    return () => clearInterval(id);
  }, []);
  if (!items.length) return null;
  const text = items[i % items.length];
  return (
    <div className="tv-ticker">
      <span className="tv-ticker-tag">Aktivitas</span>
      <span key={text} className="tv-ticker-text">
        {text}
      </span>
    </div>
  );
}

export function TvOverlay() {
  const caption = useTv((s) => s.caption);
  const next = useTv((s) => s.next);
  const status = useCaptionStatus(caption);
  const online = useHive((s) => s.onlineStaff.length);
  const real = useAuth((s) => !!s.account);
  const ai = useAi((s) => s.status);
  const prompts = useHive((s) => s.agentPrompts);
  const [ctrl, setCtrl] = useState(false);
  const hideTimer = useRef(null);

  // kontrol & kursor muncul saat mouse bergerak, hilang lagi setelah 3 detik
  useEffect(() => {
    const show = () => {
      setCtrl(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setCtrl(false), 3000);
    };
    const key = (e) => {
      if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') next();
      if (e.key === 'f' || e.key === 'F') fullscreen();
    };
    window.addEventListener('mousemove', show);
    window.addEventListener('touchstart', show);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('touchstart', show);
      window.removeEventListener('keydown', key);
      clearTimeout(hideTimer.current);
    };
  }, [next]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    go('/');
  };

  return (
    <div className={`tv${ctrl ? ' tv-active' : ''}`}>
      <div className="tv-top">
        <div className="tv-brand">
          <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#F5B700" stroke="#8A5A00" strokeWidth="2.5" />
            <rect x="9" y="16" width="22" height="3.5" fill="#3A2A12" />
            <rect x="9" y="23" width="22" height="3.5" fill="#3A2A12" />
          </svg>
          <div>
            <b>Hive Colony</b>
            <span>{real ? 'Kantor virtual · mode real' : 'Kantor virtual · simulasi'}</span>
          </div>
        </div>
        <TvClock />
        <div className="tv-live">
          <span className="tv-live-badge">● LIVE</span>
          {real && (
            <span>
              {online + 1} staff online · {(ai === 'on' ? 1 : 0) + prompts.filter((id) => id !== 'ceo').length}/21 agent AI
            </span>
          )}
        </div>
      </div>

      {caption && (
        <div key={`${caption.type}-${caption.id || caption.title}`} className={`tv-lower tv-${caption.type}`} style={caption.color ? { '--c': caption.color } : undefined}>
          <span className="tv-kicker">{caption.kicker}</span>
          <b className="tv-title">
            {caption.id === 'ceo' && '👑 '}
            {caption.title}
          </b>
          {caption.sub && caption.type !== 'floor' && caption.type !== 'orbit' && <span className="tv-sub">{caption.sub}</span>}
          {status && <span className="tv-status">{status}</span>}
        </div>
      )}

      <Ticker />

      <div className="tv-ctrl" aria-hidden={!ctrl}>
        <button onClick={next}>⏭ Shot berikutnya</button>
        <button onClick={fullscreen}>⛶ Layar penuh</button>
        <button onClick={exit}>✕ Keluar mode TV</button>
      </div>
    </div>
  );
}
