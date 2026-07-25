# Yankı — Session Summary

## Tarih: 2026-07-25

## Tamamlanan Fazlar

### ✅ Phase 0 — Project Setup
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase client'lar (browser, server, middleware → proxy)
- ESLint 9 + Prettier (strict TS uyumlu)
- `.env.example` + `.env.local`
- Klasör iskeleti (`app/`, `lib/`, `db/`, `types/`, `public/`)
- `db/schema.sql` — CONTRACTS.md birebir SQL şeması + RLS + trigger + `match_entries`
- `DEVELOPMENT.md` — çalıştırma talimatları

### ✅ Phase 1 — Auth + Onboarding
- Supabase Auth (email/şifre) — `/login`, `/register`
- `handle_new_user` trigger'ı (consent_given_at, consent_text_version)
- KVKK açık rıza checkbox'ı (`v0-placeholder`)
- Onboarding UI: adım adım, progress bar, atla (weight ≥ 0.85), "daha sonra devam et"
- `POST /api/onboarding/answer`, `POST /api/onboarding/complete`

### ✅ Phase 4 — Personality Builder (LLM)
- `lib/ai/summarize.ts` — Claude Haiku 4.5 ile kişilik profili
- `buildPersonalityProfile()`: summary + traits (Identity Layer) + firstMessage
- Traits: korkular, sevdigi_insanlar, hayattaki_amac, karar_alma_bicimi, espri_anlayisi, risk_alma_seviyesi
- ARCHITECTURE.md Sistem Prompt İlkesi prompt'a dahil
- Siyasi/dini görüş kesinlikle traits'e dahil edilmez
- Response: `{ profileId, profileSummary, firstMessage }`

### ✅ Phase 5 — Daily Questions
- `GET /api/daily-questions/today`: son 3 gün tag hariç tutma, high importance override, bugün cevaplanmış hariç, 2-3 soru
- `POST /api/daily-questions/answer`: source='daily', moderationFlag=null
- `app/daily/page.tsx`: adım adım UI
- `app/page.tsx`: `/daily` ve `/chat` butonları

### ✅ Phase 6 — Embeddings
- `lib/ai/embed.ts` — OpenAI text-embedding-3-small
- `embedEntry()`: entry oluşturmayı bloklamaz, hata → log
- Her iki answer endpoint'ine embed çağrısı eklendi
- `db/backfill-embeddings.ts` — eksik embedding'leri tamamlar

### ✅ Phase 7 — Chat / RAG Pipeline
- `match_entries` pgvector fonksiyonu (kosinüs benzerliği)
- `lib/ai/chat.ts` — `generateReply()`: embed → retrieve → context → Claude
- System prompt: ARCHITECTURE.md + NON_NEGOTIABLES birebir
- `POST /api/chat/message`: `{ reply, usedMemories }`
- `conversations` tablosuna user + yanki satırı
- `app/chat/page.tsx` — gerçek zamanlı sohbet UI
- **Gerçek RAG testi BAŞARILI** — "En büyük korkum yalnızlık" → Yankı "Evet, en büyük korkun yalnızlık..."

### ✅ Phase 8 — Insights Worker + Summary Worker
- `lib/jobs/generate-insights.ts` — haftalık trend analizi
- `lib/jobs/summarize-profile.ts` — 3 günde bir / 50+ entry → yeni personality_profiles satırı (append-only)
- Confidence: `MIN(1.0, 0.05 * entry + 0.1 * dimension)` (CONTRACTS.md birebir)
- Claude Haiku 4.5 ile insight metni üretimi
- **KESİN KURAL:** HİÇBİR bildirim tetiklemez — sessizce `insights` tablosuna yazar
- **Chat testi BAŞARILI** — insight "3 farklı boyutta değişkenlik" chat context'ine dahil edildi

## Kalan Fazlar (Sırayla)

| Faz | Ne | Not |
|---|---|---|
| **Phase 9** | Notifications | OneSignal, günlük soru bildirimi |
| **Phase 10** | Polish | Error/loading/empty states, responsive, PWA, SEO |
| **V2** | Arkadaş sistemini genişletme | Arkadaşın Yankı'sıyla etkileşim (hayattayken YOK) |
| **V3** | Legacy/ölüm sonrası | yanki_access_grants implementasyonu |

## Proje Dosya Yapısı

```
Yankı/
├── app/
│   ├── api/
│   │   ├── chat/message/route.ts
│   │   ├── daily-questions/answer/route.ts
│   │   ├── daily-questions/today/route.ts
│   │   ├── onboarding/answer/route.ts
│   │   └── onboarding/complete/route.ts
│   ├── auth/callback/route.ts
│   ├── chat/page.tsx
│   ├── daily/page.tsx
│   ├── login/page.tsx
│   ├── onboarding/page.tsx
│   ├── register/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── db/
│   ├── backfill-embeddings.ts
│   ├── schema.sql
│   ├── seed.ts
│   └── seed_questions.json
├── lib/
│   ├── ai/
│   │   ├── chat.ts
│   │   ├── embed.ts
│   │   ├── summarize.ts
│   │   ├── test-chat.ts
│   │   └── test-insight-chat.ts
│   ├── jobs/
│   │   ├── generate-insights.ts
│   │   └── summarize-profile.ts
│   └── supabase/
│       ├── client.ts
│       ├── middleware.ts
│       ├── server.ts
│       └── use-client.ts
├── proxy.ts
├── package.json
├── tsconfig.json
└── .env.example / .env.local
```

## Ortam Değişkenleri (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://epvnlslvujifcjhcfruk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
```

## Supabase'te Çalıştırılması Gerekenler

Henüz migration yapılmadı. SQL Editor'da çalıştırılacaklar:
- `db/schema.sql` — tüm tablolar + RLS + trigger + `match_entries`
- Özellikle eksik olan: `insights` tablosu, `personality_profiles` kolonları (`id`, `created_at` append-only yerine `updated_at` ile tekil)

## Yarım Kalan / Notlar

- **Supabase migration:** `schema.sql` henüz uygulanmadı — `insights` tablosu manuel oluşturuldu, diğer tabloların bazı kolonları eksik olabilir
- **Seed:** `npx tsx db/seed.ts` — soruları `questions` tablosuna yükler (ilk çalıştırmada gerekli)
- **Phase 9 (Notifications):** OneSignal entegrasyonu, günlük soru push bildirimi
