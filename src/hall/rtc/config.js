// Flag build (GitHub repo variables -> env build di .github/workflows/deploy.yml):
//   VIDEO_PROVIDER=cloudflare  -> rapat Hive Hall lewat Cloudflare Realtime (ruang video #/rapat/<id>)
//   VIDEO_PROVIDER=livekit / kosong -> rapat suara LiveKit seperti sebelumnya (jalur cadangan)
//   MEETING_RECORDING=on       -> host bisa merekam rapat video (rekaman di browser host, diunggah ke Storage)
export const VIDEO_PROVIDER = import.meta.env.VITE_VIDEO_PROVIDER === 'cloudflare' ? 'cloudflare' : 'livekit';
export const RECORDING_ENABLED = import.meta.env.VITE_MEETING_RECORDING === 'on';
export const useCloudflare = VIDEO_PROVIDER === 'cloudflare';
