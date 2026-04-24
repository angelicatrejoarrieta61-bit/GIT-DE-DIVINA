import { supabase } from './src/lib/supabase.js';
async function test() {
  const { data } = await supabase.from('collections').select('*');
  console.log(data);
}
test();
