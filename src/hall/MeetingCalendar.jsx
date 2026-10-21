// Kalender rapat Hive Hall (mode login): jadwal di hc_meeting_events, dan setiap acara membuka rapatnya
// sendiri (hc_meetings.event_id) dengan room video #/rapat/<id rapat>. Tetap satu rapat berjalan sekaligus.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';
import { MONTH } from '../ui/hallData';
import { go } from '../ui/nav';
import { confirmDialog } from '../ui/dialog';
import { startVideoMeeting } from './rtc/videoMeeting';
import { useCloudflare } from './rtc/config';

// VIDEO_PROVIDER=livekit: rapat dari jadwal berjalan sebagai rapat suara di lobi Hive Hall
const openRoom = (id) => go(useCloudflare ? `/rapat/${id}` : '/hall');

const WIB = 7 * 3600e3;
const wib = (iso) => new Date(new Date(iso).getTime() + WIB); // dibaca dengan getter UTC
const hhmm = (iso) => {
  const d = wib(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
// tanggal "YYYY-MM-DD" + jam "HH:MM" WIB -> ISO UTC
const toIso = (date, time) => new Date(`${date}T${time}:00+07:00`).toISOString();
const todayStr = () => wib(new Date().toISOString()).toISOString().slice(0, 10);

function NewEvent({ onSaved, onCancel }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('hc_meeting_events').insert({ title: title.trim().slice(0, 120), starts_at: toIso(date, time), duration_min: Number(duration) });
    setBusy(false);
    if (error) setErr(error.message.includes('row-level') ? 'Hanya owner yang bisa menjadwalkan rapat.' : `Gagal menyimpan: ${error.message}`);
    else onSaved();
  };
  return (
    <form className="mc-form" onSubmit={save}>
      <label>
        Judul rapat
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="mis. Rapat budget promo HYROX" autoFocus />
      </label>
      <label>
        Tanggal
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Jam (WIB)
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </label>
      <label>
        Durasi
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} menit
            </option>
          ))}
        </select>
      </label>
      {err && <p className="error">{err}</p>}
      <div className="mc-actions">
        <button type="button" className="hbtn" onClick={onCancel}>
          Batal
        </button>
        <button className="hbtn pri" disabled={busy || !title.trim()}>
          {busy ? 'Menyimpan…' : 'Jadwalkan'}
        </button>
      </div>
    </form>
  );
}

