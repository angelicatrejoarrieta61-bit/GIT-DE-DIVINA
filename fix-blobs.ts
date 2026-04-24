import { supabase } from './src/lib/supabase.js';

async function fix() {
  const { data: cols } = await supabase.from('collections').select('*');
  if (cols) {
    for (const c of cols) {
      if (c.image_url?.startsWith('blob:')) {
        await supabase.from('collections').update({ image_url: null }).eq('id', c.id);
        console.log('Fixed collection', c.id);
      }
    }
  }

  const { data: confs } = await supabase.from('store_config').select('*');
  if (confs) {
    for (const c of confs) {
      if (typeof c.value === 'string' && c.value.startsWith('blob:')) {
        await supabase.from('store_config').delete().eq('key', c.key);
        console.log('Fixed config', c.key);
      }
    }
  }
}
fix();
