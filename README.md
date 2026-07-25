# Yankı

Kişiye özel yapay zeka "dijital ikiz" uygulaması. Her kullanıcı, zaman içinde kendisini anlayan bir Yankı oluşturur.

> **Pusula cümlesi:** Yankı'nın amacı ölen insanları dijital olarak yaşatmak değil; yaşayan insanların benliğini zaman içinde en doğru şekilde anlayıp korumaktır. Ölüm sonrası deneyim, bunun üzerine inşa edilen ikincil bir özelliktir. Ürün kararlarında bu cümle referans alınmalı — Legacy özelliği ne kadar dikkat çekici olsa da, ürünün uzun vadeli değeri insanların **yaşarken** Yankı'yı vazgeçilmez bulmasından gelir.

Bu doküman, projeyi hiç bilmeyen bir geliştiriciye (veya başka bir AI aracına) sıfırdan anlatmak için yazılmıştır. `CONTRACTS.md` ve `ARCHITECTURE.md` ile birlikte okunmalıdır.

## Vizyon

- Her kullanıcı kendi "Yankı"sını (AI persona) oluşturur.
- Yankı, kullanıcının onboarding cevapları + günlük soru-cevapları üzerinden zamanla o kişiye benzer şekilde yanıt vermeyi öğrenir.
- Uzun vadede: kullanıcılar birbirini arkadaş ekleyebilir; ayrıca (MVP dışında, ileride) kullanıcı öldükten sonra, kullanıcının hayattayken **tek tek seçip onayladığı** kişiler (tüm arkadaşları değil) o kişinin eğitilmiş Yankı'sıyla konuşabilir. Kullanıcı hayattayken ise sahibi dışında hiç kimse Yankı'yla konuşamaz — bu istisnasız bir kuraldır.

**Konumlandırma notu:** Ürün, kullanıcıya "hayat odaklı" tanıtılır (kendini tanı, düşüncelerini kaybetme) — "legacy"/ölüm sonrası özelliği ilk izlenimde vurgulanmaz, kullanıcı uygulamayı günlük hayatının parçası haline getirdikten sonra tanıtılır. Detay için `ARCHITECTURE.md`.

## Hedef ve Kapsam

- **Ölçek hedefi:** Gerçek, herkese açık bir ürün/startup (prototip değil).
- **Ekip:** Solo geliştirici.
- **Zaman hedefi:** 1-3 ay içinde MVP.
- **İlk pazar:** Türkiye, sonrasında global.
- **Platform:** MVP'de sadece web app (PWA olarak — telefonda "ana ekrana ekle" ile uygulama gibi çalışır, push notification destekler). Native mobil (React Native) V1.1'e ertelendi — 1-3 aylık hedefi rahatlatmak için bilinçli bir kapsam kararı.
- **Gelir modeli:** Henüz belirlenmedi (freemium olasılığı var, karar verilmedi).

## MVP Kapsamı (bu fazda YAPILACAK)

