// Flag build (GitHub repo variables -> env build di .github/workflows/deploy.yml):
//   VIDEO_PROVIDER=cloudflare  -> rapat Hive Hall lewat Cloudflare Realtime (ruang video #/rapat/<id>); bawaan deploy
//   VIDEO_PROVIDER=livekit / kosong -> rapat suara LiveKit seperti sebelumnya (jalur cadangan)
//   MEETING_RECORDING=on       -> host bisa merekam rapat video (rekaman di browser host, diunggah ke Storage)
// toleran huruf besar & spasi ("Cloudflare ", "ON")
const flag = (v) => String(v || '').trim().toLowerCase();
export const VIDEO_PROVIDER = flag(import.meta.env.VITE_VIDEO_PROVIDER) === 'cloudflare' ? 'cloudflare' : 'livekit';
export const RECORDING_ENABLED = flag(import.meta.env.VITE_MEETING_RECORDING) === 'on';
export const useCloudflare = VIDEO_PROVIDER === 'cloudflare';
