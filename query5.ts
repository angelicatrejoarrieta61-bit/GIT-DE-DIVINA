import { supabase } from './src/lib/supabase.ts'; 
async function test() {
  const { data } = await supabase.from('products').select('id, name, in_stock, tags').contains('tags', ['TOP_HOME']);
  console.log('TOP_HOME:', data?.length);
  const { data: all } = await supabase.from('products').select('id, name, in_stock, tags');
  console.log('ALL:', all?.length);
}
test();
