// Penampil lampiran di Ruang Kerja: dokumen .md/.txt/.csv/.json ditampilkan rapi (bukan teks mentah),
// gambar & poster SVG ditampilkan sebagai gambar dan bisa diunduh PNG; PDF dibuka di tab baru.
import { useEffect, useRef, useState } from 'react';
import { fileUrl } from '../hall/agentApi';
import { Rich } from './AgentWorkspace';

const isImage = (f) => f.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name || '');
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const isMd = (f) => f.type === 'text/markdown' || /\.md$/i.test(f.name || '');
const baseName = (n) => String(n || 'lampiran').replace(/\.[a-z0-9]+$/i, '');

function save(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

// pratinjau kecil gambar/poster langsung di dalam pesan
export function ImageThumbs({ files, onOpen }) {
  const imgs = (files || []).filter((f) => (f.path || f.url) && isImage(f));
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    imgs.forEach((f) =>
      f.path
        ? fileUrl(f.path).then((u) => {
            if (alive && u) setUrls((m) => ({ ...m, [f.path]: u }));
          })
        : setUrls((m) => ({ ...m, [f.url]: f.url })),
    );
    return () => {
      alive = false;
    };
  }, [imgs.map((f) => f.path || f.url).join('|')]);
  if (!imgs.length) return null;
  return (
    <div className="fv-thumbs">
      {imgs.map((f) => (
        <button key={f.path || f.url} onClick={() => (f.path ? onOpen(f) : window.open(f.url, '_blank', 'noopener'))} title={f.name}>
          {urls[f.path || f.url] ? <img src={urls[f.path || f.url]} alt={f.name} loading="lazy" /> : <span>Memuat…</span>}
        </button>
      ))}
    </div>
  );
}

export function FileViewer({ file, onClose }) {
  const [text, setText] = useState(null);
  const [img, setImg] = useState(null); // blob URL (asal sama, aman untuk ekspor PNG)
  const [error, setError] = useState('');
  const bodyRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let blobUrl = null;
    (async () => {
      try {
        const url = await fileUrl(file.path);
        if (!url) throw new Error('Lampiran tidak bisa dibuka.');
        if (isPdf(file)) {
          window.open(url, '_blank', 'noopener');
          onClose();
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Lampiran tidak bisa diambil.');
        if (isImage(file)) {
          const b = await res.blob();
          blobUrl = URL.createObjectURL(b.type ? b : new Blob([b], { type: file.type || 'image/png' }));
          if (alive) setImg(blobUrl);
        } else {
          const t = await res.text();
          if (alive) setText(t);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [file.path]);

  const downloadOriginal = () => {
    if (img) save(img, file.name);
    else if (text != null) {
      const u = URL.createObjectURL(new Blob([text], { type: file.type || 'text/plain' }));
      save(u, file.name);
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }
  };
  const downloadPng = () => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.naturalWidth || 1080;
    const h = el.naturalHeight || 1080;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(el, 0, 0, w, h);
    c.toBlob((b) => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      save(u, `${baseName(file.name)}.png`);
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    }, 'image/png');
  };
  const printDoc = () => {
    const w = window.open('', '_blank');
    if (!w || !bodyRef.current) return;
    w.document.write(
      `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${baseName(file.name)}</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6;color:#2a2116}h1,h2,h3,.aw-h{font-weight:700;margin:18px 0 6px}ul{padding-left:22px}pre{white-space:pre-wrap}</style></head><body>${bodyRef.current.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="fv-backdrop" onClick={onClose}>
      <div className="fv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={file.name}>
        <div className="fv-head">
          <b title={file.name}>{file.name}</b>
          <div className="fv-actions">
            {img && (
              <button className="fv-btn pri" onClick={downloadPng}>
                ⬇ Unduh PNG
              </button>
            )}
            {text != null && (
              <button className="fv-btn" onClick={printDoc}>
                🖨 Cetak / PDF
              </button>
            )}
            {(img || text != null) && (
              <button className="fv-btn" onClick={downloadOriginal}>
                ⬇ Unduh {file.name.split('.').pop()?.toUpperCase()}
              </button>
            )}
            <button className="fv-btn" onClick={onClose} aria-label="Tutup">
              ✕
            </button>
          </div>
        </div>
        <div className="fv-body">
          {error && <p className="error">{error}</p>}
          {!error && !img && text == null && <p className="muted">Memuat lampiran…</p>}
          {img && (
            <div className="fv-img">
              <img ref={imgRef} src={img} alt={file.name} />
            </div>
          )}
          {text != null && (
            <div ref={bodyRef} className="fv-doc">
              {isMd(file) ? <Rich text={text} /> : <pre>{text}</pre>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
