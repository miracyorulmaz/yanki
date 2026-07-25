/**
 * Soru havuzunu seed eden script.
 *
 * Kullanım:
 *   npx tsx db/seed.ts
 *
 * Supabase bağlantısı için NEXT_PUBLIC_SUPABASE_URL ve
 * SUPABASE_SERVICE_ROLE_KEY ortam değişkenleri gerekli.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
import seedData from './seed_questions.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
  console.log('🌱 Seeding questions...');

  let inserted = 0;

  for (const category of seedData) {
    for (const q of category.questions) {
      const questionData = {
        category: category.category,
        tag: ('tag' in category ? (category as { tag?: string }).tag : null) ?? null,
        question_type: q.type ?? (q as { question_type?: string }).question_type,
        text: q.text,
        options: q.options ? { choices: q.options } : null,
        weight: 'weight' in q ? (q as { weight?: number }).weight ?? null : null,
        dimensions: q.dimensions,
        importance: 'importance' in q ? (q as { importance?: string }).importance ?? null : null,
        refreshable: q.refreshable ?? true,
        active: true,
      };

      // upsert: text UNIQUE constraint gerektirir.
      // Constraint yoksa (Supabase'te schema.sql eksikse) önce aynı text'li
      // satırı silip insert eder — geçici fallback, production'da UNIQUE olmalı.
      const { error } = await supabase
        .from('questions')
        .upsert(questionData, { onConflict: 'text' });

      if (error) {
        // Fallback: constraint yok → önce aynı text'i sil, sonra insert
        if (error.message.includes('unique or exclusion constraint')) {
          await supabase.from('questions').delete().eq('text', q.text);
          const { error: insErr } = await supabase
            .from('questions')
            .insert(questionData);
          if (insErr) {
            console.error(`❌ Failed: ${q.id} - ${insErr.message}`);
            continue;
          }
        } else {
          console.error(`❌ Failed: ${q.id} - ${error.message}`);
          continue;
        }
      }
      inserted++;
      console.log(`✅ ${q.id}: ${q.text.slice(0, 60)}`);
    }
  }

  console.log(`\n🎉 Done. ${inserted}/${seedData.reduce((sum, c) => sum + c.questions.length, 0)} questions seeded.`);
}

seed().catch(console.error);
