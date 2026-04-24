import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL || 'https://jntedixssldttnkyrtau.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);

async function run() {
  const { data: cols, error } = await sb.from('collections').select('id, name, slug');
  console.log('Collections:', cols, error);
}
run();
