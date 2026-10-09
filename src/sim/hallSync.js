// Sinkronisasi Hive Hall dengan Supabase (persetujuan, papan rencana, log aktivitas manusia).
// Tanpa login, Hive Hall tetap berjalan dengan data demo lokal.
import { supabase } from '../lib/supabase';
import { useHive } from './store';
import { useAuth } from './auth';

let channel = null;

const toApproval = (r) => ({ id: r.id, title: r.title, by: r.requested_by, dept: r.dept, detail: r.detail, status: r.status });
const toTask = (r) => ({ id: r.id, title: r.title, who: r.who, kind: r.kind, col: r.col });

async function loadAll() {
  const [ap, tk, act] = await Promise.all([
    supabase.from('hc_approvals').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('hc_plan_tasks').select('*').order('sort', { ascending: true }),
    supabase.from('hc_activity').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  const patch = {};
  if (!ap.error) patch.approvals = ap.data.map(toApproval);
  if (!tk.error) patch.planTasks = tk.data.map(toTask);
  if (!act.error) patch.dbActivity = act.data;
  useHive.setState(patch);
}

export async function startHallSync() {
  stopHallSync();
  await loadAll();
  channel = supabase
    .channel('hc-hall')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_approvals' }, loadAll)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hc_plan_tasks' }, loadAll)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hc_activity' }, loadAll)
    .subscribe();
}

export function stopHallSync() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  useHive.setState({ dbActivity: [] });
}

const online = () => !!useAuth.getState().account;
const myName = () => useAuth.getState().account?.name || 'Owner';

async function logActivity(kind, dept, text) {
  await supabase.from('hc_activity').insert({ kind, dept, text });
}

const VERB = { approved: 'menyetujui', revise: 'meminta revisi', rejected: 'menolak' };

export async function decideApproval(a, status) {
  if (!online()) {
    const s = useHive.getState();
    s.decideApproval(a.id, status);
    s.pushLog({ id: `ap-${a.id}-${Date.now()}`, kind: 'done', dept: a.dept, text: `Owner ${VERB[status]}: ${a.title}`, clock: s.stats.clock });
    return;
  }
  const uid = useAuth.getState().session.user.id;
  const { error } = await supabase
    .from('hc_approvals')
    .update({ status, decided_by: uid, decided_at: new Date().toISOString() })
    .eq('id', a.id);
  if (error) throw new Error(error.message.includes('row-level') ? 'Hanya owner atau kepala divisi yang bisa memutuskan.' : error.message);
  await logActivity('approval', a.dept, `${myName()} ${VERB[status]}: ${a.title}`);
}

const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
const COL_NAME = { todo: 'Belum', doing: 'Jalan', done: 'Selesai' };

export async function advanceTask(t) {
  if (!online()) {
    useHive.getState().advanceTask(t.id);
    return;
  }
  const col = NEXT[t.col];
  const uid = useAuth.getState().session.user.id;
  const { error } = await supabase
    .from('hc_plan_tasks')
    .update({ col, updated_by: uid, updated_at: new Date().toISOString() })
    .eq('id', t.id);
  if (error) throw new Error(error.message.includes('row-level') ? 'Akun viewer tidak bisa memindah tugas.' : error.message);
  await logActivity('task', null, `${myName()} memindah "${t.title}" ke ${COL_NAME[col]}`);
}
