-- ============================================================================
-- Yankı — Database Schema
-- CONTRACTS.md'deki veri modelinin BİREBİR SQL karşılığı.
-- Platform/framework değişse de bu şema değişmez.
-- ============================================================================

-- Extension: pgvector (RAG için vektör araması)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- ENUM'lar
-- ============================================================================

-- Identity Layer boyutları için sabit liste — yazım hatası RAG'i bozmasın diye enum.
-- seed_questions.json'daki tüm "dimensions" değerleriyle birebir eşleşmeli.
CREATE TYPE dimension_enum AS ENUM (
  'identity', 'attachment', 'self_perception', 'values', 'purpose',
  'decision_making', 'ethics', 'behavior', 'loyalty', 'conflict_style',
  'risk_tolerance', 'motivation', 'fears', 'coping_style',
  'communication_tone', 'openness', 'regrets', 'current_state',
  'relationships', 'career', 'family', 'stress', 'happiness',
  'current_events', 'achievement', 'wellbeing', 'curiosity',
  'gratitude', 'future_orientation'
);

-- ============================================================================
-- TABLOLAR
-- ============================================================================

-- Kullanıcılar
-- users.id = Supabase auth.users.id (FK ile bağlı).
-- Supabase Auth'ta kayıt olunca handle_new_user trigger'ı bu satırı oluşturur.
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'deceased' | 'deactivated'
  consent_given_at TIMESTAMPTZ,          -- KVKK: açık rızanın verildiği an (metin versiyonuyla birlikte loglanmalı)
  consent_text_version TEXT,             -- hangi aydınlatma metni versiyonuna rıza verildi
  deletion_requested_at TIMESTAMPTZ,     -- hesap silme talebi anı (grace period sonrası hard delete tetiklenir)
  onboarding_completed_at TIMESTAMPTZ    -- NULL ise onboarding devam ediyor demektir ("daha sonra devam et")
);

-- Soru havuzu (MVP: statik, elle küratörlüğü yapılmış — AI ile dinamik üretim V2)
-- Seçim mantığı: rastgele, ama (a) son 2-3 günde sorulan kategori hariç tutulur,
-- (b) önceki günün yüksek `importance` cevabına bağlamsal bir takip sorusu
-- önceliklidir (örn. dün stres 5/5 ise, ertesi gün "hâlâ aklında mı?" tarzı bir
-- soru rastgele seçimin önüne geçer). Bu bir "geri çekme" mekaniği değil,
-- bağlama duyarlılıktır — NON_NEGOTIABLES.md ile çelişmez.
-- Bu tablo, seed_questions.json ile BİREBİR eşleşir — biri değişirse diğeri
-- de güncellenmeli, aksi halde şema ile içerik birbirinden kopar.
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,           -- 'onboarding' | 'daily'
  tag TEXT,                         -- daily sorular için kategori (örn. 'stres', 'ilişkiler')
  question_type TEXT NOT NULL,      -- 'multiple_choice' | 'scaled' | 'open_text'
  text TEXT NOT NULL UNIQUE,
  options JSONB,                    -- multiple_choice/scaled için: seçenekler veya ölçek sınırları
  weight NUMERIC(3,2),              -- onboarding sorularında: 0.00-1.00, ne kadar kritik
  dimensions dimension_enum[],      -- bu sorunun hangi kişilik boyutlarını beslediği
  importance TEXT,                  -- daily sorularda: 'low' | 'medium' | 'high'
  refreshable BOOLEAN NOT NULL DEFAULT true, -- onboarding'de false, daily'de true
  active BOOLEAN NOT NULL DEFAULT true
);

