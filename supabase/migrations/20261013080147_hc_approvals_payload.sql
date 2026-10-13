-- Applied to General Table on 20261013080147
ALTER TABLE public.hc_approvals ADD COLUMN IF NOT EXISTS payload jsonb;
COMMENT ON COLUMN public.hc_approvals.payload IS 'Original agent-task request body to resume after approval (agent, message/title/detail, task_id, caller).';