1. **Onboarding** — kullanıcının duygusal yapısını/görüşlerini öğrenen, karma formatta (çoktan seçmeli + açık uçlu) bir soru seti.
2. **Günlük sorular** — günde 2-3 soru; hem push notification hem uygulama içi prompt ile iletilir. Sorular arasında "bugün yaşadığın/gördüğün bir olay hakkında ne düşünüyorsun" tarzı açık uçlu sorular da olur.
3. **Yankı ile konuşma** — kullanıcı kendi Yankı'sıyla sohbet edebilir; Yankı, kişilik profili + geçmiş cevaplardan (RAG) + **insights katmanından** (bkz. aşağı) beslenerek yanıt üretir.
4. **Insights katmanı** — arka planda haftalık olarak üretilen trend/örüntü analizleri (örn. "son dönemde bu konuda daha kararlısın"). Kullanıcıya push/rapor olarak İTİLMEZ — sadece Yankı'nın RAG context'ine dahil edilir, kullanıcı sorduğunda kullanılır.
5. **Sosyal katman (V1 - Basit)** — arkadaş ekleme, "yakın arkadaş" kademesi (bilinçli olarak MVP'de işlevsiz bırakıldı — gelecekte açılacak bir alan olarak merak uyandırması hedefleniyor). Arkadaşın Yankı'sıyla konuşma/etkileşim MVP'de YOKTUR, V2'ye ertelendi (bkz. `ARCHITECTURE.md`).

## MVP Kapsamı DIŞI (bilinçli olarak ertelendi)

- **Ölüm sonrası aile özelliği**: Kullanıcı öldükten sonra, kullanıcının hayattayken tek tek seçip onayladığı kişilerin (tüm arkadaşları değil) Yankı ile konuşabilmesi. Bu özellik hukuki (veri/miras), etik (yas süreci, açık onay akışı) ve teknik (kimlik doğrulama, "ölüm" durumunun tetiklenmesi, izin listesi yönetimi) açıdan MVP'den daha fazla hazırlık gerektiriyor. Erişim modeli tasarlandı (bkz. `CONTRACTS.md` — `yanki_access_grants`), implementasyon ayrı bir faz olarak ele alınacak.

## Teknoloji Yığını (önerilen, henüz kilitli değil)

| Katman | Seçim | Neden |
|---|---|---|
| Web frontend | Next.js (React), PWA | SEO + hızlı deploy + "ana ekrana ekle" ile mobilde native gibi çalışır, push notification destekler |
| Mobil (V1.1) | React Native (ertelendi) | Web'deki React bilgisi mobile'a taşınır, ama MVP kapsamı dışında |
| Backend | Node.js + TypeScript (NestJS veya tRPC) | Tüm katmanlarda tek dil, solo geliştirici için bakım kolaylığı |
| Veritabanı | PostgreSQL + pgvector | İlişkisel veri + embedding'ler aynı yerde, ekstra servis yönetimi yok |
| Auth/Altyapı | Supabase | Auth + Postgres + Storage hazır gelir, kurulum hızı |
| Push Notification | OneSignal (ücretsiz katman) | Ham Web Push API'yi (VAPID key yönetimi, service worker) sıfırdan kurmaktan çok daha az operasyon yükü |
| AI | Claude/OpenAI API + RAG (fine-tune YOK) | Kişi başına fine-tune ölçeklenemez; RAG anında güncellenebilir ve çok daha ucuz |

Detaylı gerekçe ve veri akışı için `ARCHITECTURE.md`'ye bakın. Tablo şemaları ve API sözleşmeleri için `CONTRACTS.md`'ye bakın.

## Yol Haritası (1-3 ay, taslak)

1. **Hafta 1-2:** Temel altyapı (Next.js + Supabase kurulumu, temel tablolar)
2. **Hafta 3-4:** Onboarding + günlük soru akışı + push notification
3. **Hafta 5-7:** RAG pipeline + Yankı ile konuşma arayüzü
4. **Hafta 8-10:** Sosyal katman (arkadaş/yakın arkadaş)
5. **Hafta 11-12:** Cilalama + kapalı beta

## Açık Kalan Kararlar

- Gelir modeli henüz seçilmedi.
- Ölüm sonrası aile özelliğinin onay/tetikleme mekanizması ayrıca tasarlanacak.
- **KVKK aydınlatma metni ve açık rıza formülasyonu bir avukat tarafından onaylanmalı** — teknik iskelet `CONTRACTS.md`'de hazır, ama hukuki metin MVP lansmanından önce netleşmeli. Bu bir engelleyici (blocker) madde.

## V2 (MVP Sonrası) Notları

- Arkadaşın Yankı'sıyla etkileşim (hayattayken): YOK — bu kesin bir kural, V2'de de eklenmeyecek. Sahibi dışında hiç kimse hiçbir zaman canlı bir kullanıcının Yankı'sıyla konuşamaz.
- Ölüm sonrası aile özelliği: sadece kullanıcının önceden seçip onayladığı kişiler erişebilir (`yanki_access_grants`, bkz. `CONTRACTS.md`). "Tüm arkadaşlar" mantığı yok.
