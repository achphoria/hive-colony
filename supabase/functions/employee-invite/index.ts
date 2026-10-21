// Edge Function: employee-invite
// Owner / kepala divisi mengirim undangan ke email karyawan (data di hc_employees).
//   POST { employee_id } -> { status: 'sent' | 'existing_account', link }
// 1) kode undangan dibuat lewat RPC hc_create_invite atas nama pengirim (aturan divisi/peran tetap berlaku)
// 2) email dikirim lewat fitur "Invite user" Supabase Auth (template: supabase/email-templates/invite.html).
//    Link di email langsung memasukkan karyawan; kode undangan ikut di metadata akun dan dipakai otomatis,
//    lalu karyawan diminta membuat password.
// Email yang sudah punya akun tidak bisa diundang lewat Supabase: link #/join?code=… dikembalikan untuk dikirim manual.
// Secret opsional: SITE_URL (bawaan https://achphoria.github.io/hive-colony/), harus ada di Auth -> Redirect URLs.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const REQUIRED = ['full_name', 'nickname', 'gender', 'birth_place', 'birth_date', 'photo_path', 'email', 'phone', 'emergency_name', 'emergency_relation', 'emergency_phone'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_logged_in' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await asUser.auth.getUser(jwt);
  if (uErr || !u?.user) return json({ error: 'not_logged_in' }, 401);
  const { data: me } = await asUser.from('hc_profiles').select('role').eq('id', u.user.id).maybeSingle();
  if (!me || !['owner', 'lead'].includes(me.role)) return json({ error: 'not_allowed' }, 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body?.employee_id ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'bad_employee' }, 400);

  // dibaca dengan identitas pengirim: lead hanya bisa mengundang karyawan divisinya (RLS)
  const { data: emp } = await asUser.from('hc_employees').select('*').eq('id', id).maybeSingle();
  if (!emp) return json({ error: 'bad_employee' }, 404);
  const missing = REQUIRED.filter((k) => !String(emp[k] ?? '').trim());
  if (missing.length) return json({ error: 'incomplete', missing }, 422);
  const email = String(emp.email).trim().toLowerCase();

  // 1) kode undangan, terkunci ke email, divisi, dan peran karyawan
  const { error: invErr } = await asUser.rpc('hc_create_invite', {
    p_primary_dept: emp.primary_dept,
    p_depts: (emp.depts ?? []).filter((d: string) => d !== emp.primary_dept),
    p_role: emp.role,
    p_email: email,
  });
  if (invErr) return json({ error: 'invite_failed', message: invErr.message }, 400);
  const { data: inv } = await asUser.from('hc_invites').select('code').ilike('email', email).is('used_by', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!inv?.code) return json({ error: 'invite_failed', message: 'Kode undangan tidak ditemukan setelah dibuat.' }, 500);
  // undangan lama yang belum dipakai untuk email ini tidak berlaku lagi (kirim ulang = satu link aktif)
  await asUser.from('hc_invites').delete().ilike('email', email).is('used_by', null).neq('code', inv.code);

  const site = (Deno.env.get('SITE_URL') || 'https://achphoria.github.io/hive-colony/').replace(/\/?$/, '/');
  const link = `${site}#/join?code=${inv.code}`;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 2) email undangan Supabase Auth
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: site,
    data: { invite_code: inv.code, name: emp.nickname, full_name: emp.full_name, needs_password: true },
  });
  let status = 'sent';
  if (sendErr) {
    if (/already been registered|already registered|exists/i.test(sendErr.message)) status = 'existing_account';
    else {
      console.error('invite email', sendErr.message);
      return json({ error: 'email_failed', message: sendErr.message, link }, 502);
    }
  }

  await admin.from('hc_employees').update({ invite_code: inv.code, invited_at: new Date().toISOString(), invite_status: status, updated_at: new Date().toISOString() }).eq('id', id);
  return json({ status, link });
});
