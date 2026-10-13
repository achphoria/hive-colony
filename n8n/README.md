# n8n untuk Hive Colony: otak 20 agent

## Arsitektur
```
Queen Bea (Edge Function queen-bea, Claude)
  └─ tool delegate_tasks (maks. 3 tugas, 1 level)
       ├─ insert hc_plan_tasks (who = agent_id, col = todo)
       └─ POST /webhook/hive/agent-task   ──►  n8n "Hive - Agent Task Worker"
                                                 1. cari agent di hc_agent_prompts
                                                 2. cek kata kunci needs_approval_for → hc_approvals (202, berhenti)
                                                 3. task → doing, panggil Claude (Anthropic Messages API)
                                                 4. task → done, log hc_activity (agent_reply)
                                                 5. kalau gagal: task → todo, log agent_error, respon 500
hc_approvals.status → approved/rejected
  └─ trigger DB hc_approvals_resume (pg_net) ──► POST /webhook/hive/approval-resume
                                                 n8n "Hive - Approval Resume"
                                                 approved: jalankan ulang payload lewat worker (sekali saja)
                                                 rejected: hanya log approval_rejected
```
Semua hasil masuk ke `hc_activity` dan `hc_plan_tasks`, jadi app 3D menampilkannya secara realtime.
Prompt agent disimpan di tabel `hc_agent_prompts`. Edit tabel itu kalau mau mengubah persona, tanpa perlu menyentuh workflow.

## Webhook
| Path | Workflow | Body |
|---|---|---|
| `POST /webhook/hive/agent-task` | Hive - Agent Task Worker | `{agent, message\|title, detail?, task_id?, caller?}` → 200 `{ok, agent, nick, reply, task_id, activity_id}`, 202 `{status:'pending_approval', approval_id}`, 404 `unknown_agent`, 500 `llm_failed` |
| `POST /webhook/hive/approval-resume` | Hive - Approval Resume | `{approval_id, status}` (dikirim trigger DB) |

Kedua webhook wajib memakai header `x-hive-secret`. Tanpa header itu, permintaan ditolak 403.
Instance saat ini ada di `https://sliceable-mousiness-exorcist.ngrok-free.dev` (ngrok gratis). **URL ini publik**, jadi keamanannya bergantung pada secret di header.

## Credential yang dibutuhkan di n8n
- **Anthropic - Hive Agents** (tipe `anthropicApi`): API key Anthropic.
- **Supabase - General Table** (tipe `supabaseApi`): URL project + service_role key.
- **Hive Webhook Secret** (tipe `httpHeaderAuth`): header `x-hive-secret` dan secret acak yang kuat.

Secret yang sama juga disimpan di Supabase Vault dengan nama `hive_webhook_secret`. Secret itu dibaca trigger dan Queen Bea lewat fungsi `hive_webhook_secret()`, yang hanya bisa dijalankan service_role. **Jangan pernah commit nilai secret ke repo ini.**

## Cara import
1. Jalankan migrasi di `supabase/migrations/2026101307*`–`*081319*`.
2. Simpan secret ke Vault: `select vault.create_secret('<secret>', 'hive_webhook_secret');`
3. Di n8n, buat ketiga credential di atas.
4. Import `n8n/workflows/*.json` (menu Workflows → Import from File), lalu pilih ulang credential di setiap node Supabase, HTTP Request, dan Webhook. Id credential di file JSON hanya berlaku untuk instance asal.
5. Aktifkan kedua workflow.
6. Kalau URL n8n berubah, ganti URL di fungsi `hc_approvals_notify_n8n()`, di node "Call Task Worker", dan di `N8N_AGENT_TASK_URL` (secret Edge Function queen-bea).
