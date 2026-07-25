-- ============================================================================
-- Yankı — questions tablosu eksik kolon düzeltmesi
-- Gerçek: 7 kolon (id, category, question_type, text, options, tags, active)
-- Beklenen: 11 kolon (schema.sql'deki hali)
-- Eksik: tag (TEXT), weight (NUMERIC), dimensions (dimension_enum[]),
--         importance (TEXT), refreshable (BOOLEAN)
-- Fark: tags (array) → schema.sql'de tag (TEXT), ikisi ayrı
--
-- Supabase SQL Editor'da çalıştırın.
-- ============================================================================

-- 1. dimension_enum tipini oluştur (yoksa)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dimension_enum') THEN
    CREATE TYPE dimension_enum AS ENUM (
      'identity', 'attachment', 'self_perception', 'values', 'purpose',
      'decision_making', 'ethics', 'behavior', 'loyalty', 'conflict_style',
      'risk_tolerance', 'motivation', 'fears', 'coping_style',
      'communication_tone', 'openness', 'regrets', 'current_state',
      'relationships', 'career', 'family', 'stress', 'happiness',
      'current_events', 'achievement', 'wellbeing', 'curiosity',
      'gratitude', 'future_orientation'
    );
  END IF;
END $$;

-- 2. Eksik kolonları ekle
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS weight NUMERIC(3,2);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS dimensions dimension_enum[];
ALTER TABLE questions ADD COLUMN IF NOT EXISTS importance TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS refreshable BOOLEAN NOT NULL DEFAULT true;

-- 3. Mevcut tags (array) → tag (TEXT) dönüşümü (ilk elemanı al)
UPDATE questions SET tag = tags[1] WHERE tags IS NOT NULL AND tag IS NULL;

-- 4. DOĞRULAMA
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'questions'
ORDER BY ordinal_position;
