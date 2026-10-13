// Data Ruang Kerja Agent: kesehatan server agent (n8n di PC kantor), akses saya ke tiap agent,
// riwayat percakapan, dan kirim pesan lewat Edge Function agent-chat.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';

const HEALTH_MS = 2 * 60 * 1000; // server mencache hasil 2 menit, jadi polling tidak membebani PC

// online: null (belum dicek) | true | false
export const useAgentNet = create(() => ({ online: null, checkedAt: null }));
// levels: { agent_id: 'use' | 'train' }; owner = akses penuh ke semua agent
export const useAgentAccess = create(() => ({ loaded: false, owner: false, levels: {} }));

let healthTimer = null;
async function checkHealth() {
  if (!useAuth.getState().account || document.hidden) return;
  const { data, error } = await supabase.functions.invoke('agent-chat', { body: { action: 'health' } });
  if (error || !data) return;
  useAgentNet.setState({ online: !!data.online, checkedAt: data.checked_at || null });
}

export async function loadAccess() {
  const acc = useAuth.getState().account;
  const uid = useAuth.getState().session?.user?.id;
  if (!acc || !uid) {
    useAgentAccess.setState({ loaded: true, owner: false, levels: {} });
    return;
  }
  if (acc.role === 'owner') {
    useAgentAccess.setState({ loaded: true, owner: true, levels: {} });
    return;
  }
  const { data } = await supabase.from('hc_agent_access').select('agent_id, level').eq('user_id', uid);
  useAgentAccess.setState({ loaded: true, owner: false, levels: Object.fromEntries((data || []).map((r) => [r.agent_id, r.level])) });
}

export function startAgentWatch() {
  stopAgentWatch();
  checkHealth();
  loadAccess();
  healthTimer = setInterval(checkHealth, HEALTH_MS);
  document.addEventListener('visibilitychange', checkHealth);
}

export function stopAgentWatch() {
  clearInterval(healthTimer);
  healthTimer = null;
  document.removeEventListener('visibilitychange', checkHealth);
  useAgentNet.setState({ online: null, checkedAt: null });
  useAgentAccess.setState({ loaded: false, owner: false, levels: {} });
}

// tingkat akses saya: 'owner' | 'train' | 'use' | null
export function levelFor(state, agentId) {
  if (state.owner) return 'owner';
  return state.levels[agentId] || null;
}

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  no_access: 'Kamu belum punya akses ke agent ini. Minta owner mengaturnya di halaman Akses agent.',
  unknown_agent: 'Agent ini belum aktif.',
  empty_message: 'Tulis pesan dulu.',
};

// kirim pesan; hasil: { thread_id, reply, status, meta }
export async function sendToAgent({ agent, message, threadId }) {
  const { data, error } = await supabase.functions.invoke('agent-chat', { body: { action: 'send', agent, message, thread_id: threadId || undefined } });
  if (error) {
    let body = {};
    try {
      body = await error.context.json();
    } catch {
      /* bukan JSON */
    }
    throw new Error(ERR[body.error] || 'Pesan gagal dikirim. Coba lagi.');
  }
  return data;
}

export async function loadThreads(agentId) {
  const { data } = await supabase
    .from('hc_agent_threads')
    .select('id, title, user_id, updated_at')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(40);
  return data || [];
}

export async function loadMessages(threadId) {
  const { data } = await supabase
    .from('hc_agent_messages')
    .select('id, role, content, meta, created_at')
    .eq('thread_id', threadId)
    .order('created_at')
    .limit(200);
  return data || [];
}

export async function deleteThread(threadId) {
  await supabase.from('hc_agent_threads').delete().eq('id', threadId);
}
