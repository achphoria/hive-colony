// Latih agent (tab Skill) dan Tugas rutin (tab Rutin) di Ruang Kerja Agent, plus tombol 👍/👎 di jawaban.
// Pakai: menilai & memberi koreksi. Pelatih/owner: mengatur skill, pelajaran, persona, dan tugas rutin.
import { useEffect, useState } from 'react';
import {
  useAgentScores,
  rateMessage,
  loadFeedbackQueue,
  setFeedbackStatus,
  loadSkills,
  saveSkill,
  deleteSkill,
  loadPersona,
  savePersona,
  loadRoutines,
  saveRoutine,
  deleteRoutine,
  runRoutineNow,
} from '../hall/agentApi';
import { confirmDialog } from './dialog';

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const wibLabel = (iso) => {
  if (!iso) return '-';
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${DAYS[((d.getUTCDay() + 6) % 7) + 1].slice(0, 3)} ${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const hhmm = (t) => String(t || '08:00').slice(0, 5);
export function scheduleLabel(r) {
  const at = hhmm(r.at_time);
  if (r.kind === 'daily') return `Setiap hari ${at}`;
  if (r.kind === 'weekdays') return `Senin–Jumat ${at}`;
  if (r.kind === 'weekly') return `Setiap ${DAYS[r.dow]} ${at}`;
  return `Setiap tgl ${r.dom} ${at}`;
}

// ---------- 👍 / 👎 + koreksi di jawaban agent ----------
export function RateButtons({ agent, message, mine, onRated }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(mine?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (rating, withNote) => {
    setBusy(true);
    setErr('');
    try {
      await rateMessage({ agent, messageId: message.id, rating, note: withNote ? note : mine?.note });
      onRated({ rating, note: withNote ? note.trim() || null : mine?.note || null });
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={mine?.rating === 1 ? 'on' : ''} disabled={busy} onClick={() => send(1, false)} title="Jawaban bagus">
        👍
      </button>
      <button className={mine?.rating === -1 ? 'on bad' : ''} disabled={busy} onClick={() => setOpen((x) => !x)} title="Kurang tepat, beri koreksi">
        👎
      </button>
      {open && (
        <div className="aw-rate">
          <label>
            Apa yang seharusnya? (opsional, dibaca Pelatih agent ini)
            <textarea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="mis. Harga member bulanan sekarang Rp450.000, bukan Rp400.000." autoFocus />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="aw-formbtn">
            <button onClick={() => setOpen(false)}>Batal</button>
            <button className="save" disabled={busy} onClick={() => send(-1, true)}>
              Kirim koreksi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ScoreBadge({ agent }) {
  const s = useAgentScores((x) => x[agent]);
  if (!s) return <span className="aw-score none">Skor: belum dinilai</span>;
  return (
    <span className={`aw-score${s.score >= 75 ? ' good' : s.score < 50 ? ' low' : ''}`} title={`30 hari terakhir: ${s.up} 👍, ${s.down} 👎`}>
      Skor {s.score}
    </span>
  );
}

function SkillForm({ initial, kindLabel, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [instruction, setInstruction] = useState(initial?.instruction || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!name.trim() || !instruction.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...initial, name, instruction });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="aw-taskform">
      <label>
        Nama {kindLabel}
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Format laporan harian" autoFocus />
      </label>
      <label>
        Instruksi
        <textarea rows={4} value={instruction} maxLength={1500} onChange={(e) => setInstruction(e.target.value)} placeholder="Tulis aturan kerja yang harus diikuti agent, sejelas mungkin." />
      </label>
      {err && <p className="error">{err}</p>}
      <div className="aw-formbtn">
        <button onClick={onCancel}>Batal</button>
        <button className="save" disabled={busy || !name.trim() || !instruction.trim()} onClick={submit}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}

function SkillList({ items, kind, canTrain, agent, reload }) {
  const [editing, setEditing] = useState(null); // id | 'new'
  const label = kind === 'lesson' ? 'pelajaran' : 'skill';
  const list = items.filter((s) => s.kind === kind);
  return (
    <>
      {list.length === 0 && editing !== 'new' && (
        <p className="muted small">{kind === 'lesson' ? 'Belum ada pelajaran. Koreksi 👎 dari staff bisa dijadikan pelajaran.' : 'Belum ada skill tambahan.'}</p>
      )}
      {list.map((s) =>
        editing === s.id ? (
          <SkillForm
            key={s.id}
            initial={s}
            kindLabel={label}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              await saveSkill(agent, v);
              setEditing(null);
              reload();
            }}
          />
        ) : (
          <div key={s.id} className={`aw-skill${s.active ? '' : ' off'}`}>
            <b>{s.name}</b>
            <p>{s.instruction}</p>
            {canTrain && (
              <div className="aw-acts">
                <button
                  onClick={async () => {
                    await saveSkill(agent, { ...s, active: !s.active });
                    reload();
                  }}
                >
                  {s.active ? '⏸ Nonaktifkan' : '▶ Aktifkan'}
                </button>
                <button onClick={() => setEditing(s.id)}>✏️ Ubah</button>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({ title: `Hapus ${label} “${s.name}”?`, message: 'Agent tidak lagi memakai ini di jawaban berikutnya.', confirmLabel: 'Hapus', tone: 'danger' });
                    if (!ok) return;
                    await deleteSkill(s.id);
                    reload();
                  }}
                >
                  🗑 Hapus
                </button>
              </div>
            )}
          </div>
        ),
      )}
      {canTrain &&
        (editing === 'new' ? (
          <SkillForm
            initial={{ kind }}
            kindLabel={label}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              await saveSkill(agent, v);
              setEditing(null);
              reload();
            }}
          />
        ) : (
          <button className="aw-thread new" onClick={() => setEditing('new')}>
            ＋ Tambah {label}
          </button>
        ))}
    </>
  );
}

// ---------- tab Skill ----------
export function SkillPanel({ agent, nick, canTrain, names }) {
  const score = useAgentScores((x) => x[agent]);
  const [skills, setSkills] = useState([]);
  const [queue, setQueue] = useState([]);
  const [persona, setPersona] = useState('');
  const [draft, setDraft] = useState(null);
  const [lessonFrom, setLessonFrom] = useState(null);
  const [msg, setMsg] = useState('');
  const reload = () => {
    if (agent === 'ceo') return;
    loadSkills(agent).then(setSkills);
    if (canTrain) loadFeedbackQueue(agent).then(setQueue);
  };
  useEffect(() => {
    setDraft(null);
    setLessonFrom(null);
    setMsg('');
    reload();
    if (canTrain && agent !== 'ceo') loadPersona(agent).then(setPersona);
  }, [agent, canTrain]);

  return (
    <>
      <p className="aw-label">Skor skill (30 hari)</p>
      <div className="aw-scorecard">
        <b>{score ? score.score : '–'}</b>
        <span>
          {score ? `${score.up} 👍 · ${score.down} 👎` : 'Belum ada penilaian.'}
          <br />
          <small className="muted">Nilai jawaban {nick} dengan 👍/👎 di chat. Skor ini hanya tampilan. Yang mengubah jawaban berikutnya adalah persona, skill aktif, dan pelajaran aktif.</small>
        </span>
      </div>

      {agent === 'ceo' ? (
        <p className="muted small">Persona Queen Bea diatur di kode Edge Function queen-bea. Skill agent lain (termasuk Grok Bot) dirakit ke prompt yang dikirim ke bot.</p>
      ) : (
        <>
          <p className="aw-label">Skill</p>
          <SkillList items={skills} kind="skill" canTrain={canTrain} agent={agent} reload={reload} />
          <p className="aw-label">Pelajaran dari koreksi</p>
          <SkillList items={skills} kind="lesson" canTrain={canTrain} agent={agent} reload={reload} />

          {canTrain && (
            <>
              <p className="aw-label">Masukan staff {queue.length > 0 && <span className="aw-count">{queue.length}</span>}</p>
              {queue.length === 0 && <p className="muted small">Belum ada koreksi baru.</p>}
              {queue.map((f) =>
                lessonFrom === f.id ? (
                  <SkillForm
                    key={f.id}
                    initial={{ kind: 'lesson', name: (f.ask_excerpt || 'Koreksi').replace(/\s+/g, ' ').slice(0, 60), instruction: f.note || '', source_feedback: f.id }}
                    kindLabel="pelajaran"
                    onCancel={() => setLessonFrom(null)}
                    onSave={async (v) => {
                      await saveSkill(agent, { kind: 'lesson', name: v.name, instruction: v.instruction, source_feedback: f.id });
                      await setFeedbackStatus(f.id, 'learned');
                      setLessonFrom(null);
                      setMsg(`Pelajaran ditambahkan. ${nick} langsung memakainya di jawaban berikutnya.`);
                      reload();
                    }}
                  />
                ) : (
                  <div key={f.id} className="aw-fb">
                    <div className="aw-fb-head">
                      <span>{f.rating === -1 ? '👎' : '👍'}</span>
                      <small className="muted">{names[f.user_id] || 'Staff'} · {wibLabel(f.created_at)}</small>
                    </div>
                    {f.ask_excerpt && <p className="aw-fb-q">“{f.ask_excerpt.slice(0, 160)}”</p>}
                    {f.reply_excerpt && (
                      <details>
                        <summary>Jawaban {nick}</summary>
                        <p>{f.reply_excerpt}</p>
                      </details>
                    )}
                    {f.note && <p className="aw-fb-note">✍️ {f.note}</p>}
                    <div className="aw-acts">
                      <button onClick={() => setLessonFrom(f.id)}>🎓 Jadikan pelajaran</button>
                      <button
                        onClick={async () => {
                          await setFeedbackStatus(f.id, 'dismissed');
                          reload();
                        }}
                      >
                        Abaikan
                      </button>
                    </div>
                  </div>
                ),
              )}
              {msg && <div className="aw-notice inline">{msg}</div>}

              <p className="aw-label">Persona dasar</p>
              {draft === null ? (
                <>
                  <p className="aw-role clamp">{persona}</p>
                  <button className="aw-thread new" onClick={() => setDraft(persona)}>
                    ✏️ Ubah persona
                  </button>
                </>
              ) : (
                <div className="aw-taskform">
                  <textarea rows={10} value={draft} maxLength={12000} onChange={(e) => setDraft(e.target.value)} />
                  <p className="muted small">Skill & pelajaran di atas otomatis ditambahkan di bawah persona ini.</p>
                  <div className="aw-formbtn">
                    <button onClick={() => setDraft(null)}>Batal</button>
                    <button
                      className="save"
                      onClick={async () => {
                        try {
                          await savePersona(agent, draft);
                          setPersona(draft);
                          setDraft(null);
                          setMsg('Persona disimpan.');
                        } catch (e) {
                          setMsg(e.message);
                        }
                      }}
                    >
                      Simpan persona
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

// ---------- tab Rutin ----------
const EMPTY = { title: '', instruction: '', kind: 'daily', dow: 1, dom: 1, at_time: '08:00' };
function RoutineForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, at_time: hhmm(initial?.at_time || EMPTY.at_time), dow: initial?.dow || 1, dom: initial?.dom || 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    if (!f.title.trim() || !f.instruction.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onSave(f);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="aw-taskform">
      <label>
        Judul
        <input value={f.title} maxLength={120} onChange={set('title')} placeholder="mis. Rekap penjualan kemarin" autoFocus />
      </label>
      <label>
        Instruksi untuk agent
        <textarea rows={4} value={f.instruction} maxLength={3000} onChange={set('instruction')} placeholder="Apa yang harus dikerjakan, format hasil, dan hal yang perlu diperhatikan." />
      </label>
      <div className="aw-row">
        <label>
          Jadwal
          <select value={f.kind} onChange={set('kind')}>
            <option value="daily">Setiap hari</option>
            <option value="weekdays">Senin–Jumat</option>
            <option value="weekly">Setiap minggu</option>
            <option value="monthly">Setiap bulan</option>
          </select>
        </label>
        {f.kind === 'weekly' && (
          <label>
            Hari
            <select value={f.dow} onChange={set('dow')}>
              {DAYS.slice(1).map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.kind === 'monthly' && (
          <label>
            Tanggal
            <input type="number" min={1} max={31} value={f.dom} onChange={set('dom')} />
          </label>
        )}
        <label>
          Jam (WIB)
          <input type="time" value={f.at_time} onChange={set('at_time')} />
        </label>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="aw-formbtn">
        <button onClick={onCancel}>Batal</button>
        <button className="save" disabled={busy || !f.title.trim() || !f.instruction.trim()} onClick={submit}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}

export function RoutinePanel({ agent, nick, canTrain }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');
  const reload = () => loadRoutines(agent).then(setItems);
  useEffect(() => {
    setEditing(null);
    setMsg('');
    if (agent !== 'ceo') reload();
  }, [agent]);

  if (agent === 'ceo') return <p className="muted small">Tugas rutin dijalankan oleh 20 agent di n8n. Pilih agent lain untuk membuat jadwal.</p>;
  return (
    <>
      <p className="aw-label">Tugas rutin {nick}</p>
      <p className="muted small">Dijalankan otomatis oleh n8n di PC kantor (cek tiap 5 menit). Hasilnya masuk papan rencana & panel Tugas.</p>
      {items.length === 0 && editing !== 'new' && <p className="muted small">Belum ada tugas rutin.</p>}
      {items.map((r) =>
        editing === r.id ? (
          <RoutineForm
            key={r.id}
            initial={r}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              await saveRoutine(agent, { ...v, id: r.id, active: r.active });
              setEditing(null);
              reload();
            }}
          />
        ) : (
          <div key={r.id} className={`aw-skill${r.active ? '' : ' off'}`}>
            <b>{r.title}</b>
            <span className="aw-when">🕗 {scheduleLabel(r)}</span>
            <p>{r.instruction}</p>
            <small className="muted">
              {r.active ? `Berikutnya: ${wibLabel(r.next_run_at)}` : 'Dijeda'}
              {r.last_run_at ? ` · Terakhir: ${wibLabel(r.last_run_at)}` : ''}
            </small>
            {canTrain && (
              <div className="aw-acts">
                <button
                  onClick={async () => {
                    try {
                      await runRoutineNow(r.id);
                      setMsg(`"${r.title}" dijalankan sekarang. Lihat panel Tugas di tab Info.`);
                      reload();
                    } catch (e) {
                      setMsg(e.message);
                    }
                  }}
                >
                  ▶ Jalankan sekarang
                </button>
                <button
                  onClick={async () => {
                    await saveRoutine(agent, { ...r, at_time: hhmm(r.at_time), active: !r.active });
                    reload();
                  }}
                >
                  {r.active ? '⏸ Jeda' : '▶ Aktifkan'}
                </button>
                <button onClick={() => setEditing(r.id)}>✏️ Ubah</button>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({ title: `Hapus tugas rutin “${r.title}”?`, message: 'Jadwal ini berhenti dan tidak dijalankan lagi.', confirmLabel: 'Hapus', tone: 'danger' });
                    if (!ok) return;
                    await deleteRoutine(r.id);
                    reload();
                  }}
                >
                  🗑
                </button>
              </div>
            )}
          </div>
        ),
      )}
      {msg && <div className="aw-notice inline">{msg}</div>}
      {canTrain &&
        (editing === 'new' ? (
          <RoutineForm
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              await saveRoutine(agent, v);
              setEditing(null);
              reload();
            }}
          />
        ) : (
          <button className="aw-thread new" onClick={() => setEditing('new')}>
            ＋ Tambah tugas rutin
          </button>
        ))}
      {!canTrain && <p className="muted small">Hanya owner atau Pelatih {nick} yang bisa mengatur tugas rutin.</p>}
    </>
  );
}
