import { supabase } from './src/lib/supabase.js';

async function test() {
  const { data, error } = await supabase.storage.getBucket('divina-assets');
  console.log('Bucket check:', data, error);
}

test();
