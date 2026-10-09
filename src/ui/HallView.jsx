// Hive Hall: ruang rapat manusia + AI (fullscreen). Mode demo: data dinding dibaca live dari simulasi,
// call suara disimulasikan, dan Queen Bea menjawab dengan text-to-speech bawaan browser.
import { useEffect, useRef, useState } from 'react';
import { AGENTS, AGENT_BY_ID, DEPTS } from '../data/hive';
import { DEMO_STAFF, DEFAULT_PROFILE } from '../data/staff';
import { useHive } from '../sim/store';
import { world } from '../sim/engine';
import { outdoor } from '../sim/outdoor';
import { AvatarPreview } from './AvatarPreview';
import { go } from './nav';

/* ---------- utilitas ---------- */

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const hhmm = (h) => {
  if (h === undefined) return '--:--';
  const m = Math.floor((h % 1) * 60);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const wibNow = () => new Date(Date.now() + 7 * 3600e3); // dibaca dengan getter UTC
const dayStart = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

function demoEvents() {
  const base = dayStart(wibNow());
  const mk = (off, title, color, big) => ({ ts: base + off * 864e5, title, color, big });
  return [
    mk(-2, 'Evaluasi skill agent', '#7F77DD'),
    mk(1, 'Kelas HYROX 06.00', '#4A6FA5'),
    mk(2, 'Rapat budget', '#C98A00'),
    mk(4, 'Cek alat race', '#8DBF5A'),
    mk(5, 'Simulation Race', '#FF8C1A', true),
    mk(9, 'Proses payroll', '#D99A2B'),
    mk(12, 'Onboarding coach baru', '#4A6FA5'),
  ];
}

// Teks ringkas untuk layar dinding (lebar terbatas)
function feedText(e) {
  const after = e.text.includes(': ') ? e.text.split(': ').slice(1).join(': ') : e.text;
  switch (e.kind) {
    case 'dispatch':
      return `Misi ${DEPTS[e.dept]?.short || ''}: ${after}`;
    case 'done':
      return e.text.startsWith('Owner') ? e.text : `${e.text.split(' ')[0]} selesai misi`;
    case 'meeting':
      return 'Rapat di Comb Hall';
    case 'guest':
      return 'Tamu masuk Hive Lobby';
    case 'clock':
      return e.text.startsWith('Malam') ? 'Malam: jaga malam aktif' : 'Pagi: koloni bangun';
    default:
      return e.text;
  }
}

function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function skillScores() {
  return AGENTS.filter((a) => a.id !== 'ceo')
    .map((a) => {
      const base = 70 + ((a.id.length * 7 + a.id.charCodeAt(0)) % 15);
      const done = world.doneBy[a.id] || 0;
      return { id: a.id, nick: a.nick, done, score: Math.min(99, base + done * 3) };
    })
    .sort((x, y) => y.score - x.score);
}

function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('id'));
  if (voice) u.voice = voice;
  u.lang = 'id-ID';
  u.rate = 1.02;
  u.pitch = 1.05;
  synth.speak(u);
  return true;
}

/* ---------- ruang rapat ---------- */

function AiBee({ x, y, crown }) {
  return (
    <g>
      <use href="#hh-aib" x={x} y={y} width="56" height="74" />
      {crown && (
        <polygon
          points={`${x + 20},${y + 4} ${x + 24},${y - 4} ${x + 28},${y + 2} ${x + 32},${y - 4} ${x + 36},${y + 4}`}
          fill="#FFD54A"
          stroke="#8A5A00"
          strokeWidth="0.8"
        />
      )}
    </g>
  );
}

function Wave({ x, y }) {
  return (
    <g className="wave" fill="#FF8C1A">
      <rect x={x} y={y + 4} width="3.5" height="14" rx="1.7" />
      <rect x={x + 6} y={y} width="3.5" height="22" rx="1.7" />
      <rect x={x + 12} y={y + 4} width="3.5" height="14" rx="1.7" />
    </g>
  );
}

