// Mode percakapan suara di Ruang Kerja: dengar → (diam 1,5 detik) kirim → agent berpikir → jawaban
// dibacakan → dengar lagi, sampai pengguna menekan Selesai. Memakai pengenalan & suara bawaan browser
// (gratis; paling stabil di Chrome/Edge). Teks tetap tersimpan di riwayat chat seperti biasa.
import { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking } from '../hall/ai';

export const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const SILENCE_MS = 1500; // diam selama ini = selesai bicara, pesan dikirim
const IDLE_MS = 90 * 1000; // tidak ada suara selama ini = mode percakapan berhenti sendiri

const plain = (s) =>
  String(s || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim();

// bunyi pendek penanda mikrofon mulai mendengar
let audioCtx = null;
function beep(freq = 880, ms = 110) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    audioCtx = audioCtx || new C();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g).connect(audioCtx.destination);
    const end = audioCtx.currentTime + ms / 1000;
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.start();
    o.stop(end);
  } catch {
    /* tanpa bunyi */
  }
}

// onSend(text) -> { status, reply } ; status 'pending' = balasan menyusul lewat replyArrived(text)
export function useConversation({ onSend, onError, onIdle }) {
  const [active, setActive] = useState(false);
  const [phase, setPhaseState] = useState('idle'); // listening | thinking | speaking | idle
  const [interim, setInterim] = useState('');
  const activeRef = useRef(false);
  const phaseRef = useRef('idle');
  const recRef = useRef(null);
  const silenceRef = useRef(null);
  const idleRef = useRef(null);
  const speakToken = useRef(0);
  const transcriptRef = useRef('');
  const cb = useRef({ onSend, onError, onIdle });
  cb.current = { onSend, onError, onIdle };

  const setPhase = (p) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const stopRec = () => {
    clearTimeout(silenceRef.current);
    const r = recRef.current;
    recRef.current = null;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try {
      r.abort();
    } catch {
      /* sudah berhenti */
    }
  };

  const stop = () => {
    activeRef.current = false;
    setActive(false);
    stopRec();
    clearTimeout(idleRef.current);
    speakToken.current++;
    stopSpeaking();
    setInterim('');
    setPhase('idle');
  };

  const submit = (text) => {
    stopRec();
    clearTimeout(idleRef.current);
    setInterim('');
    transcriptRef.current = '';
    setPhase('thinking');
    beep(520, 90);
    Promise.resolve(cb.current.onSend(text))
      .then((r) => {
        if (!activeRef.current || r?.status === 'pending') return; // balasan Grok Bot menyusul
        say(r?.reply || 'Maaf, belum ada jawaban.');
      })
      .catch((e) => activeRef.current && say(e?.message || 'Maaf, pesan gagal dikirim.'));
  };

  const listen = () => {
    if (!activeRef.current) return;
    stopRec();
    const rec = new SpeechRec();
    rec.lang = 'id-ID';
    rec.interimResults = true;
    rec.continuous = true;
    let finals = '';
    transcriptRef.current = '';
    rec.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += `${r[0].transcript} `;
        else partial += r[0].transcript;
      }
      const all = `${finals}${partial}`.replace(/\s+/g, ' ').trim();
      transcriptRef.current = all;
      setInterim(all);
      clearTimeout(idleRef.current);
      idleRef.current = setTimeout(idleOut, IDLE_MS);
      clearTimeout(silenceRef.current);
      if (all) silenceRef.current = setTimeout(() => submit(all), SILENCE_MS);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        cb.current.onError?.(e.error === 'audio-capture' ? 'Mikrofon tidak ditemukan.' : 'Izin mikrofon ditolak. Izinkan mikrofon di browser, lalu coba lagi.');
        stop();
      }
    };
    // Chrome menghentikan pengenalan sendiri setelah beberapa saat: nyalakan lagi selama masih mendengar
    rec.onend = () => {
      if (recRef.current === rec && activeRef.current && phaseRef.current === 'listening') {
        recRef.current = null;
        setTimeout(listen, 250);
      }
    };
    recRef.current = rec;
    setPhase('listening');
    try {
      rec.start();
    } catch {
      /* start ganda: abaikan */
    }
  };

  function idleOut() {
    if (!activeRef.current || phaseRef.current !== 'listening') return;
    stop();
    cb.current.onIdle?.();
  }

  // bacakan jawaban, lalu dengar lagi
  const say = (text) => {
    stopRec();
    setPhase('speaking');
    const token = ++speakToken.current;
    const next = () => {
      if (token !== speakToken.current || !activeRef.current) return;
      beep();
      listen();
    };
    if (!speak(plain(text), next)) next();
  };

  const start = () => {
    if (!SpeechRec) {
      cb.current.onError?.('Mode percakapan butuh Chrome atau Edge (pengenalan suara belum didukung browser ini).');
      return;
    }
    activeRef.current = true;
    setActive(true);
    stopSpeaking();
    beep();
    listen();
    clearTimeout(idleRef.current);
    idleRef.current = setTimeout(idleOut, IDLE_MS);
  };

  // potong jawaban yang sedang dibacakan, langsung dengar
  const interrupt = () => {
    if (phaseRef.current !== 'speaking') return;
    speakToken.current++;
    stopSpeaking();
    beep();
    listen();
  };

  // kirim yang sudah terdengar tanpa menunggu jeda diam
  const sendNow = () => {
    const t = transcriptRef.current.trim();
    if (phaseRef.current === 'listening' && t) submit(t);
  };

  // balasan yang datang belakangan (Grok Bot) atau batas waktu menunggu
  const replyArrived = (text) => {
    if (activeRef.current && phaseRef.current === 'thinking') say(text);
  };

  // spasi = potong saat agent bicara
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.code === 'Space' && phaseRef.current === 'speaking' && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  useEffect(() => () => stop(), []);

  return { active, phase, interim, start, stop, interrupt, sendNow, replyArrived, supported: !!SpeechRec };
}
