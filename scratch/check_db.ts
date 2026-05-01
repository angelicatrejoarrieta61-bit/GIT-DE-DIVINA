import { supabase } from './src/lib/supabase';

async function checkCollections() {
  const { data } = await supabase.from('collections').select('*');
  console.log('COLLECTIONS IN DB:', JSON.stringify(data, null, 2));
}

checkCollections();
