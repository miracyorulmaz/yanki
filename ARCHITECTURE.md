# Yankı — Architecture Notes

Bu doküman "neden bu şekilde" sorusunu cevaplar. `README.md` ne yapıldığını, `CONTRACTS.md` şemayı, bu dosya ise seçimlerin gerekçesini anlatır.

## Neden fine-tune değil, RAG?

Ölçek hedefi gerçek bir üründe binlerce/milyonlarca kullanıcı olabileceği için, kişi başına ayrı bir fine-tuned model eğitmek:
- Maliyet açısından sürdürülemez (her kullanıcı için ayrı eğitim + hosting).
- Güncelleme açısından yavaş (her yeni günlük cevapta yeniden eğitim gerekir).

Bunun yerine **RAG (Retrieval-Augmented Generation)** kullanılır:

## Hafıza Mimarisi: 4 Katman

1. **Raw Memories** — `entries` tablosu, ham soru-cevaplar.
2. **Embeddings** — `entry_embeddings`, anlamsal arama için.
3. **Summary** — `personality_profiles`, 3 günde bir güncellenen (append-only) kişilik özeti.
4. **Insights** — `insights`, haftalık üretilen trend/örüntü analizi (örn. "son 6 ayda daha umutlu konuşuyorsun"). Bu katman, sistemi "anı depolayan" bir yapıdan "kişiliği zaman içinde anlayan" bir yapıya taşır — versiyonlu `personality_profiles` geçmişini karşılaştırarak üretilir.

**Kesin kural:** Insights katmanı asla kullanıcıyı geri çekmek için proaktif olarak kullanılmaz (push notification, "haftalık raporun hazır" gibi bir mekanik YOKTUR). Sadece Yankı'nın kendisi hakkında derinlikli soruları cevaplayabilmesi için RAG context'ine sessizce eklenir. Bu sınır bilinçli bir tasarım kararıdır — amaç "bağımlılık" değil, gerçek öz-farkındalık.

## RAG Akışı (somut olarak)

1. Kullanıcı Yankı'ya bir mesaj gönderir.
2. Mesajın embedding'i çıkarılır.
3. `entry_embeddings` tablosunda vektör benzerliğiyle en alakalı geçmiş cevaplar (anılar) bulunur.
4. Bu anılar + `personality_profiles.summary_text` (genel kişilik özeti) + ilgili `insights` kayıtları + son konuşma geçmişi, tek bir system prompt olarak LLM'e (Claude/OpenAI) gönderilir.
5. LLM, bu context'i kullanarak "o kişi gibi" bir yanıt üretir.

Avantaj: yeni bir günlük cevap geldiğinde sadece bir satır embedding eklenir, model anında güncel olur. Fine-tune beklemeye gerek yoktur.

## Neden tek dil (TypeScript) her katmanda?

Solo geliştirici olduğun için context-switch maliyeti önemli. Next.js (web) + React Native (mobil) + Node.js/NestJS (backend) hepsi TypeScript kullanır — bir dil öğrenip her yerde kullanırsın, kod paylaşımı (tipler, validasyon şemaları) katmanlar arasında mümkün olur.

## Neden Supabase?

