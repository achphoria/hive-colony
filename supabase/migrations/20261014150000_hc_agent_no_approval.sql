-- Tim agent bergerak otomatis: kata kunci persetujuan owner dihapus dari semua agent.
-- Saat ini agent hanya menulis draf & rekomendasi (belum bisa membayar, memasang iklan, atau
-- menandatangani apa pun), jadi persetujuan per kata kunci lebih banyak menghambat.
-- Sebelumnya: ads (Spark) = {iklan, pengeluaran}, legal (Sage) = {kontrak}, payroll (Penny) = {pembayaran}.
-- Untuk menyalakan lagi: update public.hc_agent_prompts set needs_approval_for = '{pengeluaran}' where agent_id = 'ads';
update public.hc_agent_prompts
set needs_approval_for = '{}', updated_at = now()
where coalesce(array_length(needs_approval_for, 1), 0) > 0;
