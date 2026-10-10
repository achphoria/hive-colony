import { useEffect, useState } from 'react';
import { DEPTS } from '../data/hive';
import { useAuth } from '../sim/auth';
import { supabase } from '../lib/supabase';
import { go } from './nav';

const STAFF_DEPTS = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };
const queryParam = (k) => new URLSearchParams(window.location.hash.split('?')[1] || '').get(k) || '';

function Shell({ title, sub, children }) {
  return (
    <div className="page auth-page">
      <div className="auth-card">
        <button className="back" onClick={() => go('/')}>
          ← Koloni
        </button>
        <div className="auth-logo" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="48" height="48">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#F5B700" stroke="#8A5A00" strokeWidth="2.5" />
            <rect x="9" y="16" width="22" height="3.5" fill="#3A2A12" />
            <rect x="9" y="23" width="22" height="3.5" fill="#3A2A12" />
          </svg>
        </div>
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { session, account, needsInvite, signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session && account) {
    return (
      <Shell title={`Halo, ${account.name}`} sub={`${ROLE_LABEL[account.role]} · ${DEPTS[account.primary_dept]?.name}`}>
        <button className="save" onClick={() => go('/')}>
          Masuk ke koloni
        </button>
        <button className="link-btn" onClick={signOut}>
          Keluar dari akun
        </button>
      </Shell>
    );
  }
  if (session && needsInvite) {
    go(`/join`);
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Isi email dan password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const prof = await signIn(email.trim(), password);
      go(prof ? '/' : '/join');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Masuk ke Hive Colony" sub="Pakai email dan password akun staff kamu.">
      <form onSubmit={submit} className="auth-form">
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="save" disabled={busy}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
      <p className="auth-foot">
        Punya kode undangan dari admin? <button className="link-btn" onClick={() => go('/join')}>Daftar di sini</button>
      </p>
    </Shell>
  );
}

export function JoinPage() {
  const { session, account, signUpWithInvite, acceptInvite, inviteError, signOut } = useAuth();
  const [code, setCode] = useState(queryParam('code'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (session && account) go('/avatar');
  }, [session, account]);
  useEffect(() => {
    if (inviteError) setError(inviteError);
  }, [inviteError]);

  if (sent) {
    return (
      <Shell title="Cek email kamu" sub="Kami mengirim link konfirmasi. Setelah klik link itu, masuk dengan email dan password yang tadi kamu buat. Kode undangan akan dipakai otomatis.">
        <button className="save" onClick={() => go('/login')}>
          Ke halaman masuk
        </button>
        <p className="auth-foot">Belum ada email setelah beberapa menit? Cek folder Spam/Promosi. Kalau email kamu sudah pernah dipakai di aplikasi kantor lain, langsung saja Masuk dengan password akun itu.</p>
      </Shell>
    );
  }

  const loggedInNoProfile = !!session && !account;

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || (!loggedInNoProfile && (!email.trim() || password.length < 6))) {
      setError(loggedInNoProfile ? 'Isi kode undangan dan nama.' : 'Isi semua kolom. Password minimal 6 karakter.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (loggedInNoProfile) {
        await acceptInvite(code, name.trim());
        go('/avatar');
      } else {
        const res = await signUpWithInvite({ email: email.trim(), password, name: name.trim(), code: code.trim() });
        if (res.existing) {
          setError('Email ini sudah punya akun (mungkin dari aplikasi kantor lain). Silakan Masuk dengan password akun itu; kode undangan dipakai otomatis.');
        } else if (res.confirmEmail) setSent(true);
        else go('/avatar');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={loggedInNoProfile ? 'Aktifkan akun kamu' : 'Gabung ke Hive Colony'}
      sub={
        loggedInNoProfile
          ? `Kamu sudah login sebagai ${session.user.email}, tapi akun ini belum terhubung ke undangan Hive Colony. Masukkan kode undangan dari admin.`
          : 'Divisi dan peranmu sudah ditentukan admin lewat kode undangan.'
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label>
          Kode undangan
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="a1b2c3d4e5f6" />
        </label>
        <label>
          Nama panggilan
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Dina" />
        </label>
        {!loggedInNoProfile && (
          <>
            <label>
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" />
            </label>
            <label>
              Buat password
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" />
            </label>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="save" disabled={busy}>
          {busy ? 'Memproses…' : loggedInNoProfile ? 'Pakai kode undangan' : 'Daftar'}
        </button>
      </form>
      {loggedInNoProfile ? (
        <p className="auth-foot">
          Salah akun? <button className="link-btn" onClick={signOut}>Keluar dan pakai email lain</button>
        </p>
      ) : (
        <p className="auth-foot">
          Sudah punya akun? <button className="link-btn" onClick={() => go('/login')}>Masuk</button>
        </p>
      )}
    </Shell>
  );
}

export function InvitePage() {
  const account = useAuth((s) => s.account);
  const [primary, setPrimary] = useState(account?.role === 'lead' ? account.primary_dept : 'ops');
  const [extra, setExtra] = useState([]);
  const [role, setRole] = useState('staff');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [copied, setCopied] = useState('');

  const link = (code) => `${window.location.origin}${window.location.pathname}#/join?code=${code}`;
  const load = async () => {
    const { data } = await supabase.from('hc_invites').select('*').order('created_at', { ascending: false }).limit(30);
    setList(data || []);
  };
  useEffect(() => {
    if (account) load();
  }, [account]);

  if (!account || !['owner', 'lead'].includes(account.role)) {
    return (
      <Shell title="Undang staff" sub="Hanya owner atau kepala divisi yang bisa membuat undangan.">
        <button className="save" onClick={() => go(account ? '/' : '/login')}>
          {account ? 'Kembali ke koloni' : 'Masuk dulu'}
        </button>
      </Shell>
    );
  }
  const isOwner = account.role === 'owner';

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('hc_create_invite', {
      p_primary_dept: primary,
      p_depts: extra.filter((d) => d !== primary),
      p_role: role,
      p_email: email.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setEmail('');
      load();
    }
  };
  const remove = async (code) => {
    await supabase.from('hc_invites').delete().eq('code', code);
    load();
  };
  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(link(code));
      setCopied(code);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <button className="back" onClick={() => go('/')}>
            ← Kembali ke koloni
          </button>
          <div>
            <h1>Undang staff</h1>
            <p>Buat link undangan yang terkunci ke divisi dan peran. Staff tidak bisa mengubahnya sendiri.</p>
          </div>
        </div>
        <div className="invite-grid">
          <form className="creator-form" onSubmit={create}>
            <div className="field">
              <div className="field-label">Divisi utama</div>
              <select value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={!isOwner}>
                {STAFF_DEPTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPTS[d].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="field-label">Divisi tambahan (opsional)</div>
              <div className="opts">
                {STAFF_DEPTS.filter((d) => d !== primary && d !== 'ceo').map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`opt${extra.includes(d) ? ' on' : ''}`}
                    onClick={() => setExtra((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                  >
                    {DEPTS[d].short}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="field-label">Peran</div>
              <div className="opts">
                {(isOwner ? ['owner', 'lead', 'staff', 'viewer'] : ['staff', 'viewer']).map((r) => (
                  <button type="button" key={r} className={`opt${role === r ? ' on' : ''}`} onClick={() => setRole(r)}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="field-label">Kunci ke email (opsional)</div>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" />
              <div className="field-hint">Kalau diisi, hanya email itu yang bisa memakai undangan ini.</div>
            </div>
            {error && <div className="error">{error}</div>}
            <button className="save" disabled={busy}>
              {busy ? 'Membuat…' : 'Buat link undangan'}
            </button>
          </form>
          <div className="creator-form">
            <div className="field-label">Undangan terbaru</div>
            {list.length === 0 && <p className="field-hint">Belum ada undangan.</p>}
            <div className="invite-list">
              {list.map((inv) => (
                <div key={inv.code} className={`invite${inv.used_by ? ' used' : ''}`}>
                  <div>
                    <b>{DEPTS[inv.primary_dept]?.short}</b> · {ROLE_LABEL[inv.role]}
                    {inv.email && <span className="muted"> · {inv.email}</span>}
                    <div className="field-hint">
                      {inv.used_by ? `Sudah dipakai ${new Date(inv.used_at).toLocaleDateString('id-ID')}` : `Berlaku sampai ${new Date(inv.expires_at).toLocaleDateString('id-ID')}`}
                    </div>
                  </div>
                  {!inv.used_by && (
                    <div className="invite-actions">
                      <button className="opt" onClick={() => copy(inv.code)}>
                        {copied === inv.code ? 'Tersalin' : 'Salin link'}
                      </button>
                      <button className="opt" onClick={() => remove(inv.code)}>
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
