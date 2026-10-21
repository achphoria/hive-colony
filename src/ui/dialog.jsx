// Dialog Hive Colony: pengganti window.confirm / alert / prompt (popup bawaan browser).
// Dipanggil dari mana saja dengan await; <DialogHost /> dipasang sekali di root aplikasi.
//   if (await confirmDialog({ title, message, confirmLabel: 'Hapus', tone: 'danger' })) …
//   await alertDialog({ title, message, tone: 'error' })
//   const v = await promptDialog({ title, defaultValue })   // null = batal
//   await copyDialog({ title, message, value })              // teks untuk disalin (mis. link)
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

const useDialogs = create(() => ({ stack: [] }));
let seq = 0;

function open(kind, opts) {
  return new Promise((resolve) => {
    const id = ++seq;
    useDialogs.setState((s) => ({ stack: [...s.stack, { id, kind, ...opts, resolve }] }));
  });
}
function close(id, value) {
  const d = useDialogs.getState().stack.find((x) => x.id === id);
  useDialogs.setState((s) => ({ stack: s.stack.filter((x) => x.id !== id) }));
  d?.resolve(value);
}

export const confirmDialog = (o) => open('confirm', o);
export const alertDialog = (o) => open('alert', typeof o === 'string' ? { message: o } : o);
export const promptDialog = (o) => open('prompt', o);
export const copyDialog = (o) => open('copy', o);

const ICON = { danger: '⚠', error: '⚠', warn: '⚠', info: 'ℹ', ok: '✓', rec: '⏺', end: '⏹' };

function Dialog({ d, top }) {
  const [value, setValue] = useState(d.defaultValue ?? d.value ?? '');
  const [copied, setCopied] = useState(false);
  const card = useRef(null);
  const field = useRef(null);
  const safeBtn = useRef(null);
  const mainBtn = useRef(null);
  // aksi yang tidak bisa dibatalkan: tombol merah, fokus awal di Batal
  const danger = d.tone === 'danger' || d.tone === 'end';
  const cancel = () => close(d.id, d.kind === 'confirm' ? false : d.kind === 'prompt' ? null : undefined);
  const accept = () => {
    if (d.kind === 'prompt') {
      const v = value.trim();
      if (d.required !== false && !v) return field.current?.focus();
      return close(d.id, v);
    }
    close(d.id, d.kind === 'confirm' ? true : undefined);
  };

  // fokus awal: isian, atau tombol aman (Batal) untuk aksi berbahaya, selain itu tombol utama
  useEffect(() => {
    const prev = document.activeElement;
    const t = setTimeout(() => {
      if (field.current) {
        field.current.focus();
        field.current.select?.();
      } else (danger ? safeBtn.current : mainBtn.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, [danger]);

  // Esc = batal, Tab berputar di dalam dialog
  useEffect(() => {
    if (!top) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Tab' && card.current) {
        const els = [...card.current.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      field.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const icon = d.icon ?? ICON[d.tone] ?? (d.kind === 'prompt' ? '✎' : d.kind === 'copy' ? '🔗' : null);
  const titleId = `hd-title-${d.id}`;
  const msgId = `hd-msg-${d.id}`;
  const confirmLabel = d.confirmLabel || (d.kind === 'confirm' ? 'Ya, lanjutkan' : d.kind === 'prompt' ? 'Simpan' : 'Mengerti');
  return (
    <div className="hd-backdrop" onMouseDown={(e) => e.target === e.currentTarget && d.kind !== 'alert' && cancel()}>
      <div
        ref={card}
        className={`hd-card tone-${d.tone || 'default'}`}
        role={d.kind === 'confirm' || d.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={d.message ? msgId : undefined}
      >
        <div className="hd-body">
          {icon && (
            <span className="hd-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="hd-text">
            <h2 id={titleId}>{d.title || (d.kind === 'confirm' ? 'Yakin?' : d.kind === 'prompt' ? 'Isi' : 'Pemberitahuan')}</h2>
            {d.message && <p id={msgId}>{d.message}</p>}
            {d.detail && <p className="hd-detail">{d.detail}</p>}
          </div>
        </div>
        {(d.kind === 'prompt' || d.kind === 'copy') && (
          <form
            className="hd-field"
            onSubmit={(e) => {
              e.preventDefault();
              if (d.kind === 'copy') copy();
              else accept();
            }}
          >
            <input
              ref={field}
              value={value}
              readOnly={d.kind === 'copy'}
              onChange={(e) => setValue(e.target.value)}
              placeholder={d.placeholder}
              maxLength={d.maxLength || 200}
              aria-label={d.label || d.title}
            />
            {d.kind === 'copy' && (
              <button type="submit" className="hd-btn">
                {copied ? 'Tersalin ✓' : 'Salin'}
              </button>
            )}
          </form>
        )}
        <div className="hd-actions">
          {d.kind !== 'alert' && d.kind !== 'copy' && (
            <button ref={safeBtn} type="button" className="hd-btn ghost" onClick={cancel}>
              {d.cancelLabel || 'Batal'}
            </button>
          )}
          <button ref={mainBtn} type="button" className={`hd-btn ${danger ? 'danger' : 'primary'}`} onClick={d.kind === 'copy' ? () => close(d.id) : accept}>
            {d.kind === 'copy' ? d.confirmLabel || 'Tutup' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogHost() {
  const stack = useDialogs((s) => s.stack);
  if (!stack.length) return null;
  return stack.map((d, i) => <Dialog key={d.id} d={d} top={i === stack.length - 1} />);
}