function MeetingRoom({ me, dina, call }) {
  const log = useHive((s) => s.log);
  const missions = useHive((s) => s.missions);
  const stats = useHive((s) => s.stats);
  const approvals = useHive((s) => s.approvals);
  const agentStates = useHive((s) => s.agentStates);

  const feed = log.slice(0, 5).map((e) => ({ t: hhmm(e.clock), text: feedText(e) }));
  while (feed.length < 5) feed.push({ t: '--:--', text: 'Menunggu aktivitas…' });

  const pending = approvals.filter((a) => a.status === 'pending');
  const open = [
    ...pending.map((a) => ({ title: a.title, sub: `${a.by} · tunggu Anda`, color: '#E24B4A' })),
    ...[...missions]
      .sort((a, b) => a.progress - b.progress)
      .map((m) => ({
        title: m.title,
        sub: `${AGENT_BY_ID[m.leadId].nick} · ${Math.round(m.progress * 100)}%`,
        color: m.progress < 0.3 ? '#F5B700' : '#C0C5CE',
      })),
  ];

  const now = wibNow();
  const dow = (now.getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + (i - dow) * 864e5));
  const wStart = dayStart(week[0]);
  const wEnd = wStart + 7 * 864e5;
  const events = demoEvents().filter((e) => e.ts >= wStart && e.ts < wEnd).slice(0, 4);

  const awake = Object.values(agentStates).filter((a) => a.state !== 'sleep').length;
  const tickerText = `Madu ${stats.honey} · Misi selesai ${stats.done} · Misi berjalan ${missions.length} · Agent aktif ${awake}/21 · Persetujuan menunggu ${pending.length} · Jam ${hhmm(stats.clock)} WIB · `;

  const online = [
    { name: `${me.name || 'Anda'} (Anda)`, color: me.outfitColor, where: 'rapat', here: true },
    { name: dina.name, color: dina.outfitColor, where: 'rapat', here: true },
    ...DEMO_STAFF.slice(1).map((s) => {
      const w = outdoor.byId[s.id];
      return { name: s.name, color: s.outfitColor, where: w?.state === 'dance' ? 'joget di taman' : s.spot };
    }),
  ].slice(0, 4);

  const skills = skillScores();
  const topSkill = skills.slice(0, 4);
  const mover = [...skills].sort((a, b) => b.done - a.done)[0];

  const speaking = call.speaker;
  return (
    <svg className="hall-svg" viewBox="0 0 680 400" role="img" aria-label="Ruang rapat Hive Hall">
      <defs>
        <symbol id="hh-aib" viewBox="-30 -50 60 80">
          <ellipse cx="-20" cy="-6" rx="10" ry="6" fill="#fff" stroke="#C0C5CE" />
          <ellipse cx="20" cy="-6" rx="10" ry="6" fill="#fff" stroke="#C0C5CE" />
          <rect x="-14" y="-4" width="28" height="28" rx="12" fill="#FFB020" />
          <rect x="-14" y="6" width="28" height="4" fill="#3A2A12" />
          <line x1="-8" y1="-38" x2="-13" y2="-48" stroke="#3A2A12" strokeWidth="2" />
          <line x1="8" y1="-38" x2="13" y2="-48" stroke="#3A2A12" strokeWidth="2" />
          <circle cx="-13" cy="-48" r="3" fill="#FF8C1A" />
          <circle cx="13" cy="-48" r="3" fill="#FF8C1A" />
          <circle cx="0" cy="-22" r="19" fill="#F5B700" stroke="#8A5A00" />
          <circle cx="0" cy="-19" r="14" fill="#FFE0BD" />
          <path d="M-14 -24 Q0 -36 14 -24 Q0 -30 -14 -24Z" fill="#6B4416" />
          <circle cx="-5" cy="-18" r="2" fill="#2B2B2E" />
          <circle cx="5" cy="-18" r="2" fill="#2B2B2E" />
          <path d="M-3 -12 Q0 -10 3 -12" fill="none" stroke="#6B4416" strokeWidth="1.2" />
        </symbol>
        <clipPath id="hh-tk">
          <rect x="100" y="186" width="480" height="18" rx="4" />
        </clipPath>
      </defs>
      {/* ruangan */}
      <polygon points="0,0 680,0 590,20 90,20" fill="#FFF3D6" />
      <polygon points="0,0 90,20 90,220 0,300" fill="#FCEBC4" />
      <polygon points="680,0 590,20 590,220 680,300" fill="#FCEBC4" />
      <rect x="90" y="20" width="500" height="200" fill="#FFF8E7" />
      <polygon points="90,220 590,220 680,300 680,400 0,400 0,300" fill="#F3E3C0" />
      <g stroke="#E7C98A" fill="none" opacity="0.7">
        <line x1="90" y1="220" x2="0" y2="300" />
        <line x1="590" y1="220" x2="680" y2="300" />
      </g>
      {[220, 460].map((x) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2="10" stroke="#C98A00" />
          <polygon points={`${x},10 ${x + 8},14 ${x + 8},22 ${x},26 ${x - 8},22 ${x - 8},14`} fill="#FFD54A" stroke="#C98A00" />
        </g>
      ))}
      <text x="340" y="33" textAnchor="middle" fontSize="11" letterSpacing="3" fill="#8A5A00">
        HIVE HALL
      </text>
      <g fill="#DCEBF7" stroke="#C98A00" strokeWidth="1.5">
        <polygon points="35,85 47,92 47,106 35,113 23,106 23,92" />
        <polygon points="59,95 71,102 71,116 59,123 47,116 47,102" />
        <polygon points="35,113 47,120 47,134 35,141 23,134 23,120" />
        <polygon points="59,123 71,130 71,144 59,151 47,144 47,130" />
      </g>
      <rect x="636" y="120" width="22" height="34" rx="4" fill="#FFFDF7" stroke="#C98A00" />
      <circle cx="647" cy="132" r="6" fill="#FFD54A" />

      {/* layar 1: aktivitas live */}
      <rect x="100" y="40" width="152" height="140" rx="6" fill="#FFFDF7" stroke="#C98A00" />
      <path d="M100 46 a6 6 0 0 1 6 -6 h140 a6 6 0 0 1 6 6 v14 h-152z" fill="#F5B700" />
      <circle className="live-dot" cx="110" cy="50" r="3.5" fill="#E24B4A" />
      <text x="118" y="54" fontSize="11" fontWeight="600" fill="#3A2A12">
        Aktivitas live
      </text>
      {feed.map((f, i) => (
        <g key={`${i}-${f.text}`} className="feed-row" fontSize="10.5">
          <text x="106" y={76 + i * 22} fill="#8A6A3A">
            {f.t}
          </text>
          <text x="137" y={76 + i * 22} fill="#3A2A12">
            {cut(f.text, 20)}
          </text>
        </g>
      ))}

      {/* layar 2: kalender minggu ini */}
      <rect x="262" y="40" width="156" height="140" rx="6" fill="#FFFDF7" stroke="#C98A00" />
      <path d="M262 46 a6 6 0 0 1 6 -6 h144 a6 6 0 0 1 6 6 v14 h-156z" fill="#F5B700" />
      <text x="270" y="54" fontSize="11" fontWeight="600" fill="#3A2A12">
        Kalender minggu ini
      </text>
      {week.map((d, i) => (
        <g key={i} fontSize="10" textAnchor="middle">
          <text x={279 + i * 20} y="74" fill="#8A6A3A">
            {DAY[d.getUTCDay()][0]}
          </text>
          {i === dow && <rect x={270 + i * 20} y="78" width="18" height="16" rx="3" fill="#F5B700" />}
          <text x={279 + i * 20} y="90" fill="#3A2A12" fontWeight={i === dow ? 600 : 400}>
            {d.getUTCDate()}
          </text>
        </g>
      ))}
      {events.length === 0 && (
        <text x="270" y="113" fontSize="11" fill="#8A6A3A">
          Belum ada agenda minggu ini
        </text>
      )}
      {events.map((e, i) => {
        const d = new Date(e.ts);
        const label = `${DAY[d.getUTCDay()]} ${d.getUTCDate()} · ${e.title}`;
        return e.big ? (
          <g key={i}>
            <rect x="268" y={100 + i * 20} width="144" height="16" rx="3" fill="#FFE2C2" />
            <text x="276" y={112 + i * 20} fontSize="10.5" fill="#993C1D" fontWeight="600">
              {cut(label, 26)}
            </text>
          </g>
        ) : (
          <g key={i}>
            <rect x="270" y={100 + i * 20} width="4" height="14" fill={e.color} />
            <text x="279" y={111 + i * 20} fontSize="10.5" fill="#3A2A12">
              {cut(label, 26)}
            </text>
          </g>
        );
      })}

      {/* layar 3: belum selesai */}
      <rect x="428" y="40" width="152" height="140" rx="6" fill="#FFFDF7" stroke="#C98A00" />
      <path d="M428 46 a6 6 0 0 1 6 -6 h140 a6 6 0 0 1 6 6 v14 h-152z" fill="#FF8C1A" />
      <text x="436" y="54" fontSize="11" fontWeight="600" fill="#FFF8E7">
        Belum selesai · {open.length}
      </text>
      {open.slice(0, 4).map((o, i) => (
        <g key={i}>
          <rect x="434" y={66 + i * 28} width="3" height="24" fill={o.color} />
          <text x="442" y={76 + i * 28} fontSize="10.5" fill="#3A2A12">
            {cut(o.title, 22)}
          </text>
          <text x="442" y={88 + i * 28} fontSize="9.5" fill="#8A6A3A">
            {cut(o.sub, 26)}
          </text>
        </g>
      ))}
      {open.length === 0 && (
        <text x="436" y="80" fontSize="11" fill="#3B6D11">
          Semua beres
        </text>
      )}

      {/* ticker */}
      <rect x="100" y="186" width="480" height="18" rx="4" fill="#FCE7B0" />
      <g clipPath="url(#hh-tk)">
        <g className="ticker" fontSize="11" fill="#633806">
          <text x="110" y="199">
            {tickerText}
            {tickerText}
          </text>
        </g>
      </g>

      {/* layar berdiri: sedang online */}
      <rect x="54" y="336" width="8" height="34" fill="#C98A00" />
      <ellipse cx="58" cy="372" rx="24" ry="5" fill="#C98A00" />
      <rect x="6" y="222" width="104" height="118" rx="7" fill="#FFFDF7" stroke="#C98A00" strokeWidth="1.5" />
      <path d="M6 229 a7 7 0 0 1 7 -7 h90 a7 7 0 0 1 7 7 v13 h-104z" fill="#4A6FA5" />
      <text x="14" y="236" fontSize="11" fontWeight="600" fill="#FFFFFF">
        Sedang online · {DEMO_STAFF.length + 1}
      </text>
      {online.map((o, i) => (
        <g key={o.name} fontSize="10">
          <circle cx="20" cy={256 + i * 20} r="6" fill={o.color} />
          <circle className={o.here ? 'live-dot' : ''} cx="24" cy={260 + i * 20} r="2.5" fill={o.here ? '#8DBF5A' : '#F5B700'} />
          <text x="31" y={260 + i * 20} fill="#3A2A12">
            {cut(`${o.name.replace(' (Anda)', '')} · ${o.where}`, 16)}
          </text>
        </g>
      ))}
      <text x="14" y="334" fontSize="9.5" fill="#8A6A3A">
        +1 lagi di taman
      </text>

      {/* layar berdiri: skor skill agent */}
      <rect x="618" y="336" width="8" height="34" fill="#C98A00" />
      <ellipse cx="622" cy="372" rx="24" ry="5" fill="#C98A00" />
      <rect x="570" y="222" width="104" height="118" rx="7" fill="#FFFDF7" stroke="#C98A00" strokeWidth="1.5" />
      <path d="M570 229 a7 7 0 0 1 7 -7 h90 a7 7 0 0 1 7 7 v13 h-104z" fill="#8DBF5A" />
      <text x="578" y="236" fontSize="11" fontWeight="600" fill="#173404">
        Skor skill agent
      </text>
      {topSkill.map((k, i) => (
        <g key={k.id} fontSize="10">
          <text x="576" y={260 + i * 20} fill="#3A2A12">
            {k.nick}
          </text>
          <rect x="616" y={252 + i * 20} width="34" height="7" rx="3.5" fill="#F3E3C0" />
          <rect x="616" y={252 + i * 20} width={(34 * k.score) / 100} height="7" rx="3.5" fill={k.score >= 85 ? '#F5B700' : '#FF8C1A'} />
          <text x="670" y={260 + i * 20} textAnchor="end" fill="#3A2A12">
            {k.score}
          </text>
        </g>
      ))}
      <text x="577" y="334" fontSize="9.5" fill="#3B6D11">
        {mover && mover.done > 0 ? `▲ ${mover.nick} +${mover.done} misi selesai` : 'Skor naik tiap misi beres'}
      </text>

      {/* meja dan peserta */}
      <ellipse cx="340" cy="304" rx="170" ry="44" fill="#FFC93C" opacity="0.25" />
      <g className={speaking === 'ceo' ? 'speaking' : speaking === 'thinking' ? 'thinking' : ''}>
        <ellipse className="ring" cx="340" cy="266" rx="28" ry="8" fill="none" stroke="#FF8C1A" strokeWidth="3" />
        <AiBee x={312} y={194} crown />
        <Wave x={372} y={204} />
        <g className="think" fill="#FF8C1A">
          <circle cx="374" cy="206" r="3" />
          <circle cx="383" cy="206" r="3" />
          <circle cx="392" cy="206" r="3" />
        </g>
      </g>
      <AiBee x={230} y={204} />
      <circle cx="282" cy="214" r="8" fill="#E24B4A" />
      <line x1="277" y1="209" x2="287" y2="219" stroke="#fff" strokeWidth="2" />
      <AiBee x={394} y={204} />
      <polygon points="250,306 290,284 390,284 430,306 390,328 290,328" fill="#C98A00" />
      <polygon points="250,298 290,276 390,276 430,298 390,320 290,320" fill="#F5B700" stroke="#8A5A00" />
      <polygon points="318,298 329,290 351,290 362,298 351,306 329,306" fill="#FFF3C4" stroke="#FF8C1A" />
      <text x="340" y="302" textAnchor="middle" fontSize="10" fill="#8A5A00">
        Rencana v2
      </text>
      <svg x="122" y="300" width="56" height="70" viewBox="0 0 200 250" style={{ overflow: 'visible' }}>
        <AvatarPreview p={dina} pose="idle" showBadge={false} className="avp-mini" />
      </svg>
      <circle cx="174" cy="308" r="9" fill="#F5B700" />
      <text x="174" y="312" textAnchor="middle" fontSize="10">
        ✋
      </text>
      <g className={speaking === 'me' ? 'speaking' : ''}>
        <ellipse className="ring" cx="226" cy="386" rx="28" ry="8" fill="none" stroke="#FF8C1A" strokeWidth="3" />
        <svg x="198" y="314" width="56" height="70" viewBox="0 0 200 250" style={{ overflow: 'visible' }}>
          <AvatarPreview p={me} pose="idle" showBadge={false} className="avp-mini" />
        </svg>
        <Wave x={256} y={324} />
        {!call.mic && (
          <g>
            <circle cx="252" cy="320" r="8" fill="#E24B4A" />
            <line x1="247" y1="315" x2="257" y2="325" stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </g>
      <AiBee x={456} y={314} />
      <g fontSize="10.5" textAnchor="middle">
        <rect x="306" y="272" width="68" height="15" rx="7.5" fill="#3A2A12" />
        <text x="340" y="283" fill="#FFF3C4">
          Queen Bea
        </text>
        <rect x="222" y="280" width="72" height="15" rx="7.5" fill="#FFFDF7" stroke="#E7C98A" />
        <text x="258" y="291" fill="#3A2A12">
          Sprint · Ops
        </text>
        <rect x="386" y="280" width="72" height="15" rx="7.5" fill="#FFFDF7" stroke="#E7C98A" />
        <text x="422" y="291" fill="#3A2A12">
          Spark · Mkt
        </text>
        <rect x="114" y="378" width="72" height="15" rx="7.5" fill="#DCE6F4" />
        <text x="150" y="389" fill="#0C447C">
          {dina.name} · Ops
        </text>
        <rect x="452" y="374" width="72" height="15" rx="7.5" fill="#FFFDF7" stroke="#E7C98A" />
        <text x="488" y="385" fill="#3A2A12">
          Graph · Fin
        </text>
      </g>
    </svg>
  );
}

