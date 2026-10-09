import { useState } from 'react';
import { DEPTS } from '../data/hive';
import { AVATAR_OPTIONS, DEFAULT_PROFILE, POSES, saveProfile } from '../data/staff';
import { useHive } from '../sim/store';
import { upsertWalker, danceNow } from '../sim/outdoor';
import { AvatarPreview } from './AvatarPreview';
import { go } from './nav';

const STAFF_DEPTS = ['cx', 'ops', 'it', 'mkt', 'fin', 'prod', 'hr'];

function Chips({ field, value, onPick }) {
  return (
    <div className="opts">
      {AVATAR_OPTIONS[field].map(([v, label]) => (
        <button key={v} className={`opt${value === v ? ' on' : ''}`} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ field, value, onPick }) {
  return (
    <div className="opts">
      {AVATAR_OPTIONS[field].map(([v, label]) => (
        <button
          key={v}
          className={`sw${value === v ? ' on' : ''}`}
          style={{ background: v }}
          aria-label={label}
          title={label}
          onClick={() => onPick(v)}
        />
      ))}
    </div>
  );
}

export function AvatarCreator() {
  const saved = useHive((s) => s.profile);
  const [p, setP] = useState(saved || DEFAULT_PROFILE);
  const [preview, setPreview] = useState(saved?.pose || 'pargoy');
  const [error, setError] = useState('');
  const set = (k) => (v) => setP((old) => ({ ...old, [k]: v }));

  const save = () => {
    const name = p.name.trim();
    if (!name) {
      setError('Isi nama dulu supaya teman kantor tahu ini kamu.');
      return;
    }
    const profile = { ...p, name, id: 'me' };
    saveProfile(profile);
    upsertWalker(profile);
    useHive.getState().setProfile(profile);
    danceNow('me', profile.pose === 'idle' ? 'pargoy' : profile.pose);
    go('/');
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <button className="back" onClick={() => go('/')}>
            ← Kembali ke koloni
          </button>
          <div>
            <h1>{saved ? 'Ubah avatar kamu' : 'Buat avatar kamu'}</h1>
            <p>Avatar kamu akan berjalan-jalan di taman Hive Colony dan ikut rapat di Hive Hall.</p>
          </div>
        </div>
        <div className="creator">
          <div className="creator-preview">
            <AvatarPreview p={p} pose={preview} />
            <div className="name">{p.name.trim() || 'Nama kamu'}</div>
            <div className="sub">
              {DEPTS[p.dept]?.name} · {POSES.find((x) => x.id === preview)?.name}
            </div>
          </div>
          <div className="creator-form">
            <div className="field">
              <div className="field-label">Nama panggilan</div>
              <input
                type="text"
                value={p.name}
                maxLength={20}
                placeholder="Dina"
                onChange={(e) => {
                  set('name')(e.target.value);
                  setError('');
                }}
              />
              {error && <div className="error">{error}</div>}
            </div>
            <div className="field">
              <div className="field-label">Divisi</div>
              <select value={p.dept} onChange={(e) => set('dept')(e.target.value)}>
                {STAFF_DEPTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPTS[d].name}
                  </option>
                ))}
              </select>
              <div className="field-hint">Mode demo: nanti divisi dikunci lewat link undangan dari admin.</div>
            </div>
            <div className="field">
              <div className="field-label">Joget favorit</div>
              <div className="poses">
                {POSES.map((x) => (
                  <button
                    key={x.id}
                    className={`pose${p.pose === x.id ? ' on' : ''}`}
                    onClick={() => {
                      set('pose')(x.id);
                      setPreview(x.id);
                    }}
                  >
                    <b>{x.name}</b>
                    <span>{x.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="field-label">Rambut</div>
              <Chips field="hair" value={p.hair} onPick={set('hair')} />
            </div>
            <div className="field">
              <div className="field-label">Warna rambut</div>
              <Swatches field="hairColor" value={p.hairColor} onPick={set('hairColor')} />
            </div>
            <div className="field">
              <div className="field-label">Kulit</div>
              <Swatches field="skin" value={p.skin} onPick={set('skin')} />
            </div>
            <div className="field">
              <div className="field-label">Pakaian</div>
              <Chips field="outfit" value={p.outfit} onPick={set('outfit')} />
            </div>
            <div className="field">
              <div className="field-label">Warna pakaian</div>
              <Swatches field="outfitColor" value={p.outfitColor} onPick={set('outfitColor')} />
            </div>
            <div className="field">
              <div className="field-label">Aksesoris</div>
              <Chips field="acc" value={p.acc} onPick={set('acc')} />
            </div>
            <div className="field">
              <div className="field-label">Tato</div>
              <Chips field="tattoo" value={p.tattoo} onPick={set('tattoo')} />
            </div>
            <div className="field">
              <div className="field-label">Ekspresi</div>
              <Chips field="expr" value={p.expr} onPick={set('expr')} />
            </div>
            <button className="save" onClick={save}>
              Simpan dan masuk ke koloni
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
