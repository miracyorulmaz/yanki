import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function m() {
  const ids = ['74d1f8be-8180-4137-916c-75fb05499554','d484af37-408e-436a-9627-a0756070e9f3','42937cce-9809-471b-a522-de82ec457015','60760804-a35c-4081-bba9-8fd0f738385d','2a6738c6-1fa4-41b1-b602-687f41fabf4a'];
  const { data } = await s.from('entries').select('id, question, answer').in('id', ids);
  console.log('Dayanak entryler (' + (data?.length ?? 0) + '/' + ids.length + ' eslesiyor):\n');
  for (const e of data ?? []) {
    console.log('  [' + (e as any).id.slice(0,8) + '] ' + (e as any).question.slice(0,50));
    console.log('        -> ' + (e as any).answer.slice(0,60));
  }
  const allFound = ids.every(id => (data ?? []).some((e: any) => e.id === id));
  console.log('\nTum source_entry_ids gecerli: ' + (allFound ? 'EVET' : 'HAYIR'));
}
m();
