// Pratinjau avatar staff 2D (SVG) dengan animasi joget berbasis CSS (lihat avatar.css).
import { DEPTS } from '../data/hive';

export function AvatarPreview({ p, pose = 'idle', showBadge = true, className = '' }) {
  const deptLabel = (DEPTS[p.dept]?.short || '').slice(0, 3).toUpperCase();
  const hairPath = p.hair === 'short' || p.hair === 'long' || p.hair === 'pony';
  return (
    <svg className={`avp ${className}`} data-pose={pose} viewBox="0 0 200 250" role="img" aria-label={`Avatar ${p.name || 'staff'}`}>
      <ellipse cx="100" cy="240" rx="55" ry="7" fill="#E7C98A" opacity="0.6" />
      <g className="notes" fill="#C98A00">
        <text x="160" y="60" fontSize="18">♪</text>
        <text x="30" y="80" fontSize="14">♫</text>
      </g>
      <g className="bd">
        <g className="wg">
          <ellipse cx="62" cy="158" rx="30" ry="17" fill="#FFFFFF" fillOpacity="0.85" stroke="#C0C5CE" transform="rotate(-25 62 158)" />
          <ellipse cx="138" cy="158" rx="30" ry="17" fill="#FFFFFF" fillOpacity="0.85" stroke="#C0C5CE" transform="rotate(25 138 158)" />
        </g>
        <g className="hd">
          {p.hair === 'long' && <path d="M50 92 Q48 175 70 180 L130 180 Q152 175 150 92Z" fill={p.hairColor} />}
          {p.hair === 'pony' && <circle cx="152" cy="80" r="16" fill={p.hairColor} />}
        </g>
        <g className="ll">
          <rect x="88" y="214" width="9" height="22" rx="3" fill="#3A2A12" />
        </g>
        <g className="lr">
          <rect x="103" y="214" width="9" height="22" rx="3" fill="#3A2A12" />
        </g>
        <g className="al">
          <rect x="52" y="150" width="18" height="50" rx="9" fill={p.outfitColor} />
          <circle cx="61" cy="202" r="9" fill={p.skin} />
          {p.tattoo === 'arm' && (
            <polygon points="61,168 66,171 66,177 61,180 56,177 56,171" fill="none" stroke="#3A2A12" strokeWidth="1.4" />
          )}
        </g>
        <g className="ar">
          <rect x="130" y="150" width="18" height="50" rx="9" fill={p.outfitColor} />
          <circle cx="139" cy="202" r="9" fill={p.skin} />
        </g>
        <rect x="64" y="145" width="72" height="75" rx="26" fill={p.outfitColor} />
        {p.outfit === 'hoodie' && (
          <g>
            <rect x="66" y="178" width="68" height="9" fill="#3A2A12" />
            <rect x="66" y="196" width="68" height="9" fill="#3A2A12" />
            <path d="M76 147 Q100 165 124 147" fill="none" stroke="#C98A00" strokeWidth="5" />
          </g>
        )}
        {p.outfit === 'tee' && <polygon points="100,172 112,179 112,193 100,200 88,193 88,179" fill="#FFF8E7" />}
        {p.outfit === 'jacket' && <line x1="100" y1="150" x2="100" y2="219" stroke="#FFF8E7" strokeWidth="3" />}
        {p.outfit === 'shirt' && <polygon points="84,146 100,166 116,146 108,146 100,156 92,146" fill="#FFF8E7" />}
        {showBadge && (
          <g>
            <rect x="110" y="150" width="24" height="12" rx="3" fill={DEPTS[p.dept]?.color || '#FF8C1A'} />
            <text x="122" y="159" textAnchor="middle" fontSize="8" fill="#FFFFFF">
              {deptLabel}
            </text>
          </g>
        )}
        <g className="hd">
          <circle cx="100" cy="95" r="50" fill={p.skin} />
          {p.tattoo === 'cheek' && (
            <polygon points="128,112 133,115 133,121 128,124 123,121 123,115" fill="none" stroke="#3A2A12" strokeWidth="1.3" />
          )}
          {hairPath && <path d="M50 92 Q50 42 100 42 Q150 42 150 92 Q138 66 100 64 Q66 64 50 92Z" fill={p.hairColor} />}
          {p.hair === 'mohawk' && <path d="M90 30 Q100 22 110 30 L112 70 L88 70Z" fill={p.hairColor} />}
          {p.expr === 'happy' && (
            <g>
              <path d="M76 98 Q83 90 90 98" fill="none" stroke="#2B2B2E" strokeWidth="3" strokeLinecap="round" />
              <path d="M110 98 Q117 90 124 98" fill="none" stroke="#2B2B2E" strokeWidth="3" strokeLinecap="round" />
              <path d="M90 115 Q100 124 110 115" fill="none" stroke="#6B4416" strokeWidth="3" strokeLinecap="round" />
            </g>
          )}
          {p.expr === 'hype' && (
            <g>
              <circle cx="83" cy="96" r="7" fill="#2B2B2E" />
              <circle cx="117" cy="96" r="7" fill="#2B2B2E" />
              <circle cx="86" cy="93" r="2.5" fill="#fff" />
              <circle cx="120" cy="93" r="2.5" fill="#fff" />
              <path d="M90 112 Q100 128 110 112Z" fill="#6B4416" />
            </g>
          )}
          {p.expr === 'chill' && (
            <g stroke="#2B2B2E" strokeWidth="3" strokeLinecap="round">
              <line x1="76" y1="97" x2="90" y2="97" />
              <line x1="110" y1="97" x2="124" y2="97" />
              <line x1="93" y1="116" x2="107" y2="116" stroke="#6B4416" />
            </g>
          )}
          {p.expr === 'wink' && (
            <g>
              <circle cx="83" cy="96" r="5" fill="#2B2B2E" />
              <path d="M110 97 Q117 91 124 97" fill="none" stroke="#2B2B2E" strokeWidth="3" strokeLinecap="round" />
              <path d="M90 114 Q100 122 110 114" fill="none" stroke="#6B4416" strokeWidth="3" strokeLinecap="round" />
            </g>
          )}
          <ellipse cx="72" cy="110" rx="7" ry="4" fill="#FF9E7A" opacity="0.8" />
          <ellipse cx="128" cy="110" rx="7" ry="4" fill="#FF9E7A" opacity="0.8" />
          {p.acc === 'glasses' && (
            <g fill="none" stroke="#2B2B2E" strokeWidth="3">
              <circle cx="83" cy="97" r="11" />
              <circle cx="117" cy="97" r="11" />
              <line x1="94" y1="97" x2="106" y2="97" />
            </g>
          )}
          {p.acc === 'cap' && (
            <g>
              <path d="M52 78 Q54 40 100 40 Q146 40 148 78Z" fill="#FF8C1A" />
              <path d="M100 76 L160 80 Q158 70 146 70Z" fill="#C98A00" />
            </g>
          )}
          {p.acc === 'band' && <rect x="51" y="70" width="98" height="10" rx="5" fill="#FF8C1A" />}
          {p.acc === 'ear' && (
            <g fill="#F5B700" stroke="#8A5A00">
              <circle cx="52" cy="108" r="4" />
              <circle cx="148" cy="108" r="4" />
            </g>
          )}
        </g>
      </g>
      <g className="drop">
        <rect x="138" y="18" width="56" height="24" rx="6" fill="#FF8C1A" />
        <text x="166" y="35" textAnchor="middle" fontSize="13" fontWeight="600" fill="#FFF8E7">
          DROP!
        </text>
      </g>
    </svg>
  );
}
