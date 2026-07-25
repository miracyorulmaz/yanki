-- ============================================================================
-- Phase 11 — Schema değişiklikleri
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================================

-- 1. entries: anı gizleme
ALTER TABLE entries ADD COLUMN IF NOT EXISTS hidden_by_user BOOLEAN NOT NULL DEFAULT false;

-- 2. insights: dayanak entry ID'leri
ALTER TABLE insights ADD COLUMN IF NOT EXISTS source_entry_ids UUID[];

-- 3. match_entries: gizlenen anılar RAG'e girmesin
CREATE OR REPLACE FUNCTION match_entries(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  entry_id UUID,
  question TEXT,
  answer TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ee.entry_id,
    e.question,
    e.answer,
    1 - (ee.embedding <=> query_embedding) AS similarity
  FROM entry_embeddings ee
  JOIN entries e ON e.id = ee.entry_id
  WHERE (p_user_id IS NULL OR e.user_id = p_user_id)
    AND e.hidden_by_user = false
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- DOĞRULAMA
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('entries', 'insights')
  AND column_name IN ('hidden_by_user', 'source_entry_ids')
ORDER BY table_name, column_name;
