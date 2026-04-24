import { supabase } from './src/lib/supabase.ts'; 
async function test() {
  const { data } = await supabase.from('store_config').select('value').eq('key', 'logo_url');
  console.log('LOGO_URL:', data?.[0]?.value);
}
test();