/* ---------- call suara (demo) ---------- */

function buildAnswer(kind) {
  const s = useHive.getState();
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const lowest = [...s.missions].sort((a, b) => a.progress - b.progress)[0];
  if (kind === 'kondisi') {
    return {
      q: 'Queen Bea, gimana kondisi koloni sekarang?',
      a: `Saat ini ${s.missions.length} misi sedang berjalan, ${s.stats.done} misi sudah selesai, dan madu kita ${s.stats.honey}. ${
        pending.length ? `Ada ${pending.length} persetujuan yang menunggu Anda.` : 'Tidak ada persetujuan yang menunggu.'
      }`,
      note: pending.length ? `Ingatkan Owner: ${pending.length} persetujuan` : null,
    };
  }
  if (kind === 'mendesak') {
    return {
      q: 'Queen Bea, apa yang paling mendesak?',
      a: lowest
        ? `Yang paling perlu dikejar: "${lowest.title}" oleh ${AGENT_BY_ID[lowest.leadId].nick}, baru ${Math.round(lowest.progress * 100)} persen. Saya minta dia memberi update dalam satu jam.`
        : 'Belum ada misi yang macet. Semua agent sedang lancar.',
      note: lowest ? `Follow up: ${cut(lowest.title, 34)}` : null,
    };
  }
  const ev = demoEvents().find((e) => e.big);
  const days = Math.round((ev.ts - dayStart(wibNow())) / 864e5);
  return {
    q: 'Queen Bea, persiapan race sudah sampai mana?',
    a: `${ev.title} tinggal ${days} hari lagi. Rute dan iklan sedang dikerjakan Sprint dan Spark, sementara Dina masih perlu meminjam 2 sled.`,
    note: 'Cek status pinjam sled bersama Dina',
  };
}

