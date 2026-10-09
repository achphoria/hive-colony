// Realtime Presence: staff yang sedang online muncul di taman semua orang, termasuk jogetnya.
// Posisi jalan tiap avatar disimulasikan di masing-masing browser; yang disinkronkan adalah
// siapa yang online, tampilan avatarnya, halaman yang dibuka, dan joget yang sedang dimainkan.
import { supabase } from '../lib/supabase';
import { useHive } from './store';
import { upsertWalker, removeWalker, danceNow, outdoor } from './outdoor';

let channel = null;
let me = null;
let myState = null;
const lastDance = {};

const page = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];

export function startPresence(uid, profile) {
  stopPresence();
  me = uid;
  channel = supabase.channel('hc-colony', { config: { presence: { key: uid } } });
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const seen = new Set();
    const others = [];
    for (const [key, metas] of Object.entries(state)) {
      if (key === me) continue;
      const m = metas[metas.length - 1];
      if (!m?.profile) continue;
      const wid = `u-${key}`;
      seen.add(wid);
      upsertWalker({ ...m.profile, id: wid });
      if (m.danceAt && lastDance[wid] !== m.danceAt) {
        lastDance[wid] = m.danceAt;
        danceNow(wid, m.pose);
      }
      others.push({
        id: key,
        name: m.profile.name,
        dept: m.profile.dept,
        outfitColor: m.profile.outfitColor,
        profile: m.profile,
        page: m.page,
        dancing: m.danceAt && Date.now() - m.danceAt < 7000,
      });
    }
    for (const w of [...outdoor.walkers]) {
      if (w.id.startsWith('u-') && !seen.has(w.id)) removeWalker(w.id);
    }
    useHive.setState({ onlineStaff: others });
    useHive.getState().bumpOutdoor();
  });
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      myState = { profile, page: page(), pose: null, danceAt: null };
      await channel.track(myState);
    }
  });
  window.addEventListener('hashchange', onHash);
}

function onHash() {
  updatePresence({ page: page() });
}

export function updatePresence(patch) {
  if (!channel || !myState) return;
  myState = { ...myState, ...patch };
  channel.track(myState);
}

export function stopPresence() {
  window.removeEventListener('hashchange', onHash);
  if (channel) supabase.removeChannel(channel);
  channel = null;
  myState = null;
  for (const w of [...outdoor.walkers]) if (w.id.startsWith('u-')) removeWalker(w.id);
  useHive.setState({ onlineStaff: [] });
}
