-- ============================================================================
-- Yankı — Tablo Düzeltme Script'i
-- 2026-07-25: personality_profiles tekil/updated_at → append-only/id PK/created_at
--             + entry_embeddings oluştur
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================================

-- 1. personality_profiles: tekil modeli DROP, append-only modeli CREATE
DROP TABLE IF EXISTS personality_profiles CASCADE;

CREATE TABLE personality_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  traits JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_personality_profiles_latest ON personality_profiles (user_id, created_at DESC);

-- RLS
ALTER TABLE personality_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY personality_profiles_owner_only ON personality_profiles
  USING (user_id = auth.uid());

-- 2. entry_embeddings: eksik tabloyu oluştur
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS entry_embeddings (
  entry_id UUID PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small'
);

ALTER TABLE entry_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY entry_embeddings_owner_only ON entry_embeddings
  USING (
    EXISTS (
      SELECT 1 FROM entries
      WHERE entries.id = entry_embeddings.entry_id
        AND entries.user_id = auth.uid()
    )
  );

-- 3. DOĞRULAMA: Yeniden oluşturulan tabloları kontrol et
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'personality_profiles'
ORDER BY ordinal_position;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
