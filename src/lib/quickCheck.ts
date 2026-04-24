import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.VITE_SUPABASE_URL || 'https://jntedixssldttnkyrtau.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data: cols } = await sb.from('collections').select('id, name, slug');
  console.log('Collections:', cols);
  
  const { data: conf } = await sb.from('store_config').select('key, value');
  console.log('Keys:', conf?.map(c => c.key).filter(k => k.includes('hero_img')));
}
run();
