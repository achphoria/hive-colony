// Employee (#/employee, khusus owner & kepala divisi): data karyawan lengkap, lalu undangan dikirim ke email-nya.
// Data di hc_employees (RLS: owner semua, lead divisinya), foto di bucket privat hc-employee-photos.
// Undangan lewat Edge Function employee-invite: kode undangan + email "Invite user" Supabase Auth.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';
import { DEPTS } from '../data/hive';
import { go } from './nav';
import { confirmDialog, copyDialog } from './dialog';

const STAFF_DEPTS = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };
const BUCKET = 'hc-employee-photos';
const PHONE_RE = /^\+?[0-9 ()-]{8,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMPTY = {
  full_name: '',
  nickname: '',
  gender: '',
  birth_place: '',
  birth_date: '',
  photo_path: '',
  email: '',
  phone: '',
  emergency_name: '',
  emergency_relation: '',
  emergency_phone: '',
  primary_dept: 'ops',
  depts: [],
  role: 'staff',
};
const FIELDS = ['full_name', 'nickname', 'gender', 'birth_place', 'birth_date', 'photo_path', 'email', 'phone', 'emergency_name', 'emergency_relation', 'emergency_phone'];
const LABEL = {
  full_name: 'Nama lengkap',
  nickname: 'Nama panggilan',
  gender: 'Gender',
  birth_place: 'Tempat lahir',
  birth_date: 'Tanggal lahir',
  photo_path: 'Foto',
  email: 'Email',
  phone: 'No. telepon',
  emergency_name: 'Nama kontak darurat',
  emergency_relation: 'Hubungan',
  emergency_phone: 'No. telepon darurat',
};
const ERR = {
  not_allowed: 'Hanya owner atau kepala divisi yang bisa mengundang.',
  incomplete: 'Data karyawan belum lengkap.',
  invite_failed: 'Kode undangan gagal dibuat.',
  email_failed: 'Email undangan gagal dikirim.',
};

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const initials = (n) =>
  (n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function validate(f) {
  const e = {};
  for (const k of FIELDS) if (!String(f[k] ?? '').trim()) e[k] = `${LABEL[k]} wajib diisi.`;
  if (f.email && !EMAIL_RE.test(f.email.trim())) e.email = 'Format email tidak valid.';
  if (f.phone && !PHONE_RE.test(f.phone.trim())) e.phone = 'Nomor telepon 8–20 digit (boleh diawali +).';
  if (f.emergency_phone && !PHONE_RE.test(f.emergency_phone.trim())) e.emergency_phone = 'Nomor telepon 8–20 digit (boleh diawali +).';
  if (f.birth_date && (f.birth_date > new Date().toISOString().slice(0, 10) || f.birth_date < '1940-01-01')) e.birth_date = 'Tanggal lahir tidak masuk akal.';
  return e;
}

// foto diperkecil di browser (sisi terpanjang 600 px, JPEG) supaya ringan
async function shrink(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
}

function statusOf(emp, invites) {
  const inv = emp.invite_code && invites[emp.invite_code];
  if (inv?.used_by) return { key: 'active', label: 'Aktif', sub: `Bergabung ${new Date(inv.used_at).toLocaleDateString('id-ID')}` };
  if (emp.invite_status === 'existing_account') return { key: 'manual', label: 'Kirim link manual', sub: 'Email ini sudah punya akun' };
  if (emp.invited_at) return { key: 'invited', label: 'Diundang', sub: new Date(emp.invited_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) };
  return { key: 'draft', label: 'Belum diundang', sub: '' };
}

function Field({ k, label, error, children, wide }) {
  return (
    <label className={`em-field${wide ? ' wide' : ''}${error ? ' bad' : ''}`} htmlFor={`em-${k}`}>
      <span>
        {label || LABEL[k]} <em aria-hidden="true">*</em>
      </span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}

function EmployeeForm({ initial, photoUrl, me, onClose, onSaved }) {
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(photoUrl || '');
  const [busy, setBusy] = useState('');
  const [fail, setFail] = useState('');
  const isOwner = me.role === 'owner';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const editing = !!initial?.id;

  useEffect(() => {
    if (!isOwner) setF((x) => ({ ...x, primary_dept: me.primary_dept, role: ['staff', 'viewer'].includes(x.role) ? x.role : 'staff' }));
  }, [isOwner, me.primary_dept]);
  useEffect(() => () => file && URL.revokeObjectURL(preview), [file, preview]);

  const pickPhoto = (e) => {
    const fl = e.target.files?.[0];
    if (!fl) return;
    if (!/^image\/(jpeg|png|webp)$/.test(fl.type)) {
      setErrors((x) => ({ ...x, photo_path: 'Pakai foto JPG, PNG, atau WEBP.' }));
      return;
    }
    setFile(fl);
    setPreview(URL.createObjectURL(fl));
    setF((x) => ({ ...x, photo_path: x.photo_path || 'baru' }));
    setErrors((x) => ({ ...x, photo_path: undefined }));
  };

  const save = async (andInvite) => {
    const e = validate(f);
    setErrors(e);
    if (Object.keys(e).length) {
      setFail('Lengkapi kolom yang ditandai merah.');
      return;
    }
    setFail('');
    setBusy(andInvite ? 'invite' : 'save');
    try {
      const id = initial?.id || crypto.randomUUID();
      let photo_path = f.photo_path;
      if (file) {
        const blob = await shrink(file);
        photo_path = `${id}/foto-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(photo_path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw new Error(`Foto gagal diunggah: ${upErr.message}`);
      }
      const row = {
        full_name: f.full_name.trim(),
        nickname: f.nickname.trim(),
        gender: f.gender,
        birth_place: f.birth_place.trim(),
        birth_date: f.birth_date,
        photo_path,
        email: f.email.trim().toLowerCase(),
        phone: f.phone.trim(),
        emergency_name: f.emergency_name.trim(),
        emergency_relation: f.emergency_relation.trim(),
        emergency_phone: f.emergency_phone.trim(),
        primary_dept: f.primary_dept,
        depts: f.depts.filter((d) => d !== f.primary_dept),
        role: f.role,
        updated_at: new Date().toISOString(),
      };
      const { error: dbErr } = editing ? await supabase.from('hc_employees').update(row).eq('id', id) : await supabase.from('hc_employees').insert({ id, ...row });
      if (dbErr) {
        if (dbErr.code === '23505') throw new Error('Email ini sudah terdaftar sebagai karyawan lain.');
        if (dbErr.message.includes('row-level')) throw new Error('Kamu tidak berhak menyimpan karyawan dengan divisi/peran ini.');
        throw new Error(dbErr.message);
      }
      await onSaved(id, andInvite);
    } catch (x) {
      setFail(x.message);
    } finally {
      setBusy('');
    }
  };

  const depts = STAFF_DEPTS;
  return (
    <div className="em-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Ubah karyawan' : 'Tambah karyawan'} onClick={onClose}>
      <form
        className="em-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        noValidate
      >
        <header>
          <h2>{editing ? 'Ubah data karyawan' : 'Tambah karyawan'}</h2>
          <button type="button" className="em-x" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </header>
        <div className="em-form-body">
          <section>
            <h3>Data pribadi</h3>
            <div className="em-photo-row">
              <label className={`em-photo${errors.photo_path ? ' bad' : ''}`}>
                {preview ? <img src={preview} alt="Foto karyawan" /> : <span>📷 Foto</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} />
              </label>
              <div className="em-photo-help">
                <b>
                  Foto <em>*</em>
                </b>
                <small>Wajah terlihat jelas. JPG/PNG/WEBP, otomatis diperkecil.</small>
                {errors.photo_path && <small className="em-bad">{errors.photo_path}</small>}
              </div>
            </div>
            <div className="em-grid">
              <Field k="full_name" error={errors.full_name} wide>
                <input id="em-full_name" value={f.full_name} onChange={set('full_name')} maxLength={120} autoComplete="off" placeholder="Sesuai KTP" />
              </Field>
              <Field k="nickname" error={errors.nickname}>
                <input id="em-nickname" value={f.nickname} onChange={set('nickname')} maxLength={40} placeholder="Nama di koloni" />
              </Field>
              <Field k="gender" error={errors.gender}>
                <div className="em-seg" role="radiogroup" id="em-gender">
                  {[
                    ['L', 'Laki-laki'],
                    ['P', 'Perempuan'],
                  ].map(([v, l]) => (
                    <button type="button" key={v} role="radio" aria-checked={f.gender === v} className={f.gender === v ? 'on' : ''} onClick={() => setF((x) => ({ ...x, gender: v }))}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field k="birth_place" error={errors.birth_place}>
                <input id="em-birth_place" value={f.birth_place} onChange={set('birth_place')} maxLength={80} placeholder="mis. Jakarta" />
              </Field>
              <Field k="birth_date" error={errors.birth_date}>
                <input id="em-birth_date" type="date" value={f.birth_date} onChange={set('birth_date')} max={new Date().toISOString().slice(0, 10)} />
              </Field>
            </div>
          </section>
          <section>
            <h3>Kontak</h3>
            <div className="em-grid">
              <Field k="email" error={errors.email} wide>
                <input id="em-email" type="email" value={f.email} onChange={set('email')} maxLength={200} placeholder="nama@email.com" disabled={!!initial?.invited_at} />
              </Field>
              <Field k="phone" error={errors.phone}>
                <input id="em-phone" type="tel" value={f.phone} onChange={set('phone')} maxLength={20} placeholder="08…" />
              </Field>
            </div>
            {initial?.invited_at && <p className="em-note">Email tidak bisa diubah setelah undangan dikirim.</p>}
          </section>
          <section>
            <h3>Kontak darurat</h3>
            <div className="em-grid">
              <Field k="emergency_name" error={errors.emergency_name}>
                <input id="em-emergency_name" value={f.emergency_name} onChange={set('emergency_name')} maxLength={120} />
              </Field>
              <Field k="emergency_relation" error={errors.emergency_relation}>
                <input id="em-emergency_relation" value={f.emergency_relation} onChange={set('emergency_relation')} maxLength={40} placeholder="mis. Ibu, Suami" list="em-relations" />
                <datalist id="em-relations">
                  {['Ayah', 'Ibu', 'Suami', 'Istri', 'Kakak', 'Adik', 'Anak', 'Saudara', 'Teman'].map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </Field>
              <Field k="emergency_phone" error={errors.emergency_phone}>
                <input id="em-emergency_phone" type="tel" value={f.emergency_phone} onChange={set('emergency_phone')} maxLength={20} placeholder="08…" />
              </Field>
            </div>
          </section>
          <section>
            <h3>Penempatan</h3>
            <div className="em-grid">
              <label className="em-field">
                <span>Divisi utama</span>
                <select value={f.primary_dept} onChange={set('primary_dept')} disabled={!isOwner}>
                  {depts.map((d) => (
                    <option key={d} value={d}>
                      {DEPTS[d].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="em-field">
                <span>Peran</span>
                <select value={f.role} onChange={set('role')}>
                  {(isOwner ? ['owner', 'lead', 'staff', 'viewer'] : ['staff', 'viewer']).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="em-field wide">
                <span>Divisi tambahan (opsional)</span>
                <div className="em-chips">
                  {depts
                    .filter((d) => d !== f.primary_dept && d !== 'ceo')
                    .map((d) => (
                      <button type="button" key={d} className={f.depts.includes(d) ? 'on' : ''} onClick={() => setF((x) => ({ ...x, depts: x.depts.includes(d) ? x.depts.filter((y) => y !== d) : [...x.depts, d] }))}>
                        {DEPTS[d].short}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer>
          {fail && (
            <p className="em-fail" role="alert">
              {fail}
            </p>
          )}
          <button type="button" className="em-btn ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="em-btn" disabled={!!busy}>
            {busy === 'save' ? 'Menyimpan…' : 'Simpan'}
          </button>
          {!initial?.invited_at && (
            <button type="button" className="em-btn primary" disabled={!!busy} onClick={() => save(true)}>
              {busy === 'invite' ? 'Mengirim…' : 'Simpan & kirim undangan'}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

export function EmployeePage() {
  const account = useAuth((s) => s.account);
  const [list, setList] = useState(null);
  const [photos, setPhotos] = useState({});
  const [invites, setInvites] = useState({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | {} (baru) | baris karyawan
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState('');

  const toastTimer = useRef(0);
  const say = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  };

  const load = async () => {
    const { data, error } = await supabase.from('hc_employees').select('*').order('full_name');
    if (error) {
      setList([]);
      say(error.message.includes('does not exist') ? 'Tabel karyawan belum dibuat. Jalankan migrasi 20261022090000_hc_employees.sql.' : error.message);
      return;
    }
    setList(data || []);
    const paths = (data || []).map((e) => e.photo_path).filter(Boolean);
    if (paths.length) {
      const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      setPhotos(Object.fromEntries((urls || []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl])));
    }
    const codes = (data || []).map((e) => e.invite_code).filter(Boolean);
    if (codes.length) {
      const { data: inv } = await supabase.from('hc_invites').select('code, used_by, used_at').in('code', codes);
      setInvites(Object.fromEntries((inv || []).map((i) => [i.code, i])));
    }
  };
  useEffect(() => {
    if (account && ['owner', 'lead'].includes(account.role)) load();
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async (id) => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke('employee-invite', { body: { employee_id: id } });
    setBusyId('');
    if (error) {
      let body = {};
      try {
        body = await error.context.json();
      } catch {
        /* bukan JSON */
      }
      const extra = body.missing?.length ? ` Belum diisi: ${body.missing.map((k) => LABEL[k]).join(', ')}.` : body.message ? ` (${body.message})` : '';
      say(`${ERR[body.error] || 'Undangan gagal dikirim.'}${extra}`);
      load();
      return;
    }
    if (data.status === 'existing_account') {
      try {
        await navigator.clipboard.writeText(data.link);
      } catch {
        /* clipboard ditolak */
      }
      say('Email ini sudah punya akun, jadi tidak dikirimi email. Link undangan sudah disalin: kirim lewat WhatsApp/email biasa.');
    } else say('Undangan terkirim. Karyawan cukup klik link di email untuk bergabung.');
    load();
  };

  const remove = async (emp) => {
    const ok = await confirmDialog({
      title: `Hapus data ${emp.full_name}?`,
      message: 'Data pribadi dan fotonya dihapus permanen. Akun Hive Colony yang sudah aktif tidak ikut terhapus.',
      confirmLabel: 'Hapus data',
      tone: 'danger',
    });
    if (!ok) return;
    await supabase.from('hc_employees').delete().eq('id', emp.id);
    if (emp.photo_path) await supabase.storage.from(BUCKET).remove([emp.photo_path]);
    load();
  };

  const copyLink = async (emp) => {
    const link = `${window.location.origin}${window.location.pathname}#/join?code=${emp.invite_code}`;
    try {
      await navigator.clipboard.writeText(link);
      say('Link undangan disalin.');
    } catch {
      copyDialog({ title: 'Salin link undangan', message: 'Kirim link ini ke karyawan lewat WhatsApp atau email biasa.', value: link });
    }
  };

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (list || []).filter((e) => {
      const st = statusOf(e, invites).key;
      if (filter === 'draft' && st !== 'draft') return false;
      if (filter === 'invited' && !['invited', 'manual'].includes(st)) return false;
      if (filter === 'active' && st !== 'active') return false;
      return !k || `${e.full_name} ${e.nickname} ${e.email} ${e.phone}`.toLowerCase().includes(k);
    });
  }, [list, invites, q, filter]);

  if (!account || !['owner', 'lead'].includes(account.role)) {
    return (
      <div className="page em-page">
        <div className="em-empty">
          <h1>Employee</h1>
          <p>Hanya owner atau kepala divisi yang bisa membuka data karyawan.</p>
          <button className="em-btn" onClick={() => go('/')}>
            Kembali ke koloni
          </button>
        </div>
      </div>
    );
  }

  const counts = (list || []).reduce((c, e) => {
    const k = statusOf(e, invites).key;
    c[k === 'manual' ? 'invited' : k] = (c[k === 'manual' ? 'invited' : k] || 0) + 1;
    return c;
  }, {});

  return (
    <div className="page em-page">
      <div className="em-inner">
        <header className="em-head">
          <button className="em-btn ghost" onClick={() => go('/')}>
            ← Koloni
          </button>
          <div className="em-title">
            <h1>Employee</h1>
            <p>Data karyawan wajib lengkap sebelum undangan dikirim ke email mereka.</p>
          </div>
          <button className="em-btn primary" onClick={() => setEditing({})}>
            + Tambah karyawan
          </button>
        </header>

        <div className="em-tools">
          <div className="em-filter" role="tablist" aria-label="Saring karyawan">
            {[
              ['all', 'Semua', list?.length || 0],
              ['draft', 'Belum diundang', counts.draft || 0],
              ['invited', 'Diundang', counts.invited || 0],
              ['active', 'Aktif', counts.active || 0],
            ].map(([id, label, n]) => (
              <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
                {label} <em>{n}</em>
              </button>
            ))}
          </div>
          <input className="em-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, atau telepon" aria-label="Cari karyawan" />
        </div>

        {list === null && <p className="em-muted">Memuat data karyawan…</p>}
        {list && list.length === 0 && (
          <div className="em-empty">
            <span aria-hidden="true">🐝</span>
            <h2>Belum ada karyawan</h2>
            <p>Tambahkan data karyawan lengkap, lalu kirim undangan ke email mereka.</p>
            <button className="em-btn primary" onClick={() => setEditing({})}>
              + Tambah karyawan pertama
            </button>
          </div>
        )}
        {list && list.length > 0 && rows.length === 0 && <p className="em-muted">Tidak ada karyawan yang cocok.</p>}

        <div className="em-list">
          {rows.map((e) => {
            const st = statusOf(e, invites);
            return (
              <article key={e.id} className="em-card">
                <div className="em-card-top">
                  <div className="em-avatar">{photos[e.photo_path] ? <img src={photos[e.photo_path]} alt="" /> : <span>{initials(e.full_name)}</span>}</div>
                  <div className="em-who">
                    <b>{e.full_name}</b>
                    <span>
                      “{e.nickname}” · {DEPTS[e.primary_dept]?.short || e.primary_dept} · {ROLE_LABEL[e.role]}
                    </span>
                  </div>
                  <span className={`em-status ${st.key}`} title={st.sub}>
                    {st.label}
                  </span>
                </div>
                <dl className="em-facts">
                  <div>
                    <dt>Email</dt>
                    <dd>{e.email}</dd>
                  </div>
                  <div>
                    <dt>Telepon</dt>
                    <dd>{e.phone}</dd>
                  </div>
                  <div>
                    <dt>TTL</dt>
                    <dd>
                      {e.birth_place}, {fmtDate(e.birth_date)}
                    </dd>
                  </div>
                  <div>
                    <dt>Gender</dt>
                    <dd>{e.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</dd>
                  </div>
                  <div className="wide">
                    <dt>Kontak darurat</dt>
                    <dd>
                      {e.emergency_name} ({e.emergency_relation}) · {e.emergency_phone}
                    </dd>
                  </div>
                </dl>
                <footer>
                  {st.key !== 'active' && (
                    <button className="em-btn primary sm" onClick={() => invite(e.id)} disabled={busyId === e.id}>
                      {busyId === e.id ? 'Mengirim…' : e.invited_at ? '↻ Kirim ulang' : '✉ Kirim undangan'}
                    </button>
                  )}
                  {e.invite_code && st.key !== 'active' && (
                    <button className="em-btn sm" onClick={() => copyLink(e)}>
                      Salin link
                    </button>
                  )}
                  <button className="em-btn sm" onClick={() => setEditing(e)}>
                    Ubah
                  </button>
                  {account.role === 'owner' && (
                    <button className="em-btn sm danger" onClick={() => remove(e)}>
                      Hapus
                    </button>
                  )}
                  {st.sub && <small>{st.sub}</small>}
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {editing && (
        <EmployeeForm
          initial={editing.id ? editing : null}
          photoUrl={editing.photo_path ? photos[editing.photo_path] : ''}
          me={account}
          onClose={() => setEditing(null)}
          onSaved={async (id, andInvite) => {
            setEditing(null);
            await load();
            if (andInvite) await invite(id);
            else say('Data karyawan tersimpan.');
          }}
        />
      )}
      {toast && (
        <div className="em-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
