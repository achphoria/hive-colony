// Queen Bea tersambung ke Claude lewat Edge Function "queen-bea" (khusus staff yang login).
// Kunci API Anthropic tersimpan di Supabase Edge Function Secrets, tidak pernah ada di website.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuth } from '../sim/auth';

// status: unknown | on | off (off = belum login atau kunci API belum dipasang)
// busy: jumlah pertanyaan yang sedang dijawab (untuk status "Kerja" di daftar agent)
export const useAi = create(() => ({ status: 'unknown', model: '', busy: 0 }));

const ERR = {
  not_logged_in: 'Sesi login habis. Silakan login ulang.',
  not_hive_staff: 'Akun ini belum terdaftar sebagai staff Hive Colony.',
  ai_not_configured: 'Queen Bea belum tersambung ke AI: kunci API Anthropic belum dipasang di Supabase.',
  ai_key_invalid: 'Kunci API Anthropic ditolak. Periksa ANTHROPIC_API_KEY di Supabase.',
  ai_busy: 'Queen Bea sedang sibuk (batas permintaan). Coba lagi sebentar lagi.',
  empty_message: 'Pesannya kosong.',
};

export const modelLabel = (m) => (m ? m.replace('claude-', 'Claude ').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace('haiku', 'Haiku').replace('sonnet', 'Sonnet').replace('opus', 'Opus') : 'Claude');

export async function checkAi() {
  if (!useAuth.getState().account) {
    useAi.setState({ status: 'off', model: '' });
    return;
  }
  const { data, error } = await supabase.functions.invoke('queen-bea', { body: { action: 'status' } });
  useAi.setState(error || !data ? { status: 'off' } : { status: data.configured ? 'on' : 'off', model: data.model || '' });
}

// messages: [{ role: 'user' | 'assistant', content }]; transcript (meeting): [{ who, text }]
// hasil: { reply, sources: [{ title, url }], researched }
export async function askQueenBea({ messages, mode = 'chat', transcript }) {
  useAi.setState((s) => ({ busy: s.busy + 1 }));
  const { data, error } = await supabase.functions
    .invoke('queen-bea', { body: { messages, mode, transcript } })
    .finally(() => useAi.setState((s) => ({ busy: Math.max(0, s.busy - 1) })));
  if (error) {
    let body = {};
    try {
      body = await error.context.json();
    } catch {
      /* bukan JSON */
    }
    if (body.error === 'ai_not_configured') useAi.setState({ status: 'off' });
    const extra = body.status === 400 ? ' (cek saldo kredit Claude Console)' : '';
    throw new Error(ERR[body.error] || `Queen Bea gagal menjawab${extra}. Coba lagi.`);
  }
  useAi.setState({ status: 'on' });
  return { reply: data.reply, sources: Array.isArray(data.sources) ? data.sources : [], researched: !!data.researched };
}
