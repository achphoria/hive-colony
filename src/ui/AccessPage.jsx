// Akses agent (#/akses, khusus owner): atur agent mana yang boleh dihubungi tiap staff.
// Tingkat: Pakai (chat, perintah, nilai) dan Pelatih (juga mengubah skill agent). Owner selalu akses penuh;
// staff baru tidak punya akses sampai diatur di sini. Dijaga juga oleh RLS & Edge Function agent-chat.
import { useEffect, useState } from 'react';
import { AGENTS, DEPTS } from '../data/hive';
import { useAuth } from '../sim/auth';
import { supabase } from '../lib/supabase';
import { go } from './nav';

const DEPT_ORDER = ['ceo', 'cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];
const ROLE_LABEL = { owner: 'Owner', lead: 'Kepala divisi', staff: 'Staff', viewer: 'Viewer' };
const NEXT = { none: 'use', use: 'train', train: 'none' };
const LEVEL = { none: 'Tanpa akses', use: 'Pakai', train: 'Pelatih' };

export function AccessPage() {
  const account = useAuth((s) => s.account);
  const [staff, setStaff] = useState(null);
  const [access, setAccess] = useState({}); // { userId: { agentId: level } }
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [p, a] = await Promise.all([
      supabase.from('hc_profiles').select('id, name, role, primary_dept, depts').order('created_at'),
      supabase.from('hc_agent_access').select('user_id, agent_id, level'),
    ]);
    setStaff((p.data || []).filter((x) => x.role !== 'owner'));
    const map = {};
    for (const r of a.data || []) (map[r.user_id] ||= {})[r.agent_id] = r.level;
    setAccess(map);
  };
  useEffect(() => {
    if (account?.role === 'owner') load();
  }, [account]);

  if (!account || account.role !== 'owner') {
    return (
      <div className="page aw-page">
        <div className="aw-empty-card">
          <h1>Akses agent</h1>
          <p>Hanya owner yang bisa mengatur akses staff ke agent AI.</p>
          <button className="save" onClick={() => go(account ? '/' : '/login')}>
            {account ? 'Kembali ke koloni' : 'Masuk'}
          </button>
        </div>
      </div>
    );
  }

  // simpan satu atau beberapa perubahan: level 'none' = hapus akses
  const apply = async (userId, changes) => {
    setError('');
    setSaving(userId);
    const ups = changes.filter((c) => c.level !== 'none').map((c) => ({ user_id: userId, agent_id: c.agent, level: c.level }));
    const dels = changes.filter((c) => c.level === 'none').map((c) => c.agent);
    const r1 = ups.length ? await supabase.from('hc_agent_access').upsert(ups) : { error: null };
    const r2 = dels.length ? await supabase.from('hc_agent_access').delete().eq('user_id', userId).in('agent_id', dels) : { error: null };
    setSaving('');
    if (r1.error || r2.error) {
      setError((r1.error || r2.error).message);
      return;
    }
    setAccess((m) => {
      const cur = { ...(m[userId] || {}) };
      for (const c of changes) {
        if (c.level === 'none') delete cur[c.agent];
        else cur[c.agent] = c.level;
      }
      return { ...m, [userId]: cur };
    });
  };

  return (
    <div className="page aw-page">
      <header className="aw-top">
        <button className="back" onClick={() => go('/agent')}>
          ← <span className="lbl">Ruang kerja</span>
        </button>
        <h1>Akses agent</h1>
      </header>
      <p className="aw-intro">
        Klik agent untuk mengganti akses: <span className="acc-chip none">Tanpa akses</span> → <span className="acc-chip use">Pakai</span> →{' '}
        <span className="acc-chip train">Pelatih</span>. Pakai = chat, perintah, dan menilai jawaban. Pelatih = juga boleh mengubah skill agent. Owner selalu punya akses penuh.
      </p>
      {error && <div className="error">{error}</div>}
      {staff === null && <p className="muted">Memuat staff…</p>}
      {staff && staff.length === 0 && <p className="muted">Belum ada staff selain owner. Undang staff dulu di halaman Undang staff.</p>}
      <div className="acc-list">
        {staff?.map((s) => {
          const mine = access[s.id] || {};
          const count = Object.keys(mine).length;
          return (
            <div key={s.id} className={`acc-card${saving === s.id ? ' saving' : ''}`}>
              <div className="acc-head">
                <b>{s.name}</b>
                <span className="muted">
                  {ROLE_LABEL[s.role] || s.role} · {DEPTS[s.primary_dept]?.short}
                </span>
                <span className="acc-count">{count ? `${count} agent` : 'Belum ada akses'}</span>
              </div>
              {DEPT_ORDER.map((d) => {
                const agents = AGENTS.filter((a) => a.dept === d);
                const home = d === s.primary_dept || (s.depts || []).includes(d);
                return (
                  <div key={d} className={`acc-dept${home ? ' home' : ''}`}>
                    <span className="acc-dname">
                      <i style={{ background: DEPTS[d].color }} />
                      {DEPTS[d].short}
                    </span>
                    <div className="acc-chips">
                      {agents.map((a) => {
                        const lv = mine[a.id] || 'none';
                        return (
                          <button key={a.id} className={`acc-chip ${lv}`} title={LEVEL[lv]} onClick={() => apply(s.id, [{ agent: a.id, level: NEXT[lv] }])}>
                            {a.nick}
                            {lv === 'train' && ' ★'}
                          </button>
                        );
                      })}
                    </div>
                    <div className="acc-quick">
                      <button onClick={() => apply(s.id, agents.map((a) => ({ agent: a.id, level: 'use' })))}>Pakai semua</button>
                      <button onClick={() => apply(s.id, agents.map((a) => ({ agent: a.id, level: 'none' })))}>Kosongkan</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
