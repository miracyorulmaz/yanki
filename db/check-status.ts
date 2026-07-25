import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function m() {
  const tables = [
    'users', 'questions', 'personality_profiles', 'insights',
    'entries', 'entry_embeddings', 'friendships', 'conversations',
    'yanki_access_grants',
  ];

  for (const t of tables) {
    const { count, error } = await s.from(t).select('id', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${t.padEnd(25)} HATA: ${error.message}`);
    } else {
      console.log(`  ${t.padEnd(25)} satir: ${count ?? '?'}`);
    }
  }

  // personality_profiles yapisi
  const { data: pp } = await s.from('personality_profiles').select('*').limit(1);
  if (pp && pp.length > 0) {
    console.log('\npersonality_profiles kolonlari:', Object.keys(pp[0]).join(', '));
    console.log('  id:', pp[0].id);
    console.log('  user_id:', pp[0].user_id);
    console.log('  created_at:', pp[0].created_at);
    console.log('  updated_at:', (pp[0] as any).updated_at);
  } else {
    console.log('\npersonality_profiles: BOS (fix-tables.sql calistirilmadiysa normal)');
  }

  // entry_embeddings kontrol
  const { data: ee } = await s.from('entry_embeddings').select('entry_id').limit(1);
  if (ee !== null) {
    console.log('\nentry_embeddings: VAR');
  }
}

m().catch(console.error);
