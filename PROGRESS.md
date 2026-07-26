# Güncel Durum — 27 Temmuz 2026 (Gece Oturumu)

## Denetim ve Düzeltme Turu — Tamamlandı

### 1. SQL Veritabanı
- [x] `db/add-conversations-columns.sql` — 6 eksik kolon eklendi (Supabase'te çalıştırıldı)
- [x] `db/match-entries-v2.sql` + `db/fix-match-entries.sql` — overload çözüldü, canonical versiyon aktif
- [x] `db/schema.sql` — gerçek DB'den canonical olarak yeniden üretildi
- [x] Test kullanıcısı embedding'leri backfill edildi

### 2. Kod Temizliği ve Düzeltmeler
- [x] `types/index.ts` — Entry (`hidden_by_user`), Insight (`source_entry_ids`)
- [x] `app/settings/page.tsx` — onboarding_completed_at kontrolü
- [x] 13 ölü dosya silindi
- [x] `.gitignore` — `.env.local.bak` eklendi
- [x] `public/icon-192.png`, `public/icon-512.png` — geçerli ikonlar

### 3. Anahtar Rotasyonu
- [x] `.env.local` — tüm key'ler yenilendi (Supabase, Anthropic, OpenAI, OneSignal)
- [x] Vercel environment variables — güncellendi

### 4. API/Proxy Sorunu
- [x] **Kök neden:** Cizi Code `ANTHROPIC_BASE_URL` env var'ı SDK'yı `lotpik.cizicode.me` proxy'sine yönlendiriyordu
- [x] **Çözüm:** `chat.ts` ve `summarize.ts`'te `baseURL: 'https://api.anthropic.com'` explicit ayarlandı

### 5. Model Seçimi Yolculuğu

| Aşama | Model | Sonuç |
|-------|-------|-------|
| 1 | `claude-haiku-4-5-20251001` | Yazım hataları, yapay Türkçe → elendi |
| 2 | `gpt-4.1-nano` | Koç tonunu kıramadı → elendi |
| 3 | `gpt-4.1-mini` | Az-shot örneklerle düzeldi ama hafif edebi kaçıyor → ara geçiş |
| 4 | **`gpt-5.6-luna`** | **En doğal, en hızlı (~1450-2945ms), en az koç klişesi → final** |

### 6. Prompt Yolculuğu

| Versiyon | Yaklaşım | Sonuç |
|----------|----------|-------|
| v1 | Kural listesi (Haiku için) | Yapay Türkçe |
| v2 | Negatif yasaklar (nano için) | Görmezden geldi |
| v3 | Ek yasaklar (terapist tuzakları) | Hâlâ koç tonu |
| v4 | Az-shot örnekler + azaltılmış kurallar | Kısmen çalıştı ama edebi |
| **v5** | **Genişletilmiş 2-turlu az-shot + minimal kurallar** | **Luna ile mükemmel sonuç** |

### 7. Chat Testi Sonuçları (Production)

```
model: gpt-5.6-luna | latency: 2945ms

Q: Berrak'ı unutamıyorum, unutmak istiyor muyum onu da bilmiyorum
A: Bence sen onu tamamen unutmak istemiyorsun. Daha çok, onu 
   özlemenin ve yaptığının canını bu kadar yakmamasını istiyorsun. 
   Çünkü Berrak senin için sadece geçmişte kalmış biri değil, 
   hayatının bir parçası. Onu unutmak mı istiyorsun, yoksa onsuz 
   yaşamaya alışmak mı?
```

### 8. Build/Lint Durumu
- `tsc --noEmit`: ✅ 0 hata
- ESLint: 8 error + 2 warning (hepsi önceden var olan `no-explicit-any` + unused vars)

### 9. Commit Geçmişi (bu oturum)
```
0a0f341 switch: gpt-4.1-mini → gpt-5.6-luna
06eab26 fix: prompt v5 — genişletilmiş az-shot örneklerle koç tonu kırıldı
21d8390 fix: prompt v4 — few-shot examples + switch to gpt-4.1-mini
9c3266b fix: prompt v3 — terapist tuzaklarını kapat
e012c76 switch: chat model Anthropic Haiku → OpenAI GPT-4.1-nano
ff17f3c fix: Anthropic API baseURL override + Türkçe prompt iyileştirme
```

---

### Önemli Dosyalar
- Production URL: https://yanki-weld.vercel.app
- Supabase URL: https://epvnlslvujifcjhcfruk.supabase.co
- GitHub (yeni): https://github.com/miracyorulmaz/yanki.git
- Test kullanıcısı: test@yanki.app / yanki123
- Gerçek kullanıcı: mbyorulmaz@gmail.com
- Chat modeli: `gpt-5.6-luna` (temperature: 1)
- Embedding: `text-embedding-3-small` (OpenAI)
- System prompt: `lib/ai/chat.ts` — v5 az-shot

### Kapsam Dışı (ayrı fazlar)
- Arkadaşlık API'si (/api/friends/*)
- KVKK veri export/silme endpoint'leri
- `summarize.ts` — hâlâ Anthropic Haiku kullanıyor (onboarding tek seferlik, idare eder)
- Terra'ya yükseltme mekanizması (zor sorular için)
