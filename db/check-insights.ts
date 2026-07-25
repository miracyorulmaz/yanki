import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function m() {
  const { data } = await s.from('insights').select('*').order('created_at', { ascending: false }).limit(3);
  for (const i of data ?? []) {
    const r = i as any;
    console.log('id:', r.id);
    console.log('  text:', r.insight_text?.slice(0, 60));
    console.log('  source_entry_ids:', JSON.stringify(r.source_entry_ids));
    console.log('  created_at:', r.created_at);
    console.log('');
  }
  console.log('Toplam:', (data ?? []).length);
}
m();