Auth + Postgres + Storage + (pgvector desteği) tek bir serviste geliyor. Solo geliştirici için ayrı ayrı auth sistemi, ayrı vektör DB, ayrı dosya depolama kurmak zaman kaybı. Supabase bunları hazır verir; ileride ölçek büyürse bileşenler ayrıştırılabilir (Postgres'i kendi sunucuna taşımak gibi).

## Gizlilik/Güvenlik ile İlgili Mimari Notlar

- `entries` ve `personality_profiles` tabloları en hassas veridir (duygusal/kişisel içerik). Row-level security (RLS) ile her kullanıcı sadece kendi verisine erişebilmeli.
- **KARAR VERİLDİ (V1 - Basit):** Arkadaşlık özelliğinde, bir kullanıcının arkadaşının `entries`/`personality_profiles` verisine ERİŞİMİ YOKTUR — MVP'de sosyal katman sadece arkadaş ekleme/listeleme seviyesindedir, Yankı-to-Yankı etkileşimi (arkadaşının Yankı'sıyla konuşma) V2'ye ertelenmiştir. Bu, RLS politikalarıyla veritabanı seviyesinde zorunlu kılınır (bkz. `CONTRACTS.md`).
- **KESİN KURAL:** Kullanıcı hayattayken, sahibi dışında HİÇ KİMSE (arkadaş, yakın arkadaş dahil) o kullanıcının Yankı'sıyla asla konuşamaz. Bu bir V1/V2 kapsam meselesi değil, kalıcı bir kuraldır — sohbet endpoint'i her zaman sadece sahibine açıktır.
- **Ölüm sonrası erişim modeli (tasarlandı, ileri fazda implement edilecek):** Kullanıcı öldükten sonra bile "tüm arkadaşlar" otomatik erişim kazanmaz. Sadece kullanıcının hayattayken tek tek seçip onayladığı kişiler (`yanki_access_grants` tablosu) erişebilir. Kullanıcı bu izni istediği zaman iptal edebilir. Bu, hem gizlilik hem de "kişinin rızası" ilkesini güçlendiriyor — varsayılan davranış her zaman "erişim yok"tur, erişim sadece açık ve isme özel onayla açılır.
- MVP'de `users.status = 'deceased'` alanı şemada var ama hiçbir akış tarafından set edilmiyor — ileride aile özelliği eklenirken bu alanın tetiklenme mekanizması (kim bildirir, nasıl doğrulanır, hangi onay akışı) ayrıca tasarlanmalı. Bu, hukuki ve etik açıdan dikkat gerektiren bir karar noktasıdır.

## Background Jobs

| Job | Ne zaman | Ne yapar |
|---|---|---|
| **Embedding Worker** | Her yeni `entry` sonrası, asenkron | `entry_embeddings` satırını oluşturur |
| **Summary Worker** | 3 günde bir, VEYA 50+ yeni entry birikirse erken | Yeni `personality_profiles` satırı (append-only) üretir |
| **Insight Worker** | Haftalık | Versiyon geçmişini karşılaştırıp `insights` satırları üretir (confidence ile birlikte) |
| **Notification Worker** | Günlük | Günlük soru bildirimini OneSignal üzerinden gönderir |

Bu job'lar `lib/jobs/` altında ayrı dosyalar olarak yaşar (bkz. proje iskeleti). MVP'de basit bir cron (örn. Supabase Edge Functions + pg_cron veya Vercel Cron) yeterlidir — ayrı bir queue altyapısı (BullMQ vb.) gerekmez, ölçek büyüyünce eklenebilir.

## Sistem Prompt İlkesi: Karakteri Koru, Gerçeği Çarpıtma

Yankı, kullanıcının üslubunu/kişiliğini taklit eder ama **doğrulanabilir gerçeklerde onunla birlikte yanlış bilgi üretmez.** Örnek: kullanıcı "dünya düz" diye inanıyorsa, Yankı bunu "evet" diye onaylamaz. Sistem promptuna şu kural yazılmalı: *"Kullanıcının konuşma tarzını, mizahını ve bakış açısını yansıt; ama doğrulanabilir olgusal konularda yanlış bilgiyi teyit etme veya çoğaltma."* Bu, hem etik hem de ürünün güvenilirliği açısından ihlal edilemez bir sınır olarak ele alınmalı.

## Ürün Konumlandırması (pazarlama notu, kod değil ama karar)

MVP'nin ana sayfası/ilk kullanıcı deneyimi **ölüm/legacy temasıyla açılmamalı.** İlk izlenim "kendini daha iyi tanı", "düşüncelerini kaybetme", "geleceğe günlük bırak" gibi **hayat odaklı** bir çerçevede olmalı — çünkü insanlar bir uygulamayı ilk açtığında ölümü düşünmek istemez. Ölüm sonrası (Legacy) özelliği, kullanıcı uygulamayı zaten günlük hayatının parçası haline getirdikten sonra (örn. birkaç hafta/ay sonra) tanıtılmalı. Bu, ürün metni ve onboarding akışı yazılırken göz önünde bulundurulmalı.

## Değişebilecek/Değişemeyecek Kısımlar

**Platform değişse de sabit kalmalı:**
- SQL şeması (`CONTRACTS.md`)
- API request/response şekilleri
- RAG akışı (retrieve → profile özeti + context → LLM)

**Platforma göre değişebilir:**
- Backend framework (NestJS ↔ FastAPI ↔ Express)
- LLM sağlayıcısı (Claude ↔ OpenAI ↔ başka)
- Hosting/altyapı (Supabase ↔ kendi sunucu)