-- Onboarding'den çıkan yapılandırılmış kişilik özeti
-- APPEND-ONLY: her güncelleme yeni bir satır ekler, üzerine yazmaz.
-- Bu, gelecekteki "yıllara göre Yankı" (geçmiş versiyonlarla karşılaştırma) özelliği için
-- şimdiden ucuz bir altyapı yatırımı. "Güncel" profil, en son (en yüksek created_at) satırdır.
CREATE TABLE personality_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,       -- AI'ya prompt olarak verilecek doğal dil özet
  traits JSONB NOT NULL DEFAULT '{}',
  -- Identity Layer — yapısal, embedding içinde kaybolmaması gereken alanlar.
  -- traits şeması örneği:
  -- {
  --   "korkular": [...],
  --   "sevdigi_insanlar": [...],
  --   "hayattaki_amac": "...",
  --   "karar_alma_bicimi": "...",
  --   "espri_anlayisi": "...",
  --   "risk_alma_seviyesi": "..."
  -- }
  -- BİLİNÇLİ OLARAK DIŞLANDI: siyasi görüş, dini inanç gibi KVKK'nın "özel nitelikli
  -- kişisel veri" saydığı kategoriler yapılandırılmış/etiketli bir alan olarak
  -- TUTULMAYACAK. Bu tür şeyler (varsa) sadece serbest metin summary_text içinde
  -- dolaylı kalabilir, ayrı bir sütun/etiket açılmaz — hukuki risk.
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_personality_profiles_latest ON personality_profiles (user_id, created_at DESC);

-- Insights katmanı: arka planda (haftalık) üretilen trend/örüntü analizleri.
-- ÖNEMLİ: Bu tablo kullanıcıya push/bildirim tetiklemek için KULLANILMAZ.
-- Sadece Yankı'nın RAG context'ini zenginleştirmek için okunur (kullanıcı
-- "nasıl değiştim" gibi bir şey sorduğunda) veya kullanıcı açıkça isterse
-- gösterilir. Varsayılan davranış: sessiz, arka plan verisi.
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_text TEXT NOT NULL,       -- örn. "Son birkaç haftadır iş konusunda daha kararlı konuşuyorsun"
  category TEXT,                    -- 'trend' | 'pattern' | 'change' (serbest, MVP'de basit tutulabilir)
  confidence NUMERIC(3,2),          -- 0.00-1.00 — kaç/ne kadar veriye dayandığını yansıtır.
                                    -- Az veriden (örn. 2 onboarding cevabı) çıkan çıkarımla
                                    -- 2 yıllık veriden çıkan çıkarım aynı güvenle sunulmamalı.
                                    -- MVP formülü (basit ama deterministic — mükemmel olmasına gerek yok):
                                    --   confidence = MIN(1.0, 0.05 * kaynak_entry_sayısı + 0.1 * farklı_dimension_sayısı)
                                    -- Örnek: 10 entry, 3 farklı dimension → 0.5 + 0.3 = 0.8
  based_on_period_start TIMESTAMPTZ,
  based_on_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding ve günlük sorulara verilen tüm cevaplar
-- source: 'onboarding' | 'daily' | 'chat' | 'manual_note'
--   'chat' ve 'manual_note' şema seviyesinde MVP'de hazır, ama dolduran
--   pipeline (sohbetten otomatik anı çıkarma) V1.1'e ertelendi — MVP'de
--   sadece 'onboarding' ve 'daily' aktif olarak kullanılacak.
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id),
  source TEXT NOT NULL,             -- 'onboarding' | 'daily' | 'chat' | 'manual_note'
  question TEXT NOT NULL,           -- soru metni burada da tutulur (questions tablosu değişse bile geçmiş bozulmasın diye)
  question_type TEXT NOT NULL,      -- 'multiple_choice' | 'scaled' | 'open_text'
  answer TEXT NOT NULL,
  moderation_flag TEXT,             -- NULL | 'flagged' — bkz. "İçerik Moderasyonu" bölümü
  created_at TIMESTAMPTZ DEFAULT now()
);

-- entries'in vektör karşılığı (RAG için)
-- embedding_model: hangi model/versiyonla üretildiği (sağlayıcı değişince migration için gerekli, bkz. bölüm 5)
CREATE TABLE entry_embeddings (
  entry_id UUID PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small'
);

