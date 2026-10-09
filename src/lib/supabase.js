// Klien Supabase untuk Hive Colony.
// Anon key memang dirancang publik (dipakai di browser); keamanan data dijaga oleh aturan RLS
// di tabel hc_*. Jangan pernah menaruh service_role key di sini.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ccbyqgisgclqlqatxwbk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjYnlxZ2lzZ2NscWxxYXR4d2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Nzc3MjUsImV4cCI6MjA4NTM1MzcyNX0.wfjinS4a1Hvp1XHGwbMvv5sUUypszbjqAHJNuJdkuRQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hive-colony-auth' },
});
