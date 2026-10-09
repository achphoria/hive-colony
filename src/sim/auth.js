// Akun staff (Supabase Auth email + password) dan profil hc_profiles.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { DEFAULT_PROFILE } from '../data/staff';
import { useHive } from './store';
import { upsertWalker } from './outdoor';

const PENDING_KEY = 'hive.pendingInvite';

// Profil database -> bentuk profil avatar yang dipakai scene
export function toAvatarProfile(row) {
  if (!row) return null;
  return { ...DEFAULT_PROFILE, ...(row.avatar || {}), id: 'me', name: row.name || '', dept: row.primary_dept };
}

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
  } catch {
    return null;
  }
}
function writePending(v) {
  try {
    if (v) localStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* abaikan */
  }
}

const errText = (e) => {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email atau password salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk email kamu.';
  if (/already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/Password should be/i.test(m)) return 'Password minimal 6 karakter.';
  return m;
};

export const useAuth = create((set, get) => ({
  ready: false,
  session: null,
  account: null, // baris hc_profiles
  needsInvite: false,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session });
    if (data.session) await get().loadAccount();
    set({ ready: true });
    supabase.auth.onAuthStateChange((_event, session) => {
      const had = get().session?.user?.id;
      set({ session });
      if (!session) {
        set({ account: null, needsInvite: false });
        return;
      }
      if (session.user.id !== had) get().loadAccount();
    });
  },

  loadAccount: async () => {
    const uid = get().session?.user?.id;
    if (!uid) return null;
    const { data } = await supabase.from('hc_profiles').select('*').eq('id', uid).maybeSingle();
    if (data) {
      get().applyAccount(data);
      return data;
    }
    const pending = readPending();
    if (pending?.code) {
      const { data: prof, error } = await supabase.rpc('hc_accept_invite', { p_code: pending.code, p_name: pending.name || '' });
      if (!error && prof) {
        writePending(null);
        get().applyAccount(prof);
        return prof;
      }
    }
    set({ needsInvite: true, account: null });
    return null;
  },

  applyAccount: (row) => {
    set({ account: row, needsInvite: false });
    const profile = toAvatarProfile(row);
    useHive.getState().setProfile(profile);
    upsertWalker(profile);
    useHive.getState().bumpOutdoor();
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(errText(error));
    return get().loadAccount();
  },

  // Daftar dengan kode undangan. Kalau Supabase mewajibkan konfirmasi email, kode disimpan
  // dan dipakai otomatis saat pertama kali masuk.
  signUpWithInvite: async ({ email, password, name, code }) => {
    writePending({ code, name });
    const redirect = `${window.location.origin}${window.location.pathname}#/login`;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
    if (error) throw new Error(errText(error));
    // Supabase tidak memberi error untuk email yang sudah terdaftar; tandanya identities kosong.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { existing: true };
    }
    if (!data.session) return { confirmEmail: true };
    set({ session: data.session });
    const prof = await get().loadAccount();
    if (!prof) throw new Error('Kode undangan tidak valid atau sudah dipakai.');
    return { confirmEmail: false };
  },

  acceptInvite: async (code, name) => {
    const { data, error } = await supabase.rpc('hc_accept_invite', { p_code: code.trim(), p_name: name || '' });
    if (error) throw new Error(errText(error));
    writePending(null);
    get().applyAccount(data);
    return data;
  },

  saveAvatar: async (profile) => {
    const uid = get().session?.user?.id;
    if (!uid) return;
    const { id, name, dept, ...avatar } = profile; // eslint-disable-line no-unused-vars
    const { data, error } = await supabase
      .from('hc_profiles')
      .update({ name, avatar, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select()
      .single();
    if (error) throw new Error(errText(error));
    get().applyAccount(data);
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, account: null, needsInvite: false });
  },
}));
