import { supabase } from './src/lib/supabase.ts'; 
async function test() {
  const { data: prods } = await supabase.from('products').select('image_url').not('image_url', 'is', null);
  console.log('Original image_url:', prods?.[0]?.image_url);
  const { data } = supabase.storage.from('divina-assets').getPublicUrl(prods?.[0]?.image_url || '');
  console.log('PUBLIC URL:', data.publicUrl);
}
test();
