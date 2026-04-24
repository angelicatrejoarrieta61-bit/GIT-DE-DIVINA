import { supabase } from './src/lib/supabase.ts'; 
async function test() {
  const { data: all } = await supabase.from('products').select('id, name, tags');
  const count = all?.filter(p => p.tags?.includes('TOP_HOME')).length;
  console.log('REAL TOP_HOME COUNT IN DB:', count);
}
test();
