# Yankı — Data & API Contracts

Bu dosya, platformdan/framework'ten bağımsız olarak geçerli olan veri modeli ve API sözleşmelerini tanımlar. Hangi backend/frontend teknolojisine geçilirse geçilsin, bu şema ve sözleşmeler aynı kalmalı.

## 1. Veri Modeli (SQL şeması, Postgres varsayımıyla)

```sql
-- Kullanıcılar
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'deceased' | 'deactivated'
  consent_given_at TIMESTAMPTZ,          -- KVKK: açık rızanın verildiği an (metin versiyonuyla birlikte loglanmalı)
  consent_text_version TEXT,             -- hangi aydınlatma metni versiyonuna rıza verildi
  deletion_requested_at TIMESTAMPTZ,     -- hesap silme talebi anı (grace period sonrası hard delete tetiklenir)
  onboarding_completed_at TIMESTAMPTZ    -- NULL ise onboarding devam ediyor demektir ("daha sonra devam et")
);

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
  text TEXT NOT NULL,
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
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY insights_owner_only ON insights
  USING (user_id = auth.uid());

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
CREATE EXTENSION IF NOT EXISTS vector;
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

-- Row-Level Security: her kullanıcı SADECE kendi entries/personality_profiles
-- satırlarını okuyup yazabilir. friendships tablosu bu izni GENİŞLETMEZ —
-- arkadaş olmak, arkadaşın entries/personality_profiles'ına erişim vermez (MVP'de).
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY entries_owner_only ON entries
  USING (user_id = auth.uid());

ALTER TABLE personality_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY personality_profiles_owner_only ON personality_profiles
  USING (user_id = auth.uid());  -- user_id hâlâ tabloda var, sadece PK id'ye taşındı

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_owner_only ON conversations
  USING (user_id = auth.uid());

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
```

## 2. Temel İş Kuralları (framework'ten bağımsız, her yerde geçerli)

- Bir `entry` kaydedildiğinde, arka planda otomatik olarak `entry_embeddings` tablosuna karşılık gelen embedding eklenir. Bu senkron değil, asenkron bir job olarak tasarlanmalı.
- `personality_profiles`, **3 günde bir** (cron job) o ana kadarki yeni entries'lerden yeniden özetlenerek **yeni bir satır olarak eklenir** (üzerine yazılmaz — versiyon geçmişi korunur, gelecekteki "yıllara göre Yankı" özelliği için). **İstisna:** 3 gün dolmadan **50+ yeni entry** birikirse, erken tetiklenir (beklemez). Yankı ile her konuşmada, en son satırdaki `summary_text` system prompt'a eklenir.
- MVP'de fine-tune YOKTUR. Kişiselleştirme tamamen RAG (retrieval) + `personality_profiles` özeti üzerinden yapılır.
- `users.status = 'deceased'` alanı MVP'de kullanılmaz ama şema ileride aile özelliği için buraya eklenmiştir; MVP'de bu alanı hiçbir akış set etmemeli.

## 3. API Sözleşmeleri (REST tarzı, framework bağımsız — endpoint isimleri örnektir)

