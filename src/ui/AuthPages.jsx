import { useEffect, useState } from 'react';
import { DEPTS } from '../data/hive';
import { useAuth } from '../sim/auth';
import { go } from './nav';

const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };

const queryParam = (k) => new URLSearchParams(window.location.hash.split('?')[1] || '').get(k) || '';

function Shell({ title, sub, children, noBack }) {
  const inside = useAuth((s) => !!s.account) && !noBack;
  return (
    <div className="page auth-page">
      <div className="auth-card">
        {inside && (
          <button className="back" onClick={() => go('/')}>
            ← Koloni
          </button>
        )}
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
    <Shell title="Masuk ke Hive Colony" sub="Khusus staff. Pakai email dan password akun kamu. Sesi berakhir otomatis setiap jam 00:00 WIB.">
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

// Karyawan yang masuk lewat link undangan email (halaman Employee) belum punya password.
export function SetPasswordPage() {
  const { account, setPassword, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Password minimal 8 karakter.');
    if (pw !== pw2) return setError('Kedua password belum sama.');
    setBusy(true);
    setError('');
    try {
      await setPassword(pw);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell noBack title={`Selamat datang, ${account?.name || 'rekan'}!`} sub="Buat password untuk masuk ke Hive Colony berikutnya. Email login kamu adalah email yang menerima undangan.">
      <form className="auth-form" onSubmit={submit}>
        <label>
          Password baru
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} autoFocus />
        </label>
        <label>
          Ulangi password
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="save" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan password'}
        </button>
      </form>
      <button className="link-btn" onClick={signOut}>
        Bukan kamu? Keluar
      </button>
    </Shell>
  );
}