function useDemoCall() {
  const [call, setCall] = useState({ speaker: null, caption: '', mic: true, voice: true, notes: [] });
  const timers = useRef([]);
  const order = useRef(0);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const ask = () => {
    timers.current.forEach(clearTimeout);
    const kinds = ['kondisi', 'mendesak', 'race'];
    const r = buildAnswer(kinds[order.current++ % kinds.length]);
    setCall((c) => ({ ...c, speaker: c.mic ? 'me' : null, caption: c.mic ? `Anda: ${r.q}` : 'Mic Anda mati. Nyalakan mic untuk bertanya.' }));
    timers.current.push(
      setTimeout(() => setCall((c) => (c.mic ? { ...c, speaker: 'thinking', caption: 'Queen Bea mendengar namanya dan sedang berpikir…' } : c)), 2600),
      setTimeout(() => {
        setCall((c) => {
          if (!c.mic) return c;
          if (c.voice) speak(r.a);
          return { ...c, speaker: 'ceo', caption: `Queen Bea: ${r.a}`, notes: r.note ? [r.note, ...c.notes].slice(0, 3) : c.notes };
        });
      }, 4400),
      setTimeout(() => setCall((c) => ({ ...c, speaker: null })), 11000),
    );
  };
  return { call, setCall, ask };
}

