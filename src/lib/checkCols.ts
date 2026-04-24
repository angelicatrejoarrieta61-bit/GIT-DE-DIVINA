import { supabase } from './supabase';

async function run() {
  const { data } = await supabase.from('collections').select('*');
  console.log(data);
}
run();