-- Arkadaşlık ilişkileri
-- MVP KARARI (V1 - Basit): Bu tablo sadece arkadaşlık ilişkisini/durumunu tutar.
-- Bir kullanıcının arkadaşının Yankı'sıyla konuşması, entries'e veya
-- personality_profiles'a erişmesi MVP'de YOKTUR. Bu, V2'ye ertelenmiştir.
-- V2 geldiğinde buraya bir `yanki_access_level` kolonu eklenecek
-- ('none' | 'summary_only' | 'full_chat') — o zamana kadar eklenmemeli.
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'friend', -- 'friend' | 'close_friend'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'blocked'
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_friendship UNIQUE (requester_id, addressee_id)
);

-- Kullanıcının kendi Yankı'sıyla sohbet geçmişi
-- Ekstra kolonlar: "neden böyle cevap verdi?" sorusunu gözlemlenebilir kılmak için.
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,               -- 'user' | 'yanki'
  message TEXT NOT NULL,
  used_profile_version UUID REFERENCES personality_profiles(id), -- hangi profil satırı kullanıldı
  used_insight_ids UUID[],          -- context'e dahil edilen insights kayıtları
  model TEXT,                       -- örn. 'claude-haiku-4-5'
  token_input INTEGER,
  token_output INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ölüm sonrası erişim izinleri (TASARLANDI, MVP'de İMPLEMENT EDİLMİYOR)
-- Kullanıcı hayattayken, kendi Yankı'sına ölümünden sonra kimlerin
-- erişebileceğini TEK TEK seçer ve onaylar. Bu bir "tüm arkadaşlar"
-- kuralı DEĞİLDİR — sadece burada açıkça listelenen kişiler erişebilir.
CREATE TABLE yanki_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Yankı'nın sahibi
  grantee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- ölümden sonra erişebilecek kişi
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'revoked' (sahip hayattayken istediği zaman iptal edebilir)
  granted_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_access_grant UNIQUE (grantor_id, grantee_id)
);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Her kullanıcı SADECE kendi entries/personality_profiles satırlarını okuyup yazabilir.
-- friendships tablosu bu izni GENİŞLETMEZ — arkadaş olmak, arkadaşın
-- entries/personality_profiles'ına erişim vermez (MVP'de).

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY entries_owner_only ON entries
  USING (user_id = auth.uid());

ALTER TABLE personality_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY personality_profiles_owner_only ON personality_profiles
  USING (user_id = auth.uid());

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY insights_owner_only ON insights
  USING (user_id = auth.uid());

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_owner_only ON conversations
  USING (user_id = auth.uid());

-- users: sadece kendi satırı
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_owner_only ON users
  USING (id = auth.uid());

-- entry_embeddings: doğrudan user_id yok, entries üzerinden join ile sahiplik
ALTER TABLE entry_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY entry_embeddings_owner_only ON entry_embeddings
  USING (
    EXISTS (
      SELECT 1 FROM entries
      WHERE entries.id = entry_embeddings.entry_id
        AND entries.user_id = auth.uid()
    )
  );

-- friendships: requester veya addressee kullanıcıya ait olmalı
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY friendships_involved_only ON friendships
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- yanki_access_grants: sadece grantor (Yankı sahibi) kendi izinlerini yönetebilir
ALTER TABLE yanki_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY yanki_access_grants_grantor_only ON yanki_access_grants
  USING (grantor_id = auth.uid());

-- questions: sadece active=true olanlar herkese açık okunabilir
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY questions_read_active ON questions
  FOR SELECT
  USING (active = true);

-- ============================================================================
-- TRIGGER: Yeni kullanıcı kaydı → users tablosunda satır oluştur
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, consent_given_at, consent_text_version)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', SPLIT_PART(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data ->> 'consent_given' = 'true'
      THEN now()
      ELSE NULL
    END,
    CASE
      WHEN NEW.raw_user_meta_data ->> 'consent_given' = 'true'
      THEN 'v0-placeholder'
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$;

-- Supabase Auth'ta yeni kullanıcı oluştuğunda tetikle
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- RAG RETRIEVAL: Kosinüs benzerliği ile en yakın entry'leri bul
-- ============================================================================

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
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