export function MeetingCalendar({ onArchive }) {
  const account = useAuth((s) => s.account);
  const owner = account?.role === 'owner';
  const now = wib(new Date().toISOString());
  const [ym, setYm] = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
  const [events, setEvents] = useState([]);
  const [meetings, setMeetings] = useState({}); // id rapat -> status
  const [live, setLive] = useState(null); // rapat yang sedang berjalan
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(Date.UTC(ym.y, ym.m, 1) - WIB).toISOString();
    const to = new Date(Date.UTC(ym.y, ym.m + 1, 1) - WIB).toISOString();
    const [{ data: evs }, { data: liveRows }] = await Promise.all([
      supabase.from('hc_meeting_events').select('id, title, starts_at, duration_min, meeting_id').gte('starts_at', from).lt('starts_at', to).order('starts_at'),
      supabase.from('hc_meetings').select('id, title, event_id').eq('status', 'live').limit(1),
    ]);
    setEvents(evs || []);
    setLive(liveRows?.[0] || null);
    const ids = (evs || []).map((e) => e.meeting_id).filter(Boolean);
    if (ids.length) {
      const { data: ms } = await supabase.from('hc_meetings').select('id, status').in('id', ids);
      setMeetings(Object.fromEntries((ms || []).map((r) => [r.id, r.status])));
    } else setMeetings({});
  }, [ym]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('hc-meeting-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_meetings' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const start = async (ev) => {
    setBusy(true);
    setErr('');
    try {
      openRoom(await startVideoMeeting(ev.title, ev.id));
    } catch (e) {
      setBusy(false);
      setErr(e.message);
      load();
    }
  };
  const remove = async (ev) => {
    const ok = await confirmDialog({ title: `Hapus jadwal “${ev.title}”?`, message: 'Jadwal ini hilang dari kalender semua staff.', confirmLabel: 'Hapus jadwal', tone: 'danger' });
    if (!ok) return;
    await supabase.from('hc_meeting_events').delete().eq('id', ev.id);
    setSel(null);
    load();
  };

  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const isThisMonth = ym.y === now.getUTCFullYear() && ym.m === now.getUTCMonth();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (d) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const cur = sel && events.find((e) => e.id === sel);
  const statusOf = (ev) => (ev.meeting_id ? meetings[ev.meeting_id] || 'done' : null);

  return (
    <div className="calendar mc">
      <div className="mc-head">
        <button className="hbtn" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">
          ‹
        </button>
        <div className="cal-title">
          {MONTH[ym.m]} {ym.y}
        </div>
        <button className="hbtn" onClick={() => shift(1)} aria-label="Bulan berikutnya">
          ›
        </button>
        {live && (
          <button className="hbtn pri mc-live" onClick={() => openRoom(live.id)}>
            ● Gabung: {live.title}
          </button>
        )}
        {owner && !adding && (
          <button className="hbtn pri" onClick={() => setAdding(true)}>
            + Jadwalkan rapat
          </button>
        )}
      </div>
      {adding && (
        <NewEvent
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      <div className="cal-grid">
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />;
          const evs = events.filter((e) => wib(e.starts_at).getUTCDate() === d);
          return (
            <div key={i} className={`cal-cell${isThisMonth && d === now.getUTCDate() ? ' today' : ''}`}>
              <span className="cal-d">{d}</span>
              {evs.map((e) => (
                <button key={e.id} className={`cal-ev mc-ev ${statusOf(e) || 'plan'}${sel === e.id ? ' on' : ''}`} style={{ '--c': statusOf(e) === 'live' ? '#D85A30' : '#C98A00' }} onClick={() => setSel(sel === e.id ? null : e.id)}>
                  {hhmm(e.starts_at)} {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {!events.length && <p className="mc-empty">Belum ada rapat terjadwal bulan ini.{owner ? ' Tekan "Jadwalkan rapat" untuk menambah.' : ''}</p>}
      {cur && (
        <div className="mc-detail">
          <div>
            <b>{cur.title}</b>
            <span>
              {wib(cur.starts_at).getUTCDate()} {MONTH[wib(cur.starts_at).getUTCMonth()]} · {hhmm(cur.starts_at)} WIB · {cur.duration_min} menit
            </span>
          </div>
          {err && <p className="error">{err}</p>}
          <div className="mc-actions">
            {statusOf(cur) === 'live' && (
              <button className="hbtn pri" onClick={() => openRoom(cur.meeting_id)}>
                🎥 Gabung rapat
              </button>
            )}
            {statusOf(cur) && statusOf(cur) !== 'live' && (
              <button className="hbtn" onClick={onArchive}>
                Selesai · lihat Arsip rapat
              </button>
            )}
            {!cur.meeting_id && owner && (
              <button className="hbtn pri" onClick={() => start(cur)} disabled={busy || !!live} title={live ? 'Masih ada rapat lain yang berjalan' : ''}>
                {busy ? 'Membuka…' : '▶ Mulai rapat'}
              </button>
            )}
            {!cur.meeting_id && owner && live && <span className="mc-note">Rapat lain sedang berjalan. Akhiri dulu untuk memulai rapat ini.</span>}
            {!cur.meeting_id && !owner && <span className="mc-note">Room terbuka saat owner memulai rapat.</span>}
            {owner && !cur.meeting_id && (
              <button className="hbtn danger" onClick={() => remove(cur)}>
                Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
