import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // entries.hidden_by_user
  const { data: hb, error: hbErr } = await s.from('entries').select('id, hidden_by_user').limit(1);
  console.log('entries.hidden_by_user:', hbErr ? '❌ YOK (' + hbErr.message.slice(0, 80) + ')' : '✅ VAR (' + ((hb?.[0] as any)?.hidden_by_user ?? 'null') + ')');

  // insights.source_entry_ids
  const { data: si, error: siErr } = await s.from('insights').select('id, source_entry_ids').limit(1);
  console.log('insights.source_entry_ids:', siErr ? '❌ YOK (' + siErr.message.slice(0, 80) + ')' : '✅ VAR (' + JSON.stringify((si?.[0] as any)?.source_entry_ids ?? 'null') + ')');
}

main();
