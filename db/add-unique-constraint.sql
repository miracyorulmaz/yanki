-- questions.text UNIQUE constraint (schema.sql'de tanımlı, Supabase'te eksik)
-- Seed'in upsert ile çalışabilmesi için gerekli.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_questions_text'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions ADD CONSTRAINT uq_questions_text UNIQUE (text);
  END IF;
END $$;