/* ---------- tab lain ---------- */

function PlanBoard() {
  const tasks = useHive((s) => s.planTasks);
  const missions = useHive((s) => s.missions);
  const log = useHive((s) => s.log);
  const advance = useHive((s) => s.advanceTask);
  const done = log.filter((e) => e.kind === 'done').slice(0, 4);
  const cols = [
    { id: 'todo', name: 'Belum', color: '#C0C5CE' },
    { id: 'doing', name: 'Jalan', color: '#F5B700' },
    { id: 'done', name: 'Selesai', color: '#8DBF5A' },
  ];
  return (
    <div className="kanban">
      {cols.map((c) => (
        <div key={c.id} className="kcol">
          <div className="khead" style={{ borderColor: c.color }}>
            {c.name}
            <em>
              {tasks.filter((t) => t.col === c.id).length + (c.id === 'doing' ? missions.length : c.id === 'done' ? done.length : 0)}
            </em>
          </div>
          {tasks
            .filter((t) => t.col === c.id)
            .map((t) => (
              <button key={t.id} className={`kcard ${t.kind}`} onClick={() => advance(t.id)} title="Klik untuk pindah kolom">
                <span className={`who ${t.kind}`}>{t.who}</span>
                <p>{t.title}</p>
                <small>Rencana HYROX Race · klik untuk pindah</small>
              </button>
            ))}
          {c.id === 'doing' &&
            missions.map((m) => (
              <div key={m.id} className="kcard ai live">
                <span className="who ai">{AGENT_BY_ID[m.leadId].nick}</span>
                <p>{m.title}</p>
                <div className="bar">
                  <i style={{ width: `${Math.round(m.progress * 100)}%` }} />
                </div>
              </div>
            ))}
          {c.id === 'done' &&
            done.map((e) => (
              <div key={e.id} className="kcard ai faded">
                <p>{e.text}</p>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function CalendarMonth() {
  const now = wibNow();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const first = new Date(Date.UTC(y, mo, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  const events = demoEvents();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return (
    <div className="calendar">
      <div className="cal-title">
        {MONTH[mo]} {y}
      </div>
      <div className="cal-grid">
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />;
          const ts = Date.UTC(y, mo, d);
          const evs = events.filter((e) => e.ts === ts);
          return (
            <div key={i} className={`cal-cell${d === today ? ' today' : ''}`}>
              <span className="cal-d">{d}</span>
              {evs.map((e) => (
                <span key={e.title} className={`cal-ev${e.big ? ' big' : ''}`} style={{ '--c': e.color }}>
                  {e.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Approvals() {
  const approvals = useHive((s) => s.approvals);
  const decide = (a, status) => {
    const s = useHive.getState();
    s.decideApproval(a.id, status);
    const verb = status === 'approved' ? 'menyetujui' : status === 'revise' ? 'meminta revisi' : 'menolak';
    s.pushLog({ id: `ap-${a.id}-${Date.now()}`, kind: 'done', dept: a.dept, text: `Owner ${verb}: ${a.title}`, clock: s.stats.clock });
  };
  const label = { approved: 'Disetujui', revise: 'Diminta revisi', rejected: 'Ditolak' };
  return (
    <div className="approvals">
      {approvals.map((a) => (
        <div key={a.id} className={`appr ${a.status}`}>
          <div className="appr-top">
            <span className="chip" style={{ '--c': DEPTS[a.dept].color }}>
              {DEPTS[a.dept].short}
            </span>
            <span className="muted">dari {a.by}</span>
          </div>
          <h3>{a.title}</h3>
          <p>{a.detail}</p>
          {a.status === 'pending' ? (
            <div className="appr-btns">
              <button className="hbtn pri" onClick={() => decide(a, 'approved')}>
                Setujui
              </button>
              <button className="hbtn" onClick={() => decide(a, 'revise')}>
                Revisi
              </button>
              <button className="hbtn danger" onClick={() => decide(a, 'rejected')}>
                Tolak
              </button>
            </div>
          ) : (
            <div className="appr-done">{label[a.status]}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- halaman ---------- */

export function HallView() {
  useTick(1000);
  const [tab, setTab] = useState('rapat');
  const profile = useHive((s) => s.profile);
  const approvals = useHive((s) => s.approvals);
  const me = profile || { ...DEFAULT_PROFILE, name: 'Anda' };
  const dina = DEMO_STAFF[0];
  const { call, setCall, ask } = useDemoCall();
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const tabs = [
    ['rapat', 'Rapat'],
    ['rencana', 'Papan rencana'],
    ['kalender', 'Kalender'],
    ['persetujuan', `Persetujuan${pending ? ` · ${pending}` : ''}`],
  ];

  return (
    <div className="page hall-page">
      <div className="hall-inner">
        <div className="hall-head">
          <button className="back" onClick={() => go('/')}>
            ← Koloni
          </button>
          <div>
            <h1>Hive Hall</h1>
            <p>Rapat HYROX Simulation Race · mode demo</p>
          </div>
          <div className="hall-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'rapat' && (
          <>
            <div className="hall-room">
              <MeetingRoom me={me} dina={dina} call={call} />
            </div>
            <div className="caption">{call.caption || 'Tekan "Panggil Queen Bea" untuk bertanya. Queen Bea menjawab dengan data koloni yang sedang berjalan.'}</div>
            <div className="hall-row">
              <span className="pchip">
                <i style={{ background: '#FF8C1A' }} />
                Queen Bea · {call.speaker === 'ceo' ? 'bicara' : call.speaker === 'thinking' ? 'berpikir…' : 'mendengarkan'}
              </span>
              <span className="pchip">
                <i style={{ background: me.outfitColor }} />
                {me.name || 'Anda'} · {!call.mic ? 'mute' : call.speaker === 'me' ? 'bicara' : 'diam'}
              </span>
              <span className="pchip">
                <i style={{ background: dina.outfitColor }} />
                {dina.name} · ✋ antre
              </span>
              <span className="pchip">
                <i style={{ background: '#C0C5CE' }} />
                Sprint · mute
              </span>
              {call.notes.map((n) => (
                <span key={n} className="pchip note">
                  ✦ Tugas baru: {n}
                </span>
              ))}
            </div>
            <div className="hall-row center">
              <button className={`hbtn${call.mic ? ' pri' : ''}`} onClick={() => setCall((c) => ({ ...c, mic: !c.mic, speaker: null }))}>
                {call.mic ? '🎙 Mic nyala' : '🔇 Mic mati'}
              </button>
              <button className="hbtn pri" onClick={ask}>
                👑 Panggil Queen Bea
              </button>
              <button className={`hbtn${call.voice ? ' pri' : ''}`} onClick={() => setCall((c) => ({ ...c, voice: !c.voice }))}>
                {call.voice ? '🔊 Suara AI nyala' : '🔈 Suara AI mati'}
              </button>
              <button className="hbtn" onClick={() => setTab('rencana')}>
                Papan rencana
              </button>
              <button className="hbtn danger" onClick={() => go('/')}>
                Keluar
              </button>
            </div>
            <p className="demo-note">
              Mode demo: suara dan jawaban Queen Bea disimulasikan di browser ini. Call suara sungguhan antar-staff butuh backend (WebRTC) di tahap berikutnya.
            </p>
          </>
        )}
        {tab === 'rencana' && <PlanBoard />}
        {tab === 'kalender' && <CalendarMonth />}
        {tab === 'persetujuan' && <Approvals />}
      </div>
    </div>
  );
}