### Onboarding
```
POST /api/onboarding/answer
Body: { question: string, questionType: "multiple_choice" | "scaled" | "open_text", answer: string }
Response: { entryId: string }

POST /api/onboarding/complete
Response: { profileSummary: string, firstMessage: string }
```
**Bu endpoint sadece "tamamlandı" işareti koymaz — ilk dijital ikizi doğurur.** Sırasıyla:
1. Eksik/zorunlu onboarding sorusu var mı kontrol et (hassas olmayanlar zorunlu, `weight >= 0.85` olanlar atlanabilir)
2. İlk `personality_profiles` satırını oluştur (tüm onboarding entries'lerinden)
3. İlk `summary_text`'i üret
4. (Opsiyonel, veri azsa atlanabilir) İlk `insights` kaydını oluşturmayı dene
5. Yankı'nın **ilk sohbet mesajını** hazırla — kullanıcıdan öğrenilen 2-3 somut şeyi kontrollü biçimde yansıtan, kişiselleştirilmiş bir açılış mesajı (jenerik "Merhaba" DEĞİL)
6. `users.onboarding_completed_at` set edilir

### Günlük Sorular
```
GET /api/daily-questions/today
Response: { questions: [{ id: string, text: string, type: string }] }

POST /api/daily-questions/answer
Body: { questionId: string, answer: string }
Response: { entryId: string, moderationFlag: null | "flagged" }
```
`moderationFlag: "flagged"` dönerse, kullanıcıya cevabının kaydedildiğini ama kişilik
özetine dahil edilmeyeceğini nazikçe belirten bir bildirim gösterilmeli (örn. bir
tooltip/banner) — cevabı silmiyoruz, sadece Yankı'nın öğrenme sürecinden dışlıyoruz.

### Yankı ile Sohbet
```
POST /api/chat/message
Body: { message: string }
Response: { reply: string, usedMemories: string[] }  // usedMemories: hangi entry_id'ler context olarak kullanıldı (şeffaflık için)
```
**Erişim kuralı (KESİN, MVP ve V2'de geçerli):**
- `users.status = 'active'` iken, bu endpoint'e SADECE `user_id = auth.uid()` ile erişilebilir. Sahibi dışında (arkadaş, yakın arkadaş, kimse) hiç kimse bir başkasının Yankı'sıyla konuşamaz. İstisna yok.
- `users.status = 'deceased'` olduğunda (V2/V3, MVP'de bu durum hiç oluşmuyor), erişim isteyen kişi `yanki_access_grants` tablosunda `grantor_id = <ölen kullanıcı>` ve `status = 'active'` olarak listelenmiş olmalı. "Tüm arkadaşlar otomatik erişebilir" kuralı YOKTUR — sadece kullanıcının hayattayken tek tek seçip onayladığı kişiler erişebilir.

### Arkadaşlık (MVP — V1 Basit)
```
POST /api/friends/request
Body: { addresseeId: string, tier: "friend" | "close_friend" }

POST /api/friends/respond
Body: { friendshipId: string, action: "accept" | "block" }

GET /api/friends/list
Response: { friends: [{ userId: string, displayName: string, tier: string }] }
```
MVP'de arkadaşlık SADECE bu üç endpoint ile sınırlıdır. Bir kullanıcının
arkadaşının Yankı'sına erişebileceği herhangi bir endpoint MVP'de YOKTUR.

### Arkadaşın Yankı'sıyla Etkileşim (hayattayken) — KALICI OLARAK YOK
Kullanıcı hayattayken, sahibi dışında hiç kimsenin (arkadaş dahil) o kullanıcının
Yankı'sıyla konuşabileceği bir endpoint YOKTUR ve hiçbir fazda eklenmeyecektir.
`/api/chat/message` her zaman sadece `auth.uid() = user_id` için çalışır.

### Ölüm Sonrası Erişim (V2/V3 — MVP'de İMPLEMENT EDİLMEYECEK)
```
POST /api/yanki-access/grant       -- kullanıcı hayattayken, kime izin verdiğini seçer
Body: { granteeId: string }

POST /api/yanki-access/revoke
Body: { grantId: string }

POST /api/chat/message-deceased    -- sadece users.status = 'deceased' iken, sadece yetkili grantee için
Body: { deceasedUserId: string, message: string }
Response: { reply: string }
```
Erişim, `yanki_access_grants` tablosunda sahibin (grantor) hayattayken
tek tek seçip onayladığı kişilerle (grantee) sınırlıdır. "Tüm arkadaşlar"
otomatik erişemez.

## 4. KVKK — Veri Koruma (teknik iskelet — hukuki metin AVUKAT ONAYI GEREKTİRİR)

**⚠️ Bu bölüm hukuki tavsiye değildir.** Aşağıdaki akışlar teknik olarak kurulabilir, ama aydınlatma metni / açık rıza formülasyonu bir avukat tarafından yazılmalı — özellikle günlük açık uçlu cevaplar dolaylı olarak "özel nitelikli kişisel veri" (sağlık, dini/siyasi görüş vb.) içerebileceğinden.

- **Açık rıza:** Kayıt sırasında `users.consent_given_at` + `consent_text_version` set edilir. Rıza metni güncellenirse yeni kullanıcılar yeni versiyona, mevcut kullanıcılar tekrar onaya yönlendirilir.
- **Hesap silme:** `deletion_requested_at` set edilir → X gün grace period (kullanıcı vazgeçebilir) → sonrasında `entries`, `entry_embeddings`, `personality_profiles`, `conversations` HARD DELETE edilir (soft-delete değil — KVKK "silme" yükümlülüğü tam silmeyi gerektirir).
- **Veri taşınabilirliği:** `GET /api/account/export` — kullanıcının tüm `entries` + `personality_profiles` verisini JSON olarak indirebileceği bir endpoint.

## 5. Embedding Modeli Değişirse (Migration Stratejisi)

`entry_embeddings.embedding_model` kolonu hangi modelle üretildiğini tutar. Sağlayıcı/model değişirse (örn. `text-embedding-3-small` → başka bir model, farklı boyut):
1. Yeni model için AYRI bir tablo/kolon açma — mevcut `VECTOR(1536)` boyutunu bozmadan `entry_embeddings_v2` gibi paralel bir tablo oluştur.
2. Arka planda tüm `entries` için yeni modelle yeniden embedding üret (batch job).
3. Tamamlanınca uygulamayı yeni tabloya yönlendir, eskisini bir süre sonra sil.
Bu sayede geçiş sırasında kesinti veya veri kaybı olmaz.

## 6. İçerik Moderasyonu

MVP'de tam otomatik bir moderasyon pipeline'ı YOKTUR ama şema destekler: `entries.moderation_flag` kolonu.
- Bir `entry` kaydedilirken, arka planda basit bir sınıflandırma (Claude/OpenAI moderation) çalışır.
- Zararlı/nefret içerikli olarak işaretlenirse: kullanıcının kendi kaydı silinmez (kendi verisi), ama `personality_profiles.summary_text` üretilirken bu tür işaretli entries'ler DIŞLANIR — yani Yankı'nın kişiliği zararlı içerikle beslenmez.
- Kendine zarar verme/kriz sinyali tespit edilirse: entry'yi engellemek yerine, kullanıcıya destek kaynakları göster (bkz. önceki konuşmada kararlaştırılan "kısıtlama değil, yönlendirme" ilkesi).

## 7. Taşınabilirlik Notu

Bu sözleşmeler herhangi bir backend framework'üne (NestJS, FastAPI, Express, vb.) veya herhangi bir AI sağlayıcısına (Claude, OpenAI, vb.) bağlı değildir. Bir platform değişikliğinde:
- SQL şemasını olduğu gibi taşı.
- API endpoint'lerinin request/response şekillerini koru (implementasyon dili değişebilir).
- `ARCHITECTURE.md`'deki RAG akışını (retrieve → profile özeti + context → LLM) koru.
